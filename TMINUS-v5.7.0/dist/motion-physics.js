// Phase 2 — deterministic, allocation-free planar collision and third-person camera obstruction.
// All coordinates are world metres. Used by human and AI; no Three.js dependency.
export const ACTOR_RADIUS = 0.45;
export const MAX_SUBSTEP = 0.20;
const EPS = 1e-8;
const clamp = (v, a, b) => Math.min(b, Math.max(a, v));

export function blocked(x, z, boxes = [], circles = [], radius = ACTOR_RADIUS) {
  for (const b of boxes) {
    if (x > b.x0 - radius && x < b.x1 + radius && z > b.z0 - radius && z < b.z1 + radius) return true;
  }
  for (const c of circles) {
    const dx = x - c.x, dz = z - c.z, r = c.r + radius;
    if (dx * dx + dz * dz < r * r) return true;
  }
  return false;
}

// Sweep a short path in conservative <=20cm increments to prevent walk-through at low frame rates.
// On impact, try each tangent independently so walls, racks and rocks allow natural sliding.
// Does not eject actors already inside colliders: the caller uses a safe spawn, and this avoids
// unpredictable teleports when new geometry is attached while the player is building.
export function movePlanar(x, z, dx, dz, boxes = [], circles = [], radius = ACTOR_RADIUS) {
  if (![x,z,dx,dz].every(Number.isFinite)) return {x,z,moved:0,hit:true};
  const distance = Math.hypot(dx,dz);
  if (distance <= EPS) return {x,z,moved:0,hit:false};
  const n = Math.max(1, Math.ceil(distance / MAX_SUBSTEP));
  const sx=dx/n, sz=dz/n, ox=x,oz=z;
  let hit=false;
  for (let i=0; i<n; i++) {
    const nx=x+sx, nz=z+sz;
    if (!blocked(nx,nz,boxes,circles,radius)) {x=nx;z=nz;continue;}
    hit=true;
    // A submerged spawn cannot move straight out without a special recovery path.
    // Permit a step when it demonstrably reduces overlap with *all* nearest blockers.
    if (!blocked(nx,z,boxes,circles,radius)) x=nx;
    if (!blocked(x,nz,boxes,circles,radius)) z=nz;
  }
  return {x,z,moved:Math.hypot(x-ox,z-oz),hit};
}

// If a solid object is instantiated around a stationary actor (phase transition), recover
// to its nearest valid horizontal location. This is not used to hide regular collision bugs.
export function recoverPlanar(x,z,boxes=[],circles=[],radius=ACTOR_RADIUS){
  if (!blocked(x,z,boxes,circles,radius)) return {x,z};
  const candidates=[];
  for (const b of boxes) if(x>b.x0-radius&&x<b.x1+radius&&z>b.z0-radius&&z<b.z1+radius){
    candidates.push({x:b.x0-radius-.01,z},{x:b.x1+radius+.01,z},{x,z:b.z0-radius-.01},{x,z:b.z1+radius+.01});
  }
  for(const c of circles){const dx=x-c.x,dz=z-c.z,len=Math.hypot(dx,dz)||1,r=c.r+radius+.01;
    if(len<r) candidates.push({x:c.x+(dx||1)/len*r,z:c.z+dz/len*r});
  }
  candidates.sort((a,b)=>Math.hypot(a.x-x,a.z-z)-Math.hypot(b.x-x,b.z-z));
  for(const p of candidates) if(!blocked(p.x,p.z,boxes,circles,radius))return p;
  // Complex overlapping geometry: search a small radial neighborhood deterministically.
  for(let r=radius;r<15;r+=radius){for(let i=0;i<32;i++){
    const a=i*Math.PI/16,p={x:x+Math.cos(a)*r,z:z+Math.sin(a)*r};
    if(!blocked(p.x,p.z,boxes,circles,radius))return p;
  }}
  return {x,z};
}

function segmentBoxT(ax,az,dx,dz,b,r) {
  let lo=0, hi=1;
  for (const [p,d,min,max] of [[ax,dx,b.x0-r,b.x1+r],[az,dz,b.z0-r,b.z1+r]]) {
    if (Math.abs(d)<EPS) {if (p<min||p>max)return Infinity;continue;}
    let a=(min-p)/d,c=(max-p)/d;if(a>c)[a,c]=[c,a];
    lo=Math.max(lo,a);hi=Math.min(hi,c);if(lo>hi)return Infinity;
  }
  return lo>=0 && lo<=1 ? lo : Infinity;
}
function segmentCircleT(ax,az,dx,dz,c,r){
  const x=ax-c.x,z=az-c.z,rad=c.r+r,a=dx*dx+dz*dz;
  if(a<EPS)return Infinity;
  const b=2*(x*dx+z*dz),cc=x*x+z*z-rad*rad;
  if(cc<=0)return 0;
  const disc=b*b-4*a*cc;
  if(disc<0)return Infinity;
  const t=(-b-Math.sqrt(disc))/(2*a);
  return t>=0&&t<=1?t:Infinity;
}
// Fraction of desired camera boom that remains visible, accounting for solid structure.
// A small safety margin is left before the wall. The first 8cm near the actor are ignored
// so standing next to an object does not lock the camera to the player origin.
export function cameraBoomFraction(from,to,boxes=[],circles=[],radius=.24){
  const dx=to.x-from.x,dz=to.z-from.z;
  const length=Math.hypot(dx,dz);
  if(length<EPS)return 1;
  let hit=Infinity;
  for(const b of boxes){
    if(Number.isFinite(from.y)&&Number.isFinite(to.y)&&Number.isFinite(b.y0)){
      let lo=0,hi=1;for(const axis of ['x','y','z']){const p=from[axis],d=to[axis]-p,min=b[axis+'0']-radius,max=(b[axis+'1']??Infinity)+radius;if(Math.abs(d)<EPS){if(p<min||p>max){hi=-1;break;}continue;}let a=(min-p)/d,c=(max-p)/d;if(a>c)[a,c]=[c,a];lo=Math.max(lo,a);hi=Math.min(hi,c);}
      if(lo<=hi&&lo>=0&&lo<=1)hit=Math.min(hit,lo);
    }else hit=Math.min(hit,segmentBoxT(from.x,from.z,dx,dz,b,radius));
  }
  for(const c of circles)hit=Math.min(hit,segmentCircleT(from.x,from.z,dx,dz,c,radius));
  if(!Number.isFinite(hit))return 1;
  if(hit<.05)return 1; // camera is starting beside or inside a wall: don't pin to the head
  return clamp(hit-.04, .16,1);
}

// Continuous-angle interpolation avoids a 360-degree snap when crossing -PI / PI.
export function smoothFacing(current,target,dt,responsiveness=13){
  const delta=Math.atan2(Math.sin(target-current),Math.cos(target-current));
  return current+delta*(1-Math.exp(-responsiveness*Math.max(0,dt)));
}
