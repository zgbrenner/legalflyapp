# The Legal Fly Verification Notes

## Commands

Prepare the official data:

```sh
python -m pip install pyarrow pandas numpy
python tools/prepare_malecns.py --download --convert --export-browser
cd apps/web
npm run test:legalfly
npm test
npm run build
```

The generated browser binaries are intentionally ignored by git. `npm run dev` and `npm run build` copy them from `data/processed/malecns/v1.0/browser` into `apps/web/public/legalfly`.

## Current Native Dataset Attempt

On 2026-09-14, the official annotations and weights files were downloaded successfully.

| File | Size | SHA-256 | Publisher MD5 |
|---|---:|---|---|
| `body-annotations-male-cns-v1.0-minconf-0.5.feather` | 14,483,314 | `2177e246113e4cfbf1e7772ec37c6da1955ff22e8063d0b1f833101f99a9a3b2` | `UKdxh3DFciDxYLpPQxq4ng==` |
| `connectome-weights-male-cns-v1.0-minconf-0.5.feather` | 1,051,241,946 | `e35da783d1c686b2b58b3b87cd6a403ae43bfcfba8bff28e08ef752c1a56afc1` | `8w6dzKJc/QIb8eez2XVZng==` |

Derived conversion counts:

| Count | Value |
|---|---:|
| Retained neuronal bodies | 211,577 |
| Directed neuron-pair connections | 26,028,386 |
| Summed synaptic contacts | 125,365,933 |
| Source records excluded by policy | 125,828,298 |

Browser verification must still be treated separately from conversion. Synthetic fixtures prove engine invariants only; they do not certify native full-network browser operation.

## Full-Graph Engine Smoke

The browser-facing core module was exercised in Node against the generated full MaleCNS binary:

| Measurement | Result |
|---|---:|
| Graph parse/load | 175 ms |
| Teach 32 petitions, 4 sparse wake steps each | 5,887 ms |
| Hear one held-out petition | 139 ms |
| Sampled display nodes | 361 |
| Recommendation for sampled held-out petition | abstention, confidence 0.125 |

This is a real full-graph core run, but it is not native browser-worker verification.

## Browser Blocker In This Runtime

Native browser verification was attempted but blocked:

| Attempt | Result |
|---|---|
| `python -m playwright install chromium` | Repeated CDN timeout, then 502 from `cdn.playwright.dev` |
| System browser lookup | No `chromium`, `chromium-browser`, `google-chrome`, `chrome`, or `firefox` on `PATH` |
| Next production server, `127.0.0.1:3000` | Next reported ready, but independent `curl` and Node `fetch` returned `ECONNREFUSED` |
| Next dev server, `127.0.0.1:3001` and `0.0.0.0:3010` | Next reported ready, but `/proc/net/tcp` showed no listener on the requested port and `curl` returned `ECONNREFUSED` |

Because of that, desktop/mobile screenshots and the requested animation recording were not captured in this environment. They remain required before any public deployment.
