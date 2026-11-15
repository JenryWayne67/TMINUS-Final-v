// Real WebGL regression for the reported invisible wing-span barrier.
import {chromium} from 'playwright';
import assert from 'node:assert/strict';
import {mkdir,writeFile} from 'node:fs/promises';
import {createGameServer} from '../server/online-server.mjs';
const output=process.env.QA_OUTPUT||'work/qa';await mkdir(output,{recursive:true});
const service=createGameServer({host:'127.0.0.1',port:0}),port=(await service.listen()).port;
const browser=await chromium.launch({executablePath:process.env.CHROMIUM_PATH||'/usr/bin/chromium',headless:true,args:['--no-sandbox','--use-gl=angle','--use-angle=swiftshader','--enable-unsafe-swiftshader']});
const errors=[];
try{
 const page=await browser.newPage({viewport:{width:1280,height:800}});page.on('pageerror',e=>errors.push(e.message));
 await page.goto(`http://127.0.0.1:${port}/?dev`,{waitUntil:'domcontentloaded',timeout:60000});await page.locator('[data-screen="select"]').click();await page.locator('[data-action="start"]').click();await page.keyboard.press('Enter');await page.waitForFunction(()=>window.tminus?.crewExperience.state.mode==='play');
 await page.evaluate(()=>{const ce=window.tminus.crewExperience;ce.selectRole(0);ce.state.phase='outfit';ce.state.aiAssist=false;ce.state.carry.fill(null);ce.state.parts.forEach(p=>{p.stage='secured';p.bolts=[1,1,1];});ce.world.actors[0].group.position.set(12,.22,12);window.__apogex.aim(0,0);});
 await page.keyboard.down('w');
 const result=await page.evaluate(()=>{const ce=window.tminus.crewExperience,p=ce.world.actors[0].group.position,start=p.clone();for(let i=0;i<50;i++)ce.update(.05);return {start:start.toArray(),end:p.toArray(),distance:p.distanceTo(start)};});
 await page.keyboard.up('w');assert.ok(Math.abs(result.end[0]-12)<.15,'no push toward the old invisible wing rectangle');assert.ok(result.distance>5,'actual keyboard movement remains clear beneath the elevated wing');assert.equal(errors.length,0);
 await page.screenshot({path:output+'/08-wing-collision-regression.png',timeout:60000});await writeFile(output+'/browser-collision.json',JSON.stringify({method:'real keyboard input in actual WebGL; completed-ship phase fixture',...result,errors},null,2));console.log('PASS real browser wing-space collision',JSON.stringify(result));
}finally{await browser.close();await service.close();}
