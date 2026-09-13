import Link from 'next/link';
export default function DreamingMethod(){return <article className="page-width reading-page">
 <p className="section-label">Legal Dreaming / Method</p><h1>A dream is the metaphor.<br/>Here is the machinery.</h1>
 <p>The question is modest: after a network has learned to reconstruct legal teaching examples from its own activity, which taught patterns persist when the text stops? This is a browser experiment, not a claim that a fly understands or dreams about law.</p>
 <h2>The part that comes from a fly</h2><p>The retained graph is the existing Janelia hemibrain v1.2 subgraph: 3,072 neurons and 293,766 directed connections. All those connections participate in each simulation step. It is a selected, high-degree subset, not a whole brain, an intact learning circuit, or the newly released complete nervous system.</p>
 <p>The browser build reproduces the packaged graph fingerprint, checks it against the recorded source-rebuild provenance, and exports the same connection arrays without reducing them. Each downloaded browser graph is SHA-256 checked before use. The source archive checksum and graph fingerprints are available in the <a href="/dream/manifest.json">graph manifest</a>. The exporter does not redownload the original archive on every build. Source: <a href="https://www.janelia.org/project-team/flyem/hemibrain" rel="noreferrer" target="_blank">Janelia FlyEM hemibrain</a>, CC BY 4.0; Scheffer and colleagues, 2020.</p>
 <p>The display samples neurons and edges from that graph. Its fly-shaped arrangement is illustrative, not measured anatomy. Brightness represents the absolute simulated state, not measured biological spikes. Simulation steps are not seconds of biological time.</p>
 <h2>The part that learns</h2><p>Only each card’s text enters the encoder. Titles, subject areas, source notes, and concept labels do not drive the model. A deterministic 64-dimensional signed word-and-character hashing encoder converts that text to numbers. This is not a language model or a semantic understanding engine.</p>
 <p>Those numbers stimulate 384 seeded input neurons. The existing directed, leaky-tanh recurrence propagates their activity through the measured wiring, with the computational spectral scale set near 0.9. After reading each example for 32 steps, activity from 192 other neurons supplies a small feedback readout.</p>
 <p>Ridge regression trains that artificial readout to reconstruct the input vector from the neural state. The biological connections stay fixed. Training changes the added readout, not the fly’s original synapses. The input projection, nonlinear dynamics, readout, and artificial feedback are modeling choices, not biological measurements. The retained weights are scaled positive connection counts, not a neurotransmitter-signed spiking model.</p>
 <pre>{`Reading:
text → hashed numbers → input neurons → measured wiring
                                  ↓
                     learn state → input reconstruction

Learned replay:
state → trained numeric readout → input neurons → next state

Silence:
no text + no feedback → measured recurrence only`}</pre>
 <h2>Two different experiments</h2><p><strong>Learned replay</strong> removes external text but feeds the learned numeric reconstruction back into the input neurons. It can preserve, drift away from, or settle into an association. It is explicitly a closed-loop model. It is not the untouched connectome spontaneously generating legal ideas.</p>
 <p><strong>Silence</strong> turns that feedback off. At the default normalization and without injected noise, activity fades. A stationary state, a loop, or silence is an outcome, not a broken demo to hide. The optional seeded noise is artificial perturbation and is reported separately. The default is no noise.</p>
 <h2>Naming a state without inventing its meaning</h2><p>The atlas stores the final observed state for each teaching card. During replay, the decoder measures cosine similarity against those states. It names a card only if whole-network activity RMS is at least 0.0001, the best similarity is at least 0.80, and its margin over the next match is at least 0.035. Otherwise it abstains.</p>
 <p>The nearest three patterns can be inspected in the notebook. An unfamiliar or blended state is not evidence of a new legal doctrine, a new case, reasoning, creativity, sleep, or consciousness. A high cosine score is not a probability of legal correctness. No language model expands the activity into prose.</p>
 <h2>What the controls do and do not show</h2><p>The controls use the same corpus, cue, seed, training budget, and 256 observation steps, without injected noise. They compare learned replay on the biological graph, feedback-off decay, and separately trained replay on a rewired graph. Double-edge swaps preserve every neuron’s incoming and outgoing degree, the exact edge count, and the weight multiset. Both graphs are normalized with the same procedure.</p>
 <p>These are diagnostics, not a legal benchmark or proof that biology is better. A proper study would need multiple corpora, seeds and held-out tasks, and comparisons against encoder-only and non-biological associative-memory models. The teaching-card recognition diagnostic removes every fourth word from taught text; it is not an independent test set.</p>
 <h2>Bring your own reading</h2><p>The starter corpus contains 16 original fictional scenarios, not case holdings. Import a JSON array containing 2 to 48 cards. Each card needs the following fields. Text is limited to 6,000 characters per card and 120,000 characters in total. Give real materials accurate source notes and do not assume the model checks your annotations.</p>
 <pre>{`{
  "id": "my-card",
  "title": "A short descriptive title",
  "area": "Contracts",
  "text": "Your teaching passage or appropriately sourced excerpt.",
  "concepts": ["promise", "reliance"],
  "source": "Your source and attribution, or 'Fictional scenario'"
}`}</pre>
 <h2>Privacy, reproduction, and limits</h2><p>Reading, fitting, graph simulation, and decoding run in a dedicated browser worker. The new laboratory fetches only same-origin code, teaching cards, and graph files. It does not send entered text to an API or save it automatically. Downloads contain your teaching text: handle them accordingly. Standard hosting can still log requests for the site’s static assets, including IP addresses.</p>
 <p>Models bind their numeric state to an exact graph fingerprint and engine version. Import validates their shapes and finite values, but imported model weights and diagnostics are user-supplied, not certified research results. Notebook exports record the seed, cue, mode, noise, graph fingerprints, settings, observed frame summaries, sampled neural activity, and controls. Replay frames are sampled every eight steps; the display is not an exhaustive spike log.</p>
 <p>The experiment stops after 2,048 steps. It pauses when its tab becomes hidden. Reduced-motion preferences suppress automatic dreaming after reading. Modern HTTPS browsers with Web Workers and Web Crypto are required. This release retains the existing subset instead of claiming unsupported whole-brain performance.</p>
 <p><Link href="/">Return to the dreaming laboratory</Link> · <Link href="/classification">Open the earlier classifier</Link> · <Link href="/methodology">Read the classifier method</Link></p>
 </article>;}
