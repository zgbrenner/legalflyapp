import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile, stat } from 'node:fs/promises';
import { createReadStream, existsSync } from 'node:fs';
import { Readable } from 'node:stream';
import { webcrypto } from 'node:crypto';

const manifest = JSON.parse(await readFile(new URL('../../public/legalfly/manifest.json', import.meta.url), 'utf8'));
const fullDataAvailable = manifest.available && ['malecns.bin', 'malecns-anatomy.bin'].every(file => existsSync(new URL(`../../public/legalfly/${file}`, import.meta.url)));
test('full released graph loads once, reports bounded progress, and supplies genuine idle and training frames', { skip: fullDataAvailable ? false : 'Full MaleCNS binary assets unavailable; run after data generation' }, async t => {
  const original = { fetch: globalThis.fetch, postMessage: globalThis.postMessage, onmessage: globalThis.onmessage };
  const messages = [], requests = new Map();
  let started, release;
  const graphStarted = new Promise(resolve => { started = resolve; });
  const graphReleased = new Promise(resolve => { release = resolve; });
  globalThis.crypto ??= webcrypto;
  globalThis.onmessage = null;
  globalThis.fetch = async url => {
    requests.set(url, (requests.get(url) ?? 0) + 1);
    if (url === '/legalfly/malecns.bin') { started(); await graphReleased; }
    const file = new URL(`../../public${url}`, import.meta.url);
    const size = (await stat(file)).size;
    return new Response(Readable.toWeb(createReadStream(file)), { headers: { 'content-length': String(size) } });
  };
  globalThis.postMessage = message => messages.push(message);
  try {
    await import(`../../public/legalfly/worker.mjs?test=${Date.now()}`);
    const loadStart = performance.now();
    const first = globalThis.onmessage({ data: { id: 1, type: 'load' } });
    await graphStarted;
    const second = globalThis.onmessage({ data: { id: 2, type: 'load' } });
    release();
    await Promise.all([first, second]);
    const loadMs = performance.now() - loadStart;
    assert.equal(requests.get('/legalfly/malecns.bin'), 1, 'concurrent loads share verified bytes');
    assert.equal(requests.get('/legalfly/malecns-anatomy.bin'), 1);
    assert.equal(requests.get('/legalfly/malecns-shuffled.bin'), undefined);
    const loaded = messages.find(m => m.type === 'loaded');
    assert.equal(loaded.id, 2);
    assert.ok(!messages.some(m => m.id === 1 && ['loaded', 'activity', 'error'].includes(m.type)));
    assert.equal(loaded.graph.neurons, 165122);
    assert.equal(loaded.graph.connections, 25563197);
    const progress = messages.filter(m => m.type === 'load-progress');
    assert.ok(progress.length > 2 && progress.length < 250, 'progress is informative but bounded');
    assert.ok(progress.every(m => m.current >= 0 && m.current <= m.total));
    const idle = messages.find(m => m.type === 'activity');
    assert.equal(idle.activity.kind, 'anatomy');
    assert.ok(idle.activity.points.length > 0 && idle.activity.points.length <= 2400);
    assert.ok(idle.activity.points.every(p => !p.active && p.activation === 0 && p.coordinate.length === 3));
    const before = messages.length;
    const trainStart = performance.now();
    await globalThis.onmessage({ data: { id: 3, type: 'train', seed: 42 } });
    const trainMs = performance.now() - trainStart;
    assert.ok(messages.slice(before).some(m => m.type === 'activity' && m.activity.points.some(p => p.active)), 'training publishes real values');
    assert.ok(messages.some(m => m.type === 'trained'));
    const legalCase = JSON.parse(await readFile(new URL('../../public/legalfly/cases.json', import.meta.url), 'utf8'))[0];
    const hearStart = performance.now();
    await globalThis.onmessage({ data: { id: 4, type: 'hear', case: legalCase } });
    const hearMs = performance.now() - hearStart;
    assert.deepEqual(messages.filter(m => m.id === 4 && m.type === 'activity').map(m => m.activity.step), [1, 2, 3, 4]);
    assert.ok(!messages.some(m => m.type === 'error'));
    await globalThis.onmessage({ data: { id: 5, type: 'reset-model' } });
    assert.equal(messages.find(m => m.id === 5 && m.type === 'activity').activity.kind, 'anatomy');
    t.diagnostic(`Node harness (local file streams; NOT native browser/network): load=${loadMs.toFixed(1)}ms train=${trainMs.toFixed(1)}ms hear=${hearMs.toFixed(1)}ms; neurons=165122 connections=25563197; load-progress=${progress.length}; training-frames=${messages.filter(m => m.id === 3 && m.type === 'activity').length}`);
  } finally { Object.assign(globalThis, original); }
});

test('invalid manifest dimensions are rejected before binary requests or allocations', async () => {
  const original = { fetch: globalThis.fetch, postMessage: globalThis.postMessage, onmessage: globalThis.onmessage };
  const cases = JSON.parse(await readFile(new URL('../../public/legalfly/cases.json', import.meta.url), 'utf8'));
  try {
    for (const neurons of [1.5, -1, 250001, Number.MAX_SAFE_INTEGER]) {
      const messages = [], binaries = [];
      globalThis.onmessage = null;
      globalThis.postMessage = message => messages.push(message);
      globalThis.fetch = async url => {
        if (url.endsWith('cases.json')) return Response.json(cases);
        if (url.endsWith('manifest.json')) return Response.json({ schema: 'legalfly-malecns-graph/1', available: true, graph: { file: 'bad.bin', neurons, connections: 1 }, anatomy: { file: 'bad-anatomy.bin', neurons, coordinateCount: 1 } });
        binaries.push(url); return new Response(new Uint8Array(1));
      };
      await import(`../../public/legalfly/worker.mjs?invalid=${neurons}`);
      await globalThis.onmessage({ data: { id: 10, type: 'load' } });
      assert.ok(messages.some(m => m.type === 'error' && /dimensions/i.test(m.message)));
      assert.deepEqual(binaries, [], 'invalid dimensions must fail before binary acquisition');
    }
  } finally { Object.assign(globalThis, original); }
});

test('stalled binary requests time out without substitute frames and can be retried', async () => {
  const original = { fetch: globalThis.fetch, postMessage: globalThis.postMessage, onmessage: globalThis.onmessage, setTimeout: globalThis.setTimeout };
  const cases = JSON.parse(await readFile(new URL('../../public/legalfly/cases.json', import.meta.url), 'utf8'));
  const messages = [];
  let binaries = 0;
  globalThis.onmessage = null;
  globalThis.postMessage = message => messages.push(message);
  // Accelerate only the inactivity clock, not the absolute deadline.
  globalThis.setTimeout = (callback, delay, ...args) => original.setTimeout(callback, delay === 60000 ? 5 : delay, ...args);
  globalThis.fetch = async (url, { signal }) => {
    if (url.endsWith('cases.json')) return Response.json(cases);
    if (url.endsWith('manifest.json')) return Response.json({ schema: 'legalfly-malecns-graph/1', available: true, graph: { file: 'stalled.bin', neurons: 80, connections: 160 }, anatomy: { file: 'stalled-anatomy.bin', neurons: 80, coordinateCount: 80 } });
    binaries++;
    return new Promise((resolve, reject) => signal.addEventListener('abort', () => reject(signal.reason), { once: true }));
  };
  try {
    await import('../../public/legalfly/worker.mjs?stalled');
    await globalThis.onmessage({ data: { id: 11, type: 'load' } });
    await globalThis.onmessage({ data: { id: 12, type: 'load' } });
    assert.equal(binaries, 4);
    assert.equal(messages.filter(m => m.type === 'error' && /stalled/.test(m.message)).length, 2);
    assert.ok(!messages.some(m => ['loaded', 'activity'].includes(m.type)));
  } finally { Object.assign(globalThis, original); }
});
