import test from 'node:test';
import assert from 'node:assert/strict';
// The DOM integration requires an optional development dependency. Keep the
// real assertion active when it is installed, and explicitly report a skip
// rather than treating an unavailable offline npm package as a code failure.
let parseHTML;
try{({parseHTML}=await import('linkedom'));}catch(e){if(e?.code!=='ERR_MODULE_NOT_FOUND')throw e;}
import {initCampaign} from '../dist/campaign-ui.js';
import {PROGRESS_KEY,SAVE_KEY} from '../dist/campaign-core.js';

test('campaign menu, design, boarding, room tasks, pause, checkpoints, debrief and competitive restoration',{skip:!parseHTML?'linkedom unavailable in this offline environment':false},async()=>{
 const {window}=parseHTML('<html><body><button data-campaign="open">Campaign</button></body></html>');
 globalThis.document=window.document;globalThis.window=window;globalThis.addEventListener=()=>{};
 const storage=new Map();globalThis.localStorage={getItem:k=>storage.get(k)||null,setItem:(k,v)=>storage.set(k,v)};
 let frames=[];globalThis.requestAnimationFrame=fn=>frames.push(fn);let now=performance.now();
 const step=seconds=>{for(let i=0;i<Math.ceil(seconds/.1);i++){now+=100;const q=frames;frames=[];q.forEach(fn=>fn(now));}};
 const planning=[],api={mission:{paused:true},crewExperience:{planningChanged:value=>planning.push(value)}};
 let ctx={room:'cockpit',near:true,atTelescope:true,atAirlock:true};let disposed=0;
 const campaign=initCampaign(api,{createWorld:async(canvas,cb)=>({tick(){cb.onContext(ctx);},context:()=>ctx,setEVA(){},setPaused(){},dispose(){disposed++;}})});
 const click=selector=>{const b=document.querySelector(selector);assert.ok(b,selector);assert.ok(!b.disabled,selector+' enabled');b.dispatchEvent(new window.Event('click',{bubbles:true}));};
 const settle=async()=>{for(let i=0;i<5;i++)await Promise.resolve();step(.5);};
 click('[data-campaign]');assert.equal(campaign.view,'select');assert.equal(planning.at(-1),true);assert.ok(document.querySelector('[data-mission="telescope"]').disabled);
 click('[data-mission="orbital"]');assert.equal(campaign.view,'briefing');click('[data-cp="design"]');assert.equal(campaign.view,'design');
 click('[data-equipment="instrument"][data-value="spectrometer"]');assert.ok(document.querySelector('[data-cp="board"]').disabled,'inadequate recharge margin blocks boarding');
 click('[data-equipment="array"][data-value="expanded"]');assert.ok(!document.querySelector('[data-cp="board"]').disabled);
 click('[data-equipment="instrument"][data-value="camera"]');click('[data-cp="board"]');await settle();assert.equal(campaign.view,'play');assert.ok(storage.has(SAVE_KEY));
 const task=(room,id,seconds)=>{ctx={...ctx,room};step(.5);click(`[data-task="${id}"]`);step(seconds+.5);};
 task('power_room','check-power',8);assert.ok(campaign.state.done.includes('check-power'));
 ctx={...ctx,room:'life_support'};step(.5);click('[data-task="check-cabin"]');ctx={...ctx,room:'lab'};step(1);assert.equal(campaign.state.activity,null,'walking away cancels station work');
 task('life_support','check-cabin',8);task('lab','check-payload',8);
 click('[data-cp="pause"]');const elapsed=campaign.state.elapsed;step(5);assert.equal(campaign.state.elapsed,elapsed,'pause freezes clock');click('[data-cp="resume"]');
 task('cockpit','launch',5);assert.equal(campaign.state.phase,'launch');step(46);assert.equal(campaign.state.phase,'commission');
 task('power_room','deploy',12);task('cockpit','autopilot',5);task('cockpit','commission',5);assert.equal(campaign.state.phase,'science');
 // Continue with the same saved running state; DOM report/unlock paths are independent of renderer timing.
 campaign.state.transmitted=95;campaign.state.returned=true;campaign.state.phase='complete';step(1);
 assert.equal(campaign.view,'debrief');assert.ok(JSON.parse(storage.get(PROGRESS_KEY)).orbital.completed);assert.match(document.querySelector('.cp-debrief').textContent,/WELCOME HOME/);
 click('[data-cp="missions"]');assert.ok(!document.querySelector('[data-mission="telescope"]').disabled);click('[data-mission="telescope"]');click('[data-cp="design"]');click('[data-cp="board"]');await settle();assert.equal(campaign.state.missionId,'telescope');
 click('[data-cp="pause"]');click('[data-cp="save-select"]');assert.equal(campaign.view,'select');click('[data-cp="continue"]');await settle();assert.equal(campaign.state.missionId,'telescope');
 click('[data-cp="pause"]');click('[data-cp="checkpoint"]');await settle();assert.equal(campaign.view,'play');
 click('[data-cp="pause"]');click('[data-cp="abort"]');assert.equal(campaign.view,'debrief');assert.match(document.querySelector('.cp-debrief').textContent,/ABORTED/);
 campaign.exit();assert.equal(document.querySelector('#campaign').hidden,true);assert.equal(planning.at(-1),false);assert.ok(disposed>=3);
});
