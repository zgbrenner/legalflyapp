import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../..');
const out = path.join(root, 'apps/web/public/legalfly');
const processed = path.join(root, 'data/processed/malecns/v1.0/browser');
const sha = (b) => createHash('sha256').update(b).digest('hex');
mkdirSync(out, { recursive: true });

const unavailable = {
  schema: 'legalfly-malecns-graph/1',
  available: false,
  dataset: {
    name: 'MaleCNS',
    release: 'v1.0',
    source: 'https://male-cns.janelia.org/download/',
    license: 'CC BY 4.0',
    requiredCommand: 'python tools/prepare_malecns.py --download --convert --export-browser'
  },
  reason: 'MaleCNS browser graph has not been generated in this checkout. No hemibrain or synthetic fallback is used.'
};

const manifestPath = path.join(processed, 'manifest.json');
const graphPath = path.join(processed, 'malecns.bin');
const shuffledPath = path.join(processed, 'malecns-shuffled.bin');
if (!existsSync(manifestPath) || !existsSync(graphPath)) {
  writeFileSync(path.join(out, 'manifest.json'), JSON.stringify(unavailable, null, 2));
  console.log('Legal Fly graph unavailable: run tools/prepare_malecns.py for the official MaleCNS browser asset.');
  process.exit(0);
}

const source = JSON.parse(readFileSync(manifestPath, 'utf8'));
const graph = readFileSync(graphPath);
writeFileSync(path.join(out, 'malecns.bin'), graph);
const manifest = {
  ...source,
  schema: 'legalfly-malecns-graph/1',
  available: true,
  graph: { ...source.graph, file: 'malecns.bin', sha256: sha(graph) }
};
if (existsSync(shuffledPath)) {
  const shuffled = readFileSync(shuffledPath);
  writeFileSync(path.join(out, 'malecns-shuffled.bin'), shuffled);
  manifest.shuffled = { ...source.shuffled, file: 'malecns-shuffled.bin', sha256: sha(shuffled) };
}
writeFileSync(path.join(out, 'manifest.json'), JSON.stringify(manifest, null, 2));
console.log(`Legal Fly MaleCNS graph exported: ${manifest.graph.neurons} neurons, ${manifest.graph.connections} directed pairs.`);
