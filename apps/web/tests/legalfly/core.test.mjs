import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { ACTIONS, parseGraph, parseAnatomy, sampleActivity, Reservoir, encodeFacts, validateCases, train, correctModel, hearCase, hearCaseTrace, validateModel, actionName, factsOnlyTrain, factsOnlyRecommend, rulesRecommendation } from '../../public/legalfly/core.mjs';

const fullManifest = JSON.parse(readFileSync(new URL('../../public/legalfly/manifest.json', import.meta.url), 'utf8'));

function graphFixture() {
  const n = 80;
  const rows = Array.from({ length: n }, () => []);
  for (let i = 0; i < n; i++) {
    rows[i].push([(i + 1) % n, 1]);
    rows[i].push([(i + 7) % n, 0.5]);
  }
  const indptr = new Uint32Array(n + 1);
  for (let i = 0; i < n; i++) indptr[i + 1] = indptr[i] + rows[i].length;
  const indices = new Uint32Array(indptr[n]), weights = new Float32Array(indptr[n]);
  for (let i = 0; i < n; i++) rows[i].forEach(([dst, w], k) => { indices[indptr[i] + k] = dst; weights[indptr[i] + k] = w; });
  const header = new Uint8Array(16); new TextEncoder().encode('LFLYMC1\0').forEach((b, i) => header[i] = b);
  const view = new DataView(header.buffer); view.setUint32(8, n, true); view.setUint32(12, indptr[n], true);
  const bytes = new Uint8Array(16 + indptr.byteLength + indices.byteLength + weights.byteLength);
  bytes.set(header); bytes.set(new Uint8Array(indptr.buffer), 16); bytes.set(new Uint8Array(indices.buffer), 16 + indptr.byteLength); bytes.set(new Uint8Array(weights.buffer), 16 + indptr.byteLength + indices.byteLength);
  return parseGraph(bytes.buffer, { neurons: n, connections: indptr[n], recurrenceScale: 0.1, fingerprint: 'fixture', sha256: 'fixture-sha', contacts: 120, bodyIds: Array.from({ length: n }, (_, i) => String(i)) });
}

function anatomyFixture(n = 4) {
  const header = new Uint8Array(16);
  new TextEncoder().encode('LFLYAN1\0').forEach((byte, index) => { header[index] = byte; });
  const view = new DataView(header.buffer);
  view.setUint32(8, n, true);
  view.setUint32(12, n === 4 ? 3 : n, true);
  const bodyIds = Uint32Array.from({ length: n }, (_, i) => 101 + i);
  const missing = -2147483648;
  const coordinates = n === 4
    ? new Int32Array([10, 20, 30, 40, 50, 60, missing, missing, missing, 70, 80, 90])
    : Int32Array.from({ length: n * 3 }, (_, i) => 10 + i);
  const flags = n === 4 ? new Uint8Array([9, 10, 0, 14]) : Uint8Array.from({ length: n }, (_, i) => 8 | (i < 4 ? 1 : 0) | (i >= n - 4 ? 2 : 0) | (i % 9 === 0 ? 4 : 0));
  const bytes = new Uint8Array(16 + bodyIds.byteLength + coordinates.byteLength + flags.byteLength);
  bytes.set(header);
  bytes.set(new Uint8Array(bodyIds.buffer), 16);
  bytes.set(new Uint8Array(coordinates.buffer), 16 + bodyIds.byteLength);
  bytes.set(flags, 16 + bodyIds.byteLength + coordinates.byteLength);
  return bytes.buffer;
}

const cases = ACTIONS.flatMap(([label], i) => [0, 1].map(j => ({
  id: `${label}-${j}`,
  split: 'teach',
  family: `family-${i}-${j}`,
  title: `${actionName(label)} ${j}`,
  villager: 'Test villager',
  prop: 'paper',
  petition: 'A short fictional petition.',
  facts: { matter: ['damage', 'debt', 'property', 'delivery', 'boundary', 'insult', 'charter', 'threat'][i], property: j ? 'goods' : 'tool', harm: i > 5 ? 'high' : 'moderate', proof: j ? 'witness' : 'admitted', intent: i % 2 ? 'unclear' : 'careless', relationship: i > 5 ? 'official' : 'neighbors', urgency: i > 5 ? 'high' : 'ordinary', ability: i === 6 ? 'unable' : 'able' },
  label
})));

test('MaleCNS binary parser keeps directed positive edges', () => {
  const graph = graphFixture();
  assert.equal(graph.n, 80);
  assert.equal(graph.weights.length, 160);
  const r = new Reservoir(graph, 1);
  r.x[0] = 0.5;
  r.step(new Float32Array(96));
  assert.ok(r.x[1] > 0);
});

test('official MaleCNS manifest pins the traced-neuron full graph', () => {
  const graph = fullManifest.graph;
  assert.equal(fullManifest.dataset.name, 'MaleCNS');
  assert.equal(fullManifest.dataset.release, 'v1.0');
  assert.equal(graph.neurons, 165122);
  assert.equal(graph.connections, 25563197);
  assert.equal(graph.contacts, 124025046);
  assert.equal(graph.annotationExcluded, 46455);
  assert.equal(graph.connectionExcluded, 126293487);
  assert.equal(graph.inputIndices.length, 15897);
  assert.equal(graph.outputIndices.length, 2022);
  assert.equal(graph.vncIndices.length, 28187);
  assert.equal(graph.sha256, 'c7cce7d82cf5a228b92de425e04ecd1ce35795bc3b76ce479ec72b6cb9ea29eb');
  assert.match(graph.selectionPolicy, /status is exactly Traced/);
  assert.equal(fullManifest.anatomy.neurons, 165122);
  assert.equal(fullManifest.anatomy.coordinateCount, 140024);
  assert.equal(fullManifest.anatomy.sha256, '42d27435b12e880166ee9946adf16e42ce47b2ab2c644503b5235da82b913540');
  assert.match(fullManifest.anatomy.policy, /no positions are inferred/i);
});

test('anatomy parser preserves released body IDs, coordinates, and roles', () => {
  const anatomy = parseAnatomy(anatomyFixture(), { neurons: 4, coordinateCount: 3 });
  assert.equal(anatomy.bodyIds[1], 102);
  assert.deepEqual(anatomy.coordinate(1), [40, 50, 60]);
  assert.equal(anatomy.coordinate(2), null);
  assert.deepEqual(anatomy.roles(3), ['output', 'vnc']);
});

test('activity sampling shows the strongest genuinely active mapped neurons', () => {
  const anatomy = parseAnatomy(anatomyFixture(), { neurons: 4, coordinateCount: 3 });
  const frame = sampleActivity(anatomy, new Float32Array([0.01, -0.9, 1, 0.4]), { activeLimit: 2, contextLimit: 1, step: 3 });
  assert.equal(frame.step, 3);
  assert.equal(frame.sampled, true);
  assert.equal(frame.total_neurons, 4);
  assert.deepEqual(frame.points.filter(point => point.active).map(point => point.body_id), [102, 104]);
  assert.equal(frame.points.find(point => point.body_id === 102).activation, -0.8999999761581421);
  assert.deepEqual(frame.points.find(point => point.body_id === 104).coordinate, [70, 80, 90]);
  assert.ok(frame.points.every(point => point.body_id !== 103));
});

test('annotated sensory inputs and disjoint output populations are used when present', () => {
  const graph = graphFixture();
  graph.info.inputIndices = [2, 3, 4];
  graph.info.outputIndices = [4, 7, 9, 11];
  const reservoir = new Reservoir(graph, 2);
  assert.deepEqual(reservoir.inputIds, [2, 3, 4]);
  assert.ok(reservoir.featureIds.includes(7));
  assert.ok(!reservoir.featureIds.includes(4));
});

test('structured encoding is deterministic and excludes recommendation labels', () => {
  const a = encodeFacts(cases[0].facts);
  const renamed = { ...cases[0], title: 'Different', label: 'refer-higher' };
  assert.deepEqual(a, encodeFacts(renamed.facts));
  assert.ok(Math.abs(a.reduce((s, v) => s + v * v, 0) - 1) < 1e-6);
});

test('case validation rejects unknown labels and malformed facts', () => {
  assert.throws(() => validateCases([{ ...cases[0], label: 'win-lawsuit' }, cases[1]]), /Unknown/);
  assert.throws(() => validateCases([{ ...cases[0], facts: { ...cases[0].facts, harm: '' } }, cases[1]]), /harm/);
});

test('training produces a graph-bound model and strict import checks', async () => {
  const graph = graphFixture();
  const model = await train(graph, cases, { seed: 42 });
  assert.equal(model.cases.length, cases.length);
  assert.ok(model.centroids.some(row => row.some(v => Math.abs(v) > 1e-7)));
  validateModel(model, graph.info);
  assert.throws(() => validateModel({ ...model, graphFingerprint: 'wrong' }, graph.info), /graph/);
  assert.throws(() => validateModel({ ...model, centroids: [[Infinity]] }, graph.info), /readout/);
});

test('hearing a petition uses neural features and can abstain without inventing reasons', async () => {
  const graph = graphFixture();
  const model = await train(graph, cases, { seed: 7 });
  const result = hearCase(graph, model, cases[0]);
  assert.ok(ACTIONS.some(([id]) => id === result.advice.action) || result.advice.action === 'abstain');
  const quiet = hearCase(graph, { ...model, centroids: model.centroids.map(row => row.map(() => 0)) }, cases[0]);
  assert.equal(quiet.advice.action, 'abstain');
});

test('traced hearing emits each actual reservoir update and cancels between updates', async () => {
  const graph = graphFixture(), anatomy = parseAnatomy(anatomyFixture(80), { neurons: 80, coordinateCount: 80 });
  const model = await train(graph, cases, { seed: 7 }), frames = [];
  const result = await hearCaseTrace(graph, anatomy, model, cases[0], frame => frames.push(frame));
  assert.deepEqual(frames.map(frame => frame.step), [1, 2, 3, 4]);
  assert.ok(frames.every(frame => frame.points.some(point => point.active)));
  assert.equal(result.activity, frames[3]);
  let cancelled = false;
  await assert.rejects(
    () => hearCaseTrace(graph, anatomy, model, cases[0], () => { cancelled = true; }, () => cancelled),
    /cancel/i
  );
});

test('the readout normalizes neural feature scale before abstention', async () => {
  const graph = graphFixture(), model = await train(graph, cases, { seed: 7 });
  const first = hearCase(graph, model, cases[0]).advice;
  const scaled = { ...model, centroids: model.centroids.map(row => row.map(value => value * 1e-6)) };
  const second = hearCase(graph, scaled, cases[0]).advice;
  assert.equal(first.action, second.action);
  assert.ok(Math.abs(first.confidence - second.confidence) < 1e-5);
});

test('training cancellation is transactional', async () => {
  const graph = graphFixture();
  let stop = false;
  await assert.rejects(() => train(graph, cases, { seed: 1 }, () => { stop = true; }, () => stop), /cancel/i);
});

test('corrective feedback returns an atomic replacement and preserves inputs on cancellation', async () => {
  const graph = graphFixture(), model = await train(graph, cases, { seed: 1 }), before = cases.slice();
  let stop = false;
  await assert.rejects(
    () => correctModel(graph, cases, model, cases[0], 'refer-higher', () => { stop = true; }, () => stop),
    /cancel/i
  );
  assert.deepEqual(cases, before);
  assert.equal(model.cases.length, before.length);
  const replacement = await correctModel(graph, cases, model, cases[0], 'refer-higher');
  assert.equal(replacement.cases.length, before.length + 1);
  assert.equal(replacement.model.cases.length, before.length + 1);
});

test('facts-only and charter-rule controls stay outside the neural readout', () => {
  const factsModel = factsOnlyTrain(cases);
  const result = factsOnlyRecommend(factsModel, cases[0].facts);
  assert.ok(ACTIONS.some(([id]) => id === result.action));
  assert.ok(Number.isFinite(result.confidence));
  assert.equal(rulesRecommendation({ ...cases[0].facts, matter: 'threat', urgency: 'high', harm: 'high' }), 'refer-higher');
});
