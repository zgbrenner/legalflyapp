import hashlib
import json
import struct
from pathlib import Path

import numpy as np
import pytest

from tools.prepare_malecns import write_anatomy_bin


def test_anatomy_binary_preserves_ids_coordinates_and_flags(tmp_path):
    path = tmp_path / "anatomy.bin"
    body_ids = np.array([10001, 10002], dtype=np.uint32)
    coordinates = np.array([[10, 20, 30], [-2147483648] * 3], dtype=np.int32)
    flags = np.array([9, 6], dtype=np.uint8)

    digest = write_anatomy_bin(path, body_ids, coordinates, flags)
    payload = path.read_bytes()

    assert payload[:8] == b"LFLYAN1\0"
    assert struct.unpack("<II", payload[8:16]) == (2, 1)
    assert payload[16:24] == body_ids.astype("<u4").tobytes()
    assert payload[24:48] == coordinates.astype("<i4").tobytes()
    assert payload[48:] == flags.tobytes()
    assert digest == hashlib.sha256(payload).hexdigest()


def test_generated_anatomy_matches_every_available_official_soma_location():
    root = Path(__file__).resolve().parents[1]
    annotation_path = root / "data/raw/malecns/v1.0/body-annotations-male-cns-v1.0-minconf-0.5.feather"
    meta_path = root / "data/processed/malecns/v1.0/meta.json"
    anatomy_path = root / "data/processed/malecns/v1.0/browser/malecns-anatomy.bin"
    if not all(path.exists() for path in (annotation_path, meta_path, anatomy_path)):
        pytest.skip("Official MaleCNS files and generated anatomy are required for full-data verification")
    import pyarrow.feather as feather

    annotations = feather.read_table(annotation_path, columns=["bodyId", "status", "somaLocation"]).to_pandas()
    meta = json.loads(meta_path.read_text())
    payload = anatomy_path.read_bytes()
    n, coordinate_count = struct.unpack("<II", payload[8:16])
    body_ids = np.frombuffer(payload, dtype="<u4", count=n, offset=16)
    coordinates = np.frombuffer(payload, dtype="<i4", count=n * 3, offset=16 + n * 4).reshape(n, 3)
    flags = np.frombuffer(payload, dtype=np.uint8, count=n, offset=16 + n * 16)
    assert np.array_equal(body_ids, np.asarray(meta["body_ids"], dtype=np.uint32))
    released = annotations[annotations.status.eq("Traced")].set_index("bodyId")["somaLocation"].to_dict()
    expected_present = 0
    for index, body_id in enumerate(body_ids):
        soma = released.get(int(body_id))
        if isinstance(soma, np.ndarray) and len(soma) >= 3:
            expected_present += 1
            assert flags[index] & 8
            assert np.array_equal(coordinates[index], np.asarray(soma[:3], dtype=np.int32))
        else:
            assert not flags[index] & 8
            assert np.all(coordinates[index] == np.iinfo(np.int32).min)
    assert coordinate_count == expected_present == 140024
