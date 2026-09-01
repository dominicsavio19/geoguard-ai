import {initializeApp} from "https://www.gstatic.com/firebasejs/12.18.0/firebase-app.js";
import {getDatabase,ref,onValue,push,update,serverTimestamp,set} from "https://www.gstatic.com/firebasejs/12.18.0/firebase-database.js";
import {firebaseConfig} from "../firebase-config.js";
import {STATES,riskColor,level} from "../shared/states.js";
const app=initializeApp(firebaseConfig),db=getDatabase(app);let snapshot=null,reports=[],sos=[],alerts=[],maps={},layers={},lastAlertKeys=new Set(),alertsReady=false;
const $=id=>document.getElementById(id),esc=v=>String(v??"").replace(/[&<>"']/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#039;"}[c])),tm=v=>new Date(v||Date.now()).toLocaleTimeString([],{hour:"2-digit",minute:"2-digit"});
window.invalidateHorizonMaps=()=>{Object.values(maps).forEach(m=>{try{m.invalidateSize()}catch(e){}})};
window.renderCurrentPage=()=>{try{if(document.getElementById("reports")?.classList.contains("active"))window.renderReports();}catch(e){}try{if(document.getElementById("sos")?.classList.contains("active"))window.renderSOS();}catch(e){}try{if(document.getElementById("broadcast")?.classList.contains("active"))renderBroadcasts();}catch(e){}try{if(document.getElementById("rescue")?.classList.contains("active"))renderRescue();}catch(e){}};;
onValue(ref(db,"state"),s=>{snapshot=s.val();renderState();$("status").textContent="Realtime Database connected";},e=>{$("status").textContent="Firebase read error";});
onValue(ref(db,"reports"),s=>{reports=[];s.forEach(x=>reports.push({id:x.key,...x.val()}));reports.sort((a,b)=>(b.createdAt||0)-(a.createdAt||0));renderAll();},e=>{$("status").textContent="Reports read error";});
onValue(ref(db,"sos"),s=>{sos=[];s.forEach(x=>sos.push({id:x.key,...x.val()}));sos.sort((a,b)=>(b.createdAt||0)-(a.createdAt||0));renderAll();},e=>{$("status").textContent="SOS read error";});
onValue(ref(db,"alerts"),s=>{
  const next=[];
  s.forEach(x=>next.push({id:x.key,...x.val()}));
  next.sort((a,b)=>(b.createdAt||0)-(a.createdAt||0));
  if(alertsReady){
    const fresh=next.filter(a=>!lastAlertKeys.has(a.id));
    fresh.slice(0,3).forEach(showAdminAlert);
  }
  alerts=next;
  lastAlertKeys=new Set(next.map(a=>a.id));
  alertsReady=true;
  renderAll();
},e=>{$("status").textContent="Alerts read error";});
let dispatches=[];
onValue(ref(db,"dispatches"),s=>{
  dispatches=[]; s.forEach(x=>dispatches.push({id:x.key,...x.val()}));
  dispatches.sort((a,b)=>(b.createdAt||0)-(a.createdAt||0));
  renderAll();
},e=>{$("status").textContent="Dispatch read error";});
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

function renderBroadcasts(){
  $("broadcastList").innerHTML=alerts.slice(0,8).map(a=>`<div class=item><span class=pill>${esc(a.severity||"INFO")}</span><b>🚨 ${esc(a.title||"Alert")}</b><small>${esc(a.message||"")}</small></div>`).join("")||"<div class=item>No broadcasts yet.</div>";
}
window.sendAlert=async()=>{
  const title=$("alertTitle").value.trim();
  const message=$("alertMessage").value.trim();
  const severity=$("severity").value;
  const selected=[...document.querySelectorAll("#stateChecks input:checked")].map(x=>x.value);
  if(!title||!message){
    $("alertStatus").textContent="Enter an alert title and message.";
    return;
  }
  const payload={
    title,
    message,
    severity,
    targetStates:selected.length?selected:["ALL"],
    createdBy:"Admin",
    createdAt:serverTimestamp()
  };
  try{
    $("alertStatus").textContent="Sending…";
    const result=await push(ref(db,"alerts"),payload);
    $("alertTitle").value="";
    $("alertMessage").value="";
    document.querySelectorAll("#stateChecks input").forEach(x=>x.checked=false);
    $("alertStatus").textContent="✓ Alert sent · ID "+result.key.slice(-6);
  }catch(err){
    console.error("Broadcast failed:",err);
    $("alertStatus").textContent="✕ Broadcast failed: "+(err?.message||"Firebase write error");
  }
};
function showAdminAlert(a){
  let box=document.getElementById("adminToast");
  if(!box){
    box=document.createElement("div");box.id="adminToast";box.className="admin-toast";
    document.body.appendChild(box);
  }
  box.innerHTML=`<b>🚨 NEW BROADCAST</b><strong>${esc(a.title||"Alert")}</strong><span>${esc(a.message||"")}</span>`;
  box.classList.add("show");
  clearTimeout(window.__horizonToastTimer);
  window.__horizonToastTimer=setTimeout(()=>box.classList.remove("show"),7000);
}

;

function renderRescue(){
  const active=sos.filter(x=>String(x.status||"ACTIVE").toUpperCase()==="ACTIVE");
  const assigned={};
  dispatches.forEach(d=>{ if(d.status!=="COMPLETED") assigned[d.unitId]=d; });

  $("dispatchIncidents").innerHTML=active.map(x=>{
    const existing=dispatches.find(d=>d.sosId===x.id && d.status!=="COMPLETED");
    const lat=x.latitude!=null?safeNum(x.latitude).toFixed(5):null;
    const lon=x.longitude!=null?safeNum(x.longitude).toFixed(5):null;
    return `<div class="dispatch-card">
      <h3>🆘 ${esc(x.userName||"Mobile User")}</h3>
      <p>${esc(x.note||"Emergency SOS request")}</p>
      <div class="dispatch-meta">
        <span>GPS: <b>${lat!=null?lat+", "+lon:"Pending"}</b></span>
        <span>TIME: <b>${new Date(x.createdAt||Date.now()).toLocaleTimeString()}</b></span>
        <span>STATUS: <b>${esc(x.status||"ACTIVE")}</b></span>
      </div>
      <div class="dispatch-actions">
        ${existing
          ? `<span class="dispatch-status ${String(existing.status||"").toLowerCase().replace(" ","")}">${esc(existing.status)}</span>
             <button class="action" onclick="completeDispatch('${existing.id}')">Complete Dispatch</button>`
          : `<button class="action green" onclick="dispatchIncident('${x.id}')">🚑 Dispatch Nearest Unit</button>`}
        ${lat!=null?`<button class="action" onclick="openIncidentMap(${safeNum(x.latitude)},${safeNum(x.longitude)})">View Location</button>`:""}
      </div>
    </div>`;
  }).join("") || `<div class="dispatch-card"><b style="font-size:9px">No active SOS incidents.</b><p>New mobile SOS requests will appear here instantly.</p></div>`;

  const units=[
    ["RESCUE-01","Rapid Response · Shillong","READY"],
    ["RESCUE-02","Mountain Response · Gangtok","READY"],
    ["RESCUE-03","Terrain Team · Itanagar","READY"],
    ["RESCUE-04","Medical Response · Guwahati","READY"],
    ["RESCUE-05","Search & Rescue · Aizawl","READY"],
    ["RESCUE-06","Emergency Team · Kohima","READY"]
  ];
  $("unitList").innerHTML=units.map(u=>{
    const d=assigned[u[0]];
    const st=d?(d.status||"DISPATCHED"):u[2];
    const cls=st==="READY"?"":st==="EN ROUTE"?"enroute":st==="ON SCENE"?"onscene":"completed";
    return `<div class="unit-row"><span class="unit-dot" style="background:${st==="READY"?"#61e4a4":st==="EN ROUTE"?"#e6c84f":"#58a6d9"}"></span>
      <div class="unit-grow"><b>${u[0]}</b><small>${esc(u[1])}</small></div>
      <span class="dispatch-status ${cls}">${esc(st)}</span>
    </div>`;
  }).join("");

  $("dispatchLog").innerHTML=dispatches.slice().sort((a,b)=>(b.createdAt||0)-(a.createdAt||0)).slice(0,12).map(d=>{
    return `<div class="item"><span class="pill">${esc(d.status||"DISPATCHED")}</span><b>🚑 ${esc(d.unitId||"Response Unit")}</b>
      <small>Incident: ${esc(d.sosUser||"Mobile User")} · ${esc(d.region||"North-East India")} · ${tm(d.createdAt)}</small></div>`;
  }).join("") || `<div class="item">No dispatches yet.</div>`;
}


window.dispatchIncident=async(sosId)=>{
  const incident=sos.find(x=>x.id===sosId);
  if(!incident) return;
  const active=dispatches.filter(d=>d.status!=="COMPLETED");
  const used=new Set(active.map(d=>d.unitId));
  const units=["RESCUE-01","RESCUE-02","RESCUE-03","RESCUE-04","RESCUE-05","RESCUE-06"];
  const unitId=units.find(u=>!used.has(u));
  if(!unitId){alert("All prototype rescue units are currently assigned.");return;}
  try{
    await push(ref(db,"dispatches"),{
      sosId,
      sosUser:incident.userName||"Mobile User",
      unitId,
      region:incident.state||"North-East India",
      latitude:incident.latitude??null,
      longitude:incident.longitude??null,
      status:"DISPATCHED",
      dispatchedBy:"Admin",
      createdAt:serverTimestamp()
    });
    await update(ref(db,"sos/"+sosId),{responseStatus:"DISPATCHED",assignedUnit:unitId,dispatchUpdatedAt:serverTimestamp()});
  }catch(e){alert("Dispatch failed. Check Firebase rules.");}
};

window.completeDispatch=async(id)=>{
  const d=dispatches.find(x=>x.id===id); if(!d)return;
  await update(ref(db,"dispatches/"+id),{status:"COMPLETED",completedAt:serverTimestamp()});
  if(d.sosId) await update(ref(db,"sos/"+d.sosId),{responseStatus:"RESCUE COMPLETED",status:"RESOLVED",resolvedAt:serverTimestamp()});
};

window.openIncidentMap=(lat,lon)=>{
  if(window.openHorizonMainMap){ showPage("map"); setTimeout(()=>{ if(maps.mainMap){ maps.mainMap.setView([lat,lon],12); L.marker([lat,lon]).addTo(maps.mainMap).bindPopup("SOS incident").openPopup(); }},250); }
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
