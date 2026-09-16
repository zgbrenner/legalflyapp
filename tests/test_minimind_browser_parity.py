import hashlib
import json
import os
from pathlib import Path

import numpy as np
import pytest

from apps.minimind_adapter.service import ACTIONS, FIELD_OPTIONS
from tools import prepare_minimind_browser as prepare
from tools.export_minimind_readouts import (
    compare_backends,
    export_readouts,
    load_browser_artifacts,
    locked_cases,
)


class FixedEmbeddingScorer:
    def embed(self, petitions: list[str]) -> np.ndarray:
        return np.asarray(
            [
                [float(int(petition.removeprefix("case-")) + 1), float(index % 3 + 1), 1.0]
                for index, petition in enumerate(petitions)
            ],
            dtype=np.float32,
        )


def sample_teaching_cases() -> list[dict]:
    cases = []
    for index, label in enumerate(list(ACTIONS)[:-1]):
        petition = f"case-{index}"
        cases.append(
            {
                "id": f"teach-{petition}",
                "split": "teach",
                "petition": petition,
                "facts": {
                    field: choices[index % min(len(choices), 2)]
                    for field, choices in FIELD_OPTIONS.items()
                },
                "label": label,
            }
        )
    return cases


@pytest.fixture
def readouts_path(tmp_path: Path) -> Path:
    return export_readouts(FixedEmbeddingScorer(), sample_teaching_cases(), tmp_path)


def test_exported_readouts_are_normalized(readouts_path: Path):
    readouts = json.loads(readouts_path.read_text(encoding="utf-8"))
    for group in [*readouts["fields"].values(), readouts["actions"]]:
        assert all(abs(np.linalg.norm(row) - 1.0) < 1e-5 for row in group["centroids"])


def test_exported_readouts_preserve_adapter_label_order(readouts_path: Path):
    readouts = json.loads(readouts_path.read_text(encoding="utf-8"))
    for field in FIELD_OPTIONS:
        assert readouts["fields"][field]["labels"] == sorted(
            {case["facts"][field] for case in sample_teaching_cases()}
        )
    assert readouts["actions"]["labels"] == [label for label in ACTIONS if label != "abstain"]


def test_readout_filename_and_metadata_are_content_addressed(readouts_path: Path):
    readouts = json.loads(readouts_path.read_text(encoding="utf-8"))
    assert readouts_path.name.startswith("readouts.")
    assert prepare.sha256(readouts_path) in readouts_path.name.split(".")
    assert readouts["dimensions"] == 3
    assert len(readouts["teaching_cases_sha256"]) == 64
    assert readouts["source_sha256"] == prepare.WEIGHTS_SHA256


def test_convert_model_packages_fixed_readouts(tmp_path: Path, monkeypatch):
    weights = b"verified source fixture"
    source = tmp_path / "checkpoint"
    source.mkdir()
    (source / "model.safetensors").write_bytes(weights)
    (source / "config.json").write_text('{"model_type":"qwen3"}', encoding="utf-8")
    (source / "tokenizer.json").write_text("{}", encoding="utf-8")
    (source / "tokenizer_config.json").write_text("{}", encoding="utf-8")
    digest = hashlib.sha256(weights).hexdigest()
    monkeypatch.setattr(prepare, "WEIGHTS_SHA256", digest)
    monkeypatch.setattr(
        prepare,
        "export_qwen3_onnx",
        lambda checkpoint, destination: destination.write_bytes(b"fp32"),
    )
    monkeypatch.setattr(
        prepare,
        "quantize_onnx",
        lambda source_model, destination, quantization: destination.write_text(
            json.dumps(["logits", "last_hidden_state"]), encoding="utf-8"
        ),
    )
    monkeypatch.setattr(
        prepare,
        "_onnx_output_names",
        lambda path: json.loads(path.read_text(encoding="utf-8")),
    )
    calls = []

    def export_fixed_readouts(checkpoint: Path, output: Path, source_sha256: str):
        calls.append((checkpoint, source_sha256))
        artifact = output / "readouts.fixture.json"
        artifact.write_text('{"fixture":true}\n', encoding="utf-8")
        return artifact

    monkeypatch.setattr(prepare, "export_fixed_readouts", export_fixed_readouts)

    manifest = prepare.convert_model(source, tmp_path / "browser", "q8")

    assert calls == [(source.resolve(), digest)]
    assert len([entry for entry in manifest["files"] if entry["file"].startswith("readouts.")]) == 1


@pytest.fixture
def real_minimind_path() -> Path:
    configured = os.environ.get("LEGALFLY_TEST_MINIMIND_PATH")
    if not configured:
        pytest.skip("set LEGALFLY_TEST_MINIMIND_PATH to the pinned real checkpoint")
    path = Path(configured).expanduser().resolve()
    prepare.verify_source(path)
    return path


@pytest.fixture
def browser_artifacts():
    configured = os.environ.get("LEGALFLY_TEST_BROWSER_ARTIFACTS")
    if not configured:
        pytest.skip("set LEGALFLY_TEST_BROWSER_ARTIFACTS to a real q4 or q8 bundle")
    return load_browser_artifacts(Path(configured).expanduser().resolve())


def test_browser_backend_matches_python_labels(real_minimind_path, browser_artifacts):
    comparison = compare_backends(real_minimind_path, browser_artifacts, locked_cases())
    assert comparison.field_label_mismatches == []
    assert comparison.action_label_mismatches == []
    assert comparison.note_ranking_mismatches == []
