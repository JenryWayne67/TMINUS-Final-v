import * as THREE from './vendor/three.module.js';
// Align geometry in its parent's coordinates; never compensate a wrong mesh with a shadow.
export function groundObject(object,surfaceY=0){object.updateWorldMatrix(true,true);const box=new THREE.Box3().setFromObject(object,true);if(object.parent)box.applyMatrix4(object.parent.matrixWorld.clone().invert());if(Number.isFinite(box.min.y))object.position.y+=surfaceY-box.min.y;object.updateWorldMatrix(false,true);return object;}
