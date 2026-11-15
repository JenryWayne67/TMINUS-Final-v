// Height of the exact triangles in a Three.js PlaneGeometry after rotateX(-Math.PI / 2).
// O(1), no raycaster allocations or per-frame geometry processing.
export function sampleTerrainTriangleHeight(positions,x,z,size=200,segments=90){
 const step=size/segments;
 const gx=Math.min(segments-1e-6,Math.max(0,(x+size/2)/step));
 const gz=Math.min(segments-1e-6,Math.max(0,(z+size/2)/step));
 const ix=Math.floor(gx),iz=Math.floor(gz),u=gx-ix,v=gz-iz;
 const idx=iz*(segments+1)+ix;
 const y00=positions.getY(idx),y10=positions.getY(idx+1),y01=positions.getY(idx+segments+1),y11=positions.getY(idx+segments+2);
 // Triangles use the upper-right to lower-left diagonal; u+v chooses the exact face.
 return u+v<=1
  ? y00*(1-u-v)+y10*u+y01*v
  : y01*(1-u)+y11*(u+v-1)+y10*(1-v);
}
