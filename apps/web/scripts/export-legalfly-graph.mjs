import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const sha = (b) => createHash('sha256').update(b).digest('hex');

export function exportLegalFlyGraph({
  repositoryRoot,
  requireFull = process.env.LEGALFLY_REQUIRE_FULL === '1' || process.env.NODE_ENV === 'production',
} = {}) {
  const root = repositoryRoot ?? path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../..');
  const out = path.join(root, 'apps/web/public/legalfly');
  const processed = path.join(root, 'data/processed/malecns/v1.0/browser');
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
  const anatomyPath = path.join(processed, 'malecns-anatomy.bin');
  const shuffledPath = path.join(processed, 'malecns-shuffled.bin');
  if (![manifestPath, graphPath, anatomyPath, shuffledPath].every(existsSync)) {
    if (requireFull) {
      throw new Error('MaleCNS browser graph is incomplete; production builds require graph, anatomy, and shuffled-control assets.');
    }
    writeFileSync(path.join(out, 'manifest.json'), JSON.stringify(unavailable, null, 2));
    console.log('Legal Fly graph unavailable: run tools/prepare_malecns.py for the official MaleCNS browser asset.');
    return unavailable;
  }

  const source = JSON.parse(readFileSync(manifestPath, 'utf8'));
  const graph = readFileSync(graphPath);
  const anatomy = readFileSync(anatomyPath);
  const shuffled = readFileSync(shuffledPath);
  writeFileSync(path.join(out, 'malecns.bin'), graph);
  writeFileSync(path.join(out, 'malecns-anatomy.bin'), anatomy);
  writeFileSync(path.join(out, 'malecns-shuffled.bin'), shuffled);
  const manifest = {
    ...source,
    schema: 'legalfly-malecns-graph/1',
    available: true,
    graph: { ...source.graph, file: 'malecns.bin', sha256: sha(graph) },
    anatomy: { ...source.anatomy, file: 'malecns-anatomy.bin', sha256: sha(anatomy) },
    shuffled: { ...source.shuffled, file: 'malecns-shuffled.bin', sha256: sha(shuffled) }
  };
  writeFileSync(path.join(out, 'manifest.json'), JSON.stringify(manifest, null, 2));
  console.log(`Legal Fly MaleCNS graph exported: ${manifest.graph.neurons} neurons, ${manifest.graph.connections} directed pairs, ${manifest.anatomy.coordinateCount} mapped somas.`);
  return manifest;
}

if (process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href) {
  exportLegalFlyGraph();
}
