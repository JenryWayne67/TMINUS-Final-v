// Preserve live controls, focus and pointer targets while telemetry text changes.
export function patchMarkup(root,markup){
 const template=document.createElement('template');template.innerHTML=markup;
 function patch(parent,source){
  const fresh=[...source.childNodes];for(let i=0;i<fresh.length;i++){
   const next=fresh[i],old=parent.childNodes[i];if(!old){parent.appendChild(next.cloneNode(true));continue;}
   const key=n=>n.nodeType===1?(n.getAttribute('data-task')||n.getAttribute('data-tuning')||n.id||''):'';
   if(old.nodeType!==next.nodeType||old.nodeName!==next.nodeName||key(old)!==key(next)){old.replaceWith(next.cloneNode(true));continue;}
   if(next.nodeType===3){if(old.nodeValue!==next.nodeValue)old.nodeValue=next.nodeValue;continue;}
   if(next.nodeType!==1)continue;
   for(const a of [...old.attributes])if(!next.hasAttribute(a.name))old.removeAttribute(a.name);
   for(const a of [...next.attributes])if(old.getAttribute(a.name)!==a.value)old.setAttribute(a.name,a.value);
   patch(old,next);
  }
  while(parent.childNodes.length>fresh.length)parent.lastChild.remove();
 }
 patch(root,template.content);
}
