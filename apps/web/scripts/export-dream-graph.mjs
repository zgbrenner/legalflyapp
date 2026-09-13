/** Lossless browser export of the repository's real directed CSR graph. No downloads. */
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { inflateRawSync } from 'node:zlib';
import { createHash } from 'node:crypto';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'../../..');
const out=path.join(root,'apps/web/public/dream');
const sha=b=>createHash('sha256').update(b).digest('hex');
function entries(zip){
 let end=zip.length-22;while(end>=Math.max(0,zip.length-65557)&&zip.readUInt32LE(end)!==0x06054b50)end--;
 if(end<0)throw Error('Missing ZIP directory');
 const result={};let cursor=zip.readUInt32LE(end+16);
 for(let k=0;k<zip.readUInt16LE(end+10);k++){
  if(zip.readUInt32LE(cursor)!==0x02014b50)throw Error('Invalid ZIP entry');
  const method=zip.readUInt16LE(cursor+10),compressed=zip.readUInt32LE(cursor+20),size=zip.readUInt32LE(cursor+24);
  const nl=zip.readUInt16LE(cursor+28),xl=zip.readUInt16LE(cursor+30),cl=zip.readUInt16LE(cursor+32),offset=zip.readUInt32LE(cursor+42);
  const name=zip.toString('utf8',cursor+46,cursor+46+nl),start=offset+30+zip.readUInt16LE(offset+26)+zip.readUInt16LE(offset+28);
  if(size>32_000_000)throw Error('Oversized graph array');
  const compressedBytes=zip.subarray(start,start+compressed);
  if(method!==0&&method!==8)throw Error('Unsupported ZIP compression');
  const data=method===8?inflateRawSync(compressedBytes,{maxOutputLength:32_000_000}):compressedBytes;
  if(data.length!==size)throw Error('Truncated graph array');result[name]=data;cursor+=46+nl+xl+cl;
 }return result;
}
function npy(b,kind){
 if(b[0]!==0x93||b.toString('ascii',1,6)!=='NUMPY')throw Error('Invalid NPY array');
 const v=b[6],offset=v===1?10:12,len=v===1?b.readUInt16LE(8):b.readUInt32LE(8),header=b.toString('ascii',offset,offset+len);
 if(!header.includes(`'${kind}'`)||!header.includes('False'))throw Error(`Unsupported NPY ${header}`);
 return b.subarray(offset+len);
}
mkdirSync(out,{recursive:true});
const provenance=JSON.parse(readFileSync(path.join(root,'deploy/research-inputs/hemibrain-provenance.json')));
const graphs={};
const base=path.join(root,'deploy/data/processed/hemibrain/biological'),raw=readFileSync(path.join(base,'adjacency.npz')),files=entries(raw);
const meta=JSON.parse(readFileSync(path.join(base,'meta.json'))),ids=meta.node_ids.map(String),n=ids.length;
const ptr=npy(files['indptr.npy'],'<i4'),originalIdx=npy(files['indices.npy'],'<i4'),weights=npy(files['data.npy'],'<f4'),nnz=weights.length/4;
if(n!==3072||nnz!==293766||ptr.length!==(n+1)*4||originalIdx.length!==nnz*4)throw Error('Unexpected biological graph dimensions');
const i64=b=>{const r=Buffer.alloc(b.length*2);for(let i=0;i<b.length/4;i++)r.writeBigInt64LE(BigInt(b.readInt32LE(i*4)),i*8);return r;};
const shape=Buffer.alloc(16);shape.writeBigInt64LE(BigInt(n));shape.writeBigInt64LE(BigInt(n),8);
let randomState=211;
const random=()=>{randomState=(Math.imul(randomState,1664525)+1013904223)>>>0;return randomState/4294967296;};
for(const kind of ['biological','random_degree_preserving']){
 const idx=Buffer.from(originalIdx),data=Buffer.from(weights);let swaps=0;
 if(kind!=='biological'){
  const sources=new Uint32Array(nnz),used=new Set();
  for(let src=0;src<n;src++)for(let j=ptr.readInt32LE(src*4);j<ptr.readInt32LE((src+1)*4);j++){sources[j]=src;used.add(src*n+idx.readInt32LE(j*4));}
  for(let attempt=0;attempt<nnz*12&&swaps<nnz*2;attempt++){
   const a=Math.floor(random()*nnz),b=Math.floor(random()*nnz),s=sources[a],t=sources[b],u=idx.readInt32LE(a*4),v=idx.readInt32LE(b*4);
   if(s===t||u===v||s===v||t===u||used.has(s*n+v)||used.has(t*n+u))continue;
   used.delete(s*n+u);used.delete(t*n+v);used.add(s*n+v);used.add(t*n+u);idx.writeInt32LE(v,a*4);idx.writeInt32LE(u,b*4);swaps++;
  }
  if(swaps<nnz)throw Error('Insufficient accepted degree-preserving swaps');
  for(let src=0;src<n;src++){
   const start=ptr.readInt32LE(src*4),end=ptr.readInt32LE((src+1)*4),row=[];
   for(let j=start;j<end;j++)row.push([idx.readInt32LE(j*4),data.readFloatLE(j*4)]);
   row.sort((a,b)=>a[0]-b[0]);row.forEach(([dst,w],j)=>{idx.writeInt32LE(dst,(start+j)*4);data.writeFloatLE(w,(start+j)*4);});
  }
 }
 const header=Buffer.alloc(16);header.write('LFDREAM1');header.writeUInt32LE(n,8);header.writeUInt32LE(nnz,12);
 const bin=Buffer.concat([header,ptr,idx,data]);
 const fingerprint=sha(Buffer.concat([Buffer.from(JSON.stringify(ids)),shape,i64(ptr),i64(idx),data]));
 if(kind==='biological'&&fingerprint!==provenance.packaged_graph_hash)throw Error('Biological graph fails verified source fingerprint');
 // Identical deterministic normalization for both topologies; raw weights remain lossless.
 let state=new Float64Array(n).fill(1/Math.sqrt(n)),radius=0;
 for(let iteration=0;iteration<100;iteration++){
  const next=new Float64Array(n);
  for(let src=0;src<n;src++)for(let j=ptr.readInt32LE(src*4);j<ptr.readInt32LE((src+1)*4);j++)next[idx.readInt32LE(j*4)]+=data.readFloatLE(j*4)*state[src];
  radius=Math.sqrt(next.reduce((a,b)=>a+b*b,0));state=next.map(x=>x/(radius||1));
 }
 writeFileSync(path.join(out,`${kind}.bin`),bin);
 graphs[kind]={file:`${kind}.bin`,sha256:sha(bin),graphHash:fingerprint,npzSha256:sha(raw),n,nnz,nodeIds:ids,regions:meta.node_regions,control:kind,source:meta.metadata.source,license:meta.metadata.license,recurrenceScale:.9/radius,acceptedSwaps:swaps,parentGraphHash:provenance.packaged_graph_hash};
}
writeFileSync(path.join(out,'manifest.json'),JSON.stringify({schema:'legalfly-graph/1',source:provenance,graphs}));
console.log(`Dream graphs exported: ${n} neurons, ${nnz} connections, biological hash ${graphs.biological.graphHash}`);
