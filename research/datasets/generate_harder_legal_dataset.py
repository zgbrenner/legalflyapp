"""Harder-than-MiniLM legal/sensitive dataset (v2).

Raises difficulty past shallow lexical cues and generic embeddings by:
- burying PII inside dense boilerplate
- splitting identifiers with zero-width / whitespace tricks
- privilege / statute language that *talks about* PII without containing it
- worded phones, redacted near-misses, and confusable exhibit numbers
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
DEFAULT_OUT = REPO_ROOT / "data" / "demo" / "sensitive_harder"

FIRST = ["Alex", "Jordan", "Sam", "Riley", "Casey", "Morgan", "Taylor", "Quinn", "Avery", "Parker"]
LAST = ["Nguyen", "Patel", "Garcia", "Smith", "Chen", "Okoye", "Andersen", "Rossi", "Kim", "Lopez"]
STREETS = ["Main Street", "Oak Avenue", "Pine Road", "Cedar Lane", "Maple Court"]
CITIES = ["Springfield", "Riverton", "Fairview", "Maplewood", "Brookside"]
DOMAINS = ["example.com", "example.org", "mail.test", "corp.example"]

ZWSP = "\u200b"

HARDER_NEGATIVES = [
    "The witness declined to disclose any email address, phone number, or SSN on the record.",
    "Section 555-123-4567 of the municipal code governs notice, not telecommunications.",
    "Exhibit 123-45-6789 is a form template; fields remain blank by design.",
    "Counsel asserted privilege over draft strategy memoranda discussing PII handling policies.",
    "Please do not write real Social Security numbers in the training fixtures.",
    "The term 'date of birth' appears in the defined-terms schedule without a value.",
    "Net-30 payment terms and routing instructions to the firm's operating account are commercial, not personal.",
    "Attorney-client privilege is asserted as to the highlighted privilege log entries.",
    "Contact the clerk of court — not the deponent — for the filing window.",
    "The arbitration clause survives termination; notices may be electronic under Section 12.",
    "Account '555-operations' is an internal cost center identifier, not a telephone number.",
    "The sealed petition redacts all personal identifiers; only docket 2024-CV-5551234 remains.",
    "Discussions of password rotation policy do not include any live credentials.",
    "Medical-cost allocation methodology is described without naming patients or diagnoses.",
    "The engagement letter forbids emailing unencrypted PHI, SSN, or card data.",
    "Placeholder SSN XXX-XX-XXXX and email name@domain remain synthetic in the schedule.",
    "Governing law is the State of Example without regard to conflicts principles.",
    "Work-product doctrine protects draft media statements prior to client approval.",
    "Revenue grew 12% year over year; no employee salaries are itemized herein.",
    "Force majeure includes epidemics and governmental action.",
]


def _rng(seed: int) -> random.Random:
    return random.Random(seed)


def _noise(text: str, rng: random.Random) -> str:
    mode = rng.choice(["plain", "upper", "lower", "spaces", "punct", "zwsp", "nbsp"])
    if mode == "upper":
        return text.upper()
    if mode == "lower":
        return text.lower()
    if mode == "spaces":
        return re.sub(r"\s+", "  ", text)
    if mode == "punct":
        return text.replace(",", " ,").replace(".", " .")
    if mode == "zwsp":
        # Break trivial substring detectors / encourage real encoding.
        chars = list(text)
        for i in range(min(3, len(chars) // 8)):
            pos = rng.randint(1, len(chars) - 1)
            chars.insert(pos, ZWSP)
        return "".join(chars)
    if mode == "nbsp":
        return text.replace(" ", "\u00a0", 2)
    return text


def _email(rng: random.Random) -> str:
    local = f"{rng.choice(FIRST).lower()}.{rng.choice(LAST).lower()}{rng.randint(1, 99)}"
    domain = rng.choice(DOMAINS)
    if rng.random() < 0.35:
        # Split identifier adversarially.
        return f"{local[0]}{ZWSP}{local[1:]}@{domain}"
    if rng.random() < 0.25:
        return f"{local} @{domain}".replace(" @", "@")
    return f"{local}@{domain}"


def _phone(rng: random.Random) -> str:
    a, b, c = rng.randint(200, 989), rng.randint(200, 999), rng.randint(1000, 9999)
    styles = [
        f"{a}-{b}-{c}",
        f"({a}) {b}-{c}",
        f"{a}.{b}.{c}",
        f"+1 {a} {b} {c}",
        f"{a}{ZWSP}-{b}-{c}",
        f"{_say_digit(a // 100)} {_say_digit((a // 10) % 10)} {_say_digit(a % 10)} "
        f"{_say_digit(b // 100)} {_say_digit((b // 10) % 10)} {_say_digit(b % 10)} "
        f"{c}",
    ]
    return rng.choice(styles)


def _say_digit(d: int) -> str:
    return ["zero", "one", "two", "three", "four", "five", "six", "seven", "eight", "nine"][d]


def _ssn(rng: random.Random) -> str:
    return f"{rng.randint(100, 899)}-{rng.randint(10, 99)}-{rng.randint(1000, 9999)}"


def _person(rng: random.Random) -> str:
    return f"{rng.choice(FIRST)} {rng.choice(LAST)}"


def _address(rng: random.Random) -> str:
    return (
        f"{rng.randint(100, 9999)} {rng.choice(STREETS)}, "
        f"{rng.choice(CITIES)}, ST {rng.randint(10000, 99999)}"
    )


HARDER_POSITIVES: dict[str, list[str]] = {
    "EMAIL": [
        "Buried in ¶14 of the engagement letter, the only authorized recipient is {email}.",
        "The clean-team distribution list was expanded — incorrectly — to include {email}.",
        "Please confirm service on {email} before the overnight courier leaves.",
    ],
    "PHONE": [
        "After hours, chambers may reach the witness at {phone} regarding the sealed exhibit.",
        "The process server's contact for questions is {phone}.",
        "Hotline notation in the privilege log margin: {phone}.",
    ],
    "SSN": [
        "HR appendix B lists SSN {ssn} solely for background screening of the named deponent.",
        "The W-9 transmitted under seal shows Tax ID / SSN {ssn}.",
        "Do not circulate SSN {ssn} outside the encrypted channel.",
    ],
    "ADDRESS": [
        "Personal residence for service of process: {address}.",
        "Overnight the hard-copy binder to {address}.",
        "Sealed exhibit discloses home address {address}.",
    ],
    "PERSON": [
        "Deponent {person} asserted the Fifth as to beneficial ownership.",
        "Notify {person} before any media statement issues.",
        "Insured individual named on the declaration page: {person}.",
    ],
    "DATE_OF_BIRTH": [
        "Intake form DOB for {person}: {dob}.",
        "Passport application lists date of birth {dob}.",
        "Minor's birthdate on the sealed petition is {dob}.",
    ],
    "CREDIT_CARD": [
        "Firm card number {cc} was used for the filing fee; retain the receipt.",
        "Charge {cc} and file the cost binder entry.",
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
    template = rng.choice(HARDER_POSITIVES[label])
    values = {
        "email": _email(rng),
        "phone": _phone(rng),
        "ssn": _ssn(rng),
        "address": _address(rng),
        "person": _person(rng),
        "dob": f"{rng.randint(1, 12):02d}/{rng.randint(1, 28):02d}/{rng.randint(1955, 2004)}",
        "cc": " ".join(f"{rng.randint(1000, 9999)}" for _ in range(4)),
        "amount": f"{rng.randint(1000, 90000):,}",
        "routing": f"{rng.randint(100000000, 999999999)}",
        "salary": f"{rng.randint(60000, 220000):,}",
        "condition": rng.choice(["migraine", "asthma", "hypertension", "PTSD", "type 2 diabetes"]),
        "password": f"Tmp!{rng.randint(10000, 99999)}",
        "token": hashlib.sha1(str(rng.random()).encode()).hexdigest()[:20],
        "dl": f"D{rng.randint(1000000, 9999999)}",
        "passport": f"P{rng.randint(10000000, 99999999)}",
    }
    body = template.format(**values)
    # Wrap positives in heavy boilerplate so embeddings can't cheat on short cues.
    wrap = rng.choice(
        [
            "CONFIDENTIAL — ATTORNEY'S EYES ONLY. {body} Nothing herein waives privilege.",
            "Without waiving any objection: {body} See also the protective order of even date.",
            "For the limited purpose of the in-camera review: {body}",
            "{body} All other identifiers in this production remain redacted.",
        ]
    )
    return wrap.format(body=body)


def _example(rng: random.Random) -> dict[str, Any]:
    roll = rng.random()
    if roll < 0.42:
        text = _noise(rng.choice(HARDER_NEGATIVES), rng)
        return {
            "text": text,
            "labels": ["NONE"],
            "contains_sensitive": False,
            "difficulty": "harder",
            "task": "sensitive_information_harder",
        }
    if roll < 0.55:
        labels = rng.sample(
            [label for label in LABELS if label not in {"NONE", "OTHER_SENSITIVE"}],
            k=2,
        )
        text = " ".join(_fill(label, rng) for label in labels)
        if rng.random() < 0.3:
            text = re.sub(r"\d", "X", text)
            # Redacted multi-label still counts as sensitive for binary task.
        return {
            "text": _noise(text, rng),
            "labels": labels,
            "contains_sensitive": True,
            "difficulty": "harder",
            "task": "sensitive_information_harder",
        }
    label = rng.choice([label for label in LABELS if label != "NONE"])
    return {
        "text": _noise(_fill(label, rng), rng),
        "labels": [label],
        "contains_sensitive": True,
        "difficulty": "harder",
        "task": "sensitive_information_harder",
    }


def generate_split(seed: int, n: int) -> list[dict[str, Any]]:
    rng = _rng(seed)
    rows: list[dict[str, Any]] = []
    for label in LABELS:
        for _ in range(max(6, n // (len(LABELS) * 2))):
            if label == "NONE":
                rows.append(
                    {
                        "text": _noise(rng.choice(HARDER_NEGATIVES), rng),
                        "labels": ["NONE"],
                        "contains_sensitive": False,
                        "difficulty": "harder",
                        "task": "sensitive_information_harder",
                    }
                )
            else:
                rows.append(
                    {
                        "text": _noise(_fill(label, rng), rng),
                        "labels": [label],
                        "contains_sensitive": True,
                        "difficulty": "harder",
                        "task": "sensitive_information_harder",
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
    train_n: int = 1200,
    val_n: int = 280,
    test_n: int = 360,
) -> dict[str, Any]:
    out_dir.mkdir(parents=True, exist_ok=True)
    splits = {
        "train": generate_split(seed + 21, train_n),
        "validation": generate_split(seed + 22, val_n),
        "test": generate_split(seed + 23, test_n),
    }
    meta = {
        "seed": seed,
        "task": "sensitive_information_harder",
        "labels": list(LABELS),
        "notes": (
            "Harder-than-MiniLM synthetic legal/compliance sensitive-info benchmark. "
            "Includes buried identifiers, zero-width splits, privilege talk-about-PII "
            "negatives, and dense boilerplate. No real personal data."
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
    parser.add_argument("--train-n", type=int, default=1200)
    parser.add_argument("--val-n", type=int, default=280)
    parser.add_argument("--test-n", type=int, default=360)
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
