"""Reproducible synthetic sensitive-information dataset generator."""

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
DEFAULT_OUT = REPO_ROOT / "data" / "demo" / "sensitive"


FIRST_NAMES = [
    "Alex",
    "Jordan",
    "Sam",
    "Riley",
    "Casey",
    "Morgan",
    "Taylor",
    "Quinn",
    "Avery",
    "Parker",
    "Blake",
    "Cameron",
    "Drew",
    "Harper",
    "Jamie",
]
LAST_NAMES = [
    "Nguyen",
    "Patel",
    "Garcia",
    "Smith",
    "Chen",
    "Okoye",
    "Andersen",
    "Rossi",
    "Kim",
    "Lopez",
    "Ivanov",
    "Silva",
    "Brown",
    "Wright",
    "Hassan",
]
STREETS = [
    "Main Street",
    "Oak Avenue",
    "Pine Road",
    "Cedar Lane",
    "Maple Court",
    "River Drive",
    "Hill Boulevard",
    "Lake View",
    "Sunset Way",
    "Harbor Street",
]
CITIES = [
    "Springfield",
    "Riverton",
    "Fairview",
    "Maplewood",
    "Brookside",
    "Lakeside",
    "Cedar Falls",
    "Oakmont",
]
DOMAINS = ["example.com", "example.org", "mail.test", "corp.example"]
BANKS = ["Northriver Bank", "Cedar Credit Union", "Harbor Financial"]
CONDITIONS = ["migraine", "asthma", "hypertension", "allergy to penicillin", "type 2 diabetes"]


def _rng(seed: int) -> random.Random:
    return random.Random(seed)


def _noise(text: str, rng: random.Random) -> str:
    """Adversarial formatting / whitespace / case variations."""
    mode = rng.choice(["plain", "upper", "lower", "spaces", "punct", "tabs"])
    if mode == "upper":
        return text.upper()
    if mode == "lower":
        return text.lower()
    if mode == "spaces":
        return re.sub(r"\s+", "  ", text)
    if mode == "punct":
        return text.replace(",", " ,").replace(".", " .")
    if mode == "tabs":
        return text.replace(" ", "\t", 1)
    return text


def _email(rng: random.Random) -> str:
    user = f"{rng.choice(FIRST_NAMES).lower()}.{rng.choice(LAST_NAMES).lower()}{rng.randint(1, 99)}"
    return f"{user}@{rng.choice(DOMAINS)}"


def _phone(rng: random.Random) -> str:
    style = rng.choice(["dash", "paren", "dot", "plain"])
    a, b, c = rng.randint(200, 989), rng.randint(200, 999), rng.randint(1000, 9999)
    if style == "dash":
        return f"{a}-{b}-{c}"
    if style == "paren":
        return f"({a}) {b}-{c}"
    if style == "dot":
        return f"{a}.{b}.{c}"
    return f"{a}{b}{c}"


def _ssn(rng: random.Random) -> str:
    return f"{rng.randint(100, 899)}-{rng.randint(10, 99)}-{rng.randint(1000, 9999)}"


def _cc(rng: random.Random) -> str:
    groups = [f"{rng.randint(1000, 9999)}" for _ in range(4)]
    return " ".join(groups)


def _address(rng: random.Random) -> str:
    return (
        f"{rng.randint(100, 9999)} {rng.choice(STREETS)}, "
        f"{rng.choice(CITIES)}, ST {rng.randint(10000, 99999)}"
    )


def _person(rng: random.Random) -> str:
    return f"{rng.choice(FIRST_NAMES)} {rng.choice(LAST_NAMES)}"


def _dob(rng: random.Random) -> str:
    return f"{rng.randint(1, 12):02d}/{rng.randint(1, 28):02d}/{rng.randint(1950, 2005)}"


TEMPLATES: dict[str, list[str]] = {
    "EMAIL": [
        "My email is {email}.",
        "Please contact me at {email} regarding the contract.",
        "Send the executed agreement to {email}.",
        "CC: {email}",
        "Reach out via email ({email}) before Friday.",
    ],
    "PHONE": [
        "Call me at {phone}.",
        "Send the contract to {phone}.",
        "Phone: {phone}",
        "You can reach the clerk at {phone} during business hours.",
        "Emergency contact number is {phone}.",
    ],
    "SSN": [
        "My Social Security number is {ssn}.",
        "SSN: {ssn}",
        "Please verify SSN {ssn} against the personnel file.",
        "Taxpayer identification (SSN) {ssn} is on file.",
    ],
    "CREDIT_CARD": [
        "Card number {cc} expires next year.",
        "Charge {cc} for the filing fee.",
        "Payment method: {cc}",
    ],
    "ADDRESS": [
        "Please deliver it to {address}.",
        "Mailing address: {address}",
        "Service of process may be made at {address}.",
        "Ship the binder to {address}.",
    ],
    "PERSON": [
        "The insured person is {person}.",
        "Contact {person} for signature.",
        "Plaintiff {person} alleges breach of contract.",
        "Notify {person} immediately.",
    ],
    "DATE_OF_BIRTH": [
        "Date of birth: {dob}",
        "{person} was born on {dob}.",
        "DOB listed as {dob} on the intake form.",
    ],
    "FINANCIAL": [
        "Account balance at {bank} is ${amount}.",
        "Wire ${amount} to routing {routing}.",
        "IBAN-like demo account {iban} holds reserve funds.",
        "Annual salary is ${salary}.",
    ],
    "MEDICAL": [
        "Patient reports {condition}.",
        "Prescription refill needed for {condition}.",
        "Medical history includes {condition}.",
        "Diagnosed with {condition} last quarter.",
    ],
    "CREDENTIAL": [
        "Username admin password={password}",
        "API key: {apikey}",
        "Login with token {token}",
        "Temporary password is {password}.",
    ],
    "OTHER_SENSITIVE": [
        "Driver license number {dl}.",
        "Passport number {passport}.",
        "Employee badge ID {badge}.",
    ],
    "NONE": [
        "Our revenue grew 12%.",
        "Section 123 applies.",
        "Call Section 555 of the statute.",
        "The case was filed in 1998.",
        "Supplier shall indemnify Customer from all claims.",
        "The court entered judgment on March 4.",
        "This clause survives termination.",
        "Governing law is the State of Example.",
        "Notices may be delivered electronically.",
        "The parties agree to mediate in good faith.",
        "Exhibit A is attached hereto.",
        "Interest accrues at the statutory rate.",
        "Venue lies in the district court.",
        "Force majeure includes natural disasters.",
        "Confidentiality obligations are mutual.",
        "The statute of limitations is three years.",
        "Definitions appear in Article I.",
        "Payment is due net thirty days.",
        "Nothing herein creates a partnership.",
        "Headings are for convenience only.",
    ],
}


def _fill(label: str, rng: random.Random) -> tuple[str, dict[str, Any]]:
    template = rng.choice(TEMPLATES[label])
    values: dict[str, Any] = {
        "email": _email(rng),
        "phone": _phone(rng),
        "ssn": _ssn(rng),
        "cc": _cc(rng),
        "address": _address(rng),
        "person": _person(rng),
        "dob": _dob(rng),
        "bank": rng.choice(BANKS),
        "amount": f"{rng.randint(100, 50000):,}",
        "routing": f"{rng.randint(100000000, 999999999)}",
        "iban": f"EX{rng.randint(10, 99)}{rng.randint(1000000000, 9999999999)}",
        "salary": f"{rng.randint(40000, 180000):,}",
        "condition": rng.choice(CONDITIONS),
        "password": f"Tmp!{rng.randint(1000, 9999)}",
        "apikey": hashlib.sha1(str(rng.random()).encode()).hexdigest()[:24],
        "token": hashlib.md5(str(rng.random()).encode()).hexdigest()[:20],
        "dl": f"D{rng.randint(1000000, 9999999)}",
        "passport": f"P{rng.randint(10000000, 99999999)}",
        "badge": f"B-{rng.randint(10000, 99999)}",
    }
    text = template.format(**values)
    return text, values


def _make_example(
    rng: random.Random,
    *,
    multi: bool = False,
    redacted: bool = False,
    difficulty: str = "easy",
) -> dict[str, Any]:
    if difficulty == "hard_negative":
        text = _noise(rng.choice(TEMPLATES["NONE"]), rng)
        return {
            "text": text,
            "labels": ["NONE"],
            "contains_sensitive": False,
            "difficulty": "hard",
        }

    if multi:
        labels = rng.sample(
            [label for label in LABELS if label not in {"NONE", "OTHER_SENSITIVE"}],
            k=2,
        )
        parts = []
        for label in labels:
            part, _ = _fill(label, rng)
            parts.append(part)
        text = " ".join(parts)
    else:
        # Bias toward NONE for realistic prior, but keep class coverage.
        if rng.random() < 0.28:
            label = "NONE"
        else:
            label = rng.choice([label for label in LABELS if label != "NONE"])
        text, _ = _fill(label, rng)
        labels = [label]

    if redacted:
        text = re.sub(r"\d", "X", text)
        text = re.sub(r"[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}", "[REDACTED_EMAIL]", text)
        difficulty = "hard"

    text = _noise(text, rng)
    contains = labels != ["NONE"]
    return {
        "text": text,
        "labels": labels,
        "contains_sensitive": contains,
        "difficulty": difficulty if not multi else "medium",
    }


def generate_split(seed: int, n: int, *, include_adversarial: bool = True) -> list[dict[str, Any]]:
    rng = _rng(seed)
    examples: list[dict[str, Any]] = []

    # Ensure every label appears at least a few times.
    for label in LABELS:
        for _ in range(max(3, n // (len(LABELS) * 4))):
            if label == "NONE":
                text = _noise(rng.choice(TEMPLATES["NONE"]), rng)
                examples.append(
                    {
                        "text": text,
                        "labels": ["NONE"],
                        "contains_sensitive": False,
                        "difficulty": "easy",
                    }
                )
            else:
                text, _ = _fill(label, rng)
                examples.append(
                    {
                        "text": _noise(text, rng),
                        "labels": [label],
                        "contains_sensitive": True,
                        "difficulty": "easy",
                    }
                )

    while len(examples) < n:
        roll = rng.random()
        if include_adversarial and roll < 0.12:
            examples.append(_make_example(rng, difficulty="hard_negative"))
        elif roll < 0.22:
            examples.append(_make_example(rng, multi=True, difficulty="medium"))
        elif roll < 0.30:
            examples.append(_make_example(rng, redacted=True, difficulty="hard"))
        else:
            examples.append(_make_example(rng, difficulty=rng.choice(["easy", "medium"])))

    rng.shuffle(examples)
    return examples[:n]


def write_dataset(
    out_dir: Path,
    *,
    seed: int = 42,
    train_n: int = 800,
    val_n: int = 200,
    test_n: int = 250,
) -> dict[str, Any]:
    out_dir.mkdir(parents=True, exist_ok=True)
    splits = {
        "train": generate_split(seed + 1, train_n),
        "validation": generate_split(seed + 2, val_n),
        "test": generate_split(seed + 3, test_n),
    }
    meta = {
        "seed": seed,
        "task": "sensitive_information",
        "labels": list(LABELS),
        "notes": (
            "All examples are synthetic. No real personal data. "
            "Phone/SSN/email patterns are fictional placeholders."
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
    parser = argparse.ArgumentParser(description="Generate LegalFly sensitive-info dataset")
    parser.add_argument("--out", type=Path, default=DEFAULT_OUT)
    parser.add_argument("--seed", type=int, default=42)
    parser.add_argument("--train-n", type=int, default=800)
    parser.add_argument("--val-n", type=int, default=200)
    parser.add_argument("--test-n", type=int, default=250)
    args = parser.parse_args()
    meta = write_dataset(
        args.out,
        seed=args.seed,
        train_n=args.train_n,
        val_n=args.val_n,
        test_n=args.test_n,
    )
    print(json.dumps(meta, indent=2))


if __name__ == "__main__":
    main()