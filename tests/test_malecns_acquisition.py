import base64
import hashlib
import json

import pytest

from tools import prepare_malecns


def test_official_objects_are_acquired_at_the_recorded_gcs_generation():
    weights = prepare_malecns.OBJECTS["weights"]

    assert prepare_malecns.versioned_url(weights) == (
        "https://storage.googleapis.com/flyem-male-cns/v1.0/connectome-data/"
        "flat-connectome/connectome-weights-male-cns-v1.0-minconf-0.5.feather"
        "?generation=1780494887545976"
    )


def test_download_verifies_integrity_and_records_the_acquisition_url(tmp_path, monkeypatch):
    payload = b"official release fixture"
    publisher_md5 = base64.b64encode(hashlib.md5(payload).digest()).decode()
    source = {
        "url": "https://storage.googleapis.com/example/connectome.feather",
        "generation": "12345",
        "md5_b64": publisher_md5,
        "size": len(payload),
    }
    requested = []

    def retrieve(url, destination):
        requested.append(url)
        destination.write_bytes(payload)

    monkeypatch.setattr(prepare_malecns, "RAW", tmp_path)
    monkeypatch.setattr(prepare_malecns, "OBJECTS", {"weights": source})
    monkeypatch.setattr(prepare_malecns.urllib.request, "urlretrieve", retrieve)

    prepare_malecns.download()

    provenance = json.loads((tmp_path / "provenance.json").read_text())
    assert requested == ["https://storage.googleapis.com/example/connectome.feather?generation=12345"]
    assert provenance["objects"]["weights"]["md5_b64"] == publisher_md5
    assert provenance["objects"]["weights"]["sha256"] == hashlib.sha256(payload).hexdigest()
    assert provenance["objects"]["weights"]["acquisition_url"].endswith("?generation=12345")


def test_download_rejects_content_that_fails_publisher_integrity(tmp_path, monkeypatch):
    source = {
        "url": "https://storage.googleapis.com/example/connectome.feather",
        "generation": "12345",
        "md5_b64": base64.b64encode(hashlib.md5(b"expected").digest()).decode(),
        "size": len(b"corrupt!"),
    }

    def retrieve(_url, destination):
        destination.write_bytes(b"corrupt!")

    monkeypatch.setattr(prepare_malecns, "RAW", tmp_path)
    monkeypatch.setattr(prepare_malecns, "OBJECTS", {"weights": source})
    monkeypatch.setattr(prepare_malecns.urllib.request, "urlretrieve", retrieve)

    with pytest.raises(SystemExit, match="Integrity check failed"):
        prepare_malecns.download()
