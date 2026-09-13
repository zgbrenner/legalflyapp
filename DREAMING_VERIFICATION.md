# Legal Dreaming verification

Legal Dreaming is the only public experiment in the web application. The retired sensitive-information classifier, benchmark, ablation, comparison, and old methodology routes are no longer part of the product and must return 404.

## Required verification

The current GitHub Actions workflow verifies three layers:

1. **Python regression suite** for retained research and graph-processing code.
2. **Frontend and dream-engine tests**, including the actual packaged biological graph rather than a synthetic stand-in.
3. **Production Chromium checks** against the built Next.js site, with no classifier API process.

The browser suite covers:

- biological graph loading and checksum validation
- local corpus training and cancellation
- learned replay and feedback-off silence
- pause/resume and cue restarts
- model and notebook import/export
- degree-preserving rewired controls
- privacy/network canaries
- desktop and mobile layouts
- reduced-motion behavior
- hero scroll interaction
- explicit 404 checks for `/classification`, `/benchmark`, `/ablate`, `/compare`, and `/methodology`

Browser evidence is uploaded as the `browser-evidence` GitHub Actions artifact. Compilation alone is not treated as browser proof.

## Scientific limits

The model learns an added numerical feedback map, not biological synaptic plasticity. Replay receives internal feedback but no new external text. Silence receives neither.

The source graph is a 3,072-neuron subset with 293,766 directed connections, not a complete fly nervous system. The initial corpus is 16 fictional scenarios, not a library of court opinions.

The experiment does not demonstrate biological sleep, consciousness, legal reasoning, novel law, or superiority of biological wiring. The initial diagnostic found that the degree-preserving rewired control retained taught associations more consistently than the biological graph.

## Deployment boundaries

The public Legal Dreaming site is browser-local and does not require the retained Python research API. A Vercel or equivalent deployment should build the Next.js frontend with access to the root-level biological graph/provenance inputs and serve the generated `/dream/` assets over HTTPS.

Safari, Firefox, physical iPhones, long background sessions, arbitrary private corpora, and whole-brain execution are not certified by the standard CI run.

The inherited npm lockfile previously emitted dependency audit findings during installation. A successful build is not a security clearance; dependency findings should be reviewed independently before production use.
