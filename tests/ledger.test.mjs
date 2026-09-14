import test from 'node:test';
import assert from 'node:assert/strict';
import {parseCasebook, createEntry, casebookFile} from '../web/ledger.mjs';
import {CASES} from '../web/cases.mjs';
const fingerprint='a'.repeat(64);
test('casebook round trip preserves an actual decision and checks provenance',()=>{
 const entry=createEntry(CASES[0],{action:1,milliseconds:20,trace:[{step:24,rms:.03,active:120}],lessons:48},fingerprint);
 const file=casebookFile([entry],fingerprint);
 assert.deepEqual(parseCasebook(file,fingerprint),[entry]);
 assert.throws(()=>parseCasebook(file,'b'.repeat(64)));
});
test('casebook rejects oversized and malformed decisions',()=>{
 assert.throws(()=>parseCasebook({entries:Array(1000).fill({})},fingerprint));
 const entry=createEntry(CASES[0],{action:1,milliseconds:20,trace:[],lessons:48},fingerprint);
 const file=casebookFile([entry],fingerprint);file.entries[0].action=9;
 assert.throws(()=>parseCasebook(file,fingerprint));
});
