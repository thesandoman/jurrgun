/**
 * Phone-side photo shrink (Mobile App card M3, a plain bug: 6 MB camera
 * photos were refused by the 5 MB limit instead of uploading).
 *
 * Every image file input on every page goes through this before any other
 * handler sees the file: a capture-phase "change" listener on the document
 * swaps the picked file for a smaller copy, then fires "change" again so the
 * page's own pickers (preview, type and size checks) run on the small one.
 *
 *   - JPEG: always redrawn, long side at most 1600px, quality 0.85.
 *   - PNG and still WebP: redrawn only when over 1600px or about 1.5 MB, and
 *     kept as WebP (or PNG where the browser can't write WebP), never JPEG,
 *     so transparency survives. Animated WebP is left exactly as picked.
 *   - The picture is drawn the right way up (EXIF rotation applied while
 *     drawing), since a redraw drops the rotation flag. The server still
 *     strips all metadata (domain/photos.ts).
 *   - HEIC/HEIF (some Android pickers ignore `accept`): refused on the spot
 *     with "Choose a JPEG or PNG photo".
 *   - One photo at a time; the bitmap and canvas are freed after each.
 *   - If shrinking fails, or the copy isn't smaller, the original goes on as
 *     it was, and the existing 5 MB checks decide (in the page and on the
 *     server).
 *   - While a photo is being shrunk, the form's submit buttons are disabled.
 */
export const SHRINK_MAX_SIDE = 1600;
export const SHRINK_OVER_BYTES = 1.5 * 1024 * 1024;

export const PHOTO_SHRINK_JS = `(function(){
if(window.__jgShrink)return;window.__jgShrink=1;
var SIDE=${SHRINK_MAX_SIDE},BIG=${SHRINK_OVER_BYTES},Q=0.85;
var th=(document.documentElement.lang||"").indexOf("th")===0;
var HEIC_MSG=th?"\\u0e40\\u0e25\\u0e37\\u0e2d\\u0e01\\u0e23\\u0e39\\u0e1b JPEG \\u0e2b\\u0e23\\u0e37\\u0e2d PNG":"Choose a JPEG or PNG photo";
/* What to do with one picked file: "heic", "keep", or the type to write. */
function plan(f,w,h){
  var t=(f.type||"").toLowerCase(),n=(f.name||"").toLowerCase();
  if(/^image\\/hei[cf]/.test(t)||/\\.hei[cf]$/.test(n))return"heic";
  if(t==="image/jpeg")return"image/jpeg";
  if(t==="image/png"||t==="image/webp"){
    if(f.size>BIG||(w&&h&&Math.max(w,h)>SIDE))return"image/webp";
    return"keep";
  }
  return"keep";
}
/* Animated WebP has an ANIM chunk near the start of the file. */
function animated(f){
  if((f.type||"")!=="image/webp")return Promise.resolve(false);
  return f.slice(0,64).arrayBuffer().then(function(b){var s="",u=new Uint8Array(b);for(var i=0;i<u.length;i++)s+=String.fromCharCode(u[i]);return s.indexOf("ANIM")>=0}).catch(function(){return false});
}
/* Decoded with the EXIF rotation applied. */
function decode(f){
  if(window.createImageBitmap)return createImageBitmap(f,{imageOrientation:"from-image"}).catch(function(){return viaImg(f)});
  return viaImg(f);
}
function viaImg(f){
  return new Promise(function(res,rej){var u=URL.createObjectURL(f),i=new Image();i.onload=function(){res({img:i,width:i.naturalWidth,height:i.naturalHeight,close:function(){URL.revokeObjectURL(u)}})};i.onerror=function(){URL.revokeObjectURL(u);rej(new Error("decode"))};i.src=u});
}
function shrink(f){
  return animated(f).then(function(anim){
    if(anim)return f;
    return decode(f).then(function(bm){
      var w=bm.width,h=bm.height,out=plan(f,w,h);
      if(out==="keep"){if(bm.close)bm.close();return f}
      var s=Math.min(1,SIDE/Math.max(w,h)),cw=Math.max(1,Math.round(w*s)),ch=Math.max(1,Math.round(h*s));
      var c=document.createElement("canvas");c.width=cw;c.height=ch;
      var x=c.getContext("2d");x.drawImage(bm.img||bm,0,0,cw,ch);
      if(bm.close)bm.close();
      return new Promise(function(res){c.toBlob(function(b){c.width=0;c.height=0;res(b)},out,Q)}).then(function(b){
        if(!b||!b.size||b.size>=f.size&&s===1)return f;
        /* A browser that can't write WebP gives PNG back: still lossless, still transparent. */
        if(out==="image/webp"&&b.type!=="image/webp"&&b.type!=="image/png")return f;
        var ext=b.type==="image/jpeg"?".jpg":b.type==="image/webp"?".webp":".png";
        var name=(f.name||"photo").replace(/\\.[^.]*$/,"")+ext;
        return new File([b],name,{type:b.type,lastModified:Date.now()});
      });
    });
  }).catch(function(){return f});
}
function say(input,msg){
  var box=input.closest("[data-photo-pick]")||input.parentNode,err=box&&box.querySelector(".pf-photo-err,[data-shrink-err]");
  if(!err&&box){err=document.createElement("small");err.className="field-err";err.setAttribute("data-shrink-err","");err.setAttribute("role","alert");input.insertAdjacentElement("afterend",err)}
  if(!err)return;err.textContent="\\u26a0 "+msg;err.hidden=false;input.setAttribute("aria-invalid","true");
}
function lock(form,on){if(!form)return;[].forEach.call(form.querySelectorAll("button[type=submit],button:not([type]),input[type=submit]"),function(b){if(on){if(!b.disabled){b.disabled=true;b.dataset.shrinkLock="1"}}else if(b.dataset.shrinkLock){b.disabled=false;delete b.dataset.shrinkLock}})}
var queue=Promise.resolve();
document.addEventListener("change",function(e){
  var input=e.target;
  if(!input||input.tagName!=="INPUT"||input.type!=="file"||!/image/.test(input.accept||""))return;
  if(input.dataset.shrunk==="1"){delete input.dataset.shrunk;return}
  var files=input.files;if(!files||!files.length||typeof DataTransfer==="undefined")return;
  var stale=input.parentNode&&input.parentNode.querySelector("[data-shrink-err]");if(stale){stale.hidden=true;input.removeAttribute("aria-invalid")}
  var list=[].slice.call(files);
  if(list.some(function(f){return plan(f,0,0)==="heic"})){e.stopImmediatePropagation();input.value="";input.dataset.shrunk="1";input.dispatchEvent(new Event("change",{bubbles:true}));say(input,HEIC_MSG);return}
  if(!list.some(function(f){return /^image\\/(jpeg|png|webp)$/.test(f.type||"")}))return;
  e.stopImmediatePropagation();
  var form=input.form;lock(form,true);input.setAttribute("aria-busy","true");
  var done=[];
  list.forEach(function(f){queue=queue.then(function(){return shrink(f).then(function(g){done.push(g)})})});
  queue=queue.then(function(){
    try{var dt=new DataTransfer();done.forEach(function(g){dt.items.add(g)});input.files=dt.files}catch(err){}
  }).catch(function(){}).then(function(){
    input.removeAttribute("aria-busy");lock(form,false);
    input.dataset.shrunk="1";input.dispatchEvent(new Event("change",{bubbles:true}));
  });
},true);
window.jgShrink={plan:plan};
})();`;
