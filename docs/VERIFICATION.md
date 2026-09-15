# The Legal Fly Verification Notes

## Reproduce

```sh
python -m pip install pyarrow pandas numpy
python tools/prepare_malecns.py --download --convert --export-browser --shuffled
python -m pip install -e '.[linguistic,dev]'
python tools/prepare_minimind.py
python tools/benchmark_minimind.py
cd apps/web
npm run test:legalfly
npm test
npm run build
```

Large graph binaries and MiniMind weights are ignored by git.

## MaleCNS Acquisition

Official MaleCNS v1.0 objects acquired on 2026-09-14:

| File | Bytes | Computed SHA-256 | Publisher MD5 |
|---|---:|---|---|
| `body-annotations-male-cns-v1.0-minconf-0.5.feather` | 14,483,314 | `2177e246113e4cfbf1e7772ec37c6da1955ff22e8063d0b1f833101f99a9a3b2` | `UKdxh3DFciDxYLpPQxq4ng==` |
| `connectome-weights-male-cns-v1.0-minconf-0.5.feather` | 1,051,241,946 | `e35da783d1c686b2b58b3b87cd6a403ae43bfcfba8bff28e08ef752c1a56afc1` | `8w6dzKJc/QIb8eez2XVZng==` |

The publisher object generations are `1780494878811468` and `1780494887545976` respectively.

## Converted Graph

Selection is `status == Traced`, including isolated retained bodies and every positive released minconf-0.5 pair whose endpoints are retained.

| Count | Value |
|---|---:|
| Retained neuronal bodies | 165,122 |
| Directed neuron-pair records | 25,563,197 |
| Summed synaptic contacts | 124,025,046 |
| Excluded annotation rows | 46,455 |
| Excluded connection rows | 126,293,487 |
| Annotated sensory inputs | 15,897 |
| Disjoint motor/descending output candidates | 2,022 |
| VNC-tagged retained bodies | 28,187 |
| Released soma locations mapped | 140,024 |

Biological browser graph SHA-256: `c7cce7d82cf5a228b92de425e04ecd1ce35795bc3b76ce479ec72b6cb9ea29eb`.

Shuffled browser graph SHA-256: `23723b5fa5d2fa93b50ca4f525d9457f068f2fb9046f172b8b362c4630452354`.

Anatomy browser asset SHA-256: `42d27435b12e880166ee9946adf16e42ce47b2ab2c644503b5235da82b913540`. Its coordinate bounds are `[2468, 4758, 10154]` to `[93668, 68996, 134531]` in the released coordinate columns. The inspector projects x and z and does not infer missing positions.

The shuffled seed is `20260914`. It preserves source out-degree, target in-degree, edge-record count, and the global weight multiset. It may introduce parallel pairs and self-connections.

## Full-Graph Measurements

Measured in Node 22 on the workspace CPU using the same browser-facing core, seed 42, 32 teaching cases, 16 held-out cases, and four updates:

| Measurement | Biological | Shuffled |
|---|---:|---:|
| Training | 5,390 ms | 4,272 ms |
| Mean paired inference, both graphs | 312.6 ms | included |
| Held-out exact | 13/16 | 11/16 |
| Abstentions | 1 | 5 |
| Forced-choice exact | 14/16 | 15/16 |

Other controls: facts-only 14/16, frozen MiniMind plus action readout 7/16, and fictional charter rules 9/16.

Teaching signal touched 75,232 retained bodies. It touched 26,190 of 28,187 VNC-tagged bodies; maximum observed absolute VNC activation was 0.3436. These are continuous leaky-tanh activations, not spikes.

An additional full-data inspection smoke run used the browser-facing core with a checksum-verified graph and anatomy asset. Graph plus anatomy loading took 348.2 ms, one four-update consultation took 276.1 ms, and process RSS was 494.1 MB. The four frames contained 30, 420, 420, and 420 strongest mapped active points. VNC-tagged points among those were 2, 273, 275, and 275. The strongest displayed body ID was `816764`. This was measured under Node in the workspace, not a native browser, and used a deliberately neutral readout that abstained so it tests propagation and mapping rather than benchmark accuracy.

## MiniMind Measurements

Pinned MiniMind-3 revision: `f92512d4cd6142fa9acc0d6022375049a8974bf6`. The `model.safetensors` file is 127,834,168 bytes with computed SHA-256 `3adf69402b5d22e693151cabadc12528f923c4ba6bf343738aaf13f0892162e8`.

Measured on the same CPU with all 63.9M MiniMind parameters frozen:

| Measurement | Result |
|---|---:|
| Model load plus teaching-only readout fit | 4.85 s |
| Mean held-out petition encoding | 50.0 ms |
| Structured field accuracy | 82/128, 64.1% |
| Exact eight-field parses | 1/16 |
| MiniMind-only action exact | 7/16 |

An earlier zero-shot candidate-likelihood encoder scored only 21.1% per field and 0/16 exact parses. It was replaced by frozen embeddings with teaching-only field readouts. Confirmation remains mandatory because the improved encoder is still wrong on most complete parses.

### Browser MiniMind parity gate

The real browser parity run on 2026-09-15 used the pinned checkpoint above and all 48 locked teaching/holdout cases. The unquantized float32 ONNX graph first established that the export and ONNX Runtime execution path itself has exact discrete parity: 0/384 field-label mismatches, 0/48 action-label mismatches, and 0/48 authored-note ranking mismatches. Its maximum readout cosine-score delta was `3.5762786865234375e-07`, maximum embedding-component delta was `1.7299316823482513e-07`, and maximum candidate-score delta was `4.291534423828125e-06`.

Quantization was evaluated in the required q4-then-q8 order:

| Candidate | ONNX bytes | Field mismatches | Action mismatches | Note-ranking mismatches | Maximum cosine-score delta | Result |
|---|---:|---:|---:|---:|---:|---|
| q4, weight-only block 128 over supported MatMul/Gather weights | 54,972,589 | 50/384 | 9/48 | 3/48 | 0.071780264377594 | rejected |
| q8, weight-only block 32 over all supported MatMul weights | 87,409,139 | 2/384 | 2/48 | 0/48 | 0.002124786376953125 | rejected |
| q8, weight-only block 32 over the parity-proven module allowlist | 251,710,377 | 0/384 | 0/48 | 0/48 | 0.00012540817260742188 | selected |

The selected q8 allowlist contains only `causal_lm.model.layers.1.mlp.gate_proj`; all other weights remain float32. This limited scope is recorded explicitly in `manifest.json` under `quantization_config` and is necessary because broader q8 transforms changed locked discrete outputs. The selected bundle is 253,441,900 bytes (241.70 MiB) including its readouts and tokenizer files. Its maximum embedding-component delta is `0.0003248246503062546`, maximum candidate-score delta is `0.010023117065429688`, and every candidate ranking is identical to the Python adapter.

Selected content-addressed artifacts:

| File | Bytes | SHA-256 |
|---|---:|---|
| `model.q8.d9e7fd8f89dbf4139637caeb7cb1ecc89c8010050a61a152c50ff446568929a5.onnx` | 251,710,377 | `d9e7fd8f89dbf4139637caeb7cb1ecc89c8010050a61a152c50ff446568929a5` |
| `readouts.f9754426a25e42ecb6fad0c81c1631e1b075463be4c5573e4e6523f019217fed.json` | 1,271,933 | `f9754426a25e42ecb6fad0c81c1631e1b075463be4c5573e4e6523f019217fed` |
| `config.efcfa39ede9bbb5b64ded2bb90969e4b840f0f9e1e36725d386acb7eca1c6d05.json` | 863 | `efcfa39ede9bbb5b64ded2bb90969e4b840f0f9e1e36725d386acb7eca1c6d05` |
| `tokenizer.71f32c68cf63a15355a8fc171b7594b3d41870fe0ddb54fc6aefa55f73a4a668.json` | 451,182 | `71f32c68cf63a15355a8fc171b7594b3d41870fe0ddb54fc6aefa55f73a4a668` |
| `tokenizer_config.04ae7620b9cf93fd2d6fbf94936b0c3c4be65f30cd6ef6fa8741baac986525d1.json` | 7,545 | `04ae7620b9cf93fd2d6fbf94936b0c3c4be65f30cd6ef6fa8741baac986525d1` |

The fixed readout has 768 dimensions, temperature multiplier 4.0, and teaching-case SHA-256 `12c50fa700f5ad7720b9af4ca2efafc651110e4266a142ff07bc0a9a63a4acf2`. The measured backend was Python 3.14.7 with PyTorch 2.14.0+cpu, Transformers 4.57.6, safetensors 0.8.0, huggingface-hub 0.36.2, NumPy 2.3.3, ONNX 1.22.0, ONNX Runtime 1.30.0, ONNX Script 0.7.2, and pytest 9.1.1. `onnxscript` and ONNX Runtime 1.30 or newer are declared in the `browser` optional dependency group because the current PyTorch Qwen3 exporter and MatMulNBits quantizer require them.

The release gate was reproduced with:

```sh
python tools/export_minimind_readouts.py --model-path models/minimind-3 --output models/minimind-3-browser/q8-selected --compare
LEGALFLY_TEST_MINIMIND_PATH=models/minimind-3 LEGALFLY_TEST_BROWSER_ARTIFACTS=models/minimind-3-browser/q8-selected python -m pytest tests/test_minimind_browser_parity.py -q
```

## Tests Executed

- `python -m pytest -q` with the real MiniMind parity environment variables set: 88 passed and 1 pre-existing skip, with seven warnings (two upstream dependency deprecations and five PyTorch ONNX-export warnings from the tiny graph regression test).
- `npm run test:legalfly`: 14 passed.
- `npm test`: 20 passed.
- `npm run build`: passed.

## Browser Status

The managed Chrome browser was connected successfully, but its policy blocked both `http://localhost:3000` and `http://127.0.0.1:3000` with `ERR_BLOCKED_BY_CLIENT`. The Vercel preview generated by the existing repository integration redirected to an access-protected Vercel login. No credentials were entered.

The local Next and MiniMind processes each reported ready, but this execution environment isolates listeners between command sessions, so independent loopback requests could not reach those processes. A Playwright Chromium install had previously failed on repeated CDN timeouts and a 502, and no system browser binary is installed.

Therefore native browser-worker interaction, desktop/mobile captures, and an animation recording are still not certified in this runtime. Build and fixture tests do not substitute for that acceptance step.
