import {spawnSync} from 'node:child_process';
import {existsSync} from 'node:fs';
import {fileURLToPath} from 'node:url';
import path from 'node:path';
const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
function run(command,args){const r=spawnSync(command,args,{cwd:root,stdio:'inherit'});if(r.error)throw r.error;if(r.status!==0)throw Error(`${command} exited with ${r.status}.`);}
try{
 const win=process.platform==='win32',python=path.join(root,'.venv',win?'Scripts/python.exe':'bin/python');
 if(!existsSync(python))run(win?'py':'python3',win?['-3','-m','venv','.venv']:['-m','venv','.venv']);
 run(python,['-m','pip','install','-r','requirements-data.txt']);
 run(python,['tools/prepare.py']);
 console.log('\nFull CNS verified. Run npm start, then open http://127.0.0.1:3000.');
}catch(e){console.error(`Setup stopped: ${e.message}\nPython 3.10+ and internet access are required for the initial data download.`);process.exitCode=1;}
