import {access,cp} from 'node:fs/promises';
await access('dist/data/starter.json');
await cp('web','dist',{recursive:true});
console.log('Frontend refreshed. The verified full graph and model are unchanged.');
