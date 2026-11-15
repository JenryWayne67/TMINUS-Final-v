import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {movePlanar,blocked,recoverPlanar,cameraBoomFraction,smoothFacing} from '../dist/motion-physics.js';
import {hullBoxes,HULL,DOOR,partBoxes} from '../dist/hull-collision.js';
import {cameraNavFraction,canStand} from '../dist/ship-walk-core.js';
const eq=(x,y,eps=1e-6)=>assert.ok(Math.abs(x-y)<eps,`${x} != ${y}`);
test('player cannot tunnel across the complete spacecraft at a high input delta',()=>{
 const walls=hullBoxes();
 const p=movePlanar(0,HULL.z1+4,0,-40,walls,[]);
 assert.ok(p.z>=HULL.z1+.45-1e-7,`penetrated front hull ${p.z}`);
 assert.equal(p.hit,true);
});
test('the visible side-door approach stays accessible',()=>{const p=movePlanar(DOOR.x+3,DOOR.z,-2.5,0,hullBoxes());assert.equal(p.hit,false);assert.ok(p.x<DOOR.x+1);});
test('part collisions only activate when secured',()=>{
 const parts=[{id:'keel',stage:'secured',position:[0,1,0],angle:0,size:[2,2,2]}];
 const wall=partBoxes(parts);
 assert.ok(blocked(0,0,wall));
 const a=movePlanar(0,HULL.z1+3,0,-8,wall);
 assert.ok(a.z>=HULL.z1+.45);
});
test('high-speed movement cannot pass a thin station or rock',()=>{
 const thin=[{x0:1,x1:1.1,z0:-1,z1:1}];
 assert.ok(movePlanar(0,0,8,0,thin).x<1);
 const rocks=[{x:2,z:0,r:.4}];
 assert.ok(movePlanar(0,0,5,0,[],rocks).x<1.2);
});
test('walls allow axis sliding rather than sticky stops',()=>{
 const boxes=[{x0:1,x1:3,z0:-2,z1:2}];
 const p=movePlanar(0,0,4,2,boxes);
 assert.ok(p.x<1&&p.z>0.5,JSON.stringify(p));
});
test('AI and human use identical geometry regardless of caller',()=>{
 const world=[{x:-2,z:1,r:1.2},{x:5,z:3,r:.4}];
 const first=movePlanar(-4,0,10,0,[],world),second=movePlanar(-4,0,10,0,[],world);
 assert.deepEqual(first,second);
});
test('new solids recover without placing crew inside another collider',()=>{
 const walls=[{x0:-1,x1:1,z0:-1,z1:1}],rocks=[{x:3,z:0,r:1}];
 const q=recoverPlanar(0,0,walls,rocks);
 assert.equal(blocked(q.x,q.z,walls,rocks),false);
});
test('camera boom shortens before ship and rock without clipping',()=>{
 const wall=[{x0:2,x1:3,z0:-2,z1:2}];
 const a=cameraBoomFraction({x:0,z:0},{x:6,z:0},wall);
 assert.ok(a>.15&&a<.33,`${a}`);
 eq(cameraBoomFraction({x:0,z:0},{x:6,z:0},[]),1);
 const c=cameraBoomFraction({x:0,z:0},{x:6,z:0},[],[{x:3,z:0,r:1}]);
 assert.ok(c<.35);
});
test('smooth facing takes the shortest seam-crossing turn',()=>{
 const a=smoothFacing(Math.PI-.02,-Math.PI+.02,.016);
 assert.ok(a>Math.PI-.02&&a<Math.PI+.02,a);
});
test('no movement on pause or invalid input',()=>{
 assert.deepEqual(movePlanar(2,3,0,0),{x:2,z:3,moved:0,hit:false});
 assert.deepEqual(movePlanar(2,3,NaN,1),{x:2,z:3,moved:0,hit:true});
});
test('campaign third-person camera respects ship navigation cells and open corridors',()=>{
 const nav=JSON.parse(readFileSync(new URL('../dist/assets/ship/ship_nav.json',import.meta.url),'utf8'));
 const m=Object.values(nav.modules).find(x=>x.rows_z_cols_x.length>2);
 let point=null;
 for(let z=0;z<m.rows_z_cols_x.length&&!point;z++)for(let x=0;x<m.rows_z_cols_x[z].length;x++){
  const xx=m.origin[0]+(x+.5)*nav.cell,zz=m.origin[1]+(z+.5)*nav.cell;
  if(canStand(nav,xx,zz)){point={x:xx,z:zz};break;}
 }
 assert.ok(point,'a walkable camera anchor exists');
 const t=cameraNavFraction(nav,point.x,point.z,point.x+50,point.z);
 assert.ok(t>0&&t<1,`${t}`);
 eq(cameraNavFraction(nav,point.x,point.z,point.x,point.z),1);
});
