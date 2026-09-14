import { ACTIONS, ENGINE_VERSION, parseGraph, train, validateCases, validateModel, hearCase, yieldThread, actionName } from './core.mjs';

let generation = 0, aborter = null, graph = null, shuffled = null, model = null, cases = [], casebook = [], last = null;
const send = (id, type, data = {}) => postMessage({ id, type, ...data });
const begin = () => { generation++; aborter?.abort(); aborter = new AbortController(); return generation; };
const current = (token) => token === generation;
async function sha256(buffer) { return Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256', buffer)), b => b.toString(16).padStart(2, '0')).join(''); }

async function loadOne(info, signal) {
  const res = await fetch(`/legalfly/${info.file}`, { signal });
  if (!res.ok) throw Error('The MaleCNS graph file is unavailable');
  const buffer = await res.arrayBuffer();
  if (!crypto.subtle) throw Error('A secure context is required for graph verification');
  const actual = await sha256(buffer);
  if (actual !== info.sha256) throw Error('MaleCNS graph checksum failed');
  return parseGraph(buffer, info);
}

async function loadGraph(signal) {
  if (graph) return graph;
  const res = await fetch('/legalfly/manifest.json', { signal });
  if (!res.ok) throw Error('The MaleCNS manifest is unavailable');
  const manifest = await res.json();
  if (manifest.schema !== 'legalfly-malecns-graph/1') throw Error('Invalid MaleCNS manifest');
  if (!manifest.available) throw Error(manifest.reason || 'The official MaleCNS browser graph has not been prepared');
  graph = await loadOne(manifest.graph, signal);
  graph.info = { ...graph.info, ...manifest.graph, sampleBodyIds: manifest.graph.sampleBodyIds || [] };
  if (manifest.shuffled?.file) shuffled = await loadOne(manifest.shuffled, signal);
  send(0, 'provenance', { manifest });
  return graph;
}

function template(result) {
  const name = actionName(result.advice.action);
  if (result.advice.action === 'abstain') return 'The fly declines to advise. The petition is outside what it has been taught, too quiet, or too evenly balanced.';
  return `${name} The fly can point to the supplied facts and the village charter label, but it cannot explain the path through the wiring.`;
}

async function handle(m) {
  const id = m.id;
  if (m.type === 'cancel') { begin(); send(id, 'status', { state: model ? 'petition-ready' : 'idle' }); return; }
  if (m.type === 'export-model') { if (!model) throw Error('No learned model to export'); send(id, 'download', { name: 'legalfly-model.json', content: JSON.stringify(model, null, 2) }); return; }
  if (m.type === 'export-casebook') { send(id, 'download', { name: 'legalfly-casebook.json', content: JSON.stringify({ schema: 'legalfly-casebook/1', engine: ENGINE_VERSION, exportedAt: new Date().toISOString(), entries: casebook }, null, 2) }); return; }
  const token = begin(), signal = aborter.signal;
  try {
    if (m.type === 'load') {
      cases = validateCases(await (await fetch('/legalfly/cases.json', { signal })).json());
      send(id, 'cases', { cases, actions: ACTIONS });
      await loadGraph(signal); if (!current(token)) return;
      send(id, 'loaded', { graph: { neurons: graph.n, connections: graph.weights.length, fingerprint: graph.info.fingerprint, contacts: graph.info.contacts, release: 'MaleCNS v1.0' } });
      send(id, 'status', { state: 'idle' }); return;
    }
    await loadGraph(signal);
    if (m.type === 'train') {
      send(id, 'status', { state: 'computing' });
      model = await train(graph, cases, { seed: m.seed ?? 42 }, p => current(token) && send(id, 'progress', p), () => !current(token));
      if (!current(token)) return;
      send(id, 'trained', { modelSummary: { seed: model.seed, teaching: model.cases.filter(c => c.split === 'teach').length, heldout: model.cases.filter(c => c.split === 'holdout').length, reachability: model.reachability } });
      send(id, 'status', { state: 'petition-ready' }); return;
    }
    if (m.type === 'import-model') { model = validateModel(m.model, graph.info); send(id, 'trained', { modelSummary: { seed: model.seed, imported: true } }); send(id, 'status', { state: 'petition-ready' }); return; }
    if (m.type === 'reset-model') { model = null; send(id, 'status', { state: 'idle' }); return; }
    if (m.type === 'hear') {
      if (!model) throw Error('The fly is untrained. Teach the ledger first.');
      send(id, 'status', { state: 'computing' }); await yieldThread();
      const result = hearCase(graph, model, m.case);
      last = { ...result, recommendation: template(result), at: new Date().toISOString() };
      send(id, 'activity', { activity: result.activity });
      send(id, 'advice', { result: { case: result.case, advice: result.advice, recommendation: last.recommendation, energy: result.energy, sampledNodeIds: result.sampledNodeIds } });
      send(id, 'status', { state: 'advice-ready' }); return;
    }
    if (m.type === 'correct') {
      if (!last || !model) throw Error('No recent petition to correct');
      const corrected = { ...last.case, label: m.label, split: 'teach', id: `${last.case.id}-correction-${Date.now()}` };
      cases = [...cases, corrected];
      model = await train(graph, cases, { seed: model.seed }, p => current(token) && send(id, 'progress', p), () => !current(token));
      send(id, 'trained', { modelSummary: { seed: model.seed, corrected: true } });
      send(id, 'status', { state: 'petition-ready' }); return;
    }
    if (m.type === 'file-case') {
      if (!last) throw Error('No case to file');
      casebook = [...casebook, last].slice(-50);
      send(id, 'casebook', { entries: casebook });
      send(id, 'status', { state: 'filing' }); return;
    }
    if (m.type === 'import-casebook') {
      if (!m.casebook || m.casebook.schema !== 'legalfly-casebook/1' || !Array.isArray(m.casebook.entries)) throw Error('Invalid casebook');
      casebook = m.casebook.entries.slice(-50);
      send(id, 'casebook', { entries: casebook });
      return;
    }
    if (m.type === 'benchmark') {
      if (!model) throw Error('Train the fly before benchmarking');
      const rows = [];
      for (const c of cases.filter(x => x.split === 'holdout')) {
        if (!current(token)) return;
        const b = hearCase(graph, model, c);
        rows.push({ id: c.id, title: c.title, expected: c.label, biological: b.advice.action, abstained: b.advice.action === 'abstain', confidence: b.advice.confidence });
        await yieldThread();
      }
      const correct = rows.filter(r => r.biological === r.expected).length;
      send(id, 'benchmark', { rows, summary: { heldout: rows.length, correct, abstentions: rows.filter(r => r.abstained).length, forcedChoiceAccuracy: rows.length ? correct / rows.length : 0, controls: shuffled ? 'Shuffled graph asset available for independent retraining.' : 'Shuffled MaleCNS asset not present; no shuffled score reported.' } });
      send(id, 'status', { state: 'petition-ready' }); return;
    }
    throw Error('Unknown worker command');
  } catch (error) {
    if (!current(token) || signal.aborted) return;
    send(id, 'error', { message: error instanceof Error ? error.message : 'The experiment could not finish' });
    send(id, 'status', { state: model ? 'petition-ready' : 'idle' });
  }
}
onmessage = e => handle(e.data).catch(error => send(e.data.id, 'error', { message: error.message || 'Worker failure' }));
