import Link from "next/link";

export default function MethodologyPage() {
  return <article className="page-width reading-page">
    <p className="section-label">Method</p>
    <h1>The fly is counsel.<br />The charter is fiction.</h1>
    <h2>Dataset</h2>
    <p>The intended biological substrate is the official MaleCNS v1.0 release from Janelia FlyEM: male fruit fly brain plus ventral nerve cord, licensed CC BY 4.0. The preparation command is <code>python tools/prepare_malecns.py --download --convert --export-browser</code>.</p>
    <p>The active worker refuses to substitute hemibrain, a female brain, a tiny mushroom-body circuit, or a random graph when the MaleCNS browser asset is missing. That refusal is deliberate.</p>
    <h2>Selection Policy</h2>
    <p>The pipeline keeps all annotated traced neuronal bodies from the released body annotations and every positive minconf-0.5 directed body-pair connection between retained bodies. Isolated retained bodies stay in the graph. Glia, untraced fragments, missing endpoints, and nonpositive connection rows are excluded and counted.</p>
    <h2>Computation</h2>
    <p>Only structured facts reach the model. Petition narrative text is casebook context. The fields are matter, property, harm, proof, intent, relationship, urgency, and ability. The expected answer and benchmark identifiers never enter the neural input.</p>
    <pre>{`structured facts
  -> deterministic encoding
  -> selected input neurons
  -> fixed MaleCNS leaky-tanh reservoir
  -> separate output/sample neurons
  -> artificial readout
  -> eight recommendations or abstention`}</pre>
    <p>The biological wiring is fixed. Training changes the artificial readout only. The model does not simulate dopamine learning, biological synaptic plasticity, consciousness, legal understanding, or spike timing.</p>
    <h2>Actions</h2>
    <p>The eight recommendations are: let the matter rest, seek small reparation, seek full reparation, request return of property, find a witness, request a sworn account within the fictional charter, propose settlement, and refer the matter to a higher authority. Abstention is a real outcome when the model is untrained, silent, ambiguous, or outside the supported fields.</p>
    <h2>Benchmarks</h2>
    <p>The first split has 32 teaching petitions and 16 held-out petitions from separate scenario families. The benchmark reports abstentions rather than hiding them. A facts-only learner and a shuffled-wiring control are specified as controls; a shuffled score is reported only when the shuffled MaleCNS asset has been generated.</p>
    <h2>Privacy</h2>
    <p>Inference, training, corrections, import, export, and benchmarking run in a browser worker. The app does not call an external AI service. Nothing is saved automatically. Model and casebook exports contain any user-entered material.</p>
    <p><Link href="/">Return to the chamber</Link></p>
  </article>;
}
