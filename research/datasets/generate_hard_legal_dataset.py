"""Harder legal/compliance sensitive-information dataset.

Designed to defeat shallow pattern matching:
- statute/section numbers that look like phones
- dates that look like DOBs but are filing dates
- redacted / partial identifiers
- privilege and confidentiality language without PII
- adversarial formatting and legal boilerplate negatives
"""

from __future__ import annotations

import argparse
import hashlib
import json
import random
import re
from pathlib import Path
from typing import Any

from research.labels import LABELS

REPO_ROOT = Path(__file__).resolve().parents[2]
DEFAULT_OUT = REPO_ROOT / "data" / "demo" / "sensitive_hard"

FIRST = ["Alex", "Jordan", "Sam", "Riley", "Casey", "Morgan", "Taylor", "Quinn", "Avery", "Parker"]
LAST = ["Nguyen", "Patel", "Garcia", "Smith", "Chen", "Okoye", "Andersen", "Rossi", "Kim", "Lopez"]
STREETS = ["Main Street", "Oak Avenue", "Pine Road", "Cedar Lane", "Maple Court"]
CITIES = ["Springfield", "Riverton", "Fairview", "Maplewood", "Brookside"]
DOMAINS = ["example.com", "example.org", "mail.test", "corp.example"]


def _rng(seed: int) -> random.Random:
    return random.Random(seed)


def _noise(text: str, rng: random.Random) -> str:
    mode = rng.choice(["plain", "upper", "lower", "spaces", "punct", "nbsp"])
    if mode == "upper":
        return text.upper()
    if mode == "lower":
        return text.lower()
    if mode == "spaces":
        return re.sub(r"\s+", "  ", text)
    if mode == "punct":
        return text.replace(",", " ,").replace(".", " .")
    if mode == "nbsp":
        return text.replace(" ", "\u00a0", 1)
    return text


def _email(rng: random.Random) -> str:
    return f"{rng.choice(FIRST).lower()}.{rng.choice(LAST).lower()}{rng.randint(1,99)}@{rng.choice(DOMAINS)}"


def _phone(rng: random.Random) -> str:
    a, b, c = rng.randint(200, 989), rng.randint(200, 999), rng.randint(1000, 9999)
    return rng.choice(
        [f"{a}-{b}-{c}", f"({a}) {b}-{c}", f"{a}.{b}.{c}", f"+1 {a} {b} {c}"]
    )


def _ssn(rng: random.Random) -> str:
    return f"{rng.randint(100,899)}-{rng.randint(10,99)}-{rng.randint(1000,9999)}"


def _person(rng: random.Random) -> str:
    return f"{rng.choice(FIRST)} {rng.choice(LAST)}"


def _address(rng: random.Random) -> str:
    return f"{rng.randint(100,9999)} {rng.choice(STREETS)}, {rng.choice(CITIES)}, ST {rng.randint(10000,99999)}"


HARD_NEGATIVES = [
    "Call Section 555 of the statute before filing.",
    "See Exhibit 123-45-6789 attached hereto.",
    "The case was docketed as 2024-CV-5551234.",
    "Revenue grew 12% year over year.",
    "Notices may be delivered electronically under Section 12.",
    "The court entered judgment on March 4, 1998.",
    "Attorney-client privilege is asserted as to the highlighted passages.",
    "This communication is confidential and intended solely for counsel.",
    "Supplier shall indemnify Customer from all claims arising hereunder.",
    "Governing law is the State of Example without regard to conflicts principles.",
    "Work product doctrine protects draft strategy memoranda.",
    "Please redline Section 4.2 and circulate via the deal room.",
    "Account '555-operations' is an internal cost center, not a phone number.",
    "SSN-format placeholders in fixtures must remain synthetic.",
    "Contact the clerk of court for the filing window.",
    "The arbitration clause survives termination.",
    "Nothing herein creates a partnership or joint venture.",
    "Force majeure includes epidemics and governmental action.",
    "Payment is due net thirty (30) days from invoice.",
    "Defined terms appear in Article I.",
]

HARD_POSITIVES: dict[str, list[str]] = {
    "EMAIL": [
        "Counsel: please route the privilege log to {email} only.",
        "Reply-all accidentally exposed {email} outside the clean team.",
        "Billing contact for outside counsel is {email}.",
    ],
    "PHONE": [
        "Chambers may reach the witness overnight at {phone}.",
        "For service of process questions call {phone}.",
        "Hotline (after hours): {phone}.",
    ],
    "SSN": [
        "HR packet lists SSN {ssn} for background screening.",
        "Tax ID / SSN on the W-9 is {ssn}.",
        "Do not email SSN {ssn} outside encrypted channels.",
    ],
    "ADDRESS": [
        "Personal residence for service: {address}.",
        "Ship the hard-copy binder overnight to {address}.",
        "Home address disclosed in the sealed exhibit: {address}.",
    ],
    "PERSON": [
        "Deponent {person} asserted the Fifth as to account ownership.",
        "Notify {person} before any media statement.",
        "Insured individual: {person}.",
    ],
    "DATE_OF_BIRTH": [
        "Intake form DOB for {person}: {dob}.",
        "Passport application lists date of birth {dob}.",
        "Minor's birthdate on the sealed petition is {dob}.",
    ],
    "CREDIT_CARD": [
        "Firm card ending/full number {cc} was used for the filing fee.",
        "Charge {cc} and retain the receipt in the cost binder.",
    ],
    "FINANCIAL": [
        "Wire ${amount} using routing {routing} for the settlement escrow.",
        "Salary band disclosed in the offer letter: ${salary}.",
    ],
    "MEDICAL": [
        "Independent medical exam notes ongoing {condition}.",
        "Disability file references diagnosis of {condition}.",
    ],
    "CREDENTIAL": [
        "Temporary vault password for the data room: {password}",
        "API token for e-discovery export: {token}",
    ],
    "OTHER_SENSITIVE": [
        "Driver license {dl} appears in the KYC packet.",
        "Passport number {passport} from the travel affidavit.",
    ],
}


def _fill(label: str, rng: random.Random) -> str:
    template = rng.choice(HARD_POSITIVES[label])
    values = {
        "email": _email(rng),
        "phone": _phone(rng),
        "ssn": _ssn(rng),
        "address": _address(rng),
        "person": _person(rng),
        "dob": f"{rng.randint(1,12):02d}/{rng.randint(1,28):02d}/{rng.randint(1955,2004)}",
        "cc": " ".join(f"{rng.randint(1000,9999)}" for _ in range(4)),
        "amount": f"{rng.randint(1000,90000):,}",
        "routing": f"{rng.randint(100000000,999999999)}",
        "salary": f"{rng.randint(60000,220000):,}",
        "condition": rng.choice(["migraine", "asthma", "hypertension", "PTSD", "type 2 diabetes"]),
        "password": f"Tmp!{rng.randint(10000,99999)}",
        "token": hashlib.sha1(str(rng.random()).encode()).hexdigest()[:20],
        "dl": f"D{rng.randint(1000000,9999999)}",
        "passport": f"P{rng.randint(10000000,99999999)}",
    }
    return template.format(**values)


def _example(rng: random.Random) -> dict[str, Any]:
    roll = rng.random()
    if roll < 0.38:
        text = _noise(rng.choice(HARD_NEGATIVES), rng)
        return {
            "text": text,
            "labels": ["NONE"],
            "contains_sensitive": False,
            "difficulty": "hard",
            "task": "sensitive_information_hard",
        }
    if roll < 0.50:
        # Ambiguous multi-label or redacted
        labels = rng.sample([label for label in LABELS if label not in {"NONE", "OTHER_SENSITIVE"}], k=2)
        text = " ".join(_fill(label, rng) for label in labels)
        text = re.sub(r"\d", "X", text) if rng.random() < 0.4 else text
        return {
            "text": _noise(text, rng),
            "labels": labels,
            "contains_sensitive": True,
            "difficulty": "hard",
            "task": "sensitive_information_hard",
        }
    label = rng.choice([label for label in LABELS if label != "NONE"])
    text = _fill(label, rng)
    return {
        "text": _noise(text, rng),
        "labels": [label],
        "contains_sensitive": True,
        "difficulty": rng.choice(["medium", "hard"]),
        "task": "sensitive_information_hard",
    }


def generate_split(seed: int, n: int) -> list[dict[str, Any]]:
    rng = _rng(seed)
    rows: list[dict[str, Any]] = []
    # Coverage for every label
    for label in LABELS:
        for _ in range(max(4, n // (len(LABELS) * 3))):
            if label == "NONE":
                rows.append(
                    {
                        "text": _noise(rng.choice(HARD_NEGATIVES), rng),
                        "labels": ["NONE"],
                        "contains_sensitive": False,
                        "difficulty": "hard",
                        "task": "sensitive_information_hard",
                    }
                )
            else:
                rows.append(
                    {
                        "text": _noise(_fill(label, rng), rng),
                        "labels": [label],
                        "contains_sensitive": True,
                        "difficulty": "hard",
                        "task": "sensitive_information_hard",
                    }
                )
    while len(rows) < n:
        rows.append(_example(rng))
    rng.shuffle(rows)
    return rows[:n]


def write_dataset(
    out_dir: Path,
    *,
    seed: int = 42,
    train_n: int = 900,
    val_n: int = 220,
    test_n: int = 280,
) -> dict[str, Any]:
    out_dir.mkdir(parents=True, exist_ok=True)
    splits = {
        "train": generate_split(seed + 11, train_n),
        "validation": generate_split(seed + 12, val_n),
        "test": generate_split(seed + 13, test_n),
    }
    meta = {
        "seed": seed,
        "task": "sensitive_information_hard",
        "labels": list(LABELS),
        "notes": (
            "Harder synthetic legal/compliance sensitive-info benchmark. "
            "Includes statute-number traps, privilege language without PII, "
            "redactions identifiers, and adversarial formatting. No real personal data."
        ),
        "counts": {name: len(rows) for name, rows in splits.items()},
    }
    for name, rows in splits.items():
        path = out_dir / f"{name}.jsonl"
        with path.open("w", encoding="utf-8") as handle:
            for row in rows:
                handle.write(json.dumps(row, ensure_ascii=True) + "\n")
    (out_dir / "metadata.json").write_text(json.dumps(meta, indent=2) + "\n", encoding="utf-8")
    return meta


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--out", type=Path, default=DEFAULT_OUT)
    parser.add_argument("--seed", type=int, default=42)
    parser.add_argument("--train-n", type=int, default=900)
    parser.add_argument("--val-n", type=int, default=220)
    parser.add_argument("--test-n", type=int, default=280)
    args = parser.parse_args()
    print(
        json.dumps(
            write_dataset(
                args.out,
                seed=args.seed,
                train_n=args.train_n,
                val_n=args.val_n,
                test_n=args.test_n,
            ),
            indent=2,
        )
    )


if __name__ == "__main__":
    main()
