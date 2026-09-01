const $=id=>document.getElementById(id);
const STATES=[
 {state:"Sikkim",city:"Gangtok",lat:27.3389,lon:88.6065,terrain:0.86,history:0.78,sensors:0},
 {state:"Arunachal Pradesh",city:"Itanagar",lat:27.0844,lon:93.6053,terrain:0.92,history:0.74,sensors:0},
 {state:"Assam",city:"Guwahati",lat:26.1445,lon:91.7362,terrain:0.44,history:0.62,sensors:0},
 {state:"Meghalaya",city:"Shillong",lat:25.5788,lon:91.8933,terrain:0.82,history:0.76,sensors:0},
 {state:"Nagaland",city:"Kohima",lat:25.6751,lon:94.1086,terrain:0.88,history:0.72,sensors:0},
 {state:"Manipur",city:"Imphal",lat:24.8170,lon:93.9368,terrain:0.77,history:0.69,sensors:0},
 {state:"Mizoram",city:"Aizawl",lat:23.7271,lon:92.7176,terrain:0.90,history:0.82,sensors:0},
 {state:"Tripura",city:"Agartala",lat:23.8315,lon:91.2868,terrain:0.42,history:0.57,sensors:0}
];
let rows=[],map=null,mapLayers=[],sosWatch=null,sosStart=null,sosId=null,reportCoords=null,activeAlertFilter="all";

function level(s){return s>=80?"CRITICAL":s>=65?"HIGH":s>=45?"MODERATE":"LOW"}
function riskColor(s){return s>=80?"#ff6570":s>=65?"#f3a35d":s>=45?"#e5c95c":"#45e0a5"}
function weatherEmoji(code){if(code===0)return"☀️";if(code<=3)return"⛅";if(code<=48)return"🌫️";if(code<=67)return"🌧️";if(code<=82)return"🌦️";return"⛈️"}
function toast(msg){const t=$("toast");t.textContent=msg;t.classList.add("show");clearTimeout(toast.t);toast.t=setTimeout(()=>t.classList.remove("show"),2200)}
function escapeHtml(v){return String(v??"").replace(/[&<>"']/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#039;"}[c]))}

function openScreen(id){
 document.querySelectorAll(".screen").forEach(x=>x.classList.remove("active"));
 const target=$(id); if(!target)return; target.classList.add("active");
 document.querySelectorAll(".nav").forEach(n=>n.classList.toggle("active",n.dataset.target===id));
 if(id==="mapScreen" && map) setTimeout(()=>map.invalidateSize(),100);
 if(id==="alertsScreen") renderAlerts();
}

document.querySelectorAll(".nav").forEach(n=>n.addEventListener("click",()=>openScreen(n.dataset.target)));
document.querySelectorAll(".filter").forEach(b=>b.addEventListener("click",()=>{document.querySelectorAll(".filter").forEach(x=>x.classList.remove("active"));b.classList.add("active");activeAlertFilter=b.dataset.filter;renderAlerts()}));
$("refreshBtn").addEventListener("click",()=>refreshWeather(true));

async function fetchWeather(loc){
 const u=new URL("https://api.open-meteo.com/v1/forecast");
 u.searchParams.set("latitude",loc.lat);u.searchParams.set("longitude",loc.lon);
 u.searchParams.set("current","temperature_2m,relative_humidity_2m,precipitation,rain,weather_code,wind_speed_10m,wind_gusts_10m");
 u.searchParams.set("hourly","precipitation,rain,precipitation_probability,soil_moisture_0_to_1cm,soil_moisture_9_to_27cm");
 u.searchParams.set("forecast_days","3");u.searchParams.set("timezone","auto");
 const r=await fetch(u);if(!r.ok)throw new Error("weather");
 return r.json();
}

function calculateRisk(loc,w){
 const h=w.hourly||{}, rain=arrSum(h.rain||h.precipitation,0,24), rain72=arrSum(h.rain||h.precipitation,0,72);
 const soil=avg((h.soil_moisture_0_to_1cm||[]).slice(0,24))*100;
 const cur=w.current||{}, weather=Math.min(100,(rain*1.8)+(rain72*.28)+(soil*.16)+(cur.relative_humidity_2m*.08));
 const terrain=loc.terrain*100, historical=loc.history*100;
 let score=Math.round(Math.min(99,weather*.56+terrain*.27+historical*.17));
 if(rain72>180)score=Math.min(99,score+8);
 const reasons=[];
 if(rain24(rain)>=40)reasons.push("Heavy rainfall loading");
 else if(rain24(rain)>=15)reasons.push("Elevated rainfall");
 if(soil>=70)reasons.push("High near-surface soil moisture");
 if(loc.terrain>=.85)reasons.push("Steep / susceptible terrain");
 if(!reasons.length)reasons.push("No major threshold exceeded");
 return {score,level:level(score),rain24:rain,rain72,soil,reasons,weatherCode:cur.weather_code??0};
}
function rain24(x){return x}
function arrSum(a,s,e){return (a||[]).slice(s,e).reduce((x,y)=>x+(Number(y)||0),0)}
function avg(a){return a.length?a.reduce((x,y)=>x+(Number(y)||0),0)/a.length:0}

async function refreshWeather(manual=false){
 if(manual)toast("Refreshing live weather…");
 $("updated").textContent="Updating…";
 try{
  const data=await Promise.all(STATES.map(async loc=>{
   try{return {...loc,weather:await fetchWeather(loc)}}catch{return null}
  }));
  rows=data.filter(Boolean).map(loc=>({...loc,calc:calculateRisk(loc,loc.weather)}));
  if(!rows.length)throw new Error("no data");
  renderAll();
  $("updated").textContent="Live • "+new Date().toLocaleTimeString([],{hour:"2-digit",minute:"2-digit"});
  if(manual)toast("Live weather updated ✓");
 }catch(e){
  if(!rows.length){rows=STATES.map((x,i)=>fallbackRow(x,i));renderAll()}
  $("updated").textContent="Live API unavailable • demo values";
  if(manual)toast("Showing last available data");
 }
}
function fallbackRow(x,i){
 const scores=[68,61,52,74,63,59,79,41],rain=[44,28,18,62,37,31,77,12];
 return {...x,weather:{current:{temperature_2m:[20,29,30,18,22,24,21,31][i],relative_humidity_2m:[83,70,68,88,81,79,91,65][i],wind_speed_10m:[9,12,11,7,10,8,8,13][i],weather_code:61},hourly:{rain:[rain[i]],precipitation:[rain[i]],soil_moisture_0_to_1cm:[.65]}},calc:{score:scores[i],level:level(scores[i]),rain24:rain[i],rain72:rain[i]*3,soil:65,reasons:["Demo risk profile"],weatherCode:61}};
}

function renderAll(){
 const avgRisk=Math.round(avg(rows.map(r=>r.calc.score))), high=rows.filter(r=>r.calc.score>=65).length;
 const totalSensors=rows.reduce((n,r)=>n+(Number(r.sensors)||0),0);
 $("avgRisk").textContent=avgRisk;
 $("totalSensors").textContent=totalSensors;
 $("sensorTotalLarge").textContent=totalSensors+" ACTIVE SENSORS";$("stateAvg").textContent=avgRisk;$("regionalLevel").textContent=level(avgRisk);$("highCount").textContent=high;
 const ring=$("riskRing");ring.style.borderColor=riskColor(avgRisk);ring.style.boxShadow=`inset 0 0 0 1px ${riskColor(avgRisk)}55`;
 const sorted=[...rows].sort((a,b)=>b.calc.score-a.calc.score),top=sorted[0];
 const c=top.weather.current,calc=top.calc;
 $("featuredState").textContent=top.state.toUpperCase();$("featuredCity").textContent=top.city;$("featuredTime").textContent="Current • "+new Date(c.time||Date.now()).toLocaleTimeString([],{hour:"2-digit",minute:"2-digit"});
 $("weatherIcon").textContent=weatherEmoji(calc.weatherCode);$("temp").textContent=Math.round(c.temperature_2m)+"°";$("rain24").textContent=calc.rain24.toFixed(1);$("humidity").textContent=Math.round(c.relative_humidity_2m);$("wind").textContent=Math.round(c.wind_speed_10m);
 $("predictionText").textContent=calc.level+" risk";$("predictionScore").textContent=calc.score+"%";
 $("predictionScore").style.color=riskColor(calc.score);
 $("priorityRow").innerHTML=sorted.slice(0,5).map(r=>`<div class="priority-card" onclick="openZoneFromState('${r.state}')"><small>${escapeHtml(r.state)}</small><b>${escapeHtml(r.city)}</b><strong>${r.calc.score}</strong><em style="color:${riskColor(r.calc.score)}">${r.calc.level}</em></div>`).join("");
 $("stateBars").innerHTML=sorted.map(r=>`<i style="height:${Math.max(15,r.calc.score)}%;background:${riskColor(r.calc.score)}"></i>`).join("");
 $("statesGrid").innerHTML=rows.map(r=>`<div class="state-card" onclick="openZoneFromState('${r.state}')"><div class="state-card-head"><small>${escapeHtml(r.state)}</small><span class="sensor-count">⌁ ${r.sensors||0} sensors</span></div><b>${escapeHtml(r.city)}</b><strong>${r.calc.score}</strong><em style="color:${riskColor(r.calc.score)}">${r.calc.level}</em><small class="sensor-note">${r.sensors?"Sensors connected":"No sensors deployed"}</small></div>`).join("");
 renderMap();renderAlerts();
}

function openZoneFromState(state){
 const r=rows.find(x=>x.state===state);if(!r)return;
 toast(`${r.state}: ${r.calc.level} risk • ${r.calc.score}/100`);
 openScreen("mapScreen");
 if(map)map.setView([r.lat,r.lon],8);
}

// V16: district-level NER risk map.
// The district boundary dataset contains NAME_1 = state and NAME_2 = district.
const DISTRICT_GEO_URL =
  "https://raw.githubusercontent.com/geohacker/india/master/district/india_district.geojson";

const NER_STATES = new Set([
  "Arunachal Pradesh",
  "Assam",
  "Manipur",
  "Meghalaya",
  "Mizoram",
  "Nagaland",
  "Sikkim",
  "Tripura"
]);

let districtGeoCache=null;

function normalizeGeoName(v){
  return String(v||"")
    .trim()
    .replace(/\s+/g," ")
    .replace("Jammu & Kashmir","Jammu and Kashmir");
}

async function getDistrictGeo(){
  if(districtGeoCache)return districtGeoCache;
  const response=await fetch(DISTRICT_GEO_URL);
  if(!response.ok)throw new Error("District boundary data unavailable");
  districtGeoCache=await response.json();
  return districtGeoCache;
}

function initMap(){
 if(typeof L==="undefined")return;

 map=L.map("map",{
   zoomControl:false,
   attributionControl:true,
   preferCanvas:false
 }).setView([25.8,92.7],6);

 L.control.zoom({position:"topright"}).addTo(map);

 L.tileLayer(
   "https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}",
   {maxZoom:18,attribution:"Tiles © Esri"}
 ).addTo(map);
}

async function renderMap(){
 if(!map)return;

 mapLayers.forEach(x=>map.removeLayer(x));
 mapLayers=[];

 try{
   const allDistricts=await getDistrictGeo();
   const nerDistricts=allDistricts.features.filter(f=>
     NER_STATES.has(normalizeGeoName(f.properties?.NAME_1))
   );

   const stateRows=new Map(rows.map(r=>[normalizeGeoName(r.state),r]));
   const districtGroup=L.featureGroup();

   nerDistricts.forEach(feature=>{
     const props=feature.properties||{};
     const stateName=normalizeGeoName(props.NAME_1);
     const districtName=normalizeGeoName(props.NAME_2) || "District";
     const stateRow=stateRows.get(stateName);

     // Until district-specific weather/sensor feeds are connected,
     // the district inherits the live risk level of its state.
     const score=stateRow?.calc?.score ?? 0;
     const level=stateRow?.calc?.level ?? "Low";
     const color=riskColor(score);

     const district=L.geoJSON(feature,{
       style:{
         color:"rgba(255,255,255,.78)",
         weight:1.2,
         opacity:1,
         fillColor:color,
         fillOpacity:.76,
         lineJoin:"round"
       },
       onEachFeature:(f,layer)=>{
         // Permanent district name — not just the state name.
         layer.bindTooltip(
           `<div class="district-name-label">
              <strong>${escapeHtml(districtName)}</strong>
              <span>${escapeHtml(stateName)}</span>
              <em>${escapeHtml(level)} · ${score}/100</em>
            </div>`,
           {
             permanent:true,
             direction:"center",
             className:"district-tooltip",
             opacity:1
           }
         );

         layer.bindPopup(
           `<div class="region-popup">
              <b>${escapeHtml(districtName)}</b>
              <span>${escapeHtml(stateName)}</span>
              <strong style="color:${color}">${escapeHtml(level)} RISK · ${score}/100</strong>
              <small>Live regional risk • ${stateRow?.sensors||0} connected sensors</small>
            </div>`
         );

         layer.on("mouseover",()=>{
           layer.setStyle({
             weight:2.2,
             color:"#ffffff",
             fillColor:color,
             fillOpacity:.90
           });
         });

         layer.on("mouseout",()=>{
           layer.setStyle({
             weight:1.2,
             color:"rgba(255,255,255,.78)",
             fillColor:color,
             fillOpacity:.76
           });
         });

         layer.on("click",()=>{
           toast(`${districtName}, ${stateName}: ${level} risk • ${score}/100`);
         });
       }
     }).addTo(map);

     districtGroup.addLayer(district);
     mapLayers.push(district);
   });

   if(districtGroup.getLayers().length){
     map.fitBounds(districtGroup.getBounds().pad(.04),{
       padding:[8,8],
       maxZoom:7
     });
   }

   $("mapList").innerHTML=[...rows]
     .sort((a,b)=>b.calc.score-a.calc.score)
     .map(r=>`
       <div class="map-row" onclick="openZoneFromState('${r.state}')">
         <i class="dot" style="background:${riskColor(r.calc.score)}"></i>
         <div>
           <small>${escapeHtml(r.state)}</small>
           <b>District-level monitoring</b>
           <small class="map-sensor-line">⌁ ${r.sensors||0} sensors active</small>
         </div>
         <strong style="color:${riskColor(r.calc.score)}">${r.calc.score}</strong>
       </div>`
     ).join("");

 }catch(error){
   console.error("District map failed:",error);
   toast("District map data could not be loaded");
 }
}

function locateOnMap(){
 if(!navigator.geolocation){toast("GPS unavailable");return}
 navigator.geolocation.getCurrentPosition(p=>{if(map)map.setView([p.coords.latitude,p.coords.longitude],10);toast("Map centered on your location")},()=>toast("Location permission denied"));
}

function getReports(){return JSON.parse(localStorage.getItem("landsafeReports")||"[]")}
function renderAlerts(){
 const reports=getReports(),risk=rows.filter(r=>r.calc.score>=65).sort((a,b)=>b.calc.score-a.calc.score);
 let items=[];
 if(activeAlertFilter!=="community")items.push(...risk.map(r=>({kind:"risk",time:new Date().toISOString(),html:`<article class="alert-item"><div class="alert-icon">⚠</div><main><b>${escapeHtml(r.city)}, ${escapeHtml(r.state)}</b><p>${escapeHtml(r.calc.reasons[0])}</p><small>AI weather-linked risk • updated live</small></main><strong class="score" style="color:${riskColor(r.calc.score)}">${r.calc.score}</strong></article>`})));
 if(activeAlertFilter!=="risk")items.push(...reports.map(r=>({kind:"community",time:r.reported_at,html:`<article class="alert-item community"><div class="alert-icon">📍</div><main><b>${escapeHtml(r.category)} <span class="tag">FIELD REPORT</span></b><p>${escapeHtml(r.description||"No description provided.")}</p><small>${new Date(r.reported_at).toLocaleString()} • ${r.latitude&&r.longitude?`${Number(r.latitude).toFixed(5)}, ${Number(r.longitude).toFixed(5)}`:"Location not attached"}${r.image?" • 📷 photo":""}</small></main><strong class="score" style="color:var(--green)">NEW</strong></article>`})));
 items.sort((a,b)=>new Date(b.time)-new Date(a.time));
 $("alertCount").textContent=items.length;$("navDot").style.display=items.length?"block":"none";
 $("alertSummaryTitle").textContent=items.length?`${items.length} active item${items.length===1?"":"s"} need attention`:"No active alerts";
 $("alertSummarySub").textContent=reports.length?`${risk.length} AI risk alerts • ${reports.length} community report${reports.length===1?"":"s"}`:"Monitoring weather thresholds and community reports";
 $("alertList").innerHTML=items.length?items.map(x=>x.html).join(""):`<div class="glass-card" style="padding:24px;text-align:center;border-radius:18px;color:#8198aa;font-size:8px">No alerts or community reports yet.</div>`;
}

function attachReportLocation(){
 if(!navigator.geolocation){toast("GPS unavailable");return}
 toast("Requesting location…");
 navigator.geolocation.getCurrentPosition(p=>{
  reportCoords={lat:p.coords.latitude,lon:p.coords.longitude};
  $("reportLocation").textContent=`${p.coords.latitude.toFixed(5)}, ${p.coords.longitude.toFixed(5)}`;
  toast("Location attached ✓");
 },()=>toast("Could not access location"));
}
function previewFile(file){
 if(!file)return;
 const box=$("photoPreview");box.hidden=false;
 box.innerHTML=`<img src="${URL.createObjectURL(file)}" alt="Evidence preview"><div style="padding:6px 8px">${escapeHtml(file.name)}</div>`;
}
$("camera").addEventListener("change",e=>previewFile(e.target.files[0]));
$("gallery").addEventListener("change",e=>previewFile(e.target.files[0]));


/* ============================================================
   GEOGUARD V18 — Firebase integration
   The reference UI above is presentation. Firebase remains the
   authoritative realtime source for state, alerts, reports and SOS.
   ============================================================ */
import { initializeApp } from "https://www.gstatic.com/firebasejs/12.18.0/firebase-app.js";
import {
  getDatabase, ref, onValue, onChildAdded, onChildChanged,
  onChildRemoved, push, update, serverTimestamp
} from "https://www.gstatic.com/firebasejs/12.18.0/firebase-database.js";
import { firebaseConfig } from "../firebase-config.js";
import { STATES as SHARED_STATES, riskColor as sharedRiskColor, level as sharedLevel } from "../shared/states.js";

const firebaseApp=initializeApp(firebaseConfig);
const db=getDatabase(firebaseApp);
const CLIENT_ID_KEY="horizon_client_id_v18";
const clientId=localStorage.getItem(CLIENT_ID_KEY) || (crypto?.randomUUID?.()||("client-"+Date.now()));
localStorage.setItem(CLIENT_ID_KEY,clientId);

let firebaseSnapshot=null;
let firebaseReports=[];
const alertStore=new Map();
let firebaseDispatches=[];
let mySos=[];
let currentSosKey=null;
let sosWatch=null;
let sosStartedAt=null;
let reportCoords=null;

const stateNames=["Arunachal Pradesh","Assam","Manipur","Meghalaya","Mizoram","Nagaland","Sikkim","Tripura"];
const esc=v=>String(v??"").replace(/[&<>"']/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#039;"}[c]));

function toast(msg){
  const t=$("toast");
  if(!t)return;
  t.textContent=msg;t.classList.add("show");
  clearTimeout(toast.t);toast.t=setTimeout(()=>t.classList.remove("show"),2400);
}

function syncRowsFromFirebase(){
  const st=firebaseSnapshot?.states;
  if(!Array.isArray(st) || !st.length) return false;

  rows=st.map((s,i)=>{
    const score=Number(s.score||0);
    const temperature=Number(s.temperature||0);
    const rain=Number(s.rain||0);
    const humidity=Number(s.humidity||0);
    const wind=Number(s.wind||0);
    return {
      state:s.name||stateNames[i]||"North-East State",
      city:s.capital||"Regional",
      lat:Number(s.lat||SHARED_STATES[i]?.lat||25.5),
      lon:Number(s.lon||SHARED_STATES[i]?.lon||92.8),
      sensors:Number(s.sensors||0),
      weather:{current:{
        time:firebaseSnapshot.updatedAt||Date.now(),
        temperature_2m:temperature,
        relative_humidity_2m:humidity,
        wind_speed_10m:wind
      }},
      calc:{
        score,
        level:s.level||sharedLevel(score),
        weatherCode:0,
        rain24:rain,
        reasons:[s.reason||`${s.level||sharedLevel(score)} regional risk score from Firebase`]
      }
    };
  });
  return true;
}

function renderFirebaseHome(){
  if(!syncRowsFromFirebase()) return;
  renderAll();

  const regional=firebaseSnapshot.regional||{};
  const score=Number(regional.score ?? Math.round(rows.reduce((a,r)=>a+r.calc.score,0)/rows.length));
  $("avgRisk").textContent=score;
  $("stateAvg").textContent=score;
  $("regionalLevel").textContent=regional.level||sharedLevel(score);
  $("highCount").textContent=rows.filter(r=>r.calc.score>=65).length;
  $("totalSensors").textContent=rows.reduce((n,r)=>n+r.sensors,0);
  $("sensorTotalLarge").textContent=rows.reduce((n,r)=>n+r.sensors,0)+" ACTIVE SENSORS";

  const first=[...rows].sort((a,b)=>b.calc.score-a.calc.score)[0]||rows[0];
  if(first){
    const c=first.weather.current;
    $("featuredState").textContent=first.state.toUpperCase();
    $("featuredCity").textContent=first.city;
    $("featuredTime").textContent="Shared Firebase • "+new Date(c.time||Date.now()).toLocaleTimeString([],{hour:"2-digit",minute:"2-digit"});
    $("temp").textContent=Math.round(c.temperature_2m)+"°";
    $("rain24").textContent=Number(first.calc.rain24).toFixed(1);
    $("humidity").textContent=Math.round(c.relative_humidity_2m);
    $("wind").textContent=Math.round(c.wind_speed_10m);
    $("predictionText").textContent=(regional.forecastText||first.calc.level+" risk");
    $("predictionScore").textContent=(regional.forecastScore??score)+"%";
    $("predictionScore").style.color=sharedRiskColor(Number(regional.forecastScore??score));
  }
  $("updated").textContent=firebaseSnapshot.updatedAt
    ? "Synced "+new Date(Number(firebaseSnapshot.updatedAt)).toLocaleTimeString([],{hour:"2-digit",minute:"2-digit"})
    : "Firebase connected";
  renderStateBars();
  renderMapList();
  updateBoundaryColors();
}

function renderStateBars(){
  if(!$("stateBars"))return;
  const max=Math.max(100,...rows.map(r=>r.calc.score));
  $("stateBars").innerHTML=rows.map(r=>`<i title="${esc(r.state)}: ${r.calc.score}" style="height:${Math.max(15,(r.calc.score/max)*100)}%;background:${sharedRiskColor(r.calc.score)}"></i>`).join("");
  $("statesGrid").innerHTML=rows.map(r=>`
    <div class="state-card" onclick="openZoneFromState('${esc(r.state).replace(/'/g,"\\'")}')">
      <div class="state-card-head"><small>${esc(r.state)}</small><span class="sensor-count">⌁ ${r.sensors} sensors</span></div>
      <b>${esc(r.city)}</b><strong>${r.calc.score}</strong>
      <em style="color:${sharedRiskColor(r.calc.score)}">${esc(r.calc.level)}</em>
      <small class="sensor-note">Shared live reading</small>
    </div>`).join("");
}

function renderMapList(){
  const el=$("mapList"); if(!el)return;
  const sorted=[...rows].sort((a,b)=>b.calc.score-a.calc.score);
  el.innerHTML=sorted.map(r=>`
    <div class="map-row">
      <div><b>${esc(r.state)}</b><small>${esc(r.city)}</small></div>
      <strong style="color:${sharedRiskColor(r.calc.score)}">${r.calc.score}</strong>
    </div>`).join("");
}

function renderFirebaseAlerts(){
  const list=$("alertList"); if(!list)return;
  const arr=Array.from(alertStore.values()).sort((a,b)=>Number(b.createdAt||0)-Number(a.createdAt||0));
  $("alertCount").textContent=arr.length;
  $("navDot").style.display=arr.length?"block":"none";
  $("alertSummaryTitle").textContent=arr.length?`${arr.length} active broadcast${arr.length===1?"":"s"}`:"Monitoring all zones";
  $("alertSummarySub").textContent=arr.length?"Live messages from the regional control room":"Weather thresholds and community reports";

  list.innerHTML=arr.length?arr.map(a=>`
    <article class="alert-item">
      <div class="alert-icon">🚨</div>
      <main><b>${esc(a.title||"Regional Alert")} <span class="tag">${esc(a.severity||"INFO")}</span></b>
      <p>${esc(a.message||"")}</p>
      <small>${esc(Array.isArray(a.targetStates)?a.targetStates.join(", "):(a.targetStates||"ALL"))} • ${a.createdAt?new Date(Number(a.createdAt)).toLocaleString():"Just now"}</small></main>
      <strong class="score" style="color:${a.severity==="CRITICAL"||a.severity==="HIGH"?"#ff6570":"#e5c95c"}">${esc(a.severity||"INFO")}</strong>
    </article>`).join("")
    : `<div class="glass-card" style="padding:24px;text-align:center;border-radius:18px;color:#8198aa;font-size:8px">No alerts yet.</div>`;
}

function renderFirebaseReports(){
  const list=firebaseReports.map(r=>({
    kind:"community",time:r.createdAt,
    html:`<article class="alert-item community"><div class="alert-icon">📍</div><main>
      <b>${esc(r.category||"Hazard")} <span class="tag">FIELD REPORT</span></b>
      <p>${esc(r.description||"No description provided.")}</p>
      <small>${esc(r.city||r.state||"North-East India")} • ${r.createdAt?new Date(Number(r.createdAt)).toLocaleString():"Just now"}</small>
    </main><strong class="score" style="color:var(--green)">NEW</strong></article>`
  }));
  return list;
}

/* Firebase-backed alert history, including community reports. */
function renderAlerts(){
  const riskItems=rows.filter(r=>r.calc.score>=65).map(r=>({
    kind:"risk",time:firebaseSnapshot?.updatedAt||0,
    html:`<article class="alert-item"><div class="alert-icon">⚠</div><main><b>${esc(r.city)}, ${esc(r.state)}</b><p>${esc(r.calc.reasons[0])}</p><small>AI weather-linked risk • shared live reading</small></main><strong class="score" style="color:${sharedRiskColor(r.calc.score)}">${r.calc.score}</strong></article>`
  }));
  const broadcast=Array.from(alertStore.values()).map(a=>({
    kind:"broadcast",time:a.createdAt||0,
    html:`<article class="alert-item"><div class="alert-icon">🚨</div><main><b>${esc(a.title||"Regional Alert")} <span class="tag">${esc(a.severity||"INFO")}</span></b><p>${esc(a.message||"")}</p><small>${esc(Array.isArray(a.targetStates)?a.targetStates.join(", "):(a.targetStates||"ALL"))} • ${a.createdAt?new Date(Number(a.createdAt)).toLocaleString():"Just now"}</small></main><strong class="score" style="color:#78b9ff">LIVE</strong></article>`
  }));
  const community=activeAlertFilter==="risk"?[]:renderFirebaseReports();
  const ai=activeAlertFilter==="community"?[]:riskItems;
  const br=activeAlertFilter==="community"?broadcast:broadcast;
  const items=[...ai,...community,...br].sort((a,b)=>Number(b.time)-Number(a.time));
  $("alertCount").textContent=items.length;
  $("navDot").style.display=items.length?"block":"none";
  $("alertSummaryTitle").textContent=items.length?`${items.length} live item${items.length===1?"":"s"} need attention`:"No active alerts";
  $("alertSummarySub").textContent="Broadcasts, AI risk and community reports";
  $("alertList").innerHTML=items.length?items.map(x=>x.html).join(""):`<div class="glass-card" style="padding:24px;text-align:center;border-radius:18px;color:#8198aa;font-size:8px">No alerts or reports yet.</div>`;
}

function addBroadcastToast(a){
  toast(`🚨 ${a.title||"New regional alert"}`);
}

function showClientAlert(a){
  addBroadcastToast(a);
}

/* ---------- MAP: preserve v16 state-boundary behavior ---------- */
let boundaryMap=null, boundaryLayers=[];
async function initMap(){
  if(typeof L==="undefined" || !$("map"))return;
  if(boundaryMap){setTimeout(()=>boundaryMap.invalidateSize(),80);return;}
  boundaryMap=L.map("map",{zoomControl:false,attributionControl:true,preferCanvas:true}).setView([25.5,92.8],6);
  L.control.zoom({position:"topright"}).addTo(boundaryMap);
  L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png",{maxZoom:12,attribution:"© OpenStreetMap"}).addTo(boundaryMap);
  try{
    const res=await fetch("https://raw.githubusercontent.com/AbhinavSwami28/india-official-geojson/refs/heads/main/india-states-simplified.geojson");
    const data=await res.json();
    const features=data.features.filter(f=>stateNames.includes(f.properties?.NAME_1));
    const geo=L.geoJSON(features,{
      style:f=>{
        const r=rows.find(x=>x.state===f.properties?.NAME_1);
        return {color:"#fff",weight:1.5,opacity:.9,fillColor:sharedRiskColor(Number(r?.calc.score||0)),fillOpacity:.72};
      },
      onEachFeature:(f,layer)=>{
        const name=f.properties?.NAME_1||"State";
        layer.bindTooltip(name,{sticky:true});
        layer.on({mouseover:e=>e.target.setStyle({weight:2.5,fillOpacity:.86}),mouseout:e=>geo.resetStyle(e.target)});
        boundaryLayers.push({layer,name});
      }
    }).addTo(boundaryMap);
    boundaryMap.fitBounds(geo.getBounds(),{padding:[10,10]});
  }catch(e){console.error(e);toast("Map boundary data unavailable");}
}
function updateBoundaryColors(){
  boundaryLayers.forEach(x=>{
    const r=rows.find(v=>v.state===x.name);
    x.layer.setStyle({fillColor:sharedRiskColor(Number(r?.calc.score||0))});
  });
}
function locateOnMap(){
  if(!navigator.geolocation){toast("GPS unavailable");return}
  navigator.geolocation.getCurrentPosition(p=>{
    if(boundaryMap){boundaryMap.setView([p.coords.latitude,p.coords.longitude],10)}
    toast("Map centered on your location");
  },()=>toast("Could not access location"));
}
window.locateOnMap=locateOnMap;

/* ---------- REPORT → Firebase ---------- */
window.attachReportLocation=function(){
  if(!navigator.geolocation){toast("GPS unavailable");return}
  toast("Requesting location…");
  navigator.geolocation.getCurrentPosition(p=>{
    reportCoords={lat:p.coords.latitude,lon:p.coords.longitude};
    $("reportLocation").textContent=`${p.coords.latitude.toFixed(5)}, ${p.coords.longitude.toFixed(5)}`;
    toast("Location attached ✓");
  },()=>toast("Could not access location"));
};

$("camera")?.addEventListener("change",e=>{
  const f=e.target.files?.[0]; if(!f)return;
  $("photoPreview").hidden=false;
  $("photoPreview").innerHTML=`<img src="${URL.createObjectURL(f)}" alt="Evidence preview"><div style="padding:6px 8px">${esc(f.name)}</div>`;
});
$("gallery")?.addEventListener("change",e=>{
  const f=e.target.files?.[0]; if(!f)return;
  $("photoPreview").hidden=false;
  $("photoPreview").innerHTML=`<img src="${URL.createObjectURL(f)}" alt="Evidence preview"><div style="padding:6px 8px">${esc(f.name)}</div>`;
});

$("submitReport")?.addEventListener("click",async()=>{
  const type=$("reportType").value;
  const desc=$("reportDescription").value.trim();
  if(!type){toast("Select an incident type");return}
  try{
    await push(ref(db,"reports"),{
      category:type,description:desc,
      latitude:reportCoords?.lat||null,longitude:reportCoords?.lon||null,
      state:"North-East India",city:"Community report",
      status:"UNVERIFIED",createdAt:serverTimestamp()
    });
    $("reportType").value="";$("reportDescription").value="";
    $("photoPreview").hidden=true;$("photoPreview").innerHTML="";
    reportCoords=null;$("reportLocation").textContent="Not attached";
    toast("Field report sent to control room ✓");
    openScreen("alertsScreen");
  }catch(e){console.error(e);toast("Could not send field report");}
});

/* ---------- SOS → Firebase → Rescue Ops ---------- */
window.startSOS=function(){
  $("sosLayer").hidden=false;
  $("sosConsent").hidden=false;
  $("sosActivePanel").hidden=true;
  $("sosHeading").textContent="Activate SOS?";
  $("sosMessage").textContent="Your live location will be shared with the control room after you confirm.";
};

window.cancelSOS=function(){
  if(sosWatch!==null){navigator.geolocation.clearWatch(sosWatch);sosWatch=null}
  $("sosLayer").hidden=true;
};

window.confirmSOS=async function(){
  if(!navigator.geolocation){toast("GPS unavailable on this device");return}
  if(!window.confirm("Activate SOS and share your live location?"))return;
  sosStartedAt=Date.now();
  $("sosConsent").hidden=true;$("sosActivePanel").hidden=false;
  $("sosHeading").textContent="SOS active";
  $("sosMessage").textContent="Live location sharing is now active.";
  $("sosStatus").textContent="Requesting GPS permission…";
  $("sosTime").textContent="Report time • "+new Date(sosStartedAt).toLocaleString();

  try{
    const created=await push(ref(db,"sos"),{
      userName:"Mobile User",clientId,
      state:"North-East India",latitude:null,longitude:null,
      note:"Emergency SOS from Horizon mobile client",
      status:"ACTIVE",responseStatus:"WAITING",createdAt:serverTimestamp()
    });
    currentSosKey=created.key;
    toast("SOS sent to control room ✓");
  }catch(e){
    console.error(e);toast("SOS could not be sent");return;
  }

  sosWatch=navigator.geolocation.watchPosition(async p=>{
    const payload={
      latitude:p.coords.latitude,longitude:p.coords.longitude,
      accuracy:p.coords.accuracy,lastLocationAt:serverTimestamp()
    };
    if(currentSosKey) update(ref(db,"sos/"+currentSosKey),payload);
    $("sosStatus").textContent="SOS active • live location sharing";
    $("sosTime").textContent="Updated "+new Date().toLocaleTimeString();
    $("sosLocation").textContent=`${p.coords.latitude.toFixed(6)}, ${p.coords.longitude.toFixed(6)}`;
    $("sosAccuracy").textContent=`GPS accuracy ±${Math.round(p.coords.accuracy)} m`;
  },()=>{
    $("sosStatus").textContent="SOS active • GPS signal unavailable";
  },{enableHighAccuracy:true,maximumAge:5000,timeout:10000});
};

window.stopSOS=async function(){
  if(sosWatch!==null){navigator.geolocation.clearWatch(sosWatch);sosWatch=null}
  if(currentSosKey){
    try{await update(ref(db,"sos/"+currentSosKey),{status:"RESOLVED",responseStatus:"CLOSED",closedAt:serverTimestamp()})}catch(e){console.error(e)}
  }
  $("sosLayer").hidden=true;
  toast("SOS stopped • location sharing ended");
};

function renderMyRescueStatus(){
  const latest=mySos.slice().sort((a,b)=>Number(b.createdAt||0)-Number(a.createdAt||0))[0];
  if(!latest)return;
  const linked=firebaseDispatches.filter(d=>d.sosId===latest.id).sort((a,b)=>Number(b.createdAt||0)-Number(a.createdAt||0))[0];
  const title=linked?`🚑 ${linked.unitId||"RESCUE UNIT"} DISPATCHED`:String(latest.responseStatus||"WAITING")==="DISPATCHED"?"🚑 RESCUE DISPATCHED":"🆘 SOS SENT";
  $("sosStatus") && ( $("sosStatus").textContent=title );
}

/* ---------- REALTIME LISTENERS ---------- */
onValue(ref(db,"state"),snap=>{
  firebaseSnapshot=snap.val();
  if(firebaseSnapshot)renderFirebaseHome();
},e=>{console.error(e);$("updated").textContent="Firebase connection error"});

onChildAdded(ref(db,"alerts"),snap=>{
  const a={id:snap.key,...(snap.val()||{})};
  const fresh=!alertStore.has(a.id);
  alertStore.set(a.id,a);
  renderAlerts();
  if(fresh)showClientAlert(a);
});
onChildChanged(ref(db,"alerts"),snap=>{
  alertStore.set(snap.key,{id:snap.key,...(snap.val()||{})});
  renderAlerts();
});
onChildRemoved(ref(db,"alerts"),snap=>{
  alertStore.delete(snap.key);renderAlerts();
});

onValue(ref(db,"reports"),snap=>{
  firebaseReports=[];
  snap.forEach(x=>firebaseReports.push({id:x.key,...(x.val()||{})}));
  firebaseReports.sort((a,b)=>Number(b.createdAt||0)-Number(a.createdAt||0));
  renderAlerts();
});

onValue(ref(db,"dispatches"),snap=>{
  firebaseDispatches=[];
  snap.forEach(x=>firebaseDispatches.push({id:x.key,...(x.val()||{})}));
  firebaseDispatches.sort((a,b)=>Number(b.createdAt||0)-Number(a.createdAt||0));
  renderMyRescueStatus();
});

onValue(ref(db,"sos"),snap=>{
  mySos=[];
  snap.forEach(x=>{
    const v=x.val()||{};
    if(v.clientId===clientId)mySos.push({id:x.key,...v});
  });
  mySos.sort((a,b)=>Number(b.createdAt||0)-Number(a.createdAt||0));
  renderMyRescueStatus();
});

/* ---------- UI INIT ---------- */
document.addEventListener("DOMContentLoaded",()=>{
  // The reference navigation is preserved.
  document.querySelectorAll(".nav").forEach(n=>n.addEventListener("click",()=>openScreen(n.dataset.target)));
  document.querySelectorAll(".filter").forEach(b=>b.addEventListener("click",()=>{
    document.querySelectorAll(".filter").forEach(x=>x.classList.remove("active"));
    b.classList.add("active");activeAlertFilter=b.dataset.filter;renderAlerts();
  }));

  $("refreshBtn")?.addEventListener("click",()=>toast("Refreshing shared Firebase readings…"));
  initMap();
  renderFirebaseHome();
  renderAlerts();
});
