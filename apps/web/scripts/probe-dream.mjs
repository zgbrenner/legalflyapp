/** Reproducible diagnostic, not a legal accuracy benchmark. All input is fictional. */
import { readFileSync, writeFileSync } from 'node:fs';
import { parseGraph, train, DreamSession, DEFAULTS } from '../public/dream/core.mjs';
const base = new URL('../public/dream/', import.meta.url);
const manifest = JSON.parse(readFileSync(new URL('manifest.json', base)));
const cards = JSON.parse(readFileSync(new URL('cards.json', base)));
const rows = [];
for (const kind of ['biological', 'random_degree_preserving']) {
  const data = readFileSync(new URL(`${kind}.bin`, base));
  const graph = parseGraph(data.buffer.slice(data.byteOffset, data.byteOffset + data.byteLength), manifest.graphs[kind]);
  for (const seed of [42, 43, 44]) {
    const model = await train(graph, cards, { seed });
    for (const cue of [0, 1, 2, 4]) {
      for (const mode of kind === 'biological' ? ['replay', 'silence'] : ['replay']) {
        const session = new DreamSession(graph, model);
        session.prime(cue);
        let changes = 0, matched = 0, prior = session.frame().match;
        const path = [], sampled = [];
        for (let step = 0; step < 256; step++) {
          session.tick(mode, 0);
          const f = session.frame();
          if (f.match !== null) matched++;
          if (f.match !== prior) {
            changes++;
            path.push({ step: f.step, association: f.match === null ? f.status : cards[f.match].id });
          }
          if (step % 32 === 31) sampled.push(f);
          prior = f.match;
        }
        const final = session.frame();
        rows.push({ kind, seed, cue: cards[cue].id, mode, noise: 0, steps: 256, graphHash: graph.info.graphHash, training: model.metrics, matchedSteps: matched, labelChanges: changes, finalRMS: final.rms, finalDelta: final.delta, path, sampled });
      }
    }
  }
}
const result = { schema: 'legalfly-dream-diagnostic/1', settings: DEFAULTS, corpus: '16 fictional starter cards', seeds: [42, 43, 44], cues: [0, 1, 2, 4], caveat: 'Exploratory dynamics only. No held-out legal accuracy, biological superiority or spontaneous invention claim.', rows };
if (process.argv[2]) writeFileSync(process.argv[2], JSON.stringify(result, null, 2));
console.log(JSON.stringify(rows.map(({ kind, seed, cue, mode, matchedSteps, labelChanges, finalRMS, finalDelta }) => ({ kind, seed, cue, mode, matchedSteps, labelChanges, finalRMS, finalDelta })), null, 2));
