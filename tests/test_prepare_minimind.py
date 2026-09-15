import json
import hashlib

import pytest

from tools import prepare_minimind as setup


def test_check_missing_checkpoint_is_offline_and_actionable(tmp_path, monkeypatch, capsys):
    monkeypatch.setenv("LEGALFLY_MINIMIND_PATH", str(tmp_path))
    monkeypatch.setattr("sys.argv", ["prepare_minimind.py", "--check"])
    monkeypatch.setattr(setup, "snapshot_download", lambda *a, **kw: pytest.fail("offline check downloaded"))
    with pytest.raises(SystemExit) as error:
        setup.main()
    assert error.value.code == 1
    assert "model.safetensors" in capsys.readouterr().err


def test_download_rejects_incomplete_snapshot_without_certifying_it(tmp_path, monkeypatch):
    monkeypatch.setattr(setup, "TARGET", tmp_path)
    monkeypatch.setenv("LEGALFLY_MINIMIND_PATH", str(tmp_path))
    monkeypatch.setattr("sys.argv", ["prepare_minimind.py"])
    monkeypatch.setattr(setup, "snapshot_download", lambda *a, **kw: None)
    with pytest.raises(SystemExit) as error:
        setup.main()
    assert error.value.code == 1
    assert not (tmp_path / "provenance.json").exists()


def test_check_rejects_corrupt_weights_even_with_claimed_provenance(tmp_path, monkeypatch, capsys):
    for name in ["config.json", "tokenizer.json", "tokenizer_config.json"]:
        (tmp_path / name).write_text("{}")
    (tmp_path / "model.safetensors").write_bytes(b"not a checkpoint")
    (tmp_path / "provenance.json").write_text(json.dumps({"revision": setup.REVISION}))
    monkeypatch.setenv("LEGALFLY_MINIMIND_PATH", str(tmp_path))
    monkeypatch.setattr("sys.argv", ["prepare_minimind.py", "--check"])
    monkeypatch.setattr(setup, "snapshot_download", lambda *a, **kw: pytest.fail("offline check downloaded"))
    with pytest.raises(SystemExit) as error:
        setup.main()
    assert error.value.code == 1
    assert "SHA-256" in capsys.readouterr().err


def test_download_uses_runtime_path_and_records_verified_files(tmp_path, monkeypatch, capsys):
    # Tiny test-only bytes exercise hashing; they are not a model/runtime substitute.
    weights = b"checksum test fixture"
    monkeypatch.setattr(setup, "WEIGHTS_SHA256", hashlib.sha256(weights).hexdigest())
    monkeypatch.setenv("LEGALFLY_MINIMIND_PATH", str(tmp_path))
    monkeypatch.setattr("sys.argv", ["prepare_minimind.py"])

    def download(model, *, revision, local_dir, allow_patterns):
        assert model == "jingyaogong/minimind-3"
        assert revision == "f92512d4cd6142fa9acc0d6022375049a8974bf6"
        assert local_dir == tmp_path
        (local_dir / "model.safetensors").write_bytes(weights)
        for name in ["config.json", "tokenizer.json", "tokenizer_config.json"]:
            (local_dir / name).write_text("{}")

    monkeypatch.setattr(setup, "snapshot_download", download)
    setup.main()
    provenance = json.loads((tmp_path / "provenance.json").read_text())
    assert provenance["files"]["model.safetensors"]["sha256"] == hashlib.sha256(weights).hexdigest()
    before = (tmp_path / "provenance.json").read_bytes()
    monkeypatch.setattr("sys.argv", ["prepare_minimind.py", "--check"])
    monkeypatch.setattr(setup, "snapshot_download", lambda *a, **kw: pytest.fail("offline check downloaded"))
    setup.main()
    assert (tmp_path / "provenance.json").read_bytes() == before
    assert "NOT been checked" in capsys.readouterr().out
