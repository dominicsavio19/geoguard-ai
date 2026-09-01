const targetList=v=>Array.isArray(v)?v:(v==null||v===""?["ALL"]:[String(v)]);
import {initializeApp} from "https://www.gstatic.com/firebasejs/12.18.0/firebase-app.js";
import {getDatabase,ref,onValue,onChildAdded} from "https://www.gstatic.com/firebasejs/12.18.0/firebase-database.js";
import {firebaseConfig} from "../firebase-config.js";
import {STATES,riskColor} from "../shared/states.js";
const app=initializeApp(firebaseConfig),db=getDatabase(app);let snapshot=null,reports=[],alerts=[],maps={},layers={},alertsReady=false,lastAlertKeys=new Set();
const $=id=>document.getElementById(id),esc=v=>String(v??"").replace(/[&<>"']/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#039;"}[c])),tm=v=>new Date(v||Date.now()).toLocaleTimeString([],{hour:"2-digit",minute:"2-digit"});
window.openPage=id=>{document.querySelectorAll(".page").forEach(x=>x.classList.remove("active"));const page=$(id);if(page)page.classList.add("active");if(id==="alerts")setTimeout(renderAlerts,0);if(id==="map")setTimeout(()=>maps.mainMap?.invalidateSize(),100)};
onValue(ref(db,"state"),s=>{snapshot=s.val();renderState();});
onValue(ref(db,"reports"),s=>{reports=[];s.forEach(x=>reports.push({id:x.key,...x.val()}));reports.sort((a,b)=>(b.createdAt||0)-(a.createdAt||0));renderReports();});
onValue(ref(db,"alerts"),s=>{
  const next=[];
  s.forEach(x=>next.push({id:x.key,...(x.val()||{})}));
  next.sort((a,b)=>(b.createdAt||0)-(a.createdAt||0));
  alerts=next;
  lastAlertKeys=new Set(next.map(a=>a.id));
  alertsReady=true;
  renderAlerts();
},e=>console.error("Client alerts read error",e));

onChildAdded(ref(db,"alerts"),snap=>{
  const a={id:snap.key,...(snap.val()||{})};
  const exists=alerts.some(x=>x.id===a.id);
  if(!exists){
    alerts.push(a);
    alerts.sort((x,y)=>(Number(y.createdAt)||0)-(Number(x.createdAt)||0));
    renderAlerts();
    if(alertsReady) showClientAlert(a);
  }
  lastAlertKeys.add(a.id);
});

function showClientAlert(a){
  let box=document.getElementById("alertToast");
  if(!box){
    box=document.createElement("div");
    box.id="alertToast";
    box.className="alert-toast";
    document.body.appendChild(box);
  }
  box.innerHTML=`<b>🚨 ${esc(a.severity||"ALERT")} WARNING</b><strong>${esc(a.title||"New Alert")}</strong><span>${esc(a.message||"")}</span>`;
  box.onclick=()=>{box.classList.remove("show");openPage("alerts");};
  box.classList.add("show");
  clearTimeout(window.__clientAlertTimer);
  window.__clientAlertTimer=setTimeout(()=>box.classList.remove("show"),8000);
}

onValue(ref(db,"dispatches"),s=>{const ds=[];s.forEach(x=>ds.push({id:x.key,...x.val()}));ds.sort((a,b)=>(b.createdAt||0)-(a.createdAt||0));renderDispatches(ds);});
function renderDispatches(ds){$("homeDispatches").innerHTML=ds.filter(d=>d.status!=="COMPLETED").slice(0,3).map(d=>`<div class="item"><span class="pill">${esc(d.status||"DISPATCHED")}</span><b>🚑 ${esc(d.unitId||"Rescue Unit")}</b><small>Response team assigned · ${tm(d.createdAt)}</small></div>`).join("")||"<div class=item>No rescue dispatch updates.</div>";}

function renderState(){if(!snapshot?.states)return;const r=snapshot.regional,m=snapshot.states[0];$("regionalLevel").textContent=r.level;$("regionalScore").textContent=`${r.score}/100 · shared Firebase reading`;$("updated").textContent=`SYNCED ${tm(snapshot.updatedAt)}`;$("temp").textContent=m.temperature==null?"--":Number(m.temperature).toFixed(1)+"°C";$("rain").textContent=Number(m.rain||0).toFixed(1)+" mm";$("humidity").textContent=Number(m.humidity||0)+"%";$("stateList").innerHTML=snapshot.states.map(s=>`<div class="state"><div><b>${esc(s.name)}</b><small>${esc(s.capital)} · ${Number(s.temperature||0).toFixed(1)}°C · Rain ${Number(s.rain||0).toFixed(1)} mm</small></div><b style="color:${riskColor(s.score)}">${s.level} ${s.score}</b></div>`).join("");updateColors()}
function renderReports(){let h=reports.slice(0,4).map(r=>`<div class="item"><span class="pill">${esc(r.status||"UNVERIFIED")}</span><b>⚠ ${esc(r.category)}</b><small>📍 ${esc(r.city||r.state)} · ${tm(r.createdAt)}</small></div>`).join("")||"<div class=item>No reports.</div>";$("homeReports").innerHTML=h;$("allReports").innerHTML=reports.map(r=>`<div class="item"><span class="pill">${esc(r.status||"UNVERIFIED")}</span><b>⚠ ${esc(r.category)}</b><p>${esc(r.description)}</p><small>📍 ${esc(r.city||r.state)} · ${tm(r.createdAt)}</small></div>`).join("")}
function renderAlerts(){
  const history=alerts.map(a=>`<div class="item" data-alert-id="${esc(a.id)}"><span class="pill">${esc(a.severity||"INFO")}</span><b>🚨 ${esc(a.title||"Alert")}</b><p>${esc(a.message||"")}</p><small>${esc(targetList(a.targetStates).join(", "))} · ${tm(a.createdAt)}</small></div>`).join("");
  const home=alerts.slice(0,4).map(a=>`<div class="item" data-alert-id="${esc(a.id)}"><span class="pill">${esc(a.severity||"INFO")}</span><b>🚨 ${esc(a.title||"Alert")}</b><small>${esc(a.message||"")}</small></div>`).join("");
  const homeEl=$("homeAlerts"), listEl=$("allAlerts");
  if(homeEl) homeEl.innerHTML=home||"<div class=item>No alerts.</div>";
  if(listEl) listEl.innerHTML=history||"<div class=item>No alerts.</div>";
}onst targetList=v=>Array.isArray(v)?v:(v==null||v===""?["ALL"]:[String(v)]);
import {initializeApp} from "https://www.gstatic.com/firebasejs/12.18.0/firebase-app.js";
import {getDatabase,ref,onValue,onChildAdded} from "https://www.gstatic.com/firebasejs/12.18.0/firebase-database.js";
import {firebaseConfig} from "../firebase-config.js";
import {STATES,riskColor} from "../shared/states.js";
const app=initializeApp(firebaseConfig),db=getDatabase(app);let snapshot=null,reports=[],alerts=[],maps={},layers={},alertsReady=false,lastAlertKeys=new Set();
const $=id=>document.getElementById(id),esc=v=>String(v??"").replace(/[&<>"']/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#039;"}[c])),tm=v=>new Date(v||Date.now()).toLocaleTimeString([],{hour:"2-digit",minute:"2-digit"});
window.openPage=id=>{document.querySelectorAll(".page").forEach(x=>x.classList.remove("active"));const page=$(id);if(page)page.classList.add("active");if(id==="alerts")setTimeout(renderAlerts,0);if(id==="map")setTimeout(()=>maps.mainMap?.invalidateSize(),100)};
onValue(ref(db,"state"),s=>{snapshot=s.val();renderState();});
onValue(ref(db,"reports"),s=>{reports=[];s.forEach(x=>reports.push({id:x.key,...x.val()}));reports.sort((a,b)=>(b.createdAt||0)-(a.createdAt||0));renderReports();});
onValue(ref(db,"alerts"),s=>{
  const next=[];
  s.forEach(x=>next.push({id:x.key,...(x.val()||{})}));
  next.sort((a,b)=>(b.createdAt||0)-(a.createdAt||0));
  alerts=next;
  lastAlertKeys=new Set(next.map(a=>a.id));
  alertsReady=true;
  renderAlerts();
},e=>console.error("Client alerts read error",e));

onChildAdded(ref(db,"alerts"),snap=>{
  const a={id:snap.key,...(snap.val()||{})};
  const exists=alerts.some(x=>x.id===a.id);
  if(!exists){
    alerts.push(a);
    alerts.sort((x,y)=>(Number(y.createdAt)||0)-(Number(x.createdAt)||0));
    renderAlerts();
    if(alertsReady) showClientAlert(a);
  }
  lastAlertKeys.add(a.id);
});

function showClientAlert(a){
  let box=document.getElementById("alertToast");
  if(!box){
    box=document.createElement("div");
    box.id="alertToast";
    box.className="alert-toast";
    document.body.appendChild(box);
  }
  box.innerHTML=`<b>🚨 ${esc(a.severity||"ALERT")} WARNING</b><strong>${esc(a.title||"New Alert")}</strong><span>${esc(a.message||"")}</span>`;
  box.onclick=()=>{box.classList.remove("show");openPage("alerts");};
  box.classList.add("show");
  clearTimeout(window.__clientAlertTimer);
  window.__clientAlertTimer=setTimeout(()=>box.classList.remove("show"),8000);
}

onValue(ref(db,"dispatches"),s=>{const ds=[];s.forEach(x=>ds.push({id:x.key,...x.val()}));ds.sort((a,b)=>(b.createdAt||0)-(a.createdAt||0));renderDispatches(ds);});
function renderDispatches(ds){$("homeDispatches").innerHTML=ds.filter(d=>d.status!=="COMPLETED").slice(0,3).map(d=>`<div class="item"><span class="pill">${esc(d.status||"DISPATCHED")}</span><b>🚑 ${esc(d.unitId||"Rescue Unit")}</b><small>Response team assigned · ${tm(d.createdAt)}</small></div>`).join("")||"<div class=item>No rescue dispatch updates.</div>";}

function renderState(){if(!snapshot?.states)return;const r=snapshot.regional,m=snapshot.states[0];$("regionalLevel").textContent=r.level;$("regionalScore").textContent=`${r.score}/100 · shared Firebase reading`;$("updated").textContent=`SYNCED ${tm(snapshot.updatedAt)}`;$("temp").textContent=m.temperature==null?"--":Number(m.temperature).toFixed(1)+"°C";$("rain").textContent=Number(m.rain||0).toFixed(1)+" mm";$("humidity").textContent=Number(m.humidity||0)+"%";$("stateList").innerHTML=snapshot.states.map(s=>`<div class="state"><div><b>${esc(s.name)}</b><small>${esc(s.capital)} · ${Number(s.temperature||0).toFixed(1)}°C · Rain ${Number(s.rain||0).toFixed(1)} mm</small></div><b style="color:${riskColor(s.score)}">${s.level} ${s.score}</b></div>`).join("");updateColors()}
function renderReports(){let h=reports.slice(0,4).map(r=>`<div class="item"><span class="pill">${esc(r.status||"UNVERIFIED")}</span><b>⚠ ${esc(r.category)}</b><small>📍 ${esc(r.city||r.state)} · ${tm(r.createdAt)}</small></div>`).join("")||"<div class=item>No reports.</div>";$("homeReports").innerHTML=h;$("allReports").innerHTML=reports.map(r=>`<div class="item"><span class="pill">${esc(r.status||"UNVERIFIED")}</span><b>⚠ ${esc(r.category)}</b><p>${esc(r.description)}</p><small>📍 ${esc(r.city||r.state)} · ${tm(r.createdAt)}</small></div>`).join("")}
function renderAlerts(){let h=alerts.slice(0,4).map(a=>`<div class="item"><span class="pill">${esc(a.severity)}</span><b>🚨 ${esc(a.title)}</b><small>${esc(a.message)}</small></div>`).join("")||"<div class=item>No alerts.</div>";$("homeAlerts").innerHTML=h;$("allAlerts").innerHTML=alerts.map(a=>`<div class="item"><span class="pill">${esc(a.severity)}</span><b>🚨 ${esc(a.title)}</b><p>${esc(a.message)}</p><small>${esc(targetList(a.targetStates).join(", "))} · ${tm(a.createdAt)}</small></div>`).join("")}
$("stateSelect").innerHTML=STATES.map(s=>`<option>${s.name}</option>`).join("");
window.submitReport=async()=>{const description=$("description").value.trim();if(!description)return $("reportMsg").textContent="Please add a description.";await push(ref(db,"reports"),{category:$("hazard").value,state:$("stateSelect").value,city:$("city").value,description,userId:"Horizon Client",status:"UNVERIFIED",createdAt:serverTimestamp()});$("reportMsg").textContent="✓ Report sent to control room.";$("description").value="";$("city").value=""};
window.sendSOS=()=>{const done=async(lat,lon)=>{await push(ref(db,"sos"),{userName:"Horizon Client User",state:"North-Eastern Region",latitude:lat,longitude:lon,status:"ACTIVE",note:"SOS pressed from mobile client",createdAt:serverTimestamp()});alert("SOS sent to the Horizon control room.")};navigator.geolocation?navigator.geolocation.getCurrentPosition(p=>done(p.coords.latitude,p.coords.longitude),()=>done(null,null)):done(null,null)};
async function makeMap(id){let m=L.map(id).setView([25.5,92.8],6);L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png",{maxZoom:18,attribution:"© OpenStreetMap"}).addTo(m);return m}
async function initMap(id){if(maps[id])return;maps[id]=await makeMap(id);for(const s of STATES){const c=L.circleMarker([s.lat,s.lon],{radius:10,fillColor:"#1769ff",color:"#fff",weight:2,fillOpacity:.8}).addTo(maps[id]);c.bindTooltip(s.name);(layers[id]??=[]).push({layer:c,name:s.name})}updateColors()}
function updateColors(){for(const id in layers)for(const x of layers[id]){const s=snapshot?.states?.find(v=>v.name===x.name);x.layer.setStyle({fillColor:riskColor(s?.score||0)})}}
setTimeout(()=>initMap("homeMap"),300);setTimeout(()=>initMap("mainMap"),500);
