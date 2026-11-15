// Phase 4: deterministic, dependency-free adaptive rendering controller.
// Never infer performance from a single long frame (tab suspend / debugger / GC).
export const GRAPHICS_MODES = Object.freeze(['auto','high','medium','low']);
export const MANUAL_RATIOS = Object.freeze({high:2,medium:1.5,low:1});
// Estimates resident source buffers and uncompressed texture mip chains. Drivers
// may keep additional copies; browsers do not expose exact physical GPU memory.
export function estimateSceneMemory(scene){
 const geometry=new Set(),texture=new Set(),material=new Set();let geometryBytes=0,textureBytes=0;
 scene.traverse(o=>{if(o.geometry)geometry.add(o.geometry);for(const m of (Array.isArray(o.material)?o.material:[o.material]))if(m)material.add(m);});
 const arrays=new Set();for(const g of geometry){for(const a of [...Object.values(g.attributes||{}),g.index,...Object.values(g.morphAttributes||{}).flat()]){const data=a?.array||a?.data?.array;if(data&&!arrays.has(data)){arrays.add(data);geometryBytes+=data.byteLength;}}}
 for(const m of material)for(const v of Object.values(m))if(v?.isTexture)texture.add(v);
 for(const t of texture){const image=t.image||t.source?.data,w=image?.width||0,h=image?.height||0;textureBytes+=w*h*4*(t.generateMipmaps?4/3:1);}
 return {geometryBytes,textureBytes:Math.ceil(textureBytes),materials:material.size,method:'source geometry buffers + RGBA texture mip estimate; excludes driver overhead'};
}
export function createPerformanceGovernor({min=0.75,max=1.5,initial=1.5,
  sampleMs=2500,cooldownMs=6000,downThreshold=47,upThreshold=58}={}){
 if(!(min>0&&max>=min&&initial>=min&&initial<=max))throw Error('Invalid resolution scale bounds');
 let mode='auto',ratio=initial,windowMs=0,frames=0,elapsed=0,lastChange=-Infinity,
  slow=0,fast=0,lastFps=0,changed=true;
 const resetSamples=()=>{windowMs=0;frames=0;slow=0;fast=0;};
 return {
  get mode(){return mode;},get ratio(){return ratio;},get fps(){return lastFps;},
  setMode(next){if(!GRAPHICS_MODES.includes(next))return false;
   mode=next;ratio=next==='auto'?Math.min(max,1.5):MANUAL_RATIOS[next];
   changed=true;resetSamples();lastChange=elapsed;return true;},
  observe(ms,{active=true,visible=true}={}){
   if(!active||!visible||!Number.isFinite(ms)||ms<=0||ms>140)return {ratio,changed:false,fps:lastFps};
   elapsed+=ms;windowMs+=ms;frames++;
   if(windowMs>=sampleMs){lastFps=Math.round(frames*1000/windowMs);
    if(mode==='auto'){
     slow=lastFps<downThreshold?slow+1:0;fast=lastFps>=upThreshold?fast+1:0;
     if(elapsed-lastChange>=cooldownMs){
      if(slow>=2&&ratio>min){ratio=Math.max(min,Math.round((ratio-.15)*100)/100);changed=true;resetSamples();lastChange=elapsed;}
      else if(fast>=4&&ratio<max){ratio=Math.min(max,Math.round((ratio+.1)*100)/100);changed=true;resetSamples();lastChange=elapsed;}
     }
    }
    windowMs=0;frames=0;
   }
   const didChange=changed;changed=false;
   return {ratio,changed:didChange,fps:lastFps};
  }
 };
}
