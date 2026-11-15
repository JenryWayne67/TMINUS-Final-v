import test from 'node:test';
import assert from 'node:assert/strict';
import {readdir,readFile,stat} from 'node:fs/promises';
import {resolve,dirname,join} from 'node:path';
const dist=new URL('../dist/',import.meta.url);
const root=new URL('../',import.meta.url);
test('all relative javascript imports in dist point to shipped files',async()=>{
 let imports=0;
 async function visit(directory){
  for(const name of await readdir(directory)){
   const abs=join(directory,name),st=await stat(abs);
   if(st.isDirectory()){if(name!=='vendor')await visit(abs);continue;}
   if(!name.endsWith('.js'))continue;
   const text=await readFile(abs,'utf8');
   const matches=[...text.matchAll(/(?:\bimport\s*(?:[\s\S]*?\sfrom\s*)?|\bexport\s+[^;\n]*?\sfrom\s*)['"](\.[^'"]+)['"]/g)];
   for(const m of matches){imports++;const path=resolve(dirname(abs),m[1]);
    await assert.doesNotReject(()=>stat(path),`missing imported module ${abs} -> ${m[1]}`);
   }
  }
 }
 await visit(new URL('.',dist).pathname);
 assert.ok(imports>=55,`unusually few imports inspected: ${imports}`);
});
test('phase 5 keeps precise release identity and one production module entry',async()=>{
 const {version}=JSON.parse(await readFile(new URL('./package.json',root),'utf8'));
 const release=JSON.parse(await readFile(new URL('./dist/release.json',root),'utf8'));
 const html=await readFile(new URL('./dist/index.html',root),'utf8');
 assert.equal(version,'5.7.0');assert.equal(release.version,version);
 assert.equal(release.entry,'t-minus-v5.7.0.js');assert.match(html,/t-minus-v5\.7\.0\.js/);
 assert.doesNotMatch(html,/<script[^>]*t-minus-v5\.3\.0\.js/);
});
test('release names real multiplayer capabilities honestly',async()=>{
 const menu=await readFile(new URL('./dist/crew-experience.js',root),'utf8');
 const notes=await readFile(new URL('./PHASE4_RELEASE_NOTES.md',root),'utf8');
 assert.match(menu,/OFFLINE \/ 1 PLAYER \+ 15 BOTS/);
 assert.match(notes,/no WebSocket backend/i);
 assert.match(menu,/Automatic \/ recommended/);
});
