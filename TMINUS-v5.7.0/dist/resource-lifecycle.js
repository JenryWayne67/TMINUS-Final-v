// Phase 4: release only per-match GPU objects. THREE's scene.remove() does not
// free buffer geometries or materials. Shared geometry, cached assets and their
// textures must outlive individual matches.
export function disposeDetachedTree(root, isRetained=()=>false){
 const roots=Array.isArray(root)?root:[root];
 const geos=new Set(),mats=new Set(),textures=new Set();
 for(const item of roots){if(!item||typeof item.traverse!=='function')continue;item.traverse(obj=>{
  if(obj.userData?.tminusAssetShared)return;
  if(obj.geometry && !isRetained(obj.geometry))geos.add(obj.geometry);
  const material=obj.material;
  if(material)for(const m of (Array.isArray(material)?material:[material]))if(m && !isRetained(m))mats.add(m);
 });}
 let geometries=0,materials=0;
 for(const g of geos){g.dispose?.();geometries++;}
 for(const m of mats){for(const key of ['map','normalMap','roughnessMap','metalnessMap','emissiveMap','alphaMap']){const texture=m[key];if(texture&&!isRetained(texture)&&!texture.userData?.tminusShared&&!texture.userData?.tminusAssetShared)textures.add(texture);}m.dispose?.();materials++;}
 for(const texture of textures)texture.dispose?.();
 return {geometries,materials};
}
