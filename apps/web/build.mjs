import {spawnSync} from 'node:child_process';
import {cp,rm} from 'node:fs/promises';
import {fileURLToPath} from 'node:url';
import path from 'node:path';
const here=path.dirname(fileURLToPath(import.meta.url)),root=path.resolve(here,'../..');
function run(file){const result=spawnSync(process.execPath,[path.join(root,file)],{cwd:root,stdio:'inherit'});if(result.error)throw result.error;if(result.status!==0)throw Error(`${file} failed.`);}
if(process.env.VILLAGE_DATA_READY!=='1')run('tools/setup.mjs');
run('tools/build.mjs');
await rm(path.join(here,'dist'),{recursive:true,force:true});
await cp(path.join(root,'dist'),path.join(here,'dist'),{recursive:true});
