import hashlib
import json
import subprocess
import sys
from pathlib import Path

import pytest

from tools import prepare_minimind_browser as prepare


REVISION = "f92512d4cd6142fa9acc0d6022375049a8974bf6"


def make_minimal_checkpoint(tmp_path: Path, *, weights: bytes = b"fixture weights") -> Path:
    source = tmp_path / "checkpoint"
    source.mkdir()
    (source / "model.safetensors").write_bytes(weights)
    (source / "config.json").write_text(
        json.dumps({"model_type": "qwen3", "architectures": ["Qwen3ForCausalLM"]}),
        encoding="utf-8",
    )
    (source / "tokenizer.json").write_text("{}", encoding="utf-8")
    (source / "tokenizer_config.json").write_text("{}", encoding="utf-8")
    return source


def make_fixture_export(tmp_path: Path) -> Path:
    output = tmp_path / "export"
    output.mkdir()
    (output / "model.q8.onnx").write_text(
        json.dumps(["logits", "last_hidden_state"]), encoding="utf-8"
    )
    (output / "tokenizer.json").write_text('{"version":"1.0"}', encoding="utf-8")
    return output


def read_fixture_onnx_outputs(path: Path) -> list[str]:
    return json.loads(path.read_text(encoding="utf-8"))


def test_manifest_rejects_wrong_source_hash(tmp_path):
    source = make_minimal_checkpoint(tmp_path, weights=b"wrong")
    with pytest.raises(ValueError, match="SHA-256"):
        prepare.verify_source(source)


def test_manifest_uses_content_addressed_files(tmp_path):
    fixture_export = make_fixture_export(tmp_path)
    manifest = prepare.build_manifest(
        fixture_export,
        revision=REVISION,
        quantization="q8",
    )

    assert manifest["schema"] == "legalfly-minimind-browser/1"
    assert manifest["model"] == "jingyaogong/minimind-3"
    assert manifest["revision"] == REVISION
    assert manifest["source_sha256"] == prepare.WEIGHTS_SHA256
    assert all(entry["sha256"] in entry["file"] for entry in manifest["files"])
    assert manifest["outputs"] == ["logits", "last_hidden_state"]
    assert sorted(path.name for path in fixture_export.iterdir()) == sorted(
        entry["file"] for entry in manifest["files"]
    )


def test_download_uses_only_the_checkpoint_allowlist(tmp_path, monkeypatch):
    calls = []

    def snapshot_download(model, *, revision, local_dir, allow_patterns):
        calls.append((model, revision, local_dir, allow_patterns))

    monkeypatch.setattr(prepare, "snapshot_download", snapshot_download)
    prepare.download_source(tmp_path)

    assert calls == [
        (
            "jingyaogong/minimind-3",
            REVISION,
            tmp_path,
            list(prepare.REQUIRED_FILES),
        )
    ]
    assert not any("*" in pattern for pattern in calls[0][3])


def test_script_help_works_when_invoked_by_file_path():
    result = subprocess.run(
        [sys.executable, prepare.__file__, "--help"],
        capture_output=True,
        text=True,
        check=False,
    )

    assert result.returncode == 0, result.stderr
    assert "--quantization {q4,q8}" in result.stdout


@pytest.mark.parametrize(
    "relative_name",
    [
        r"C:\outside\model.deadbeef.onnx",
        r"\\server\share\model.deadbeef.onnx",
        r"..\outside\model.deadbeef.onnx",
        "/absolute/model.deadbeef.onnx",
        "nested//model.deadbeef.onnx",
        "nested/./model.deadbeef.onnx",
        "",
        ".",
    ],
)
def test_artifact_path_rejects_noncanonical_or_absolute_names(tmp_path, relative_name):
    with pytest.raises(ValueError, match="unsafe"):
        prepare.resolve_artifact_path(tmp_path, relative_name)


def test_artifact_path_accepts_normal_content_addressed_name(tmp_path):
    name = "nested/model.0123456789abcdef.onnx"

    assert prepare.resolve_artifact_path(tmp_path, name) == (tmp_path / name).resolve()


def test_artifact_path_rejects_symlink_escape(tmp_path):
    output = tmp_path / "bundle"
    outside = tmp_path / "outside"
    output.mkdir()
    outside.mkdir()
    link = output / "linked"
    try:
        link.symlink_to(outside, target_is_directory=True)
    except OSError as exc:
        if sys.platform != "win32":
            pytest.skip(f"symlinks unavailable: {exc}")
        junction = subprocess.run(
            ["cmd", "/c", "mklink", "/J", str(link), str(outside)],
            capture_output=True,
            text=True,
            check=False,
        )
        if junction.returncode:
            pytest.skip(f"junctions unavailable: {junction.stderr}")

    with pytest.raises(ValueError, match="unsafe"):
        prepare.resolve_artifact_path(output, "linked/model.0123456789abcdef.onnx")


def test_convert_model_packages_verified_quantized_export(tmp_path, monkeypatch):
    weights = b"verified source fixture"
    source = make_minimal_checkpoint(tmp_path, weights=weights)
    output = tmp_path / "browser"
    monkeypatch.setattr(prepare, "WEIGHTS_SHA256", hashlib.sha256(weights).hexdigest())

    def export_qwen3(checkpoint, destination):
        assert checkpoint == source
        destination.write_bytes(b"fp32 onnx")

    def quantize(source_model, destination, quantization):
        assert source_model.read_bytes() == b"fp32 onnx"
        assert quantization == "q4"
        destination.write_text(
            json.dumps(["logits", "last_hidden_state"]), encoding="utf-8"
        )

    monkeypatch.setattr(prepare, "export_qwen3_onnx", export_qwen3)
    monkeypatch.setattr(prepare, "quantize_onnx", quantize)
    monkeypatch.setattr(
        prepare, "_onnx_output_names", read_fixture_onnx_outputs, raising=False
    )

    manifest = prepare.convert_model(source, output, "q4")

    written = json.loads((output / "manifest.json").read_text(encoding="utf-8"))
    assert written == manifest
    assert manifest["quantization"] == "q4"
    assert manifest["source_sha256"] == hashlib.sha256(weights).hexdigest()
    assert all((output / entry["file"]).is_file() for entry in manifest["files"])
    assert not (output / "model.fp32.onnx").exists()
    assert not list(output.glob("*.tmp"))


@pytest.mark.parametrize(
    "outputs",
    [
        ["logits"],
        ["last_hidden_state", "logits"],
        ["logits", "last_hidden_state", "extra"],
    ],
)
def test_convert_model_rejects_quantized_graph_with_wrong_outputs(
    tmp_path, monkeypatch, outputs
):
    weights = b"verified source fixture"
    source = make_minimal_checkpoint(tmp_path, weights=weights)
    output = tmp_path / "browser"
    monkeypatch.setattr(prepare, "WEIGHTS_SHA256", hashlib.sha256(weights).hexdigest())
    monkeypatch.setattr(
        prepare,
        "export_qwen3_onnx",
        lambda checkpoint, destination: destination.write_bytes(b"fp32 onnx"),
    )
    monkeypatch.setattr(
        prepare,
        "quantize_onnx",
        lambda source_model, destination, quantization: destination.write_text(
            json.dumps(outputs), encoding="utf-8"
        ),
    )
    monkeypatch.setattr(
        prepare, "_onnx_output_names", read_fixture_onnx_outputs, raising=False
    )

    with pytest.raises(ValueError, match="ONNX outputs"):
        prepare.convert_model(source, output, "q8")

    assert not (output / "manifest.json").exists()


def test_convert_model_rejects_unknown_quantization_before_export(tmp_path):
    source = make_minimal_checkpoint(tmp_path)

    with pytest.raises(ValueError, match="q4 or q8"):
        prepare.convert_model(source, tmp_path / "browser", "fp16")


def test_verify_browser_export_detects_artifact_corruption(tmp_path):
    fixture_export = make_fixture_export(tmp_path)
    manifest = prepare.build_manifest(
        fixture_export,
        revision=REVISION,
        quantization="q8",
    )
    prepare.write_manifest(fixture_export, manifest)
    artifact = fixture_export / manifest["files"][0]["file"]
    artifact.write_bytes(b"corrupt")

    with pytest.raises(ValueError, match="SHA-256"):
        prepare.verify_browser_export(fixture_export)


def test_verify_browser_export_rejects_wrong_onnx_outputs(tmp_path, monkeypatch):
    fixture_export = make_fixture_export(tmp_path)
    model = fixture_export / "model.q8.onnx"
    model.write_text(json.dumps(["logits"]), encoding="utf-8")
    manifest = prepare.build_manifest(
        fixture_export,
        revision=REVISION,
        quantization="q8",
    )
    prepare.write_manifest(fixture_export, manifest)
    monkeypatch.setattr(
        prepare, "_onnx_output_names", read_fixture_onnx_outputs, raising=False
    )

    with pytest.raises(ValueError, match="ONNX outputs"):
        prepare.verify_browser_export(fixture_export)


@pytest.mark.parametrize("invalid_size", [True, False, 1.0, "1", -1])
def test_verify_browser_export_rejects_non_integer_byte_counts(
    tmp_path, invalid_size
):
    fixture_export = make_fixture_export(tmp_path)
    manifest = prepare.build_manifest(
        fixture_export,
        revision=REVISION,
        quantization="q8",
    )
    manifest["files"][0]["bytes"] = invalid_size
    prepare.write_manifest(fixture_export, manifest)

    with pytest.raises(ValueError, match="invalid byte count"):
        prepare.verify_browser_export(fixture_export)


def test_check_verifies_browser_artifacts_without_source_checkpoint(
    tmp_path, monkeypatch, capsys
):
    fixture_export = make_fixture_export(tmp_path)
    manifest = prepare.build_manifest(
        fixture_export,
        revision=REVISION,
        quantization="q8",
    )
    prepare.write_manifest(fixture_export, manifest)
    monkeypatch.setattr(
        prepare, "_onnx_output_names", read_fixture_onnx_outputs, raising=False
    )

    result = prepare.main(
        [
            "--check",
            "--source",
            str(tmp_path / "missing-checkpoint"),
            "--output",
            str(fixture_export),
        ]
    )

    assert result == 0
    assert '"schema": "legalfly-minimind-browser/1"' in capsys.readouterr().out
