import {readFile,rm,cp,stat} from 'node:fs/promises';
import {fileURLToPath} from 'node:url';
import path from 'node:path';
import {createHash} from 'node:crypto';
const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
try{
 const data=path.join(root,'site/data'),m=JSON.parse(await readFile(path.join(data,'manifest.json'),'utf8'));
 if(m.neurons!==166700||m.connections!==25582938)throw Error('Complete MaleCNS data required.');
 const whole=createHash('sha256');let total=0;
 for(const p of m.parts){if(!/^part-\d{3}\.bin$/.test(p.file))throw Error('Unsafe part path.');const b=await readFile(path.join(data,p.file));if(b.length!==p.bytes||createHash('sha256').update(b).digest('hex')!==p.sha256)throw Error('Data part checksum mismatch.');whole.update(b);total+=b.length;}
 if(total!==m.bytes||whole.digest('hex')!==m.sha256)throw Error('Whole graph checksum mismatch.');
 await stat(path.join(root,'site/assets/village-lawyer.jpg'));
 await rm(path.join(root,'dist'),{recursive:true,force:true});await cp(path.join(root,'site'),path.join(root,'dist'),{recursive:true});
 console.log(`Production site built: ${m.neurons.toLocaleString()} neurons, ${m.connections.toLocaleString()} connections. Upload dist/ to a static host.`);
}catch(e){console.error(`Build stopped: ${e.message}\nRun npm run setup first. A data-free shell is not a production build.`);process.exitCode=1;}
