import { ACTIONS, ENGINE_VERSION, parseGraph, parseAnatomy, train, correctModel, validateCases, validateModel, hearCase, hearCaseTrace, yieldThread, actionName, factsOnlyTrain, factsOnlyRecommend, rulesRecommendation } from './core.mjs';

let generation = 0, aborter = null, graph = null, anatomy = null, shuffled = null, graphManifest = null, model = null, cases = [], casebook = [], last = null;
const send = (id, type, data = {}) => postMessage({ id, type, ...data });
const begin = () => { generation++; aborter?.abort(); aborter = new AbortController(); return generation; };
const current = (token) => token === generation;
async function sha256(buffer) { return Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256', buffer)), b => b.toString(16).padStart(2, '0')).join(''); }

async function loadVerified(info, signal, kind) {
  const res = await fetch(`/legalfly/${info.file}`, { signal });
  if (!res.ok) throw Error(`The MaleCNS ${kind} file is unavailable`);
  const buffer = await res.arrayBuffer();
  if (!crypto.subtle) throw Error('A secure context is required for graph verification');
  const actual = await sha256(buffer);
  if (actual !== info.sha256) throw Error(`MaleCNS ${kind} checksum failed`);
  return buffer;
}

async function loadOne(info, signal) {
  return parseGraph(await loadVerified(info, signal, 'graph'), info);
}

async function loadGraph(signal) {
  if (graph && anatomy) return graph;
  const res = await fetch('/legalfly/manifest.json', { signal });
  if (!res.ok) throw Error('The MaleCNS manifest is unavailable');
  graphManifest = await res.json();
  if (graphManifest.schema !== 'legalfly-malecns-graph/1') throw Error('Invalid MaleCNS manifest');
  if (!graphManifest.available) throw Error(graphManifest.reason || 'The official MaleCNS browser graph has not been prepared');
  const candidateGraph = await loadOne(graphManifest.graph, signal);
  if (!graphManifest.anatomy?.file) throw Error('The released MaleCNS soma map is missing from the manifest');
  const candidateAnatomy = parseAnatomy(await loadVerified(graphManifest.anatomy, signal, 'anatomy'), graphManifest.anatomy);
  candidateGraph.info = { ...candidateGraph.info, ...graphManifest.graph, sampleBodyIds: graphManifest.graph.sampleBodyIds || [] };
  graph = candidateGraph; anatomy = candidateAnatomy;
  send(0, 'provenance', { manifest: graphManifest });
  return graph;
}

async function loadShuffled(signal) {
  if (shuffled) return shuffled;
  if (!graphManifest?.shuffled?.file) return null;
  shuffled = await loadOne(graphManifest.shuffled, signal);
  shuffled.info = { ...shuffled.info, ...graphManifest.shuffled, sampleBodyIds: graphManifest.shuffled.sampleBodyIds || [] };
  return shuffled;
}

function template(result) {
  const name = actionName(result.advice.action);
  if (result.advice.action === 'abstain') return 'The fly declines to advise. The petition is outside what it has been taught, too quiet, or too evenly balanced.';
  return `${name} The fly can point to the supplied facts and the village charter label, but it cannot explain the path through the wiring.`;
}

async function handle(m) {
  const id = m.id;
  if (m.type === 'cancel') { begin(); if (!m.silent) send(id, 'status', { state: model ? 'petition-ready' : 'idle' }); return; }
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
      const trainedModel = await train(graph, cases, { seed: m.seed ?? 42 }, p => current(token) && send(id, 'progress', p), () => !current(token));
      if (!current(token)) return;
      model = trainedModel;
      send(id, 'trained', { modelSummary: { seed: model.seed, teaching: model.cases.filter(c => c.split === 'teach').length, heldout: model.cases.filter(c => c.split === 'holdout').length, reachability: model.reachability } });
      send(id, 'status', { state: 'petition-ready' }); return;
    }
    if (m.type === 'import-model') { model = validateModel(m.model, graph.info); send(id, 'trained', { modelSummary: { seed: model.seed, imported: true } }); send(id, 'status', { state: 'petition-ready' }); return; }
    if (m.type === 'reset-model') { model = null; last = null; send(id, 'model-reset'); send(id, 'status', { state: 'idle' }); return; }
    if (m.type === 'hear') {
      if (!model) throw Error('The fly is untrained. Teach the ledger first.');
      send(id, 'status', { state: 'computing' }); await yieldThread();
      const result = await hearCaseTrace(
        graph, anatomy, model, m.case,
        activity => current(token) && send(id, 'activity', { activity }),
        () => !current(token)
      );
      if (!current(token)) return;
      last = { ...result, recommendation: template(result), at: new Date().toISOString() };
      send(id, 'advice', { result: { case: result.case, advice: result.advice, recommendation: last.recommendation, energy: result.energy, sampledNodeIds: result.sampledNodeIds } });
      send(id, 'status', { state: 'advice-ready' }); return;
    }
    if (m.type === 'correct') {
      if (!last || !model) throw Error('No recent petition to correct');
      const replacement = await correctModel(graph, cases, model, last.case, m.label, p => current(token) && send(id, 'progress', p), () => !current(token));
      if (!current(token)) return;
      cases = replacement.cases; model = replacement.model;
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
      send(id, 'status', { state: 'computing' });
      await loadShuffled(signal); if (!current(token)) return;
      const rows = [], factsModel = factsOnlyTrain(model.cases);
      const shuffledModel = shuffled ? await train(shuffled, model.cases, { seed: model.seed }, p => current(token) && send(id, 'progress', { ...p, title: `Shuffled control: ${p.title}` }), () => !current(token)) : null;
      for (const c of cases.filter(x => x.split === 'holdout')) {
        if (!current(token)) return;
        const b = hearCase(graph, model, c);
        const random = shuffledModel ? hearCase(shuffled, shuffledModel, c).advice : null;
        rows.push({ id: c.id, title: c.title, petition: c.petition, expected: c.label, biological: b.advice.action, forcedChoice: b.advice.forcedChoice, factsOnly: factsOnlyRecommend(factsModel, c.facts).action, shuffled: random?.action ?? null, rules: rulesRecommendation(c.facts), abstained: b.advice.action === 'abstain', confidence: b.advice.confidence });
        await yieldThread();
      }
      const correct = rows.filter(r => r.biological === r.expected).length;
      const forcedCorrect = rows.filter(r => (r.biological === 'abstain' ? r.forcedChoice : r.biological) === r.expected).length;
      send(id, 'benchmark', { rows, summary: { heldout: rows.length, correct, abstentions: rows.filter(r => r.abstained).length, forcedChoiceAccuracy: rows.length ? forcedCorrect / rows.length : 0, factsOnlyCorrect: rows.filter(r => r.factsOnly === r.expected).length, shuffledCorrect: shuffled ? rows.filter(r => r.shuffled === r.expected).length : null, rulesCorrect: rows.filter(r => r.rules === r.expected).length, controls: shuffled ? 'The shuffled graph was independently trained with the same cases and seed.' : 'Shuffled MaleCNS asset not present; no shuffled score reported.' } });
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
