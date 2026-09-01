
import { initializeApp } from "https://www.gstatic.com/firebasejs/12.18.0/firebase-app.js";
import {
  getDatabase, ref, onValue, onChildAdded, onChildChanged,
  onChildRemoved, push, update, serverTimestamp
} from "https://www.gstatic.com/firebasejs/12.18.0/firebase-database.js";
import { firebaseConfig } from "../firebase-config.js";
import { STATES, riskColor, level } from "../shared/states.js";

const app = initializeApp(firebaseConfig);
const db = getDatabase(app);

const $ = id => document.getElementById(id);
const esc = v => String(v ?? "").replace(/[&<>"']/g, c =>
  ({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#039;"}[c])
);
const fmtTime = v => {
  const n = Number(v);
  return new Date(Number.isFinite(n) && n > 0 ? n : Date.now())
    .toLocaleTimeString([], {hour:"2-digit", minute:"2-digit"});
};

const CLIENT_ID_KEY = "horizon_client_id_v19";
const clientId = localStorage.getItem(CLIENT_ID_KEY) ||
  (globalThis.crypto?.randomUUID?.() || `client-${Date.now()}-${Math.random().toString(36).slice(2)}`);
localStorage.setItem(CLIENT_ID_KEY, clientId);

let rows = [];
let firebaseState = null;
let stateFromFirebase = false;
let alerts = new Map();
let reports = [];
let dispatches = [];
let mySos = [];
let currentSosKey = null;
let sosWatch = null;
let sosStartedAt = null;
let reportCoords = null;
let map = null;
let mapLayers = [];
let mapGeo = null;
let activeFilter = "all";

function toast(msg){
  const t = $("toast");
  if(!t) return;
  t.textContent = msg;
  t.classList.add("show");
  clearTimeout(toast.timer);
  toast.timer = setTimeout(() => t.classList.remove("show"), 2600);
}

/* ---------- NAVIGATION ---------- */
function openScreen(id){
  document.querySelectorAll(".screen").forEach(x => x.classList.remove("active"));
  const target = $(id);
  if(target) target.classList.add("active");
  document.querySelectorAll(".nav").forEach(n =>
    n.classList.toggle("active", n.dataset.target === id)
  );
  if(id === "mapScreen"){
    setTimeout(() => { if(map) map.invalidateSize(); }, 120);
    renderMap();
  }
  if(id === "alertsScreen") renderAlerts();
}
window.openScreen = openScreen;

/* ---------- DATA MODEL ---------- */
function fallbackRows(){
  const fallback = [
    [68,44,20,83,9],[61,28,29,70,12],[52,18,30,68,11],[74,62,18,88,7],
    [79,77,21,91,8],[63,37,22,81,10],[59,31,24,79,8],[41,12,31,65,13]
  ];
  return STATES.map((s,i) => {
    const [score,rain,temp,humidity,wind] = fallback[i];
    return {
      state:s.name, city:s.capital, lat:s.lat, lon:s.lon,
      sensors:0,
      temperature:temp, rain, humidity, wind, score,
      riskLevel:level(score),
      reason:"Demo weather profile"
    };
  });
}

function rowsFromFirebase(snapshot){
  if(!snapshot?.states) return [];
  const source = Array.isArray(snapshot.states)
    ? snapshot.states
    : Object.values(snapshot.states);

  return source.map((s,i) => {
    const base = STATES.find(x => x.name === s.name) || STATES[i] || {};
    const score = Number(s.score ?? 0);
    return {
      state:s.name || base.name,
      city:s.capital || base.capital || "Regional",
      lat:Number(s.lat ?? s.latitude ?? base.lat),
      lon:Number(s.lon ?? s.longitude ?? base.lon),
      sensors:Number(s.sensors ?? 0),
      temperature:Number(s.temperature ?? s.temperature_2m ?? 0),
      rain:Number(s.rain ?? s.precipitation ?? 0),
      humidity:Number(s.humidity ?? s.relative_humidity_2m ?? 0),
      wind:Number(s.wind ?? s.wind_speed_10m ?? 0),
      score,
      riskLevel:s.level || level(score),
      reason:s.reason || `${s.level || level(score)} regional risk`
    };
  });
}

/* ---------- WEATHER FALLBACK ---------- */
async function fetchWeather(s){
  const u = new URL("https://api.open-meteo.com/v1/forecast");
  u.searchParams.set("latitude", s.lat);
  u.searchParams.set("longitude", s.lon);
  u.searchParams.set("current",
    "temperature_2m,relative_humidity_2m,precipitation,rain,weather_code,wind_speed_10m");
  u.searchParams.set("hourly",
    "rain,precipitation,soil_moisture_0_to_1cm");
  u.searchParams.set("forecast_days","3");
  u.searchParams.set("timezone","auto");
  const r = await fetch(u);
  if(!r.ok) throw new Error("weather request failed");
  return r.json();
}

function calculateWeatherRisk(s,w){
  const cur=w.current || {};
  const h=w.hourly || {};
  const rainArr=h.rain || h.precipitation || [];
  const rain24=rainArr.slice(0,24).reduce((a,v)=>a+Number(v||0),0);
  const rain72=rainArr.slice(0,72).reduce((a,v)=>a+Number(v||0),0);
  const soilArr=(h.soil_moisture_0_to_1cm||[]).slice(0,24);
  const soil=soilArr.length
    ? soilArr.reduce((a,v)=>a+Number(v||0),0)/soilArr.length*100 : 65;
  const humidity=Number(cur.relative_humidity_2m||70);
  const weather=Math.min(100,rain24*1.8+rain72*.28+soil*.16+humidity*.08);
  let score=Math.round(Math.min(99,weather*.56+(s.terrain*100)*.27+(s.exposure*100)*.17));
  if(rain72>180) score=Math.min(99,score+8);
  const reasons=[];
  if(rain24>=40) reasons.push("Heavy rainfall loading");
  else if(rain24>=15) reasons.push("Elevated rainfall");
  if(soil>=70) reasons.push("High near-surface soil moisture");
  if(s.terrain>=.85) reasons.push("Steep / susceptible terrain");
  if(!reasons.length) reasons.push("No major threshold exceeded");

  return {
    state:s.name, city:s.capital, lat:s.lat, lon:s.lon, sensors:0,
    temperature:Number(cur.temperature_2m||0), rain:rain24,
    humidity, wind:Number(cur.wind_speed_10m||0),
    score, riskLevel:level(score), reason:reasons[0]
  };
}

async function loadWeatherFallback(){
  $("updated").textContent = "Loading live weather…";
  const result = await Promise.all(STATES.map(async s => {
    try { return calculateWeatherRisk(s, await fetchWeather(s)); }
    catch { return null; }
  }));
  const good=result.filter(Boolean);
  if(good.length){
    rows=good;
    renderData();
    if(!stateFromFirebase) $("updated").textContent="Live weather • waiting for shared state";
  }else{
    rows=fallbackRows();
    renderData();
    $("updated").textContent="Demo data • weather unavailable";
  }
}

/* ---------- RENDER HOME / STATES ---------- */
function renderData(){
  if(!rows.length) return;

  const avg=Math.round(rows.reduce((a,r)=>a+r.score,0)/rows.length);
  const high=rows.filter(r=>r.score>=65).length;
  const sensors=rows.reduce((a,r)=>a+r.sensors,0);

  $("avgRisk").textContent=avg;
  $("stateAvg").textContent=avg;
  $("regionalLevel").textContent=level(avg);
  $("highCount").textContent=high;
  $("totalSensors").textContent=sensors;
  $("sensorTotalLarge").textContent=`${sensors} ACTIVE SENSORS`;

  const ring=$("riskRing");
  if(ring){
    ring.style.borderColor=riskColor(avg);
    ring.style.boxShadow=`inset 0 0 0 1px ${riskColor(avg)}55`;
  }

  const sorted=[...rows].sort((a,b)=>b.score-a.score);
  const top=sorted[0];
  $("featuredState").textContent=top.state.toUpperCase();
  $("featuredCity").textContent=top.city;
  $("featuredTime").textContent=stateFromFirebase
    ? `Shared Firebase • ${fmtTime(firebaseState?.updatedAt)}`
    : "Live weather";
  $("weatherIcon").textContent=top.rain>=15 ? "🌧️" : "☁";
  $("temp").textContent=`${Math.round(top.temperature)}°`;
  $("rain24").textContent=Number(top.rain).toFixed(1);
  $("humidity").textContent=Math.round(top.humidity);
  $("wind").textContent=Math.round(top.wind);
  $("predictionText").textContent=`${top.riskLevel} risk`;
  $("predictionScore").textContent=`${top.score}%`;
  $("predictionScore").style.color=riskColor(top.score);

  $("priorityRow").innerHTML=sorted.slice(0,5).map(r=>`
    <div class="priority-card" onclick="openZoneFromState('${esc(r.state).replace(/'/g,"\\'")}')">
      <small>${esc(r.state)}</small><b>${esc(r.city)}</b>
      <strong>${r.score}</strong><em style="color:${riskColor(r.score)}">${esc(r.riskLevel)}</em>
    </div>`).join("");

  const max=Math.max(100,...rows.map(r=>r.score));
  $("stateBars").innerHTML=rows.map(r=>
    `<i title="${esc(r.state)}: ${r.score}" style="height:${Math.max(15,r.score/max*100)}%;background:${riskColor(r.score)}"></i>`
  ).join("");

  $("statesGrid").innerHTML=rows.map(r=>`
    <div class="state-card" onclick="openZoneFromState('${esc(r.state).replace(/'/g,"\\'")}')">
      <div class="state-card-head"><small>${esc(r.state)}</small>
      <span class="sensor-count">⌁ ${r.sensors} sensors</span></div>
      <b>${esc(r.city)}</b><strong>${r.score}</strong>
      <em style="color:${riskColor(r.score)}">${esc(r.riskLevel)}</em>
      <small class="sensor-note">${stateFromFirebase?"Shared live reading":"Live weather fallback"}</small>
    </div>`).join("");

  renderMapList();
  renderAlerts();
  updateMapColors();
}

function renderMapList(){
  const el=$("mapList");
  if(!el) return;
  el.innerHTML=[...rows].sort((a,b)=>b.score-a.score).map(r=>`
    <div class="map-row" onclick="openZoneFromState('${esc(r.state).replace(/'/g,"\\'")}')">
      <div><b>${esc(r.state)}</b><small>${esc(r.city)}</small></div>
      <strong style="color:${riskColor(r.score)}">${r.score}</strong>
    </div>`).join("");
}

window.openZoneFromState=function(state){
  const r=rows.find(x=>x.state===state);
  if(!r)return;
  openScreen("mapScreen");
  if(map)map.setView([r.lat,r.lon],7);
  toast(`${r.state}: ${r.riskLevel} risk • ${r.score}/100`);
};

/* ---------- BOUNDARY MAP ---------- */
const STATE_GEO_URL =
  "https://raw.githubusercontent.com/AbhinavSwami28/india-official-geojson/refs/heads/main/india-states-simplified.geojson";
const NER=new Set(STATES.map(s=>s.name));

async function initMap(){
  if(typeof L==="undefined" || !$("map")) return;
  if(map){setTimeout(()=>map.invalidateSize(),80);return;}
  map=L.map("map",{zoomControl:false,preferCanvas:true}).setView([25.5,92.8],6);
  L.control.zoom({position:"topright"}).addTo(map);
  L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png",{
    maxZoom:12,attribution:"© OpenStreetMap"
  }).addTo(map);
  try{
    const res=await fetch(STATE_GEO_URL);
    if(!res.ok)throw new Error("boundary");
    const data=await res.json();
    const features=data.features.filter(f=>NER.has(f.properties?.NAME_1));
    mapGeo=L.geoJSON(features,{
      style:f=>{
        const r=rows.find(x=>x.state===f.properties?.NAME_1);
        return {color:"#fff",weight:1.5,opacity:.9,
          fillColor:riskColor(Number(r?.score||0)),fillOpacity:.72};
      },
      onEachFeature:(f,layer)=>{
        const name=f.properties?.NAME_1||"State";
        layer.bindTooltip(name,{sticky:true});
        layer.on({
          mouseover:e=>e.target.setStyle({weight:2.5,fillOpacity:.88}),
          mouseout:e=>mapGeo.resetStyle(e.target),
          click:()=>toast(name)
        });
        mapLayers.push({layer,name});
      }
    }).addTo(map);
    if(mapGeo.getLayers().length)map.fitBounds(mapGeo.getBounds(),{padding:[10,10]});
  }catch(e){
    console.error("map boundary",e);
    toast("Map boundary data unavailable");
  }
}
function updateMapColors(){
  mapLayers.forEach(x=>{
    const r=rows.find(v=>v.state===x.name);
    if(r)x.layer.setStyle({fillColor:riskColor(r.score)});
  });
}
window.locateOnMap=function(){
  if(!navigator.geolocation){toast("GPS unavailable");return}
  navigator.geolocation.getCurrentPosition(p=>{
    if(map)map.setView([p.coords.latitude,p.coords.longitude],10);
    toast("Map centered on your location");
  },()=>toast("Location permission denied"));
};
function renderMap(){updateMapColors();renderMapList()}

/* ---------- ALERTS / BROADCAST HISTORY ---------- */
function renderAlerts(){
  const list=$("alertList");
  if(!list)return;

  const broadcasts=Array.from(alerts.values()).map(a=>({
    kind:"broadcast",time:Number(a.createdAt||0),
    html:`<article class="alert-item">
      <div class="alert-icon">🚨</div><main>
      <b>${esc(a.title||"Regional Alert")} <span class="tag">${esc(a.severity||"INFO")}</span></b>
      <p>${esc(a.message||"")}</p>
      <small>${esc(Array.isArray(a.targetStates)?a.targetStates.join(", "):(a.targetStates||"ALL"))} • ${a.createdAt?new Date(Number(a.createdAt)).toLocaleString():"Just now"}</small>
      </main><strong class="score" style="color:${a.severity==="CRITICAL"||a.severity==="HIGH"?"#ff6570":"#78b9ff"}">${esc(a.severity||"INFO")}</strong>
    </article>`
  }));

  const community=reports.map(r=>({
    kind:"community",time:Number(r.createdAt||0),
    html:`<article class="alert-item community">
      <div class="alert-icon">📍</div><main>
      <b>${esc(r.category||"Hazard")} <span class="tag">FIELD REPORT</span></b>
      <p>${esc(r.description||"No description provided.")}</p>
      <small>${esc(r.city||r.state||"North-East India")} • ${r.createdAt?new Date(Number(r.createdAt)).toLocaleString():"Just now"}</small>
      </main><strong class="score" style="color:var(--green)">NEW</strong>
    </article>`
  }));

  const risk=rows.filter(r=>r.score>=65).map(r=>({
    kind:"risk",time:Number(firebaseState?.updatedAt||Date.now()),
    html:`<article class="alert-item">
      <div class="alert-icon">⚠</div><main>
      <b>${esc(r.city)}, ${esc(r.state)}</b><p>${esc(r.reason)}</p>
      <small>AI weather-linked risk • shared live reading</small>
      </main><strong class="score" style="color:${riskColor(r.score)}">${r.score}</strong>
    </article>`
  }));

  let items=[...broadcasts,...community,...risk];
  if(activeFilter==="risk")items=items.filter(x=>x.kind==="risk");
  if(activeFilter==="community")items=items.filter(x=>x.kind==="community");
  items.sort((a,b)=>b.time-a.time);

  $("alertCount").textContent=items.length;
  $("navDot").style.display=items.length?"block":"none";
  $("alertSummaryTitle").textContent=items.length
    ? `${items.length} live item${items.length===1?"":"s"}`
    : "Monitoring all zones";
  $("alertSummarySub").textContent="Broadcasts, AI risk and community reports";
  list.innerHTML=items.length
    ? items.map(x=>x.html).join("")
    : `<div class="glass-card" style="padding:24px;text-align:center;border-radius:18px;color:#8198aa;font-size:8px">No alerts or reports yet.</div>`;
}

function showClientAlert(a){
  renderAlerts();
  toast(`🚨 ${a.title||"New regional alert"}`);
}

/* ---------- REPORTS ---------- */
window.attachReportLocation=function(){
  if(!navigator.geolocation){toast("GPS unavailable");return}
  toast("Requesting location…");
  navigator.geolocation.getCurrentPosition(p=>{
    reportCoords={lat:p.coords.latitude,lon:p.coords.longitude};
    $("reportLocation").textContent=`${p.coords.latitude.toFixed(5)}, ${p.coords.longitude.toFixed(5)}`;
    toast("Location attached ✓");
  },()=>toast("Could not access location"));
};

function preview(file){
  if(!file)return;
  const box=$("photoPreview");
  box.hidden=false;
  box.innerHTML=`<img src="${URL.createObjectURL(file)}" alt="Evidence preview"><div style="padding:6px 8px">${esc(file.name)}</div>`;
}
$("camera")?.addEventListener("change",e=>preview(e.target.files?.[0]));
$("gallery")?.addEventListener("change",e=>preview(e.target.files?.[0]));

$("submitReport")?.addEventListener("click",async()=>{
  const type=$("reportType")?.value;
  const desc=$("reportDescription")?.value.trim()||"";
  if(!type){toast("Select an incident type");return}
  try{
    await push(ref(db,"reports"),{
      category:type,description:desc,
      latitude:reportCoords?.lat||null,longitude:reportCoords?.lon||null,
      state:"North-East India",city:"Community report",
      status:"UNVERIFIED",createdAt:serverTimestamp()
    });
    $("reportType").value="";
    $("reportDescription").value="";
    $("photoPreview").hidden=true;
    $("photoPreview").innerHTML="";
    reportCoords=null;
    $("reportLocation").textContent="Not attached";
    toast("Field report sent to control room ✓");
    openScreen("alertsScreen");
  }catch(e){
    console.error(e);
    toast("Could not send field report");
  }
});

/* ---------- SOS / RESCUE ---------- */
function renderMyRescueStatus(){
  const latest=mySos.slice().sort((a,b)=>Number(b.createdAt||0)-Number(a.createdAt||0))[0];
  if(!latest)return;
  const linked=dispatches.filter(d=>d.sosId===latest.id)
    .sort((a,b)=>Number(b.createdAt||0)-Number(a.createdAt||0))[0];

  if(linked){
    $("sosStatus") && ($("sosStatus").textContent =
      linked.status==="COMPLETED"
        ? "✓ Rescue completed"
        : `🚑 ${linked.unitId||"Rescue unit"} dispatched`);
  }
}

window.startSOS=function(){
  $("sosLayer").hidden=false;
  $("sosConsent").hidden=false;
  $("sosActivePanel").hidden=true;
  $("sosHeading").textContent="Activate SOS?";
  $("sosMessage").textContent="Your live location will be shared with the control room after you confirm.";
};

window.cancelSOS=function(){
  if(sosWatch!==null){
    navigator.geolocation.clearWatch(sosWatch);
    sosWatch=null;
  }
  $("sosLayer").hidden=true;
};

window.confirmSOS=async function(){
  if(!navigator.geolocation){toast("GPS unavailable on this device");return}
  if(!confirm("Activate SOS and share your live location?"))return;

  sosStartedAt=Date.now();
  $("sosConsent").hidden=true;
  $("sosActivePanel").hidden=false;
  $("sosHeading").textContent="SOS active";
  $("sosMessage").textContent="Live location sharing is now active.";
  $("sosStatus").textContent="Sending SOS to control room…";
  $("sosTime").textContent="Report time • "+new Date(sosStartedAt).toLocaleString();

  try{
    const created=await push(ref(db,"sos"),{
      userName:"Mobile User",clientId,
      state:"North-East India",
      latitude:null,longitude:null,
      note:"Emergency SOS from GeoGuard mobile client",
      status:"ACTIVE",responseStatus:"WAITING",
      createdAt:serverTimestamp()
    });
    currentSosKey=created.key;
    toast("SOS sent to control room ✓");
  }catch(e){
    console.error(e);
    toast("SOS could not be sent");
    return;
  }

  sosWatch=navigator.geolocation.watchPosition(async p=>{
    const payload={
      latitude:p.coords.latitude,longitude:p.coords.longitude,
      accuracy:p.coords.accuracy,lastLocationAt:serverTimestamp()
    };
    if(currentSosKey)await update(ref(db,"sos/"+currentSosKey),payload);
    $("sosStatus").textContent="SOS active • live location sharing";
    $("sosTime").textContent="Updated "+new Date().toLocaleTimeString();
    $("sosLocation").textContent=`${p.coords.latitude.toFixed(6)}, ${p.coords.longitude.toFixed(6)}`;
    $("sosAccuracy").textContent=`GPS accuracy ±${Math.round(p.coords.accuracy)} m`;
  },()=>{
    $("sosStatus").textContent="SOS active • GPS signal unavailable";
  },{enableHighAccuracy:true,maximumAge:5000,timeout:10000});
};

window.stopSOS=async function(){
  if(sosWatch!==null){
    navigator.geolocation.clearWatch(sosWatch);
    sosWatch=null;
  }
  if(currentSosKey){
    try{
      await update(ref(db,"sos/"+currentSosKey),{
        status:"RESOLVED",responseStatus:"CLOSED",closedAt:serverTimestamp()
      });
    }catch(e){console.error(e)}
  }
  $("sosLayer").hidden=true;
  toast("SOS stopped • location sharing ended");
};

/* ---------- FIREBASE REALTIME ---------- */
onValue(ref(db,"state"),snap=>{
  firebaseState=snap.val();
  const incoming=rowsFromFirebase(firebaseState);
  if(incoming.length){
    stateFromFirebase=true;
    rows=incoming;
    renderData();
    $("updated").textContent=firebaseState.updatedAt
      ? `Synced ${fmtTime(firebaseState.updatedAt)}`
      : "Firebase connected";
  }
},err=>{
  console.error("state",err);
  if(!stateFromFirebase)loadWeatherFallback();
});

onChildAdded(ref(db,"alerts"),snap=>{
  const a={id:snap.key,...(snap.val()||{})};
  const fresh=!alerts.has(a.id);
  alerts.set(a.id,a);
  renderAlerts();
  if(fresh)showClientAlert(a);
});
onChildChanged(ref(db,"alerts"),snap=>{
  alerts.set(snap.key,{id:snap.key,...(snap.val()||{})});
  renderAlerts();
});
onChildRemoved(ref(db,"alerts"),snap=>{
  alerts.delete(snap.key);
  renderAlerts();
});

onValue(ref(db,"reports"),snap=>{
  reports=[];
  snap.forEach(x=>reports.push({id:x.key,...(x.val()||{})}));
  reports.sort((a,b)=>Number(b.createdAt||0)-Number(a.createdAt||0));
  renderAlerts();
});

onValue(ref(db,"dispatches"),snap=>{
  dispatches=[];
  snap.forEach(x=>dispatches.push({id:x.key,...(x.val()||{})}));
  renderMyRescueStatus();
});

onValue(ref(db,"sos"),snap=>{
  mySos=[];
  snap.forEach(x=>{
    const v=x.val()||{};
    if(v.clientId===clientId)mySos.push({id:x.key,...v});
  });
  renderMyRescueStatus();
});

/* ---------- STARTUP ---------- */
document.addEventListener("DOMContentLoaded",()=>{
  document.querySelectorAll(".nav").forEach(n=>{
    n.addEventListener("click",()=>openScreen(n.dataset.target));
  });
  document.querySelectorAll(".filter").forEach(b=>{
    b.addEventListener("click",()=>{
      document.querySelectorAll(".filter").forEach(x=>x.classList.remove("active"));
      b.classList.add("active");
      activeFilter=b.dataset.filter;
      renderAlerts();
    });
  });

  rows=fallbackRows();
  renderData();
  renderAlerts();
  initMap();

  // Give Firebase a moment to provide the authoritative shared snapshot.
  // If it does not, load live Open-Meteo data so the UI never remains stuck
  // on "Loading".
  setTimeout(()=>{
    if(!stateFromFirebase)loadWeatherFallback();
  },1200);
});
