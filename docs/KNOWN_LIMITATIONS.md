# Known limits of this release

## Observed live false negative

During checks of the default hashing-encoder live API, all three classifiers (fly hybrid, scrambled hybrid and linear baseline) returned NONE for this exact invented passage:

> For the confidential personnel file, the employee's Social Security number is 000-12-3456. This is an invented example.

The planted number is synthetic and not a valid assigned SSN. It remains an SSN-format example that the demonstration intends to flag. The miss stays available as **A private number**. The interface compares the answer to the expected label and reports misses. Agreement between models is not success. This observation concerns the live hashing configuration, not the MiniLM research benchmark.

The email example was flagged EMAIL. The legal-number decoy and ordinary meeting sentence were not flagged. Four examples are only a smoke test, not an estimate of real-world accuracy. Do not use this as a privacy gate or redaction product.

## Research result

The corrected 120-example paired search did not establish a fly advantage. Standard MiniLM classifiers have higher mean scores. The hybrids retain original text features; full lesions can leave those features sufficient for a prediction. Raw trials and unsuccessful comparisons are retained.

Data are synthetic, share template structure and were used in earlier project experiments. The search is exploratory. More seeds do not create independent external validation. The original encoder producer omitted the exact MiniLM revision. Frozen vectors with hashes are included rather than a claim that an unpinned new download reproduces identical vectors.

## Unsupported or unverified

This is a 3,072-neuron hemibrain subgraph, not the whole fly brain. Coordinates are illustrative. Flashes replay mathematical activity, not biological recordings or consciousness. Region labels/routing are coarse heuristics, not a validated mushroom-body learning circuit.

Browser inference, client-side readout training, full FlyWire execution and user model import are not implemented by this application. Cancellation stops the browser accepting a response but does not guarantee that server computation stops. Destination Docker execution, proxy behavior, cold starts and infrastructure privacy require separate deployment verification.
