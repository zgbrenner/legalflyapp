import {validateFacts,ACTIONS} from './cases.mjs';
import {ENGINE} from './engine.mjs';
export function createEntry(petition,result,fingerprint) {
  return {id:crypto.randomUUID(),title:petition.name.slice(0,100),person:petition.person.slice(0,100),note:petition.note.slice(0,1400),facts:validateFacts(petition.facts),action:result.action,milliseconds:result.milliseconds,lessons:result.lessons,recordedAt:new Date().toISOString(),fingerprint,engine:ENGINE};
}
export function casebookFile(entries,fingerprint) {return {kind:'village-casebook',version:1,fingerprint,engine:ENGINE,entries};}
export function parseCasebook(file,fingerprint) {
  if(!file||file.kind!=='village-casebook'||file.version!==1||file.engine!==ENGINE||file.fingerprint!==fingerprint||!Array.isArray(file.entries)||file.entries.length>128)throw Error('This casebook is incompatible, malformed or has more than 128 entries.');
  const seen=new Set();
  return file.entries.map(e=>{
    if(!e||typeof e.id!=='string'||e.id.length>80||seen.has(e.id)||typeof e.title!=='string'||e.title.length>100||typeof e.person!=='string'||e.person.length>100||typeof e.note!=='string'||e.note.length>1400||!Number.isInteger(e.action)||!ACTIONS[e.action]||typeof e.milliseconds!=='number'||!Number.isFinite(e.milliseconds)||e.milliseconds<0||e.milliseconds>1e9||!Number.isInteger(e.lessons)||e.lessons<1||e.lessons>128||typeof e.recordedAt!=='string'||!Number.isFinite(Date.parse(e.recordedAt))||e.fingerprint!==fingerprint||e.engine!==ENGINE)throw Error('An entry in this casebook is malformed.');
    seen.add(e.id);return {id:e.id,title:e.title,person:e.person,note:e.note,facts:validateFacts(e.facts),action:e.action,milliseconds:e.milliseconds,lessons:e.lessons,recordedAt:e.recordedAt,fingerprint:e.fingerprint,engine:e.engine};
  });
}
