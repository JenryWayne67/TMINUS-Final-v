import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from '../dist/vendor/three.module.js';
import {sampleTerrainTriangleHeight} from '../dist/terrain-height.js';

test('ground-height interpolation matches real indexed triangle geometry',()=>{
 const size=36,segments=12;
 const geo=new THREE.PlaneGeometry(size,size,segments,segments);
 geo.rotateX(-Math.PI/2);
 const pos=geo.getAttribute('position');
 for(let i=0;i<pos.count;i++){
  const x=pos.getX(i),z=pos.getZ(i);
  pos.setY(i,Math.sin(x*.31)*.9+Math.cos(z*.28)*.7+Math.sin(z*.51+x*.22)*.23);
 }
 geo.computeVertexNormals();
 const mesh=new THREE.Mesh(geo,new THREE.MeshBasicMaterial({side:THREE.DoubleSide}));
 mesh.updateMatrixWorld(true);
 const raycaster=new THREE.Raycaster();
 for(let i=0;i<240;i++){
  const x=-17.8+35.6*((i*37%241)/241),z=-17.8+35.6*((i*53%239)/239);
  raycaster.set(new THREE.Vector3(x,100,z),new THREE.Vector3(0,-1,0));
  const hit=raycaster.intersectObject(mesh)[0];
  assert.ok(hit,`no raycast at ${x}, ${z}`);
  const estimated=sampleTerrainTriangleHeight(pos,x,z,size,segments);
  assert.ok(Math.abs(hit.point.y-estimated)<1e-4,`ground mismatch ${x},${z}: ${hit.point.y} vs ${estimated}`);
 }
 geo.dispose();
});
