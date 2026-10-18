/**
 * Edit profile in place (owner cards, 2026-10-18). A classic script, loaded with the profile form
 * (ProfileFormScript) on /settings/profile and on my own card at /me/profile. Without it every
 * form still posts and every ✏️ is a link, so it only adds:
 *
 * 1. Edit sheets on my card load their section's form the first time they open.
 * 2. A section's Save sends just that form (fetch, header x-pe). A refused save comes back as the
 *    same form with the error beside its field, and focus goes to it. A save from a sheet closes
 *    the sheet, refreshes the card from the server, and puts focus back on that ✏️ with its
 *    "✓ Saved" tick; one on the long form swaps in the fresh form and updates the row's progress.
 *    Sheets with unsaved edits are carried over to the refreshed card, nothing typed is lost.
 * 3. A link to #something inside a closed row or fold opens it.
 * 4. The "Edit | How others see it" switch on the long form: every section's fields as they are now
 *    (photos left out) go to POST /settings/profile/preview, which draws my card from them through
 *    the same template and privacy filter a connection's view uses, and saves nothing. The forms are
 *    only hidden meanwhile, so switching back loses nothing. A photo picked but not saved shows too.
 */
export const PE_JS = `(function(){
if(window.__pe)return;window.__pe=1;
var D=document;
function G(){return window.jgGuard}
function run(root){[].forEach.call(root.querySelectorAll("script"),function(o){var n=D.createElement("script");n.textContent=o.textContent;o.parentNode.replaceChild(n,o)});if(window.jgPf)jgPf.init(root);if(window.jgUni)jgUni()}
function frag(html){var t=D.createElement("template");t.innerHTML=html.trim();return t.content.querySelector("form[data-pe]")}
function field(root){return root.querySelector('input:not([type=hidden]):not([tabindex="-1"]):not(.sr-only),select,textarea')}
function swapForm(form,fresh){form.setAttribute("data-guard",fresh.getAttribute("data-guard")||"");while(form.firstChild)form.removeChild(form.firstChild);while(fresh.firstChild)form.appendChild(fresh.firstChild);run(form);if(G())G().reset(form)}
function busy(f,on){var b=f.querySelector(".pe-save .btn");if(b){if(on)b.setAttribute("aria-busy","true");else b.removeAttribute("aria-busy")}if(on)f.dataset.busy="1";else delete f.dataset.busy}

D.addEventListener("toggle",function(e){var d=e.target;if(!d.matches||!d.matches("details.pe-sheet")||!d.open)return;var box=d.querySelector(".pe-load");if(!box||box.dataset.busy)return;box.dataset.busy="1";
  fetch(box.dataset.src,{headers:{"x-pe":"1"},credentials:"same-origin"}).then(function(r){if(!r.ok)throw 0;return r.text()}).then(function(h){var f=frag(h);if(!f)throw 0;box.replaceWith(f);run(f);if(G())G().add(f);var x=field(f);if(x&&d.open)x.focus({preventScroll:true})})
  .catch(function(){delete box.dataset.busy;var a=d.parentNode.querySelector(".pe-link"),p=D.createElement("p"),l=D.createElement("a");l.href=a?a.href:"/settings/profile";l.textContent=box.dataset.err||"";p.appendChild(l);box.textContent="";box.appendChild(p)});
},true);

function refreshCard(name,sheet,saved){
  var went=false;
  function go(){if(went)return;went=true;
    fetch("/me/profile?saved="+encodeURIComponent(name),{credentials:"same-origin"}).then(function(r){if(!r.ok)throw 0;return r.text()}).then(function(h){
      var nu=new DOMParser().parseFromString(h,"text/html").querySelector("article.pc"),old=D.querySelector("article.pc");if(!nu||!old)throw 0;
      [].forEach.call(old.querySelectorAll("details.pe-sheet form[data-pe]"),function(f){if(f===saved)return;var spot=nu.querySelector('[data-pe-spot="'+f.dataset.pe+'"] .pe-load');if(spot)spot.replaceWith(f);else if(G())G().drop(f)});
      if(G())G().drop(saved);
      old.replaceWith(nu);
      var spot=D.getElementById("pe-"+name),s=spot&&spot.querySelector("details>summary");
      if(s){var d=s.closest("details:not(.sheet)");if(d)d.open=true;s.focus();var tk=spot.querySelector(".pe-tick");if(tk){var x=tk.textContent;tk.textContent="";setTimeout(function(){tk.textContent=x},60)}}
      else{var h1=D.querySelector("article.pc h1");if(h1){h1.tabIndex=-1;h1.focus()}}
    }).catch(function(){location.href="/me/profile?saved="+encodeURIComponent(name)+"#pe-"+name})}
  sheet.addEventListener("toggle",go,{once:true});
  if(window.jgSheet)jgSheet.shut(sheet,false,false);else sheet.open=false;
  setTimeout(go,800);
}

D.addEventListener("submit",function(e){var f=e.target;if(!f.matches||!f.matches("form[data-pe]")||e.defaultPrevented||!window.fetch||!window.FormData)return;
  var b=e.submitter;if(b&&b.hasAttribute("formaction"))return;
  e.preventDefault();if(f.dataset.busy)return;busy(f,true);
  fetch(f.action,{method:"POST",body:new FormData(f),headers:{"x-pe":"1"},credentials:"same-origin"}).then(function(r){return r.text().then(function(h){return{ok:r.ok,h:h,prog:r.headers.get("x-pe-progress")}})}).then(function(res){
    busy(f,false);var fresh=frag(res.h);if(!fresh)throw 0;var name=f.dataset.pe,sheet=f.closest("details.pe-sheet");
    if(!res.ok){swapForm(f,fresh);if(window.jgPf)jgPf.focusErr(f);return}
    if(sheet){refreshCard(name,sheet,f);return}
    swapForm(f,fresh);
    var row=f.closest("details.pe-row"),pr=row&&row.querySelector(".pe-prog");if(pr&&res.prog)pr.textContent=decodeURIComponent(res.prog);
    var sv=f.querySelector(".pe-save .btn");if(sv)sv.focus({preventScroll:true});
  }).catch(function(){busy(f,false);if(G())G().drop(f);HTMLFormElement.prototype.submit.call(f)});
});
function clearTick(e){var f=e.target&&e.target.form;if(f&&f.matches("form[data-pe]")){var tk=f.querySelector(".pe-tick");if(tk)tk.textContent=""}}
D.addEventListener("input",clearTick,true);D.addEventListener("change",clearTick,true);

function openTo(){var id=decodeURIComponent(location.hash.slice(1));if(!id)return;var el=D.getElementById(id);if(!el)return;var opened=false,d=el.closest("details:not(.sheet)");
  while(d){if(!d.open){d.open=true;opened=true}d=d.parentElement&&d.parentElement.closest("details:not(.sheet)")}if(opened)el.scrollIntoView()}
openTo();addEventListener("hashchange",openTo);

var seg=D.querySelector(".pe-seg"),forms=D.getElementById("pe-forms"),pv=D.getElementById("pe-preview"),seq=0;
if(seg&&forms&&pv){
  var show=function(mode){[].forEach.call(seg.querySelectorAll("[data-pe-view]"),function(b){b.setAttribute("aria-pressed",String(b.dataset.peView===mode))});forms.hidden=mode!=="edit";pv.hidden=mode==="edit"};
  seg.addEventListener("click",function(e){var b=e.target.closest("[data-pe-view]");if(!b)return;
    if(b.dataset.peView==="edit"){seq++;show("edit");return}
    var fd=new FormData();[].forEach.call(forms.querySelectorAll("form[data-pe]"),function(f){new FormData(f).forEach(function(v,k){if(typeof v==="string")fd.append(k,v)})});
    var my=++seq;pv.setAttribute("aria-busy","true");show("preview");
    fetch("/settings/profile/preview",{method:"POST",body:fd,headers:{"x-pe":"1"},credentials:"same-origin"}).then(function(r){if(!r.ok)throw 0;return r.text()}).then(function(h){if(my!==seq)return;pv.innerHTML=h;pv.removeAttribute("aria-busy");
      var picked=forms.querySelector("#photo [data-preview] img"),undo=forms.querySelector("#photo .pf-undo"),ph=pv.querySelector(".pc-photo");
      if(picked&&undo&&!undo.hidden&&ph){var img=D.createElement("img");img.className="pc-photo";img.src=picked.src;img.alt=picked.alt;ph.replaceWith(img)}})
    .catch(function(){if(my!==seq)return;pv.removeAttribute("aria-busy");pv.textContent="";var p=D.createElement("p");p.className="field-err";p.setAttribute("role","alert");p.textContent=seg.dataset.previewErr||"";pv.appendChild(p)});
  });
}
})();`;
