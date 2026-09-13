export default function MethodologyPage() {
  return <article className="page-width reading-page"><p className="section-label">Tissue &amp; procedure</p><h1>What we kept.<br/>What we changed.</h1>
    <h2>The borrowed wiring</h2><p>The real-data mode uses a 3,072-neuron subgraph of Janelia’s hemibrain v1.2, with 293,766 directed connections. Each retained connection comes from the reconstructed dataset. We selected high-degree neurons; this is not the whole fly brain and not an intact learning circuit. Synapse counts are scaled into computational weights.</p>
    <h2>What “trained” means</h2><p>A text encoder turns a passage into numbers. Those numbers stimulate selected neurons in a mathematical model of the wiring. A small classifier, called a readout, learns to turn the resulting activity into labels such as EMAIL, PHONE, or NONE. The wiring stays fixed during that training. The model does not understand law, and there is no living or conscious fly inside it.</p>
    <pre>{`Text → shared encoder → neural stimulation
                     ↓
         directed fly-wiring dynamics
                     ↓
         activity → trained readout

A[source, destination] = connection weight
x(t+1) = (1−λ)x(t) + λ tanh(Aᵀx(t) + Win·u(t))`}</pre>
    <h2>What the controls preserve</h2><p>The random graph preserves the exact number of neurons, edges, and the weight multiset. The degree-matched control also preserves every neuron’s incoming and outgoing edge count. The weight control preserves all connection locations and permutes the original weights. Collision checks prevent duplicate edges from being merged. Global normalization for the dynamics is recorded separately.</p>
    <h2>The MiniLM comparison</h2><p>MiniLM supplies the same frozen text features to every model in the published search. The fly hybrid combines those features with compact neural activity; scrambled hybrids use the same construction. Standard alternatives are a linear readout and a small neural readout. Each model family receives 18 validation candidates. Configuration choices are saved before the test is scored. Training, validation, and test label counts are reported separately.</p>
    <p>Paired trials vary training samples and graph/input seeds. Confidence intervals resample training-data-seed groups because several trials share the same training sample. These intervals condition on the existing synthetic test set. They do not establish real-world performance, and independent datasets are still needed.</p>
    <h2>About the pictures</h2><p>The points identify sampled neurons, and the connections and activity come from the model. The brain-shaped layout is an illustration, not microscopy coordinates. Signals are replayed with interpolation and a fixed display gain. Both panels use the same gain, clock, layout rule, and camera angle. Moving sparks illustrate direction; they are not a measurement of biological spike timing.</p>
    <h2>Data and privacy</h2><p>This public demo processes text on a server. The application does not save the passage, but that is not a promise about every hosting provider’s infrastructure. Only submit invented or redacted text. The interface’s initial recorded example is a saved inference on synthetic text and is labeled as such.</p>
    <h2>Reproduce the work</h2><pre>{`make fetch-hemibrain
make build-hemibrain
pip install -e '.[research,dev]'
python -m research.experiments.search
python -m research.experiments.surgery
pytest -q`}</pre><p>Graph hashes, encoder identity, dataset hashes, individual trials, and validation selection records accompany the measurements. Serving artifacts are versioned and checked before loading. Production does not train missing models on a request.</p>
    <h2>Attribution</h2><p>Hemibrain v1.2: Janelia FlyEM, Scheffer and colleagues, CC BY 4.0. The project code and synthetic examples use the MIT license. The live graph source is reported next to each specimen. Synthetic mode is explicitly labeled and must not be treated as anatomical data.</p>
  </article>;
}
