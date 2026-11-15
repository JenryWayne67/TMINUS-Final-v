// Loads glb models from the T-MINUS_Latest asset pack. Everything is local; no network, no decoders needed
// (the shipped models use no Draco/meshopt compression and no external textures).
import {GLTFLoader} from './vendor/GLTFLoader.js';
import {DRACOLoader} from './vendor/DRACOLoader.js';

const cache = new Map();
const draco = new DRACOLoader().setDecoderPath('./vendor/draco/');
const loader = () => new GLTFLoader().setDRACOLoader(draco);

export function parseGLB(buffer, path = './') {
  return new Promise((resolve, reject) => loader().parse(buffer, path, resolve, reject));
}

export function loadGLB(url) {
  if (!cache.has(url)) {
    cache.set(url, new Promise((resolve, reject) => loader().load(url, gltf=>{gltf.scene.traverse(o=>{if(o.isMesh||o.isSkinnedMesh)o.userData.tminusAssetShared=true;});resolve(gltf);}, undefined, reject)));
    cache.get(url).catch(() => cache.delete(url));   // allow retry after a failed load
  }
  return cache.get(url);
}

// Map of node name -> Object3D for a loaded gltf scene.
export function namedNodes(gltf) {
  const map = new Map();
  gltf.scene.traverse(o => { if (o.name) map.set(o.name, o); });
  return map;
}

export const SHIP_INTERIOR_URL = './assets/ship/ship_interior.glb';
export const loadShipInterior = () => loadGLB(SHIP_INTERIOR_URL);
