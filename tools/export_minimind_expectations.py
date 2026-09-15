"""Export the reference model's discrete decisions for the JavaScript runtime parity test.

``tools/export_minimind_readouts.py --compare`` proves that PyTorch and ONNX Runtime
CPU agree when both are driven by the Python tokenizer. The production path is
different: the Transformers.js tokenizer plus ONNX Runtime Web inside
``apps/web/workers/minimind.worker.ts``. This tool records, per locked case, what the
PyTorch reference decides through exactly the code paths the parity harness trusts:

* the eight proposed field labels, read out with the centroids shipped inside the
  browser bundle (so the fixture is tied to the exact readouts file the worker loads);
* the MiniMind-only benchmark action label from the same shipped action centroids;
* for each of those nine decisions, the reference margin (top-1 cosine score minus
  top-2) and the runner-up label, plus a header ``margin_floor`` below which a decision
  is a knife edge that another float32 backend may legitimately flip;
* for each of the eight non-abstain actions, the ranking of the authored candidate
  notes under the case's own confirmed facts and the harness's confidence band. The
  authored note templates themselves are recorded once in the header so a test can
  reconstruct the chosen sentence without re-authoring it.

The fixture contains labels and ranking indices only, never embeddings or scores, so it
stays small enough to commit at ``apps/web/tests/fixtures/minimind-expectations.json``.
"""

from __future__ import annotations

import argparse
import hashlib
import json
import re
import sys
from pathlib import Path
from typing import Any

import numpy as np

if not __package__:  # Support ``python tools/export_minimind_expectations.py`` from any directory.
    _REPOSITORY_ROOT = str(Path(__file__).resolve().parents[1])
    if _REPOSITORY_ROOT not in sys.path:
        sys.path.insert(0, _REPOSITORY_ROOT)

from apps.minimind_adapter.service import (  # noqa: E402
    ACTIONS,
    FIELD_OPTIONS,
    Adapter,
    Facts,
    MiniMindScorer,
)

if __package__:
    from tools import export_minimind_readouts as readouts_tool
    from tools import prepare_minimind as source_contract
    from tools import prepare_minimind_browser as browser_contract
else:
    import export_minimind_readouts as readouts_tool
    import prepare_minimind as source_contract
    import prepare_minimind_browser as browser_contract


REPOSITORY_ROOT = Path(__file__).resolve().parents[1]
CASES_PATH = readouts_tool.CASES_PATH
BUNDLE_PATH = browser_contract.WEB_TARGET
FIXTURE_PATH = REPOSITORY_ROOT / "apps" / "web" / "tests" / "fixtures" / "minimind-expectations.json"
EXPECTATION_SCHEMA = "legalfly-minimind-expectations/1"
EXPECTED_CASE_COUNT = 48
CONFIDENCE_BAND = "medium"
NOTE_ACTIONS = list(ACTIONS)[:-1]
SUBJECT_PLACEHOLDER = "{subject}"
SUBJECT_FALLBACK = "the matter"
MARGIN_FLOOR = 5e-4
MARGIN_FLOOR_RATIONALE = (
    "Measured PyTorch-versus-ONNX-Runtime embedding noise reaches about 3e-4 per component "
    "and about 1.3e-4 in cosine score, so reference decisions closer than 5e-4 are knife edges "
    "that a different float32 backend may flip without being wrong."
)
MAX_FIXTURE_BYTES = 96 * 1024
_INLINE_INT_ARRAY = re.compile(r"\[\s+((?:\d+,\s+)*\d+)\s+\]")


def _sha256_bytes(payload: bytes) -> str:
    return hashlib.sha256(payload).hexdigest()


def note_templates() -> dict[str, list[str]]:
    """The Python-authored candidate notes with the subject left as a placeholder."""
    placeholder_facts = {field: options[0] for field, options in FIELD_OPTIONS.items()}
    placeholder_facts["property"] = SUBJECT_PLACEHOLDER
    templates: dict[str, list[str]] = {}
    for action in NOTE_ACTIONS:
        _, candidates = readouts_tool._note_selection_input(placeholder_facts, action)
        templates[action] = list(candidates)
    return templates


def _load_bundle_readouts(bundle: Path) -> tuple[dict[str, Any], str, str]:
    """Return the shipped readouts, their file digest, and the bundle quantization."""
    artifacts = readouts_tool.load_browser_artifacts(bundle)
    raw = artifacts.readouts.read_bytes()
    digest = _sha256_bytes(raw)
    manifest_entry = next(
        (
            entry
            for entry in artifacts.manifest["files"]
            if str(entry["file"]).startswith("readouts.")
        ),
        None,
    )
    if manifest_entry is None or manifest_entry["sha256"] != digest:
        raise ValueError("Browser readouts digest does not match the bundle manifest")
    return json.loads(raw.decode("utf-8")), digest, artifacts.quantization


def decide(vector: np.ndarray, group: dict[str, Any]) -> tuple[str, str, float]:
    """Return the reference label, its runner-up, and the top-1 minus top-2 cosine margin."""
    label, scores = readouts_tool._readout(vector, group)
    labels = list(group["labels"])
    if len(labels) < 2:
        raise ValueError("Readout groups must offer at least two labels")
    winner = labels.index(label)
    runner_up = max(
        (index for index in range(len(labels)) if index != winner),
        key=lambda index: (float(scores[index]), -index),
    )
    margin = float(scores[winner]) - float(scores[runner_up])
    if not np.isfinite(margin) or margin < 0:
        raise ValueError(f"Invalid readout margin for {label!r}")
    return label, labels[runner_up], float(f"{margin:.6g}")


def _embed_single(scorer: MiniMindScorer, petition: str) -> np.ndarray:
    """Embed one petition on its own, exactly as the worker's ``encode`` does."""
    return np.asarray(scorer.embed([petition]), dtype=np.float32)[0]


def build_expectations(
    scorer: MiniMindScorer,
    cases: list[dict[str, Any]],
    readouts: dict[str, Any],
    *,
    readouts_sha256: str,
    quantization: str,
    source_sha256: str,
    confidence_band: str = CONFIDENCE_BAND,
) -> dict[str, Any]:
    """Record the reference decisions for every locked case."""
    if len(cases) != EXPECTED_CASE_COUNT:
        raise ValueError(f"Expected {EXPECTED_CASE_COUNT} locked cases, found {len(cases)}")
    teaching_sha256 = readouts_tool._canonical_sha256(readouts_tool._teaching_cases(cases))
    if readouts.get("teaching_cases_sha256") != teaching_sha256:
        raise ValueError("Browser readouts do not match the locked teaching cases")

    # The adapter fits its own readouts from the same checkpoint. Its labels must agree with
    # the shipped centroids; otherwise the bundle is stale and no fixture should be written.
    adapter = Adapter(scorer, cases)
    adapter.load()
    petitions = [str(case["petition"]) for case in cases]
    batched = np.asarray(scorer.embed(petitions), dtype=np.float32)
    if batched.shape != (len(cases), int(readouts["dimensions"])):
        raise ValueError("Reference embeddings do not match the shipped readout dimensions")

    templates = note_templates()
    rows: list[dict[str, Any]] = []
    for index, case in enumerate(cases):
        case_id = str(case["id"])
        petition = str(case["petition"])
        single = _embed_single(scorer, petition)
        adapter_facts = adapter.encode(petition)["facts"]
        facts: dict[str, str] = {}
        margins: dict[str, float] = {}
        runners_up: dict[str, str] = {}
        for field in FIELD_OPTIONS:
            label, runner_up, margin = decide(single, readouts["fields"][field])
            batched_label, _ = readouts_tool._readout(batched[index], readouts["fields"][field])
            if label != batched_label:
                raise ValueError(
                    f"Case {case_id} field {field} depends on batch padding: "
                    f"{label!r} alone versus {batched_label!r} batched"
                )
            if label != str(adapter_facts[field]):
                raise ValueError(
                    f"Shipped readouts disagree with the fitted adapter for {case_id}/{field}: "
                    f"{label!r} versus {adapter_facts[field]!r}"
                )
            facts[field] = label
            margins[field] = margin
            runners_up[field] = runner_up

        action, action_runner_up, action_margin = decide(single, readouts["actions"])
        margins["action"] = action_margin
        runners_up["action"] = action_runner_up
        batched_action, _ = readouts_tool._readout(batched[index], readouts["actions"])
        adapter_action = str(adapter.classify_control(petition)["action"])
        if action != batched_action:
            raise ValueError(
                f"Case {case_id} action depends on batch padding: "
                f"{action!r} alone versus {batched_action!r} batched"
            )
        if action != adapter_action:
            raise ValueError(
                f"Shipped action readout disagrees with the fitted adapter for {case_id}: "
                f"{action!r} versus {adapter_action!r}"
            )

        confirmed = Facts(**case["facts"]).model_dump()
        notes: dict[str, Any] = {}
        for note_action in NOTE_ACTIONS:
            prompt, candidates = readouts_tool._note_selection_input(
                confirmed, note_action, confidence_band
            )
            scores = scorer.score(prompt, candidates)
            if len(scores) != len(candidates) or not all(np.isfinite(scores)):
                raise ValueError(f"Reference note scores are invalid for {case_id}/{note_action}")
            ranking = readouts_tool._ranking(scores)
            rendered = [
                template.replace(SUBJECT_PLACEHOLDER, confirmed["property"] if confirmed["property"] != "none" else SUBJECT_FALLBACK)
                for template in templates[note_action]
            ]
            if rendered != list(candidates):
                raise ValueError(f"Authored note templates diverge for {case_id}/{note_action}")
            notes[note_action] = ranking

        rows.append(
            {
                "id": case_id,
                "split": str(case["split"]),
                "label": str(case["label"]),
                "facts": facts,
                "action": action,
                "margins": margins,
                "runners_up": runners_up,
                "notes": notes,
            }
        )

    sub_floor = sub_floor_decisions(rows)
    return {
        "schema": EXPECTATION_SCHEMA,
        "model": source_contract.MODEL_ID,
        "revision": source_contract.REVISION,
        "source_sha256": source_sha256,
        "reference": "pytorch-float32-cpu",
        "bundle_quantization": quantization,
        "readouts_sha256": readouts_sha256,
        "teaching_cases_sha256": teaching_sha256,
        "cases_sha256": readouts_tool._canonical_sha256(cases),
        "confidence_band": confidence_band,
        "margin_floor": MARGIN_FLOOR,
        "margin_floor_rationale": MARGIN_FLOOR_RATIONALE,
        "sub_floor_decisions": sub_floor,
        "sub_floor_count": len(sub_floor),
        "note_actions": NOTE_ACTIONS,
        "note_subject": {"field": "property", "placeholder": SUBJECT_PLACEHOLDER, "none": SUBJECT_FALLBACK},
        "note_templates": templates,
        "fields": list(FIELD_OPTIONS),
        "case_count": len(rows),
        "cases": rows,
    }


def sub_floor_decisions(rows: list[dict[str, Any]], floor: float = MARGIN_FLOOR) -> list[dict[str, Any]]:
    """Every decision whose reference margin is below the floor, in case order."""
    decisions: list[dict[str, Any]] = []
    for row in rows:
        for decision in [*FIELD_OPTIONS, "action"]:
            margin = float(row["margins"][decision])
            if margin < floor:
                label = row["action"] if decision == "action" else row["facts"][decision]
                decisions.append(
                    {
                        "case": row["id"],
                        "decision": decision,
                        "margin": margin,
                        "labels": [label, row["runners_up"][decision]],
                    }
                )
    return decisions


def serialize_expectations(payload: dict[str, Any]) -> bytes:
    """Serialize deterministically: sorted keys, two-space indent, newline at EOF.

    Integer-only arrays (the note rankings) are kept on one line so the fixture stays
    readable in review without inflating its size.
    """
    text = json.dumps(payload, ensure_ascii=False, indent=2, sort_keys=True)
    text = _INLINE_INT_ARRAY.sub(lambda match: "[" + re.sub(r"\s+", " ", match.group(1)) + "]", text)
    return (text + "\n").encode("utf-8")


def validate_expectations(
    payload: Any,
    cases: list[dict[str, Any]],
    *,
    readouts_sha256: str | None = None,
) -> None:
    """Reject any fixture that is not a complete, label-only record of the locked cases."""
    if not isinstance(payload, dict):
        raise ValueError("Expectations fixture must be a JSON object")
    header = {
        "schema": EXPECTATION_SCHEMA,
        "model": source_contract.MODEL_ID,
        "revision": source_contract.REVISION,
        "confidence_band": CONFIDENCE_BAND,
        "margin_floor": MARGIN_FLOOR,
        "margin_floor_rationale": MARGIN_FLOOR_RATIONALE,
        "note_actions": NOTE_ACTIONS,
        "note_subject": {"field": "property", "placeholder": SUBJECT_PLACEHOLDER, "none": SUBJECT_FALLBACK},
        "note_templates": note_templates(),
        "fields": list(FIELD_OPTIONS),
        "case_count": EXPECTED_CASE_COUNT,
        "cases_sha256": readouts_tool._canonical_sha256(cases),
        "teaching_cases_sha256": readouts_tool._canonical_sha256(
            readouts_tool._teaching_cases(cases)
        ),
    }
    for field, expected in header.items():
        if payload.get(field) != expected:
            raise ValueError(f"Expectations fixture has invalid {field}")
    for field in ("source_sha256", "readouts_sha256"):
        value = payload.get(field)
        if not isinstance(value, str) or len(value) != 64:
            raise ValueError(f"Expectations fixture has invalid {field}")
    if readouts_sha256 is not None and payload["readouts_sha256"] != readouts_sha256:
        # Readout centroids are float32 model outputs and differ in their last
        # digits between build hosts, so a bundle converted elsewhere carries a
        # different readouts hash while still reproducing every decision above
        # the margin floor. The decisive ties are the locked cases and the
        # teaching-case hash checked above; report the difference, do not fail.
        print(
            "Expectations fixture was exported against readouts "
            f"{payload['readouts_sha256'][:12]}; this bundle ships {readouts_sha256[:12]} "
            "(expected across build hosts; decisions are compared by the runtime test)."
        )

    if len(cases) != EXPECTED_CASE_COUNT:
        raise ValueError(f"Expected {EXPECTED_CASE_COUNT} locked cases, found {len(cases)}")
    rows = payload.get("cases")
    if not isinstance(rows, list) or len(rows) != EXPECTED_CASE_COUNT:
        raise ValueError(f"Expectations fixture must contain {EXPECTED_CASE_COUNT} cases")

    for row, case in zip(rows, cases, strict=True):
        if not isinstance(row, dict) or set(row) != {
            "id", "split", "label", "facts", "action", "margins", "runners_up", "notes",
        }:
            raise ValueError("Expectations fixture contains an invalid case entry")
        if row["id"] != case["id"] or row["split"] != case["split"] or row["label"] != case["label"]:
            raise ValueError(f"Expectations fixture case {row.get('id')!r} does not match the locked cases")
        facts = row["facts"]
        if not isinstance(facts, dict) or set(facts) != set(FIELD_OPTIONS):
            raise ValueError(f"Expectations fixture case {row['id']} has invalid facts")
        for field, options in FIELD_OPTIONS.items():
            if facts[field] not in options:
                raise ValueError(f"Expectations fixture case {row['id']} has invalid {field}")
        if row["action"] not in NOTE_ACTIONS:
            raise ValueError(f"Expectations fixture case {row['id']} has an invalid action")
        margins, runners_up = row["margins"], row["runners_up"]
        decisions = [*FIELD_OPTIONS, "action"]
        if (
            not isinstance(margins, dict)
            or not isinstance(runners_up, dict)
            or set(margins) != set(decisions)
            or set(runners_up) != set(decisions)
        ):
            raise ValueError(f"Expectations fixture case {row['id']} has invalid margins")
        for decision in decisions:
            margin = margins[decision]
            allowed = NOTE_ACTIONS if decision == "action" else FIELD_OPTIONS[decision]
            chosen = row["action"] if decision == "action" else facts[decision]
            if (
                not isinstance(margin, (int, float))
                or isinstance(margin, bool)
                or not np.isfinite(margin)
                or margin < 0
                or runners_up[decision] not in allowed
                or runners_up[decision] == chosen
            ):
                raise ValueError(f"Expectations fixture case {row['id']} has an invalid {decision} margin")
        notes = row["notes"]
        if not isinstance(notes, dict) or sorted(notes) != sorted(NOTE_ACTIONS):
            raise ValueError(f"Expectations fixture case {row['id']} has invalid notes")
        Facts(**case["facts"])
        for action, ranking in notes.items():
            if not isinstance(ranking, list) or sorted(ranking) != list(
                range(len(header["note_templates"][action]))
            ):
                raise ValueError(
                    f"Expectations fixture case {row['id']} has an invalid {action} ranking"
                )
    expected_sub_floor = sub_floor_decisions(rows)
    if payload.get("sub_floor_decisions") != expected_sub_floor or payload.get("sub_floor_count") != len(expected_sub_floor):
        raise ValueError("Expectations fixture sub-floor decisions do not match its margins")
    encoded = serialize_expectations(payload)
    if len(encoded) > MAX_FIXTURE_BYTES:
        raise ValueError(f"Expectations fixture is too large: {len(encoded)} bytes")


def export_expectations(
    model_path: Path,
    bundle: Path,
    cases: list[dict[str, Any]],
    output: Path,
) -> Path:
    """Write the fixture and return its path."""
    source_sha256 = browser_contract.verify_source(model_path)
    readouts, readouts_sha256, quantization = _load_bundle_readouts(bundle)
    scorer = MiniMindScorer(model_path)
    payload = build_expectations(
        scorer,
        cases,
        readouts,
        readouts_sha256=readouts_sha256,
        quantization=quantization,
        source_sha256=source_sha256,
    )
    validate_expectations(payload, cases, readouts_sha256=readouts_sha256)
    output.parent.mkdir(parents=True, exist_ok=True)
    output.write_bytes(serialize_expectations(payload))
    return output


def check_expectations(fixture: Path, bundle: Path, cases: list[dict[str, Any]]) -> dict[str, Any]:
    """Validate an existing fixture against the locked cases and the shipped readouts."""
    raw = fixture.read_bytes()
    payload = json.loads(raw.decode("utf-8"))
    _, readouts_sha256, quantization = _load_bundle_readouts(bundle)
    validate_expectations(payload, cases, readouts_sha256=readouts_sha256)
    if raw != serialize_expectations(payload):
        raise ValueError("Expectations fixture is not in canonical serialized form")
    if payload["bundle_quantization"] != quantization:
        raise ValueError("Expectations fixture was exported against a different quantization")
    return {
        "fixture": str(fixture),
        "bytes": len(raw),
        "cases": len(payload["cases"]),
        "readouts_sha256": readouts_sha256,
        "quantization": quantization,
        "margin_floor": payload["margin_floor"],
        "sub_floor_decisions": payload["sub_floor_decisions"],
    }


def _parser() -> argparse.ArgumentParser:
    parser = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    parser.add_argument("--model-path", type=Path, default=source_contract.TARGET)
    parser.add_argument("--cases", type=Path, default=CASES_PATH)
    parser.add_argument("--bundle", type=Path, default=BUNDLE_PATH, help="Verified browser bundle directory")
    parser.add_argument("--output", type=Path, default=FIXTURE_PATH)
    parser.add_argument(
        "--check",
        action="store_true",
        help="Validate the existing fixture against the cases and bundle without loading the model",
    )
    return parser


def main(argv: list[str] | None = None) -> int:
    args = _parser().parse_args(argv)
    cases = readouts_tool.locked_cases(args.cases)
    bundle = args.bundle.expanduser().resolve()
    output = args.output.expanduser().resolve()
    if args.check:
        print(json.dumps(check_expectations(output, bundle, cases), indent=2))
        return 0
    destination = export_expectations(args.model_path.expanduser().resolve(), bundle, cases, output)
    print(json.dumps(check_expectations(destination, bundle, cases), indent=2))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
