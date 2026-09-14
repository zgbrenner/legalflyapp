export const ENGINE_VERSION = 'legalfly-village/2';
export const ACTIONS = [
  ['let-rest', 'Let the matter rest.'],
  ['seek-small-reparation', 'Seek small reparation.'],
  ['seek-full-reparation', 'Seek full reparation.'],
  ['request-return', 'Request return of property.'],
  ['find-witness', 'Find a witness.'],
  ['sworn-account', 'Request a sworn account within the fictional charter.'],
  ['propose-settlement', 'Propose settlement.'],
  ['refer-higher', 'Refer the matter to a higher authority.']
];
export const DIM = 96;
export const FEATURES = 256;
export const WAKE_STEPS = 4;
export const DEFAULTS = Object.freeze({ leak: 0.28, inputScale: 1.15, margin: 0.045, confidence: 0.28, quietRMS: 1e-5, readoutTemperature: 4 });
const FIELDS = ['matter', 'property', 'harm', 'proof', 'intent', 'relationship', 'urgency', 'ability'];
const finite = (x, max = 1e6) => typeof x === 'number' && Number.isFinite(x) && Math.abs(x) <= max;
export const yieldThread = () => new Promise(resolve => setTimeout(resolve, 0));
export function rng(seed) { let x = seed >>> 0; return () => { x = (Math.imul(x, 1664525) + 1013904223) >>> 0; return x / 4294967296; }; }
export function rms(a) { let s = 0; for (const x of a) s += x * x; return Math.sqrt(s / Math.max(1, a.length)); }
function hash(s) { let h = 2166136261; for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619); } return h >>> 0; }
function dot(a, b) { let s = 0; for (let i = 0; i < a.length; i++) s += a[i] * b[i]; return s; }
function cosine(a, b) { return dot(a, b) / Math.max(1e-12, Math.sqrt(dot(a, a) * dot(b, b))); }
function softmax(scores, temperature = 1) { const m = Math.max(...scores), e = scores.map(x => Math.exp((x - m) * temperature)), z = e.reduce((a, b) => a + b, 0) || 1; return e.map(x => x / z); }

export function parseGraph(buffer, info) {
  const v = new DataView(buffer);
  const magic = new TextDecoder().decode(new Uint8Array(buffer, 0, 8));
  if (buffer.byteLength < 16 || magic !== 'LFLYMC1\0') throw Error('Invalid MaleCNS graph file');
  const n = v.getUint32(8, true), nnz = v.getUint32(12, true), end = 16 + (n + 1) * 4 + nnz * 8;
  if (n !== info.neurons || nnz !== info.connections || n < 1 || n > 250000 || nnz > 100000000 || buffer.byteLength !== end) throw Error('MaleCNS graph dimensions do not match manifest');
  const indptr = new Uint32Array(buffer, 16, n + 1);
  const indices = new Uint32Array(buffer, 16 + (n + 1) * 4, nnz);
  const weights = new Float32Array(buffer, 16 + (n + 1) * 4 + nnz * 4, nnz);
  if (indptr[0] !== 0 || indptr[n] !== nnz) throw Error('Invalid MaleCNS offsets');
  for (let i = 0; i < n; i++) if (indptr[i] > indptr[i + 1]) throw Error('Invalid MaleCNS offsets');
  for (let j = 0; j < nnz; j++) if (indices[j] >= n || !finite(weights[j]) || weights[j] <= 0) throw Error('Invalid MaleCNS connection');
  return { n, indptr, indices, weights, info };
}

export function validateCase(c) {
  if (!c || typeof c !== 'object') throw Error('Invalid petition');
  const text = (v, max, name) => { if (typeof v !== 'string' || !v.trim() || v.length > max) throw Error(`Invalid ${name}`); return v.trim(); };
  const facts = {};
  for (const field of FIELDS) facts[field] = text(c.facts?.[field], 80, field);
  const label = c.label == null ? null : text(c.label, 80, 'label');
  if (label && !ACTIONS.some(([id]) => id === label)) throw Error('Unknown recommendation label');
  return { id: text(c.id || `custom-${hash(JSON.stringify(facts))}`, 100, 'id'), split: c.split === 'holdout' ? 'holdout' : 'teach', family: text(c.family || 'custom', 100, 'family'), title: text(c.title || 'Custom petition', 160, 'title'), villager: text(c.villager || 'A villager', 120, 'villager'), prop: text(c.prop || 'petition', 80, 'prop'), petition: text(c.petition || 'A petition was brought to the desk.', 1000, 'petition'), facts, label };
}
export function validateCases(value) {
  if (!Array.isArray(value) || value.length < 2 || value.length > 96) throw Error('Use 2 to 96 petitions');
  const seen = new Set();
  return value.map(validateCase).map(c => { if (seen.has(c.id)) throw Error('Petition IDs must be unique'); seen.add(c.id); return c; });
}
export function encodeFacts(facts) {
  const u = new Float32Array(DIM);
  for (const field of FIELDS) {
    const token = `${field}:${facts[field] ?? 'unknown'}`.toLowerCase();
    const h = hash(token), k = h % DIM;
    u[k] += ((h >>> 9) & 1 ? 1 : -1);
    u[(k + 31) % DIM] += ((h >>> 13) & 1 ? 0.38 : -0.38);
  }
  const norm = Math.sqrt(dot(u, u));
  if (norm) for (let i = 0; i < DIM; i++) u[i] /= norm;
  return u;
}

export class Reservoir {
  constructor(graph, seed = 42) {
    this.graph = graph; this.n = graph.n; this.x = new Float32Array(this.n); this.sum = new Float64Array(this.n); this.input = new Float64Array(this.n);
    const random = rng(seed), order = Array.from({ length: this.n }, (_, i) => i);
    for (let i = order.length - 1; i > 0; i--) { const j = Math.floor(random() * (i + 1)); [order[i], order[j]] = [order[j], order[i]]; }
    const annotatedInputs = graph.info.inputIndices?.filter(i => Number.isInteger(i) && i >= 0 && i < this.n) ?? [];
    const inputSet = new Set(annotatedInputs);
    const annotatedOutputs = graph.info.outputIndices?.filter(i => Number.isInteger(i) && i >= 0 && i < this.n && !inputSet.has(i)) ?? [];
    const inputCount = Math.min(this.n, Math.max(64, Math.floor(this.n / 180)));
    this.inputIds = annotatedInputs.length ? annotatedInputs : order.slice(0, inputCount);
    const outputOrder = annotatedOutputs.length ? annotatedOutputs.slice() : order.slice(inputCount);
    for (let i = outputOrder.length - 1; i > 0; i--) { const j = Math.floor(random() * (i + 1)); [outputOrder[i], outputOrder[j]] = [outputOrder[j], outputOrder[i]]; }
    this.featureIds = outputOrder.slice(0, FEATURES);
    const fallbackOutputs = order.filter(i => !inputSet.has(i));
    while (this.featureIds.length < FEATURES) this.featureIds.push(fallbackOutputs[this.featureIds.length % fallbackOutputs.length]);
    this.projection = new Float32Array(this.inputIds.length * DIM);
    for (let k = 0; k < this.inputIds.length; k++) {
      let norm = 0;
      for (let j = 0; j < DIM; j++) { const v = random() * 2 - 1; this.projection[k * DIM + j] = v; norm += v * v; }
      for (let j = 0; j < DIM; j++) this.projection[k * DIM + j] *= DEFAULTS.inputScale / Math.sqrt(norm);
    }
  }
  reset() { this.x.fill(0); }
  features() { return Float32Array.from(this.featureIds, i => this.x[i]); }
  step(u) {
    const { indptr, indices, weights } = this.graph;
    this.sum.fill(0); this.input.fill(0);
    for (let src = 0; src < this.n; src++) {
      const x = this.x[src]; if (x === 0) continue;
      for (let j = indptr[src]; j < indptr[src + 1]; j++) this.sum[indices[j]] += weights[j] * x;
    }
    for (let k = 0; k < this.inputIds.length; k++) { let z = 0; for (let j = 0; j < DIM; j++) z += this.projection[k * DIM + j] * u[j]; this.input[this.inputIds[k]] = z; }
    const scale = this.graph.info.recurrenceScale ?? 1e-4, leak = DEFAULTS.leak;
    for (let i = 0; i < this.n; i++) this.x[i] = (1 - leak) * this.x[i] + leak * Math.tanh(this.sum[i] * scale + this.input[i]);
  }
}

function trainCentroids(samples, dimensions = FEATURES) {
  const centroids = ACTIONS.map(() => new Float64Array(dimensions));
  const counts = ACTIONS.map(() => 0);
  for (const s of samples) {
    const idx = ACTIONS.findIndex(([id]) => id === s.label);
    if (idx < 0) continue;
    counts[idx]++;
    for (let i = 0; i < dimensions; i++) centroids[idx][i] += s.features[i];
  }
  return centroids.map((c, i) => Array.from(c, v => counts[i] ? v / counts[i] : 0));
}
export async function train(graph, cases, options = {}, progress = () => {}, cancelled = () => false) {
  const all = validateCases(cases), teach = all.filter(c => c.split === 'teach' && c.label);
  if (teach.length < 8) throw Error('At least eight labeled teaching petitions are required');
  const seed = options.seed ?? 42, reservoir = new Reservoir(graph, seed), samples = [], reach = { touched: new Uint8Array(graph.n), maxVncActivity: 0, activeAfterWake: 0, activeVnc: 0 };
  for (let i = 0; i < teach.length; i++) {
    if (cancelled()) throw Error('Training cancelled');
    const u = encodeFacts(teach[i].facts); reservoir.reset();
    for (let t = 0; t < WAKE_STEPS; t++) reservoir.step(u);
    for (let k = 0; k < reservoir.x.length; k++) if (Math.abs(reservoir.x[k]) > 1e-6) reach.touched[k] = 1;
    for (const k of graph.info.vncIndices ?? []) reach.maxVncActivity = Math.max(reach.maxVncActivity, Math.abs(reservoir.x[k]));
    samples.push({ label: teach[i].label, features: reservoir.features() });
    progress({ current: i + 1, total: teach.length, title: teach[i].title }); await yieldThread();
  }
  reach.activeAfterWake = reach.touched.reduce((a, b) => a + b, 0);
  reach.activeVnc = (graph.info.vncIndices ?? []).reduce((count, index) => count + reach.touched[index], 0);
  const reachability = { activeAfterWake: reach.activeAfterWake, activeVnc: reach.activeVnc, maxVncActivity: reach.maxVncActivity, totalVnc: graph.info.vncIndices?.length ?? 0 };
  return { schema: ENGINE_VERSION, graphFingerprint: graph.info.fingerprint, graphSha256: graph.info.sha256, seed, actions: ACTIONS, settings: { ...DEFAULTS, inputDimensions: DIM, outputFeatures: FEATURES, wakeSteps: WAKE_STEPS }, cases: all, centroids: trainCentroids(samples), reachability };
}
export function validateModel(value, info) {
  if (!value || value.schema !== ENGINE_VERSION || value.graphFingerprint !== info.fingerprint || value.graphSha256 !== info.sha256) throw Error('Model does not match this MaleCNS graph and engine');
  if (!Number.isInteger(value.seed) || value.seed < 0 || value.seed > 0xffffffff) throw Error('Invalid model seed');
  const cases = validateCases(value.cases);
  if (JSON.stringify(value.actions) !== JSON.stringify(ACTIONS)) throw Error('Action identities do not match');
  if (!Array.isArray(value.centroids) || value.centroids.length !== ACTIONS.length || !value.centroids.every(row => Array.isArray(row) && row.length === FEATURES && row.every(v => finite(v, 10)))) throw Error('Invalid readout weights');
  return { ...value, cases };
}
export function recommendFromFeatures(features, model, energy) {
  if (energy < DEFAULTS.quietRMS) return { action: 'abstain', confidence: 0, margin: 0, scores: [], reason: 'silent' };
  const scores = model.centroids.map(c => cosine(features, c));
  const probs = softmax(scores, model.settings?.readoutTemperature ?? DEFAULTS.readoutTemperature);
  const ranked = probs.map((p, i) => ({ i, p })).sort((a, b) => b.p - a.p);
  const margin = ranked[0].p - (ranked[1]?.p ?? 0);
  const forcedChoice = ACTIONS[ranked[0].i][0];
  if (ranked[0].p < DEFAULTS.confidence || margin < DEFAULTS.margin) return { action: 'abstain', forcedChoice, confidence: ranked[0].p, margin, scores: probs, reason: 'ambiguous' };
  return { action: forcedChoice, forcedChoice, confidence: ranked[0].p, margin, scores: probs, reason: 'readout' };
}
export function hearCase(graph, model, legalCase) {
  const c = validateCase(legalCase), checked = validateModel(model, graph.info), reservoir = new Reservoir(graph, checked.seed);
  const u = encodeFacts(c.facts); reservoir.reset();
  for (let t = 0; t < WAKE_STEPS; t++) reservoir.step(u);
  const features = reservoir.features(), energy = rms(reservoir.x), advice = recommendFromFeatures(features, checked, energy);
  const activity = displayGraph(graph, reservoir.x);
  return { case: c, advice, energy, activity, sampledNodeIds: activity.node_ids, featureIds: reservoir.featureIds, inputIds: reservoir.inputIds };
}
export function factsOnlyTrain(cases) {
  const teach = validateCases(cases).filter(c => c.split === 'teach' && c.label);
  return { centroids: trainCentroids(teach.map(c => ({ label: c.label, features: encodeFacts(c.facts) })), DIM) };
}
export function factsOnlyRecommend(model, facts) {
  const features = encodeFacts(facts), scores = model.centroids.map(c => cosine(features, c));
  const probabilities = softmax(scores, DEFAULTS.readoutTemperature), ranked = probabilities.map((p, i) => ({ p, i })).sort((a, b) => b.p - a.p);
  return { action: ACTIONS[ranked[0].i][0], confidence: ranked[0].p };
}
export function rulesRecommendation(facts) {
  if (facts.urgency === 'high' && (facts.harm === 'high' || facts.matter === 'threat' || facts.matter === 'official')) return 'refer-higher';
  if (facts.proof === 'unclear' && ['boundary', 'insult', 'property'].includes(facts.matter)) return 'find-witness';
  if (facts.matter === 'property' && facts.property !== 'none') return 'request-return';
  if (facts.ability === 'unable' || facts.matter === 'debt') return 'propose-settlement';
  if (facts.matter === 'account' || facts.matter === 'charter') return 'sworn-account';
  if (facts.harm === 'high' || facts.intent === 'deliberate') return 'seek-full-reparation';
  if (facts.harm === 'moderate' || facts.harm === 'low' || ['damage', 'delivery'].includes(facts.matter)) return 'seek-small-reparation';
  return 'let-rest';
}
export function displayGraph(graph, values = null) {
  const stride = Math.max(1, Math.floor(graph.n / 360)), indices = [];
  for (let i = 0; i < graph.n; i += stride) indices.push(i);
  const bodyIdMap = new Map(graph.info.sampleBodyIds ?? []);
  const local = new Map(indices.map((id, i) => [id, i])), edges = [];
  for (const src of indices) for (let j = graph.indptr[src]; j < graph.indptr[src + 1]; j++) { const dst = graph.indices[j]; if (local.has(dst)) edges.push([local.get(src), local.get(dst), graph.weights[j]]); }
  return { indices, node_ids: indices.map(i => bodyIdMap.get(i) ?? String(i)), values: indices.map(i => values ? Math.abs(values[i]) : 0), edges: edges.slice(0, 900), total_neurons: graph.n, total_edges: graph.weights.length, graph_hash: graph.info.fingerprint, sampled: true };
}
export const actionName = (id) => ACTIONS.find(([k]) => k === id)?.[1] ?? 'Abstain.';
