import {initializeApp} from "https://www.gstatic.com/firebasejs/12.18.0/firebase-app.js";
import {getDatabase,ref,onValue,push,update,serverTimestamp,set} from "https://www.gstatic.com/firebasejs/12.18.0/firebase-database.js";
import {firebaseConfig} from "../firebase-config.js";
import {STATES,riskColor,level} from "../shared/states.js";
const app=initializeApp(firebaseConfig),db=getDatabase(app);let snapshot=null,reports=[],sos=[],alerts=[],maps={},layers={};
const $=id=>document.getElementById(id),esc=v=>String(v??"").replace(/[&<>"']/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#039;"}[c])),tm=v=>new Date(v||Date.now()).toLocaleTimeString([],{hour:"2-digit",minute:"2-digit"});
window.invalidateHorizonMaps=()=>{Object.values(maps).forEach(m=>{try{m.invalidateSize()}catch(e){}})};
window.renderCurrentPage=()=>{try{if(document.getElementById("reports")?.classList.contains("active"))window.renderReports();}catch(e){}try{if(document.getElementById("sos")?.classList.contains("active"))window.renderSOS();}catch(e){}try{if(document.getElementById("broadcast")?.classList.contains("active"))renderBroadcasts();}catch(e){}try{if(document.getElementById("rescue")?.classList.contains("active"))renderRescue();}catch(e){}};;
onValue(ref(db,"state"),s=>{snapshot=s.val();renderState();$("status").textContent="Realtime Database connected";},e=>{$("status").textContent="Firebase read error";});
onValue(ref(db,"reports"),s=>{reports=[];s.forEach(x=>reports.push({id:x.key,...x.val()}));reports.sort((a,b)=>(b.createdAt||0)-(a.createdAt||0));renderAll();},e=>{$("status").textContent="Reports read error";});
onValue(ref(db,"sos"),s=>{sos=[];s.forEach(x=>sos.push({id:x.key,...x.val()}));sos.sort((a,b)=>(b.createdAt||0)-(a.createdAt||0));renderAll();},e=>{$("status").textContent="SOS read error";});
onValue(ref(db,"alerts"),s=>{alerts=[];s.forEach(x=>alerts.push({id:x.key,...x.val()}));alerts.sort((a,b)=>(b.createdAt||0)-(a.createdAt||0));renderAll();},e=>{$("status").textContent="Alerts read error";});
function renderState(){if(!snapshot?.states)return;$("risk").textContent=snapshot.regional.level;$("riskScore").textContent=`${snapshot.regional.score}/100 · same reading used by client`;$("updated").textContent=tm(snapshot.updatedAt);$("priority").innerHTML=snapshot.states.slice().sort((a,b)=>b.score-a.score).slice(0,6).map((s,i)=>`<div class="priority"><span>0${i+1}</span><i style="width:7px;height:7px;border-radius:50%;background:${riskColor(s.score)}"></i><div class="grow"><b>${esc(s.name)}</b><small>${esc(s.capital)} · ${safeNum(s.temperature).toFixed(1)}°C · Rain ${safeNum(s.rain).toFixed(1)} mm · Hum ${s.humidity}%</small></div><strong style="color:${riskColor(s.score)}">${s.score}</strong></div>`).join("");updateColors()}
function safeNum(v, fallback=0){const n=Number(v);return Number.isFinite(n)?n:fallback}
function renderAll(){
  try{renderCounts()}catch(e){}
  try{renderLatestReports()}catch(e){}
  try{renderLatestSOS()}catch(e){}
  try{renderLatestAlerts()}catch(e){}
  try{window.renderReports()}catch(e){}
  try{window.renderSOS()}catch(e){}
  try{renderBroadcasts()}catch(e){}
  try{renderRescue()}catch(e){}
}
function renderCounts(){
  const ar=reports.filter(r=>!["REJECTED","RESOLVED"].includes(String(r.status||"").toUpperCase())).length;
  const as=sos.filter(x=>String(x.status||"ACTIVE").toUpperCase()==="ACTIVE").length;
  $("reports").textContent=ar;$("sos").textContent=as;$("reportCount").textContent=ar;$("sosCount").textContent=as;
}
function renderLatestReports(){
  $("latestReports").innerHTML=reports.slice(0,4).map(r=>`<div class=item><span class=pill>${esc(r.status||"UNVERIFIED")}</span><b>⚠ ${esc(r.category||"Hazard report")}</b><small>📍 ${esc(r.city||r.state||"Location not provided")} · ${tm(r.createdAt)}</small></div>`).join("")||"<div class=item>No reports.</div>";
}
function renderLatestSOS(){
  $("latestSOS").innerHTML=sos.filter(x=>String(x.status||"ACTIVE").toUpperCase()!=="RESOLVED").slice(0,3).map(x=>{
    const lat=x.latitude!=null?safeNum(x.latitude).toFixed(5):null,lon=x.longitude!=null?safeNum(x.longitude).toFixed(5):null;
    return `<div class=mini><span class=pill>ACTIVE</span><b>⌁ ${esc(x.userName||"Mobile User")}</b><small>${lat!=null?lat+", "+lon:"GPS pending"} · ${tm(x.createdAt)}</small></div>`;
  }).join("")||"<div class=mini>No active SOS.</div>";
}
function renderLatestAlerts(){
  $("latestAlerts").innerHTML=alerts.slice(0,4).map(a=>`<div class=item><span class=pill>${esc(a.severity||"INFO")}</span><b>🚨 ${esc(a.title||"Alert")}</b><small>${esc(a.message||"")}</small></div>`).join("")||"<div class=item>No alerts.</div>";
}
window.renderReports=()=>{
  const f=$("filter")?.value||"ALL";
  const d=reports.filter(r=>f==="ALL"||String(r.status||"UNVERIFIED").toUpperCase()===f);
  $("reportTable").innerHTML=`<table><thead><tr><th>REPORT</th><th>LOCATION</th><th>STATUS</th><th>ACTION</th></tr></thead><tbody>${
    d.map(r=>`<tr><td><b>${esc(r.category||"Hazard report")}</b><small>${esc(r.description||"No description")}</small></td><td>${esc(r.city||r.state||"Not provided")}</td><td><span class=pill>${esc(r.status||"UNVERIFIED")}</span></td><td><button class="action green" onclick="setReport('${r.id}','VERIFIED')">Verify</button><button class="action" onclick="setReport('${r.id}','UNDER REVIEW')">Review</button><button class="action red" onclick="setReport('${r.id}','REJECTED')">Reject</button></td></tr>`).join("")
  }</tbody></table>`;
};
window.setReport=(id,status)=>update(ref(db,"reports/"+id),{status,statusUpdatedAt:serverTimestamp()});
window.renderSOS=()=>{
  $("sosTable").innerHTML=`<table><thead><tr><th>USER</th><th>GPS</th><th>STATUS</th><th>TIME</th><th>ACTION</th></tr></thead><tbody>${
    sos.map(x=>{const lat=x.latitude!=null?safeNum(x.latitude).toFixed(6):null,lon=x.longitude!=null?safeNum(x.longitude).toFixed(6):null;
      return `<tr><td><b>⌁ ${esc(x.userName||"Mobile User")}</b><small>${esc(x.note||"SOS request")}</small></td><td>${lat!=null?lat+", "+lon:"GPS pending"}</td><td><span class=pill>${esc(x.status||"ACTIVE")}</span></td><td>${new Date(x.createdAt||Date.now()).toLocaleString()}</td><td>${String(x.status||"ACTIVE").toUpperCase()==="RESOLVED"?"—":`<button class="action green" onclick="resolveSOS('${x.id}')">Resolve</button>`}</td></tr>`;
    }).join("")
  }</tbody></table>`;
};
window.resolveSOS=id=>update(ref(db,"sos/"+id),{status:"RESOLVED",resolvedAt:serverTimestamp()});
function renderBroadcasts(){$("broadcastList").innerHTML=alerts.slice(0,8).map(a=>`<div class=item><span class=pill>${esc(a.severity||"INFO")}</span><b>🚨 ${esc(a.title||"Alert")}</b><small>${esc(a.message||"")}</small></div>`).join("")||"<div class=item>No broadcasts yet.</div>"}
function renderRescue(){const a=sos.filter(x=>String(x.status||"ACTIVE").toUpperCase()==="ACTIVE");$("rescueGrid").innerHTML=a.map((x,i)=>`<div class="card rescue"><h3>Response Unit ${String(i+1).padStart(2,"0")}</h3><p>${esc(x.userName||"Mobile user")}</p><div class=unit>INCIDENT: SOS ACTIVE<br><br>LOCATION: ${x.latitude!=null?safeNum(x.latitude).toFixed(5)+", "+safeNum(x.longitude).toFixed(5):"GPS pending"}</div></div>`).join("")||"<div class='card rescue'>No active rescue operations.</div>"}


window.sendAlert=async()=>{
  const title=$("alertTitle").value.trim(), message=$("alertMessage").value.trim();
  if(!title||!message){ $("alertStatus").textContent="Title and message are required."; return; }
  const target=[...document.querySelectorAll("#stateChecks input:checked")].map(x=>x.value);
  try{
    await push(ref(db,"alerts"),{
      title,message,
      severity:$("severity").value,
      targetStates:target.length?target:["ALL"],
      createdBy:"Admin",
      createdAt:serverTimestamp()
    });
    $("alertStatus").textContent="✓ Alert broadcast to connected clients.";
    $("alertTitle").value=""; $("alertMessage").value="";
  }catch(e){ $("alertStatus").textContent="Could not send alert. Check Firebase rules."; }
};

function initChecks(){$("stateChecks").innerHTML=STATES.map(s=>`<label><input type=checkbox value="${s.name}"> ${s.name}</label>`).join("")}
async function makeMap(id){let m=L.map(id).setView([25.5,92.8],6);L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png",{maxZoom:18,attribution:"© OpenStreetMap"}).addTo(m);return m}
async function initMap(id){
  if(maps[id]||document.getElementById(id)?.dataset.fallback) return;
  if(!window.L){
    const el=document.getElementById(id); if(!el)return;
    el.dataset.fallback="1";
    el.innerHTML=`<div class="mapfallback"><div class="maptitle">NORTH-EAST INDIA · LIVE SHARED MAP</div><div class="neoutline"></div><div class="mapstates"></div></div>`;
    const box=el.querySelector(".mapstates");
    STATES.forEach((st,i)=>{const p=document.createElement("div");p.className="mapdot";p.style.left=(22+(st.lon-88)*5.5)+"%";p.style.top=(78-(st.lat-22)*5.2)+"%";p.title=st.name;p.innerHTML=`<span></span><b>${esc(st.name)}</b>`;box.appendChild(p)});
    return;
  }
  maps[id]=await makeMap(id);
  for(const st of STATES){const c=L.circleMarker([st.lat,st.lon],{radius:10,fillColor:"#1769ff",color:"#fff",weight:2,fillOpacity:.8}).addTo(maps[id]);c.bindTooltip(st.name);(layers[id]??=[]).push({layer:c,name:st.name})}
  updateColors();
}
function updateColors(){for(const id in layers)for(const x of layers[id]){const s=snapshot?.states?.find(v=>v.name===x.name);x.layer.setStyle({fillColor:riskColor(s?.score||0)})}}
window.syncWeather=async()=>{try{$("status").textContent="Fetching live weather…";const lat=STATES.map(s=>s.lat).join(","),lon=STATES.map(s=>s.lon).join(",");const u=`https://api.open-meteo.com/v1/forecast?latitude=${lat}&longitude=${lon}&current=temperature_2m,relative_humidity_2m,precipitation,rain,wind_speed_10m&forecast_days=1`;const raw=await fetch(u).then(r=>r.json()),arr=Array.isArray(raw)?raw:[raw];const states=STATES.map((s,i)=>{const c=arr[i]?.current||{},rain=Number(c.rain??c.precipitation??0),humidity=Number(c.relative_humidity_2m??70),score=Math.max(0,Math.min(99,Math.round(rain*3+humidity*.10+s.terrain*27+s.exposure*17)));return{name:s.name,capital:s.capital,latitude:s.lat,longitude:s.lon,temperature:c.temperature_2m??null,humidity,rain,wind:c.wind_speed_10m??0,score,level:level(score)}});const avg=Math.round(states.reduce((a,s)=>a+s.score,0)/states.length);await set(ref(db,"state"),{version:"1.0",source:"Open-Meteo",updatedAt:Date.now(),regional:{score:avg,level:level(avg)},states});$("status").textContent="Shared state updated";}catch(e){$("status").textContent="Weather sync failed; retaining last state"}};
initChecks();setInterval(()=>{$("clock").textContent=new Date().toLocaleString()},1000);setTimeout(()=>initMap("dashMap"),500);
window.openHorizonMainMap=()=>{initMap("mainMap").then(()=>maps.mainMap?.invalidateSize()).catch(()=>{});};
setTimeout(()=>{if(!snapshot)syncWeather()},1200);
setInterval(syncWeather,15*60*1000);
