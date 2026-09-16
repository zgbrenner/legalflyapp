"""Create a verified, content-addressed MiniMind bundle for browser inference."""

from __future__ import annotations

import argparse
import json
import os
import shutil
import sys
import tempfile
from pathlib import Path, PurePosixPath, PureWindowsPath
from typing import Literal, TypedDict, cast

if __package__:
    from tools import prepare_minimind as source_contract
else:  # Support ``python tools/prepare_minimind_browser.py`` from any directory.
    # The readout exporter imports ``apps.minimind_adapter``; as a plain script
    # only ``tools/`` is on sys.path, so add the repository root explicitly.
    _REPOSITORY_ROOT = str(Path(__file__).resolve().parents[1])
    if _REPOSITORY_ROOT not in sys.path:
        sys.path.insert(0, _REPOSITORY_ROOT)
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
Q8_PARITY_MODULES = ("causal_lm.model.layers.1.mlp.gate_proj",)

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
    quantization_config: dict[str, object]
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


def _quantization_config(quantization: Quantization) -> dict[str, object]:
    if quantization == "q8":
        return {
            "method": "weight-only",
            "bits": 8,
            "block_size": 32,
            "modules": list(Q8_PARITY_MODULES),
        }
    return {
        "method": "weight-only",
        "bits": 4,
        "block_size": 128,
        "modules": ["*"],
    }


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


def export_fixed_readouts(source: Path, output: Path, source_sha256: str) -> Path:
    """Fit and export the immutable browser readouts from the locked teaching cases."""
    if __package__:
        from tools.export_minimind_readouts import export_readouts, locked_cases
    else:  # Support ``python tools/prepare_minimind_browser.py --convert``.
        from export_minimind_readouts import export_readouts, locked_cases

    return export_readouts(
        source,
        locked_cases(),
        output,
        source_sha256=source_sha256,
    )


def _onnx_output_names(path: Path) -> list[str]:
    try:
        import onnx
    except ImportError as exc:  # pragma: no cover - depends on optional conversion extras
        raise RuntimeError(
            "Browser conversion requires the 'browser' optional dependencies"
        ) from exc
    model = onnx.load(path, load_external_data=False)
    return [entry.name for entry in model.graph.output]


def validate_onnx_outputs(path: Path) -> None:
    output_names = _onnx_output_names(path)
    if output_names != OUTPUT_NAMES:
        raise ValueError(
            f"Unexpected ONNX outputs in {path}: expected {OUTPUT_NAMES}, got {output_names}"
        )


def export_torch_onnx(module, inputs: tuple, destination: Path) -> None:
    """Export through PyTorch's Qwen3-compatible dynamo path as one ONNX file."""
    import torch

    torch.onnx.export(
        module,
        inputs,
        destination,
        input_names=["input_ids", "attention_mask"],
        output_names=OUTPUT_NAMES,
        dynamic_axes={
            "input_ids": {0: "batch", 1: "sequence"},
            "attention_mask": {0: "batch", 1: "sequence"},
            "logits": {0: "batch", 1: "sequence"},
            "last_hidden_state": {0: "batch", 1: "sequence"},
        },
        opset_version=18,
        do_constant_folding=True,
        dynamo=True,
        external_data=False,
    )


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
        dtype=torch.float32,
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
    wrapper.eval()
    input_ids = torch.ones((1, 8), dtype=torch.long)
    attention_mask = torch.ones_like(input_ids)
    destination.parent.mkdir(parents=True, exist_ok=True)
    export_torch_onnx(wrapper, (input_ids, attention_mask), destination)

    validate_onnx_outputs(destination)


def quantize_onnx(source: Path, destination: Path, quantization: str) -> None:
    """Apply the selected ONNX Runtime weight quantization."""
    selected = _validated_quantization(quantization)
    try:
        from onnxruntime.quantization import quant_utils
    except ImportError as exc:  # pragma: no cover - depends on optional conversion extras
        raise RuntimeError(
            "Browser conversion requires the 'browser' optional dependencies"
        ) from exc

    try:
        from onnxruntime.quantization import matmul_nbits_quantizer as nbits_quantizer
    except ImportError:
        if selected == "q8":  # pragma: no cover - incompatible optional dependency
            raise RuntimeError(
                "q8 browser conversion requires ONNX Runtime's MatMulNBits quantizer"
            )
        from onnxruntime.quantization import matmul_4bits_quantizer as nbits_quantizer

    configuration = nbits_quantizer.DefaultWeightOnlyQuantConfig(
        block_size=32 if selected == "q8" else 128,
        is_symmetric=True,
        accuracy_level=4,
        quant_format=quant_utils.QuantFormat.QOperator,
        op_types_to_quantize=("MatMul",) if selected == "q8" else ("MatMul", "Gather"),
        quant_axes=(("MatMul", 0),) if selected == "q8" else (("MatMul", 0), ("Gather", 1)),
        **({"bits": 8} if selected == "q8" else {}),
    )
    model = quant_utils.load_model_with_shape_infer(source)
    nodes_to_include = None
    if selected == "q8":
        nodes_to_include = []
        for node in model.graph.node:
            metadata = {entry.key: entry.value for entry in node.metadata_props}
            namespace = metadata.get("namespace", "")
            if any(f"/{module}:" in namespace for module in Q8_PARITY_MODULES):
                nodes_to_include.append(node.name)
        if len(nodes_to_include) != len(Q8_PARITY_MODULES):
            raise ValueError("Exported ONNX graph does not contain every parity-proven q8 module")
        # ONNX Runtime treats an empty op-type set as the MatMul default, so clear
        # the constructed set explicitly and select only the semantic nodes above.
        configuration.op_types_to_quantize.clear()
    quantizer_type = getattr(
        nbits_quantizer,
        "MatMulNBitsQuantizer",
        getattr(nbits_quantizer, "MatMul4BitsQuantizer", None),
    )
    if quantizer_type is None:  # pragma: no cover - incompatible optional dependency
        raise RuntimeError("Installed ONNX Runtime does not provide weight-only q4 quantization")
    quantizer = quantizer_type(
        model,
        nodes_to_exclude=None,
        nodes_to_include=nodes_to_include,
        algo_config=configuration,
    )
    quantizer.process()
    strip_exporter_metadata(quantizer.model.model)
    quantizer.model.save_model_to_file(str(destination), False)


def strip_exporter_metadata(model) -> None:
    """Remove per-node exporter provenance so the shipped graph is host-independent.

    The PyTorch dynamo exporter annotates every node with ``pkg.torch.onnx.stack_trace``,
    ``namespace``, and similar metadata. Those strings embed absolute source paths,
    interpreter-specific line numbers, and local module names, which would ship the
    build host's file layout to every visitor and make byte-identical conversion
    impossible across machines. The q8 allowlist is resolved from ``namespace``
    before quantization, so nothing downstream needs this metadata.
    """
    def scrub(entry) -> None:
        del entry.metadata_props[:]
        entry.doc_string = ""

    for node in model.graph.node:
        scrub(node)
    for function in model.functions:
        for node in function.node:
            scrub(node)
    # torch.export also tags every parameter and input tensor with its
    # graph-signature role and original module path.
    for tensor in model.graph.initializer:
        scrub(tensor)
    for value in (*model.graph.input, *model.graph.output, *model.graph.value_info):
        scrub(value)
    # torch.export records the whole graph signature and range constraints on
    # the graph itself.
    scrub(model.graph)
    for function in model.functions:
        del function.metadata_props[:]
        function.doc_string = ""
    del model.metadata_props[:]
    model.doc_string = ""


EXPORTER_PROVENANCE_MARKERS = (
    b"pkg.torch",
    b"pkg.onnxscript",
    b"stack_trace",
    b"site-packages",
    b"/home/",
    b"/repo/",
    b"/Users/",
    b"C:\\",
)


def assert_no_exporter_provenance(path: Path) -> None:
    """Fail if the serialized graph still carries exporter metadata or host paths."""
    data = Path(path).read_bytes()
    found = [marker.decode("utf-8", "replace") for marker in EXPORTER_PROVENANCE_MARKERS if marker in data]
    if found:
        raise ValueError(
            f"Browser ONNX graph {path.name} carries exporter provenance: {', '.join(found)}"
        )


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
        "quantization_config": _quantization_config(selected),
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


def resolve_artifact_path(output: Path, relative_name: str) -> Path:
    """Resolve one canonical manifest path without allowing platform-specific escapes."""
    if not isinstance(relative_name, str) or "\\" in relative_name:
        raise ValueError(f"Browser manifest contains unsafe path {relative_name}")
    components = relative_name.split("/")
    posix_path = PurePosixPath(relative_name)
    windows_path = PureWindowsPath(relative_name)
    if (
        any(component in {"", ".", ".."} for component in components)
        or posix_path.is_absolute()
        or bool(windows_path.drive)
        or bool(windows_path.root)
    ):
        raise ValueError(f"Browser manifest contains unsafe path {relative_name}")

    output_root = Path(output).resolve()
    artifact = output_root.joinpath(*components).resolve()
    try:
        artifact.relative_to(output_root)
    except ValueError as exc:
        raise ValueError(f"Browser manifest contains unsafe path {relative_name}") from exc
    return artifact


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
    selected = _validated_quantization(cast(str, manifest["quantization"]))
    if manifest.get("quantization_config") != _quantization_config(selected):
        raise ValueError("Browser manifest has invalid quantization_config")

    files = manifest.get("files")
    if not isinstance(files, list) or not files:
        raise ValueError("Browser manifest has no files")
    onnx_models: list[Path] = []
    for entry in files:
        if not isinstance(entry, dict):
            raise ValueError("Browser manifest contains an invalid file entry")
        relative_name = entry.get("file")
        digest = entry.get("sha256")
        expected_size = entry.get("bytes")
        if not isinstance(relative_name, str) or not isinstance(digest, str):
            raise ValueError("Browser manifest contains an invalid file entry")
        if (
            not isinstance(expected_size, int)
            or isinstance(expected_size, bool)
            or expected_size < 0
        ):
            raise ValueError(f"Browser manifest has invalid byte count for {relative_name}")
        artifact = resolve_artifact_path(output, relative_name)
        if digest not in artifact.name.split("."):
            raise ValueError(f"Browser artifact is not content-addressed: {relative_name}")
        if not artifact.is_file():
            raise ValueError(f"Missing browser artifact {relative_name}")
        if sha256(artifact) != digest:
            raise ValueError(f"Browser artifact SHA-256 mismatch: {relative_name}")
        if artifact.stat().st_size != expected_size:
            raise ValueError(f"Browser artifact byte count mismatch: {relative_name}")
        if artifact.suffix == ".onnx":
            onnx_models.append(artifact)
    if len(onnx_models) != 1:
        raise ValueError("Browser manifest must contain exactly one ONNX model")
    validate_onnx_outputs(onnx_models[0])
    assert_no_exporter_provenance(onnx_models[0])
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
        validate_onnx_outputs(quantized)
        unquantized.unlink(missing_ok=True)
        export_fixed_readouts(source, staging, source_digest)
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
            _copy_atomically(
                resolve_artifact_path(staging, entry["file"]),
                resolve_artifact_path(output, entry["file"]),
            )
        _copy_atomically(staging / "manifest.json", output / "manifest.json")

    verify_browser_export(output)
    return manifest


def _parser() -> argparse.ArgumentParser:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--download", action="store_true", help="Download the pinned allowlist")
    parser.add_argument("--convert", action="store_true", help="Create a browser ONNX bundle")
    parser.add_argument("--check", action="store_true", help="Verify browser artifacts offline")
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
        manifest = verify_browser_export(output)
        print(json.dumps(manifest, indent=2))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
