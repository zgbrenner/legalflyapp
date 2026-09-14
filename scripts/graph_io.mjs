import {readFile} from 'node:fs/promises';
import {join} from 'node:path';
import {gunzipSync} from 'node:zlib';
import {createHash} from 'node:crypto';
import {loadGraph} from '../web/engine.mjs';
export const hash=bytes=>createHash('sha256').update(bytes).digest('hex');
export async function readGraph(root='dist') {
  const manifest=JSON.parse(await readFile(join(root,'data/manifest.json'),'utf8'));
  const graph=await loadGraph(manifest,async p=>{const packed=await readFile(join(root,'data',p.file));if(hash(packed)!==p.sha256)throw Error('Graph checksum mismatch.');const raw=gunzipSync(packed);return raw.buffer.slice(raw.byteOffset,raw.byteOffset+raw.byteLength);});
  return {graph,manifest};
}
