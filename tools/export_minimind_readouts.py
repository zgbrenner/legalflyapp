"""Export fixed MiniMind readouts and compare PyTorch with a browser ONNX bundle."""

from __future__ import annotations

import argparse
import hashlib
import json
import os
import sys
import tempfile
from dataclasses import asdict, dataclass
from pathlib import Path
from typing import Any, Protocol

import numpy as np

if not __package__:  # Support ``python tools/export_minimind_readouts.py`` from any directory.
    _REPOSITORY_ROOT = str(Path(__file__).resolve().parents[1])
    if _REPOSITORY_ROOT not in sys.path:
        sys.path.insert(0, _REPOSITORY_ROOT)

from apps.minimind_adapter.service import ACTIONS, FIELD_OPTIONS, Adapter, Facts, MiniMindScorer  # noqa: E402

if __package__:
    from tools import prepare_minimind as source_contract
else:
    import prepare_minimind as source_contract


REPOSITORY_ROOT = Path(__file__).resolve().parents[1]
CASES_PATH = REPOSITORY_ROOT / "apps" / "web" / "public" / "legalfly" / "cases.json"
READOUT_SCHEMA = "legalfly-minimind-readouts/1"
TEMPERATURE_MULTIPLIER = 4.0
# Reference decisions closer than this (top-1 minus top-2 cosine score) are knife edges:
# measured cross-backend embedding noise is up to about 3e-4 per component and about
# 1.3e-4 in cosine score, so another float32 backend may flip them without being wrong.
KNIFE_EDGE_MARGIN = 5e-4


class EmbeddingScorer(Protocol):
    def embed(self, petitions: list[str]) -> np.ndarray: ...


@dataclass(frozen=True)
class BrowserArtifacts:
    root: Path
    model: Path
    readouts: Path
    manifest: dict[str, Any]

    @property
    def quantization(self) -> str:
        return str(self.manifest["quantization"])


@dataclass(frozen=True)
class BackendComparison:
    quantization: str
    cases: int
    field_labels: int
    action_labels: int
    note_rankings: int
    field_label_mismatches: list[dict[str, str]]
    action_label_mismatches: list[dict[str, str]]
    note_ranking_mismatches: list[dict[str, Any]]
    max_cosine_delta: float
    max_embedding_component_delta: float
    max_candidate_score_delta: float
    min_field_margin: float
    min_action_margin: float
    knife_edge_decisions: list[dict[str, Any]]

    @property
    def discrete_parity(self) -> bool:
        return not (
            self.field_label_mismatches
            or self.action_label_mismatches
            or self.note_ranking_mismatches
        )

    def to_dict(self) -> dict[str, Any]:
        return {**asdict(self), "discrete_parity": self.discrete_parity}


def locked_cases(path: Path = CASES_PATH) -> list[dict[str, Any]]:
    """Load the repository's immutable teaching and holdout parity cases."""
    cases = json.loads(Path(path).read_text(encoding="utf-8"))
    if not isinstance(cases, list) or not cases:
        raise ValueError(f"Locked MiniMind cases must be a non-empty array: {path}")
    return cases


def _teaching_cases(cases: list[dict[str, Any]]) -> list[dict[str, Any]]:
    teaching = [case for case in cases if case.get("split") == "teach"]
    if not teaching:
        raise ValueError("At least one teaching case is required to export readouts")
    return teaching


def _canonical_sha256(value: Any) -> str:
    encoded = json.dumps(
        value,
        ensure_ascii=False,
        separators=(",", ":"),
        sort_keys=True,
    ).encode("utf-8")
    return hashlib.sha256(encoded).hexdigest()


def _normalized_centroids(
    vectors: np.ndarray,
    labels: list[str],
    observed: list[str],
) -> list[list[float]]:
    rows = []
    for label in labels:
        selected = vectors[np.asarray([value == label for value in observed], dtype=bool)]
        if not len(selected):
            raise ValueError(f"Teaching cases have no example for readout label {label!r}")
        centroid = selected.mean(axis=0)
        norm = float(np.linalg.norm(centroid))
        if not np.isfinite(norm) or norm <= 1e-12:
            raise ValueError(f"Teaching cases produce an invalid centroid for {label!r}")
        rows.append((centroid / norm).astype(np.float32).tolist())
    return rows


def build_readouts(
    scorer: EmbeddingScorer,
    cases: list[dict[str, Any]],
    *,
    source_sha256: str = source_contract.WEIGHTS_SHA256,
) -> dict[str, Any]:
    """Fit the adapter's exact teaching-only centroid readouts."""
    teaching = _teaching_cases(cases)
    vectors = np.asarray(
        scorer.embed([str(case["petition"]) for case in teaching]),
        dtype=np.float32,
    )
    if vectors.ndim != 2 or vectors.shape[0] != len(teaching) or not vectors.shape[1]:
        raise ValueError("MiniMind embeddings have an invalid shape")
    if not np.isfinite(vectors).all():
        raise ValueError("MiniMind embeddings contain non-finite values")

    fields: dict[str, Any] = {}
    for field in FIELD_OPTIONS:
        labels = sorted({str(case["facts"][field]) for case in teaching})
        fields[field] = {
            "labels": labels,
            "centroids": _normalized_centroids(
                vectors,
                labels,
                [str(case["facts"][field]) for case in teaching],
            ),
        }

    action_labels = list(ACTIONS)[:-1]
    actions = {
        "labels": action_labels,
        "centroids": _normalized_centroids(
            vectors,
            action_labels,
            [str(case["label"]) for case in teaching],
        ),
    }
    return {
        "schema": READOUT_SCHEMA,
        "model": source_contract.MODEL_ID,
        "revision": source_contract.REVISION,
        "source_sha256": source_sha256,
        "teaching_cases_sha256": _canonical_sha256(teaching),
        "dimensions": int(vectors.shape[1]),
        "temperature_multiplier": TEMPERATURE_MULTIPLIER,
        "fields": fields,
        "actions": actions,
    }


def _write_content_addressed_json(output: Path, payload: dict[str, Any]) -> Path:
    output = Path(output)
    output.mkdir(parents=True, exist_ok=True)
    encoded = (json.dumps(payload, ensure_ascii=False, indent=2) + "\n").encode("utf-8")
    digest = hashlib.sha256(encoded).hexdigest()
    destination = output / f"readouts.{digest}.json"
    descriptor, temporary_name = tempfile.mkstemp(prefix=".readouts.", suffix=".tmp", dir=output)
    temporary = Path(temporary_name)
    try:
        with os.fdopen(descriptor, "wb") as handle:
            handle.write(encoded)
            handle.flush()
            os.fsync(handle.fileno())
        os.replace(temporary, destination)
    finally:
        temporary.unlink(missing_ok=True)
    return destination


def export_readouts(
    scorer_or_model_path: EmbeddingScorer | str | Path,
    cases: list[dict[str, Any]],
    output: Path,
    *,
    source_sha256: str = source_contract.WEIGHTS_SHA256,
) -> Path:
    """Export normalized readouts to ``readouts.<sha256>.json``."""
    scorer: EmbeddingScorer
    if isinstance(scorer_or_model_path, (str, Path)):
        scorer = MiniMindScorer(Path(scorer_or_model_path))
    else:
        scorer = scorer_or_model_path
    return _write_content_addressed_json(
        output,
        build_readouts(scorer, cases, source_sha256=source_sha256),
    )


def load_browser_artifacts(output: Path) -> BrowserArtifacts:
    """Verify and locate the ONNX and fixed-readout members of a bundle."""
    if __package__:
        from tools import prepare_minimind_browser as prepare
    else:  # pragma: no cover - package imports are used by tests and comparison runs
        import prepare_minimind_browser as prepare

    root = Path(output).expanduser().resolve()
    manifest = prepare.verify_browser_export(root)
    paths = [prepare.resolve_artifact_path(root, entry["file"]) for entry in manifest["files"]]
    models = [path for path in paths if path.suffix == ".onnx"]
    readouts = [path for path in paths if path.name.startswith("readouts.")]
    if len(models) != 1 or len(readouts) != 1:
        raise ValueError("Browser bundle must contain exactly one ONNX model and one readout file")
    payload = json.loads(readouts[0].read_text(encoding="utf-8"))
    expected = {
        "schema": READOUT_SCHEMA,
        "model": source_contract.MODEL_ID,
        "revision": source_contract.REVISION,
        "source_sha256": source_contract.WEIGHTS_SHA256,
        "temperature_multiplier": TEMPERATURE_MULTIPLIER,
    }
    for field, value in expected.items():
        if payload.get(field) != value:
            raise ValueError(f"Browser readouts have invalid {field}")
    return BrowserArtifacts(root=root, model=models[0], readouts=readouts[0], manifest=manifest)


class OnnxMiniMindScorer:
    """The browser graph's embedding and candidate-scoring operations under ORT."""

    def __init__(self, model_path: Path, tokenizer: Any):
        try:
            import onnxruntime as ort
        except ImportError as exc:  # pragma: no cover - optional dependency
            raise RuntimeError("Parity comparison requires the 'browser' dependencies") from exc
        self.tokenizer = tokenizer
        self.session = ort.InferenceSession(
            str(model_path),
            providers=["CPUExecutionProvider"],
        )

    def _run(self, ids: np.ndarray, mask: np.ndarray) -> tuple[np.ndarray, np.ndarray]:
        logits, hidden = self.session.run(
            ["logits", "last_hidden_state"],
            {
                "input_ids": np.asarray(ids, dtype=np.int64),
                "attention_mask": np.asarray(mask, dtype=np.int64),
            },
        )
        return np.asarray(logits, dtype=np.float32), np.asarray(hidden, dtype=np.float32)

    def embed(self, petitions: list[str]) -> np.ndarray:
        prompts = [
            "<|im_start|>user\nRead this village petition literally: "
            + petition
            + "<|im_end|>\n<|im_start|>assistant\n"
            for petition in petitions
        ]
        batch = self.tokenizer(
            prompts,
            return_tensors="np",
            padding=True,
            truncation=True,
            max_length=256,
        )
        batch.pop("token_type_ids", None)
        mask = np.asarray(batch["attention_mask"], dtype=np.int64)
        _, hidden = self._run(batch["input_ids"], mask)
        expanded_mask = mask[:, :, None].astype(np.float32)
        pooled = (hidden * expanded_mask).sum(axis=1) / np.maximum(expanded_mask.sum(axis=1), 1.0)
        norms = np.linalg.norm(pooled, axis=1, keepdims=True)
        return (pooled / np.maximum(norms, 1e-12)).astype(np.float32)

    def score(self, prompt: str, candidates: list[str]) -> list[float]:
        prefix = self.tokenizer.encode(prompt, add_special_tokens=False)
        encoded = [
            prefix + self.tokenizer.encode(candidate, add_special_tokens=False)
            for candidate in candidates
        ]
        width = max(map(len, encoded))
        pad_id = self.tokenizer.pad_token_id or self.tokenizer.eos_token_id or 0
        ids = np.full((len(encoded), width), pad_id, dtype=np.int64)
        mask = np.zeros_like(ids)
        for row, values in enumerate(encoded):
            ids[row, : len(values)] = values
            mask[row, : len(values)] = 1
        logits, _ = self._run(ids, mask)
        logits = logits[:, :-1]
        maxima = logits.max(axis=-1, keepdims=True)
        log_probs = logits - maxima - np.log(np.exp(logits - maxima).sum(axis=-1, keepdims=True))
        scores = []
        for row, values in enumerate(encoded):
            start = max(0, len(prefix) - 1)
            positions = np.arange(start, len(values) - 1)
            targets = ids[row, 1 : len(values)][start:]
            scores.append(float(log_probs[row, positions, targets].mean()))
        return scores


def _readout(vector: np.ndarray, group: dict[str, Any]) -> tuple[str, np.ndarray]:
    centroids = np.asarray(group["centroids"], dtype=np.float32)
    scores = centroids @ np.asarray(vector, dtype=np.float32)
    probabilities = np.exp((scores - scores.max()) * TEMPERATURE_MULTIPLIER)
    probabilities /= probabilities.sum()
    return str(group["labels"][int(probabilities.argmax())]), scores


def _note_selection_input(
    facts: dict[str, str], action: str, confidence_band: str = "medium"
) -> tuple[str, list[str]]:
    subject = facts["property"] if facts["property"] != "none" else "the matter"
    templates = {
        "let-rest": [
            "Let the matter rest unless the facts change.",
            "No further step is advised on the present account.",
        ],
        "seek-small-reparation": [
            f"First speak with the other party. Record the harm to {subject}. Seek modest reparation if it continues.",
            f"Document the harm to {subject}, then ask for a small reparation.",
        ],
        "seek-full-reparation": [
            f"Preserve the account of harm to {subject}. Seek full reparation under the fictional charter.",
            f"Record the loss involving {subject} and request full reparation.",
        ],
        "request-return": [
            f"Ask for the return of {subject}. Record the request and any reply.",
            f"Request that {subject} be returned before taking a further step.",
        ],
        "find-witness": [
            "Find a witness before pressing the petition further.",
            "Write down the disputed account and seek someone who observed it.",
        ],
        "sworn-account": [
            "Request a sworn account under the fictional village charter.",
            "Ask each party for a sworn account within the fictional charter.",
        ],
        "propose-settlement": [
            "Put a practical settlement to both parties and record what each accepts.",
            "Propose terms both parties can keep, then write them into the ledger.",
        ],
        "refer-higher": [
            "Refer the petition to a higher authority. The fly offers no final judgment.",
            "Place the matter before a higher authority under the fictional charter.",
        ],
        "abstain": [
            "The fly declines to advise on the present facts.",
            "The account is too uncertain for this fly to recommend a next step.",
        ],
    }[action]
    prompt = (
        "<|im_start|>system\nSelect one supplied counsel note. The action is fixed and cannot "
        "be changed.<|im_end|>\n<|im_start|>user\n"
        f"Selected action: {ACTIONS[action]}\nConfirmed facts: {facts}\n"
        f"Confidence band: {confidence_band}<|im_end|>\n<|im_start|>assistant\n"
    )
    return prompt, templates


def _margin(scores: np.ndarray, labels: list[str]) -> tuple[float, list[str]]:
    """Top-1 minus top-2 score and the two labels involved (index breaks ties)."""
    order = sorted(range(len(labels)), key=lambda index: (-float(scores[index]), index))
    if len(order) < 2:
        raise ValueError("Readout groups must offer at least two labels")
    return float(scores[order[0]] - scores[order[1]]), [labels[order[0]], labels[order[1]]]


def _ranking(scores: list[float]) -> list[int]:
    return sorted(range(len(scores)), key=lambda index: (-scores[index], index))


def compare_backends(
    real_minimind_path: Path,
    browser_artifacts: BrowserArtifacts | Path,
    cases: list[dict[str, Any]],
) -> BackendComparison:
    """Compare every locked discrete readout and note ranking plus numeric deltas."""
    if isinstance(browser_artifacts, Path):
        browser_artifacts = load_browser_artifacts(browser_artifacts)
    source_contract_path = Path(real_minimind_path).expanduser().resolve()
    if __package__:
        from tools import prepare_minimind_browser as prepare
    else:  # pragma: no cover
        import prepare_minimind_browser as prepare
    prepare.verify_source(source_contract_path)

    python_scorer = MiniMindScorer(source_contract_path)
    python_adapter = Adapter(python_scorer, cases)
    python_adapter.load()
    browser_scorer = OnnxMiniMindScorer(browser_artifacts.model, python_scorer.tokenizer)

    petitions = [str(case["petition"]) for case in cases]
    python_vectors = np.asarray(python_scorer.embed(petitions), dtype=np.float32)
    browser_vectors = browser_scorer.embed(petitions)
    if python_vectors.shape != browser_vectors.shape:
        raise ValueError(
            f"Backend embedding shapes differ: {python_vectors.shape} != {browser_vectors.shape}"
        )

    readouts = json.loads(browser_artifacts.readouts.read_text(encoding="utf-8"))
    if readouts.get("teaching_cases_sha256") != _canonical_sha256(_teaching_cases(cases)):
        raise ValueError("Browser readouts do not match the locked teaching cases")
    if readouts.get("dimensions") != python_vectors.shape[1]:
        raise ValueError("Browser readout dimensions do not match the checkpoint")

    field_mismatches: list[dict[str, str]] = []
    action_mismatches: list[dict[str, str]] = []
    note_mismatches: list[dict[str, Any]] = []
    max_cosine_delta = 0.0
    max_candidate_score_delta = 0.0
    min_field_margin = float("inf")
    min_action_margin = float("inf")
    knife_edges: list[dict[str, Any]] = []

    def record_margin(case_id: str, decision: str, scores: np.ndarray, labels: list[str]) -> float:
        margin, top_two = _margin(scores, labels)
        if margin < KNIFE_EDGE_MARGIN:
            knife_edges.append(
                {"case": case_id, "decision": decision, "margin": margin, "labels": top_two}
            )
        return margin

    for row, case in enumerate(cases):
        python_result = python_adapter.encode(case["petition"])
        for field in FIELD_OPTIONS:
            browser_label, browser_scores = _readout(
                browser_vectors[row], readouts["fields"][field]
            )
            python_label = str(python_result["facts"][field])
            if python_label != browser_label:
                field_mismatches.append(
                    {
                        "case": str(case["id"]),
                        "field": field,
                        "python": python_label,
                        "browser": browser_label,
                    }
                )
            labels, python_centroids = python_adapter.field_readouts[field]
            if list(labels) != list(readouts["fields"][field]["labels"]):
                raise ValueError(f"Browser readout label ordering differs for {field}")
            python_scores = np.asarray(python_centroids, dtype=np.float32) @ python_vectors[row]
            min_field_margin = min(
                min_field_margin,
                record_margin(str(case["id"]), field, python_scores, list(labels)),
            )
            max_cosine_delta = max(
                max_cosine_delta,
                float(np.max(np.abs(python_scores - browser_scores))),
            )

        browser_action, browser_action_scores = _readout(browser_vectors[row], readouts["actions"])
        python_action = str(python_adapter.classify_control(case["petition"])["action"])
        if python_action != browser_action:
            action_mismatches.append(
                {
                    "case": str(case["id"]),
                    "python": python_action,
                    "browser": browser_action,
                }
            )
        action_labels, python_action_centroids = python_adapter.action_readout
        if list(action_labels) != list(readouts["actions"]["labels"]):
            raise ValueError("Browser action-readout label ordering differs")
        python_action_scores = (
            np.asarray(python_action_centroids, dtype=np.float32) @ python_vectors[row]
        )
        min_action_margin = min(
            min_action_margin,
            record_margin(str(case["id"]), "action", python_action_scores, list(action_labels)),
        )
        max_cosine_delta = max(
            max_cosine_delta,
            float(np.max(np.abs(python_action_scores - browser_action_scores))),
        )

        facts = Facts(**case["facts"]).model_dump()
        prompt, candidates = _note_selection_input(facts, str(case["label"]))
        python_candidate_scores = python_scorer.score(prompt, candidates)
        browser_candidate_scores = browser_scorer.score(prompt, candidates)
        python_ranking = _ranking(python_candidate_scores)
        browser_ranking = _ranking(browser_candidate_scores)
        max_candidate_score_delta = max(
            max_candidate_score_delta,
            max(
                abs(python_score - browser_score)
                for python_score, browser_score in zip(
                    python_candidate_scores, browser_candidate_scores, strict=True
                )
            ),
        )
        if python_ranking != browser_ranking:
            note_mismatches.append(
                {
                    "case": str(case["id"]),
                    "action": str(case["label"]),
                    "python": python_ranking,
                    "browser": browser_ranking,
                }
            )

    return BackendComparison(
        quantization=browser_artifacts.quantization,
        cases=len(cases),
        field_labels=len(cases) * len(FIELD_OPTIONS),
        action_labels=len(cases),
        note_rankings=len(cases),
        field_label_mismatches=field_mismatches,
        action_label_mismatches=action_mismatches,
        note_ranking_mismatches=note_mismatches,
        max_cosine_delta=max_cosine_delta,
        max_embedding_component_delta=float(np.max(np.abs(python_vectors - browser_vectors))),
        max_candidate_score_delta=max_candidate_score_delta,
        min_field_margin=min_field_margin,
        min_action_margin=min_action_margin,
        knife_edge_decisions=knife_edges,
    )


def _parser() -> argparse.ArgumentParser:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--model-path", type=Path, default=source_contract.TARGET)
    parser.add_argument("--cases", type=Path, default=CASES_PATH)
    parser.add_argument("--output", type=Path, required=True)
    parser.add_argument(
        "--compare",
        action="store_true",
        help="Treat output as a completed browser bundle and compare it with PyTorch",
    )
    return parser


def main(argv: list[str] | None = None) -> int:
    args = _parser().parse_args(argv)
    model_path = args.model_path.expanduser().resolve()
    cases = locked_cases(args.cases)
    if args.compare:
        comparison = compare_backends(model_path, args.output, cases)
        print(json.dumps(comparison.to_dict(), indent=2))
        return 0 if comparison.discrete_parity else 1
    if __package__:
        from tools import prepare_minimind_browser as prepare
    else:
        import prepare_minimind_browser as prepare
    digest = prepare.verify_source(model_path)
    destination = export_readouts(
        model_path,
        cases,
        args.output.expanduser().resolve(),
        source_sha256=digest,
    )
    print(destination)
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
