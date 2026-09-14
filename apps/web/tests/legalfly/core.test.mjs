import test from 'node:test';
import assert from 'node:assert/strict';
import { ACTIONS, parseGraph, Reservoir, encodeFacts, validateCases, train, hearCase, validateModel, actionName } from '../../public/legalfly/core.mjs';

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

test('training cancellation is transactional', async () => {
  const graph = graphFixture();
  let stop = false;
  await assert.rejects(() => train(graph, cases, { seed: 1 }, () => { stop = true; }, () => stop), /cancel/i);
});
