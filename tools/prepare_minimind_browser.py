"""Create a verified, content-addressed MiniMind bundle for browser inference."""

from __future__ import annotations

import argparse
import json
import os
import shutil
import tempfile
from pathlib import Path, PurePosixPath
from typing import Literal, TypedDict, cast

if __package__:
    from tools import prepare_minimind as source_contract
else:  # Support ``python tools/prepare_minimind_browser.py``.
    import prepare_minimind as source_contract

MODEL_ID = source_contract.MODEL_ID
REVISION = source_contract.REVISION
WEIGHTS_SHA256 = source_contract.WEIGHTS_SHA256
REQUIRED_FILES = source_contract.REQUIRED_FILES
SOURCE_TARGET = source_contract.TARGET
REPOSITORY_ROOT = Path(__file__).resolve().parents[1]
BROWSER_TARGET = REPOSITORY_ROOT / "models" / "minimind-3-browser"
WEB_TARGET = REPOSITORY_ROOT / "apps" / "web" / "public" / "minimind"
SCHEMA = "legalfly-minimind-browser/1"
OUTPUT_NAMES = ["logits", "last_hidden_state"]
QUANTIZATIONS = ("q4", "q8")

Quantization = Literal["q4", "q8"]


class BrowserFile(TypedDict):
    file: str
    bytes: int
    sha256: str


class BrowserManifest(TypedDict):
    schema: str
    model: str
    revision: str
    source_sha256: str
    files: list[BrowserFile]
    quantization: Quantization
    outputs: list[str]


def snapshot_download(*args, **kwargs):
    """Import the network dependency only for an explicit download operation."""
    from huggingface_hub import snapshot_download as download

    return download(*args, **kwargs)


def sha256(path: Path) -> str:
    return source_contract.sha256(path)


def _validated_quantization(quantization: str) -> Quantization:
    if quantization not in QUANTIZATIONS:
        raise ValueError("quantization must be q4 or q8")
    return cast(Quantization, quantization)


def download_source(source: Path) -> None:
    """Download only the files in the pinned source checkpoint contract."""
    snapshot_download(
        MODEL_ID,
        revision=REVISION,
        local_dir=source,
        allow_patterns=list(REQUIRED_FILES),
    )


def verify_source(source: Path) -> str:
    """Verify the pinned checkpoint and return its weights digest."""
    source = Path(source)
    missing = [name for name in REQUIRED_FILES if not (source / name).is_file()]
    if missing:
        raise ValueError(f"Missing checkpoint files at {source}: {', '.join(missing)}")

    weights_digest = sha256(source / "model.safetensors")
    if weights_digest != WEIGHTS_SHA256:
        raise ValueError(
            f"MiniMind model.safetensors SHA-256 mismatch at {source}; "
            "refusing to export these weights."
        )

    documents: dict[str, object] = {}
    for name in REQUIRED_FILES[1:]:
        try:
            document = json.loads((source / name).read_text(encoding="utf-8"))
        except (OSError, UnicodeDecodeError, json.JSONDecodeError) as exc:
            raise ValueError(f"Invalid JSON object in {name}") from exc
        if not isinstance(document, dict):
            raise ValueError(f"Invalid JSON object in {name}")
        documents[name] = document

    config = cast(dict[str, object], documents["config.json"])
    if config.get("model_type") != "qwen3":
        raise ValueError("MiniMind config.json must declare model_type qwen3")
    return weights_digest


def export_qwen3_onnx(source: Path, destination: Path) -> None:
    """Export Qwen3 logits and the final hidden state as a single ONNX graph."""
    try:
        import torch
        from transformers import AutoModelForCausalLM
    except ImportError as exc:  # pragma: no cover - depends on optional conversion extras
        raise RuntimeError(
            "Browser conversion requires the 'browser' optional dependencies"
        ) from exc

    model = AutoModelForCausalLM.from_pretrained(
        source,
        local_files_only=True,
        trust_remote_code=False,
        attn_implementation="eager",
        dtype="auto",
    )
    model.config.use_cache = False
    model.eval()

    class BrowserQwen3(torch.nn.Module):
        def __init__(self, causal_lm):
            super().__init__()
            self.causal_lm = causal_lm

        def forward(self, input_ids, attention_mask):
            result = self.causal_lm(
                input_ids=input_ids,
                attention_mask=attention_mask,
                use_cache=False,
                output_hidden_states=True,
                return_dict=True,
            )
            return result.logits, result.hidden_states[-1]

    wrapper = BrowserQwen3(model)
    input_ids = torch.ones((1, 8), dtype=torch.long)
    attention_mask = torch.ones_like(input_ids)
    destination.parent.mkdir(parents=True, exist_ok=True)
    torch.onnx.export(
        wrapper,
        (input_ids, attention_mask),
        destination,
        input_names=["input_ids", "attention_mask"],
        output_names=OUTPUT_NAMES,
        dynamic_axes={
            "input_ids": {0: "batch", 1: "sequence"},
            "attention_mask": {0: "batch", 1: "sequence"},
            "logits": {0: "batch", 1: "sequence"},
            "last_hidden_state": {0: "batch", 1: "sequence"},
        },
        opset_version=17,
        do_constant_folding=True,
    )

    try:
        import onnx
    except ImportError as exc:  # pragma: no cover - torch export also requires onnx
        raise RuntimeError(
            "Browser conversion requires the 'browser' optional dependencies"
        ) from exc
    graph_outputs = [entry.name for entry in onnx.load(destination).graph.output]
    if graph_outputs != OUTPUT_NAMES:
        raise ValueError(f"Unexpected ONNX outputs: {graph_outputs}")


def quantize_onnx(source: Path, destination: Path, quantization: str) -> None:
    """Apply the selected ONNX Runtime weight quantization."""
    selected = _validated_quantization(quantization)
    try:
        from onnxruntime.quantization import QuantType, quantize_dynamic
    except ImportError as exc:  # pragma: no cover - depends on optional conversion extras
        raise RuntimeError(
            "Browser conversion requires the 'browser' optional dependencies"
        ) from exc

    if selected == "q8":
        quantize_dynamic(
            str(source),
            str(destination),
            weight_type=QuantType.QInt8,
            per_channel=True,
        )
        return

    from onnxruntime.quantization import matmul_4bits_quantizer, quant_utils

    configuration = matmul_4bits_quantizer.DefaultWeightOnlyQuantConfig(
        block_size=128,
        is_symmetric=True,
        accuracy_level=4,
        quant_format=quant_utils.QuantFormat.QOperator,
        op_types_to_quantize=("MatMul", "Gather"),
        quant_axes=(("MatMul", 0), ("Gather", 1)),
    )
    model = quant_utils.load_model_with_shape_infer(source)
    quantizer = matmul_4bits_quantizer.MatMul4BitsQuantizer(
        model,
        nodes_to_exclude=None,
        nodes_to_include=None,
        algo_config=configuration,
    )
    quantizer.process()
    quantizer.model.save_model_to_file(str(destination), False)


def _content_addressed_name(path: Path, digest: str) -> str:
    if digest in path.name.split("."):
        return path.name
    return f"{path.stem}.{digest}{path.suffix}"


def build_manifest(
    output: Path,
    *,
    revision: str,
    quantization: str,
    source_sha256: str = WEIGHTS_SHA256,
) -> BrowserManifest:
    """Content-address export files and describe the immutable browser bundle."""
    selected = _validated_quantization(quantization)
    output = Path(output)
    candidates = sorted(
        (
            path
            for path in output.rglob("*")
            if path.is_file()
            and path.name != "manifest.json"
            and not path.name.startswith(".manifest.json.")
        ),
        key=lambda path: path.relative_to(output).as_posix(),
    )
    if not candidates:
        raise ValueError(f"No browser export files found at {output}")

    files: list[BrowserFile] = []
    for path in candidates:
        digest = sha256(path)
        destination = path.with_name(_content_addressed_name(path, digest))
        if destination != path:
            if destination.exists():
                if sha256(destination) != digest:
                    raise ValueError(f"Content-address collision at {destination}")
                path.unlink()
            else:
                path.replace(destination)
        files.append(
            {
                "file": destination.relative_to(output).as_posix(),
                "bytes": destination.stat().st_size,
                "sha256": digest,
            }
        )

    files.sort(key=lambda entry: entry["file"])
    return {
        "schema": SCHEMA,
        "model": MODEL_ID,
        "revision": revision,
        "source_sha256": source_sha256,
        "files": files,
        "quantization": selected,
        "outputs": list(OUTPUT_NAMES),
    }


def write_manifest(output: Path, manifest: BrowserManifest) -> Path:
    """Atomically publish manifest.json after all artifacts are durable."""
    output = Path(output)
    output.mkdir(parents=True, exist_ok=True)
    destination = output / "manifest.json"
    descriptor, temporary_name = tempfile.mkstemp(
        prefix=".manifest.json.", suffix=".tmp", dir=output
    )
    temporary = Path(temporary_name)
    try:
        with os.fdopen(descriptor, "w", encoding="utf-8", newline="\n") as handle:
            json.dump(manifest, handle, indent=2)
            handle.write("\n")
            handle.flush()
            os.fsync(handle.fileno())
        os.replace(temporary, destination)
    finally:
        temporary.unlink(missing_ok=True)
    return destination


def verify_browser_export(output: Path) -> BrowserManifest:
    """Verify manifest identity and every content-addressed artifact offline."""
    output = Path(output)
    manifest_path = output / "manifest.json"
    try:
        raw_manifest = json.loads(manifest_path.read_text(encoding="utf-8"))
    except (OSError, UnicodeDecodeError, json.JSONDecodeError) as exc:
        raise ValueError(f"Invalid browser manifest at {manifest_path}") from exc
    if not isinstance(raw_manifest, dict):
        raise ValueError(f"Invalid browser manifest at {manifest_path}")

    manifest = cast(BrowserManifest, raw_manifest)
    expected_values = {
        "schema": SCHEMA,
        "model": MODEL_ID,
        "revision": REVISION,
        "source_sha256": WEIGHTS_SHA256,
        "outputs": OUTPUT_NAMES,
    }
    for field, expected in expected_values.items():
        if manifest.get(field) != expected:
            raise ValueError(f"Browser manifest has invalid {field}")
    if manifest.get("quantization") not in QUANTIZATIONS:
        raise ValueError("Browser manifest has invalid quantization")

    files = manifest.get("files")
    if not isinstance(files, list) or not files:
        raise ValueError("Browser manifest has no files")
    for entry in files:
        if not isinstance(entry, dict):
            raise ValueError("Browser manifest contains an invalid file entry")
        relative_name = entry.get("file")
        digest = entry.get("sha256")
        expected_size = entry.get("bytes")
        if not isinstance(relative_name, str) or not isinstance(digest, str):
            raise ValueError("Browser manifest contains an invalid file entry")
        relative_path = PurePosixPath(relative_name)
        if relative_path.is_absolute() or ".." in relative_path.parts:
            raise ValueError(f"Browser manifest contains unsafe path {relative_name}")
        if digest not in relative_path.name.split("."):
            raise ValueError(f"Browser artifact is not content-addressed: {relative_name}")
        artifact = output.joinpath(*relative_path.parts)
        if not artifact.is_file():
            raise ValueError(f"Missing browser artifact {relative_name}")
        if sha256(artifact) != digest:
            raise ValueError(f"Browser artifact SHA-256 mismatch: {relative_name}")
        if artifact.stat().st_size != expected_size:
            raise ValueError(f"Browser artifact byte count mismatch: {relative_name}")
    return manifest


def _copy_atomically(source: Path, destination: Path) -> None:
    destination.parent.mkdir(parents=True, exist_ok=True)
    descriptor, temporary_name = tempfile.mkstemp(
        prefix=f".{destination.name}.", suffix=".tmp", dir=destination.parent
    )
    temporary = Path(temporary_name)
    try:
        with source.open("rb") as input_handle, os.fdopen(descriptor, "wb") as output_handle:
            shutil.copyfileobj(input_handle, output_handle)
            output_handle.flush()
            os.fsync(output_handle.fileno())
        os.replace(temporary, destination)
    finally:
        temporary.unlink(missing_ok=True)


def convert_model(source: Path, output: Path, quantization: str) -> BrowserManifest:
    """Verify, export, quantize, content-address, and atomically publish a bundle."""
    selected = _validated_quantization(quantization)
    source = Path(source).expanduser().resolve()
    output = Path(output).expanduser().resolve()
    source_digest = verify_source(source)
    output.parent.mkdir(parents=True, exist_ok=True)

    with tempfile.TemporaryDirectory(prefix=f".{output.name}-", dir=output.parent) as workspace:
        staging = Path(workspace)
        unquantized = staging / "model.fp32.onnx"
        quantized = staging / f"model.{selected}.onnx"
        export_qwen3_onnx(source, unquantized)
        quantize_onnx(unquantized, quantized, selected)
        unquantized.unlink(missing_ok=True)
        for name in REQUIRED_FILES[1:]:
            shutil.copy2(source / name, staging / name)

        manifest = build_manifest(
            staging,
            revision=REVISION,
            quantization=selected,
            source_sha256=source_digest,
        )
        write_manifest(staging, manifest)

        output.mkdir(parents=True, exist_ok=True)
        for entry in manifest["files"]:
            relative_path = PurePosixPath(entry["file"])
            _copy_atomically(
                staging.joinpath(*relative_path.parts),
                output.joinpath(*relative_path.parts),
            )
        _copy_atomically(staging / "manifest.json", output / "manifest.json")

    verify_browser_export(output)
    return manifest


def _parser() -> argparse.ArgumentParser:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--download", action="store_true", help="Download the pinned allowlist")
    parser.add_argument("--convert", action="store_true", help="Create a browser ONNX bundle")
    parser.add_argument("--check", action="store_true", help="Verify source and browser artifacts offline")
    parser.add_argument(
        "--quantization", choices=QUANTIZATIONS, default="q8", help="Weight quantization"
    )
    parser.add_argument(
        "--export-web",
        action="store_true",
        help="Use apps/web/public/minimind as the conversion or check target",
    )
    parser.add_argument("--source", type=Path, default=SOURCE_TARGET)
    parser.add_argument("--output", type=Path, default=BROWSER_TARGET)
    return parser


def main(argv: list[str] | None = None) -> int:
    parser = _parser()
    args = parser.parse_args(argv)
    if not (args.download or args.convert or args.check):
        parser.error("choose at least one of --download, --convert, or --check")

    source = args.source.expanduser().resolve()
    output = (WEB_TARGET if args.export_web else args.output).expanduser().resolve()
    if args.download:
        download_source(source)
        verify_source(source)
    if args.convert:
        manifest = convert_model(source, output, args.quantization)
        print(json.dumps(manifest, indent=2))
    if args.check:
        verify_source(source)
        manifest = verify_browser_export(output)
        print(json.dumps(manifest, indent=2))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
