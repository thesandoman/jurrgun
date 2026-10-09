/**
 * The Discover map (PRD §7.1 "Venue and map", §7.2 district filter).
 *
 * Carried over from the Sanroo live map (floodmap.apps.sv-academy.org): the same
 * MapLibre setup and calm grey basemap, a row of one-tap chips, a small legend,
 * a bottom sheet for what you tapped, "near me" kept on the phone, and the same
 * keyboard and reduced-motion care. What it shows is different: published events
 * only. Never people, never who is going; your own RSVP shows only to you.
 *
 * Server side builds the points (see `eventPlace` in lib/places.ts); this file
 * renders the container, hands the points over as JSON and runs a small script.
 * Without JavaScript the page still lists every event below the map.
 */
import type { Precision } from "../lib/places";
import { BKK_CENTER } from "../lib/places";
import type { T } from "../lib/i18n";

export type MapPoint = {
  id: string;
  title: string;
  when: string;
  venue: string;
  district: string;
  lat: number;
  lng: number;
  precision: Precision;
  emoji: string;
  /** The event's cover photo address, when it has one. */
  cover: string | null;
  /** Category values (EVENT_TAGS) for the chips. */
  tags: string[];
  free: boolean;
  cost: string;
  spots: string;
  full: boolean;
  /** The viewer's own registration label, if any. */
  mine: string | null;
};

export type MapChip = { value: string; label: string; emoji: string };

/** JSON for a <script type="application/json"> block, safe against </script>. */
function scriptJson(x: unknown): string {
  return JSON.stringify(x).replace(/</g, "\\u003c");
}

export function DiscoverMap(props: { points: MapPoint[]; chips: MapChip[]; t: T; listHref: string }) {
  const { t } = props;
  const msgs = {
    all: t("ทั้งหมด", "All"),
    free: t("ฟรี", "Free"),
    shown: t("กิจกรรมบนแผนที่", "events on the map"),
    none: t("ไม่มีกิจกรรมในหมวดนี้บนแผนที่", "No events in this category on the map"),
    here: t("กิจกรรมที่นี่", "Events here"),
    inArea: t("ในเขต", "in"),
    open: t("ดูรายละเอียด", "See details"),
    close: t("ปิด", "Close"),
    me: t("คุณอยู่ที่นี่ (เก็บไว้ในเครื่องนี้เท่านั้น)", "You are here (kept on this phone only)"),
    noGeo: t("หาตำแหน่งไม่ได้ ลองเปิดสิทธิ์ตำแหน่งในเบราว์เซอร์", "Couldn't find your location — check the browser's location permission"),
    km: t("กม.", "km"),
    precision: {
      exact: t("สถานที่จริง", "Exact place"),
      route: t("จุดเริ่มเส้นทาง", "Route start"),
      area: t("ระดับเขต — ดูที่อยู่ในหน้ากิจกรรม", "District area — address on the event page"),
    },
    events: t("กิจกรรม", "events"),
    loadFail: t("โหลดแผนที่ไม่ได้ — ดูเป็นรายการแทน", "The map couldn't load — use the list instead"),
  };
  return (
    <section class="dmap-wrap" aria-label={t("แผนที่กิจกรรม", "Event map")}>
      <a class="skip" href={props.listHref}>{t("ข้ามแผนที่ ดูเป็นรายการ", "Skip the map, show the list")}</a>
      <div class="dmap-chips" id="dmap-chips" role="toolbar" aria-label={t("หมวดกิจกรรม", "Categories")}>
        <button type="button" class="dchip on" data-chip="" aria-pressed="true">✨ {msgs.all}</button>
        {props.chips.map((c) => (
          <button type="button" class="dchip" data-chip={c.value} aria-pressed="false">
            <span aria-hidden="true">{c.emoji}</span> {c.label}
          </button>
        ))}
        <button type="button" class="dchip" data-chip="free" aria-pressed="false">💸 {msgs.free}</button>
      </div>
      <div class="dmap" id="dmap" role="region" aria-label={t("แผนที่", "Map")}>
        <p class="dmap-fallback" id="dmap-fallback" hidden>{msgs.loadFail}</p>
        <button type="button" class="dmap-me" id="dmap-me" aria-label={t("ตำแหน่งของฉัน", "My location")} title={t("ตำแหน่งของฉัน", "My location")}>
          ◎
        </button>
        <details class="dmap-key" open>
          <summary>{t("คำอธิบาย", "Key")}</summary>
          <p><i class="k exact" aria-hidden="true"></i> {msgs.precision.exact}</p>
          <p><i class="k area" aria-hidden="true"></i> {t("ระดับเขต", "District area")}</p>
          <p><i class="k mine" aria-hidden="true">✓</i> {t("กิจกรรมของฉัน", "My events")}</p>
        </details>
        <div class="dsheet" id="dsheet" role="dialog" aria-labelledby="dsheet-h" hidden>
          <button type="button" class="dsheet-x" id="dsheet-x" aria-label={msgs.close}>✕</button>
          <h2 id="dsheet-h" tabindex={-1}></h2>
          <div id="dsheet-body"></div>
        </div>
      </div>
      <p class="muted dmap-count" id="dmap-count" aria-live="polite">
        {props.points.length} {msgs.shown}
      </p>
      <link rel="stylesheet" href="https://cdn.jsdelivr.net/npm/maplibre-gl@6.11.2/dist/maplibre-gl.css" />
      <script type="application/json" id="dmap-data" dangerouslySetInnerHTML={{ __html: scriptJson({ points: props.points, msgs, center: BKK_CENTER }) }} />
      <script dangerouslySetInnerHTML={{ __html: MAP_JS }} />
    </section>
  );
}

/** Styles for the map and the list / map switch. Discover adds them next to the switch, so styles.ts stays untouched. */
export const MAP_CSS = `/* ---- Discover: list / map toggle and the event map (template from the Sanroo map) ---- */
.view-toggle{display:inline-grid;grid-template-columns:1fr 1fr;gap:4px;padding:4px;margin:6px 0 10px;border-radius:12px;background:var(--surface-2)}
.view-toggle a{display:flex;align-items:center;justify-content:center;min-height:40px;padding:0 16px;border-radius:9px;text-decoration:none;color:var(--ink-2);font-weight:600}
.view-toggle a.on{background:var(--surface);color:var(--brand);box-shadow:var(--shadow)}
.dmap-wrap{position:relative;margin:4px 0 12px}
.dmap-wrap .skip{position:absolute;left:-9999px}
.dmap-wrap .skip:focus{left:8px;top:8px;z-index:4;background:var(--surface);padding:8px 12px;border-radius:10px;border:2px solid var(--brand)}
.dmap-chips{display:flex;gap:6px;overflow-x:auto;padding:2px 2px 8px;scrollbar-width:none}
.dmap-chips::-webkit-scrollbar{display:none}
.dchip{flex:0 0 auto;display:inline-flex;align-items:center;gap:4px;min-height:40px;padding:0 14px;border-radius:999px;border:1px solid var(--line);background:var(--surface);color:var(--ink);font:inherit;font-size:.88rem;font-weight:600;cursor:pointer}
.dchip.on{background:var(--brand);border-color:var(--brand);color:var(--brand-ink)}
.dmap{position:relative;height:min(64vh,560px);min-height:360px;border-radius:var(--radius);overflow:hidden;border:1px solid var(--line);background:var(--surface-2)}
.dmap-fallback{position:absolute;inset:auto 12px 12px 12px;z-index:3;background:var(--warn-soft);color:var(--warn);padding:10px 12px;border-radius:10px;margin:0}
.dmap-me{position:absolute;right:10px;bottom:12px;z-index:3;width:46px;height:46px;border-radius:50%;border:1px solid var(--line);background:var(--surface);color:var(--brand);font-size:1.3rem;cursor:pointer;box-shadow:var(--shadow)}
.dmap-key{position:absolute;left:10px;bottom:12px;z-index:3;background:color-mix(in srgb,var(--surface) 94%,transparent);border:1px solid var(--line);border-radius:12px;padding:6px 10px;font-size:.8rem;max-width:62%;box-shadow:var(--shadow)}
.dmap-key summary{cursor:pointer;font-weight:600;min-height:28px}
.dmap-key p{margin:2px 0;display:flex;align-items:center;gap:6px}
.dmap-key .k{display:inline-grid;place-items:center;width:16px;height:16px;border-radius:50%;font-style:normal;font-size:10px}
.dmap-key .k.exact{background:var(--brand);border:2px solid #fff;box-shadow:0 0 0 1px var(--brand)}
.dmap-key .k.area{border:2px dashed var(--brand);background:color-mix(in srgb,var(--brand) 18%,transparent)}
.dmap-key .k.mine{background:var(--gold);color:#fff}
.dpin{position:relative;display:grid;place-items:center;width:40px;height:40px;margin-bottom:7px;border-radius:50%;border:2px solid #fff;background:var(--brand);color:var(--brand-ink);box-shadow:0 3px 10px rgba(0,0,0,.28);cursor:pointer;padding:0;font:inherit;font-weight:700}
.dpin>span{font-size:18px;line-height:1}
.dpin::after{content:"";position:absolute;left:50%;bottom:-8px;transform:translateX(-50%);border:6px solid transparent;border-top:7px solid #fff;border-bottom:0}
.dpin.area{border:2px dashed var(--brand);background:color-mix(in srgb,var(--surface) 82%,var(--brand));color:var(--ink)}
.dpin.full{opacity:.72}
.dpin.mine{background:var(--gold);color:#fff}
.dpin i{position:absolute;top:-6px;right:-6px;width:18px;height:18px;border-radius:50%;background:var(--ok);color:#fff;font-style:normal;font-size:11px;display:grid;place-items:center;border:2px solid #fff}
.dpin:focus-visible{outline:3px solid var(--gold);outline-offset:3px}
.dme{width:18px;height:18px;border-radius:50%;background:#2563eb;border:3px solid #fff;box-shadow:0 0 0 6px rgba(37,99,235,.25)}
.dsheet{position:absolute;left:8px;right:8px;bottom:8px;z-index:4;max-height:62%;overflow:auto;background:var(--surface);border:1px solid var(--line);border-radius:16px;padding:14px 14px 8px;box-shadow:0 -6px 30px rgba(0,0,0,.18)}
.dsheet h2{margin:0 40px 8px 0;font-size:1.05rem}
.dsheet h2:focus{outline:none}
.dsheet-x{position:absolute;top:6px;right:6px;width:44px;height:44px;border:0;background:none;color:var(--ink-3);font-size:1.1rem;cursor:pointer;border-radius:50%}
.dcard{display:flex;gap:10px;padding:10px 4px;border-top:1px solid var(--line);text-decoration:none;color:inherit}
.dcard:first-child{border-top:0}
.dcard>span:last-child{display:flex;flex-direction:column;gap:1px;min-width:0}
.dcard b{font-size:.98rem}
.dcard small{color:var(--ink-3);font-size:.84rem}
.dcard-e{font-size:1.6rem;line-height:1.2;flex:0 0 auto}
.dcard-e img{display:block;width:56px;height:56px;object-fit:cover;border-radius:10px}
.dcard-tags em{font-style:normal;padding:1px 8px;border-radius:999px;background:var(--surface-2);color:var(--ink-2)}
.dcard-tags em.ok{background:var(--ok-soft);color:var(--ok)}.dcard-tags em.warn{background:var(--warn-soft);color:var(--warn)}.dcard-tags em.accent{background:var(--brand-soft);color:var(--brand)}
.dcard-note{font-style:italic}
.dmap-count{margin:6px 2px 0}
.dmap .maplibregl-ctrl-attrib{font-size:.7rem}
@media (min-width:900px){.dmap{height:min(70vh,640px)}.dsheet{left:auto;right:12px;top:12px;bottom:auto;width:360px;max-height:calc(100% - 24px)}}`;

/**
 * The browser side. Plain ES5-style script (the rest of the app has almost no
 * client JS); MapLibre is loaded on demand only on this page.
 */
const MAP_JS = `(function(){
  var cfg=JSON.parse(document.getElementById('dmap-data').textContent);
  var P=cfg.points,M=cfg.msgs,box=document.getElementById('dmap');
  var reduce=window.matchMedia&&matchMedia('(prefers-reduced-motion: reduce)').matches;
  var dark=window.matchMedia&&matchMedia('(prefers-color-scheme: dark)').matches;
  var chip='',markers=[],map,me=null,opener=null;
  /* On a phone the key starts folded so it doesn't cover pins. */
  if(box.clientWidth<500){var key=box.querySelector('.dmap-key');if(key)key.open=false;}
  function esc(s){return String(s==null?'':s).replace(/[&<>"']/g,function(c){return{'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c];});}
  function km(a,b){var R=6371,r=Math.PI/180,dl=(b.lat-a.lat)*r,dn=(b.lng-a.lng)*r;
    var x=Math.sin(dl/2)*Math.sin(dl/2)+Math.cos(a.lat*r)*Math.cos(b.lat*r)*Math.sin(dn/2)*Math.sin(dn/2);return 2*R*Math.asin(Math.sqrt(x));}
  function match(p){return !chip||(chip==='free'?p.free:p.tags.indexOf(chip)>=0);}
  /* Events at the same point (often a district centre) share one pin. */
  function groups(){var g={},out=[];P.filter(match).forEach(function(p){var k=p.lat.toFixed(5)+','+p.lng.toFixed(5);
    if(!g[k]){g[k]={lat:p.lat,lng:p.lng,items:[]};out.push(g[k]);}g[k].items.push(p);});return out;}
  function pinEl(gr){var b=document.createElement('button');b.type='button';var one=gr.items.length===1,p=gr.items[0];
    var area=gr.items.every(function(x){return x.precision==='area';}),mine=gr.items.some(function(x){return x.mine;});
    b.className='dpin'+(area?' area':'')+(mine?' mine':'')+(gr.items.every(function(x){return x.full;})?' full':'');
    b.innerHTML='<span aria-hidden="true">'+(one?p.emoji:gr.items.length)+'</span>'+(mine?'<i aria-hidden="true">✓</i>':'');
    b.setAttribute('aria-label',one?(p.title+', '+p.when+', '+p.venue):(gr.items.length+' '+M.events+' '+M.inArea+' '+p.district));
    b.addEventListener('click',function(e){e.stopPropagation();openSheet(gr,b);});return b;}
  function draw(){markers.forEach(function(m){m.remove();});markers=[];var gs=groups();
    gs.forEach(function(gr){markers.push(new ml.Marker({element:pinEl(gr),anchor:'bottom'}).setLngLat([gr.lng,gr.lat]).addTo(map));});
    var n=gs.reduce(function(s,g){return s+g.items.length;},0);
    document.getElementById('dmap-count').textContent=n?(n+' '+M.shown):M.none;return gs;}
  function card(p){var d=me?' · '+km(me,p).toFixed(1)+' '+M.km:'';
    return '<a class="dcard" href="/events/'+encodeURIComponent(p.id)+'"><span class="dcard-e" aria-hidden="true">'+(p.cover?'<img src="'+esc(p.cover)+'" alt="" loading="lazy">':esc(p.emoji))+'</span><span>'+
      '<b>'+esc(p.title)+'</b><small>🗓️ '+esc(p.when)+'</small><small>📍 '+esc(p.venue)+' · '+esc(p.district)+d+'</small>'+
      '<small class="dcard-tags"><em class="'+(p.full?'warn':'ok')+'">'+esc(p.spots)+'</em> <em>'+esc(p.cost)+'</em>'+(p.mine?' <em class="accent">✓ '+esc(p.mine)+'</em>':'')+'</small>'+
      (p.precision!=='exact'?'<small class="dcard-note">'+esc(M.precision[p.precision])+'</small>':'')+'</span></a>';}
  function openSheet(gr,from){opener=from||null;var s=document.getElementById('dsheet'),h=document.getElementById('dsheet-h'),p=gr.items[0];
    h.textContent=gr.items.length===1?('📍 '+p.venue):(M.here+' · '+p.district);
    var items=gr.items.slice();if(me)items.sort(function(a,b){return km(me,a)-km(me,b);});
    document.getElementById('dsheet-body').innerHTML=items.map(card).join('');s.hidden=false;h.focus();
    var wide=box.clientWidth>=600;map.easeTo({center:[gr.lng,gr.lat],offset:wide?[-180,0]:[0,-90],duration:reduce?0:500});}
  function closeSheet(){var s=document.getElementById('dsheet');if(s.hidden)return;s.hidden=true;if(opener&&opener.isConnected)opener.focus();opener=null;}
  document.getElementById('dsheet-x').addEventListener('click',closeSheet);
  box.addEventListener('keydown',function(e){if(e.key==='Escape')closeSheet();});
  document.getElementById('dmap-chips').addEventListener('click',function(e){var b=e.target.closest('[data-chip]');if(!b)return;
    chip=b.getAttribute('data-chip');Array.prototype.forEach.call(this.querySelectorAll('[data-chip]'),function(x){var on=x===b;x.classList.toggle('on',on);x.setAttribute('aria-pressed',String(on));});
    closeSheet();fit(draw());});
  function fit(gs){if(!gs.length)return;var b=new ml.LngLatBounds();gs.forEach(function(g){b.extend([g.lng,g.lat]);});
    map.fitBounds(b,{padding:{top:60,bottom:60,left:40,right:40},maxZoom:14,duration:reduce?0:600});}
  document.getElementById('dmap-me').addEventListener('click',function(){if(!navigator.geolocation)return alert(M.noGeo);
    navigator.geolocation.getCurrentPosition(function(pos){me={lat:pos.coords.latitude,lng:pos.coords.longitude};
      if(window._meMk)window._meMk.remove();var d=document.createElement('div');d.className='dme';d.setAttribute('role','img');d.setAttribute('aria-label',M.me);d.title=M.me;
      window._meMk=new ml.Marker({element:d}).setLngLat([me.lng,me.lat]).addTo(map);map.flyTo({center:[me.lng,me.lat],zoom:13,duration:reduce?0:900});},
      function(){alert(M.noGeo);},{enableHighAccuracy:false,timeout:10000,maximumAge:300000});});
  var ml;
  import('https://cdn.jsdelivr.net/npm/maplibre-gl@6.11.2/dist/maplibre-gl.mjs').then(function(m){ml=m;
    var base=dark?'Dark_Gray':'Light_Gray',esri='https://server.arcgisonline.com/ArcGIS/rest/services/Canvas/World_';
    map=new ml.Map({container:box,center:[cfg.center[1],cfg.center[0]],zoom:10.6,minZoom:9,maxZoom:18,
      maxBounds:[[100.15,13.35],[101.1,14.15]],attributionControl:{compact:true},cooperativeGestures:false,
      style:{version:8,sources:{
        base:{type:'raster',tiles:[esri+base+'_Base/MapServer/tile/{z}/{y}/{x}'],tileSize:256,maxzoom:16,attribution:'© Esri, HERE, Garmin, © OpenStreetMap contributors'},
        ref:{type:'raster',tiles:[esri+base+'_Reference/MapServer/tile/{z}/{y}/{x}'],tileSize:256,maxzoom:16}},
        layers:[{id:'base',type:'raster',source:'base'},{id:'ref',type:'raster',source:'ref'}]}});
    map.addControl(new ml.NavigationControl({showCompass:false}),'top-right');
    map.on('click',closeSheet);
    /* Pins don't wait for the tiles: draw them as soon as the map exists. */
    fit(draw());
  }).catch(function(){document.getElementById('dmap-fallback').hidden=false;});
})();`;
