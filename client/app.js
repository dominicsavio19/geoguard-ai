
import { initializeApp } from "https://www.gstatic.com/firebasejs/12.18.0/firebase-app.js";
import {
  getDatabase, ref, onValue, onChildAdded, onChildChanged, onChildRemoved, push, update, serverTimestamp
} from "https://www.gstatic.com/firebasejs/12.18.0/firebase-database.js";
import { firebaseConfig } from "../firebase-config.js";
import { STATES, riskColor, level } from "../shared/states.js";

const app = initializeApp(firebaseConfig);
const db = getDatabase(app);

const $ = id => document.getElementById(id);
const esc = v => String(v ?? "").replace(/[&<>"']/g, c =>
  ({ "&":"&amp;", "<":"&lt;", ">":"&gt;", '"':"&quot;", "'":"&#039;" }[c])
);
const tm = v => {
  const n = Number(v);
  return new Date(Number.isFinite(n) && n > 0 ? n : Date.now())
    .toLocaleTimeString([], {hour:"2-digit", minute:"2-digit"});
};
const targetList = v => Array.isArray(v) ? v : (v == null || v === "" ? ["ALL"] : [String(v)]);

let snapshot = null;
let reports = [];
let alerts = [];
let dispatches = [];
let maps = {};
let layers = {};
let firebaseAlertsLoaded = false;
const ALERT_CACHE_KEY = "horizon_alert_history_v11";

function loadCachedAlerts(){
  try{
    const cached=JSON.parse(localStorage.getItem(ALERT_CACHE_KEY)||"[]");
    if(Array.isArray(cached)) alerts=cached;
  }catch(_){}
}
function cacheAlerts(){
  try{ localStorage.setItem(ALERT_CACHE_KEY, JSON.stringify(alerts.slice(0,100))); }catch(_){}
}

function setLive(text) {
  const el = $("updated");
  if (el) el.textContent = text;
}

/* ---------- NAVIGATION ---------- */
window.openPage = id => {
  document.querySelectorAll(".page").forEach(p => p.classList.remove("active"));
  const page = $(id);
  if (page) page.classList.add("active");

  if (id === "alerts") renderAlerts();
  if (id === "reports") renderReports();
  if (id === "map") {
    setTimeout(() => {
      if (maps.mainMap) maps.mainMap.invalidateSize();
      if (!maps.mainMap) initMap("mainMap");
    }, 120);
  }
};

/* ---------- SHARED STATE ---------- */
function renderState() {
  if (!snapshot || !snapshot.states || !snapshot.regional) {
    $("regionalLevel").textContent = "--";
    $("regionalScore").textContent = "Waiting for shared reading";
    $("temp").textContent = "--";
    $("rain").textContent = "--";
    $("humidity").textContent = "--";
    setLive("WAITING…");
    return;
  }

  const states = snapshot.states;
  const regional = snapshot.regional;
  const first = states[0] || {};

  $("regionalLevel").textContent = regional.level || "--";
  $("regionalScore").textContent = `${regional.score ?? "--"}/100 · shared Firebase reading`;
  $("temp").textContent = first.temperature == null ? "--" : `${Number(first.temperature).toFixed(1)}°C`;
  $("rain").textContent = `${Number(first.rain || 0).toFixed(1)} mm`;
  $("humidity").textContent = `${Number(first.humidity || 0).toFixed(0)}%`;

  const updated = Number(snapshot.updatedAt);
  setLive(updated ? `SYNCED ${tm(updated)}` : "SYNCED");

  const list = $("stateList");
  if (list) {
    list.innerHTML = states.map(s => `
      <div class="state">
        <div>
          <b>${esc(s.name)}</b>
          <small>${esc(s.capital || "")} · ${Number(s.temperature || 0).toFixed(1)}°C · Rain ${Number(s.rain || 0).toFixed(1)} mm</small>
        </div>
        <b style="color:${riskColor(Number(s.score || 0))}">${esc(s.level || "")} ${Number(s.score || 0)}</b>
      </div>
    `).join("");
  }

  updateMapColors();
}

/* ---------- REPORTS ---------- */
function renderReports() {
  const home = reports.slice(0, 4).map(r => `
    <div class="item">
      <span class="pill">${esc(r.status || "UNVERIFIED")}</span>
      <b>⚠ ${esc(r.category || "Hazard")}</b>
      <small>📍 ${esc(r.city || r.state || "North-East India")} · ${tm(r.createdAt)}</small>
    </div>
  `).join("") || `<div class="item">No reports yet.</div>`;

  const all = reports.map(r => `
    <div class="item">
      <span class="pill">${esc(r.status || "UNVERIFIED")}</span>
      <b>⚠ ${esc(r.category || "Hazard")}</b>
      <p>${esc(r.description || "")}</p>
      <small>📍 ${esc(r.city || r.state || "North-East India")} · ${tm(r.createdAt)}</small>
    </div>
  `).join("") || `<div class="item">No reports yet.</div>`;

  if ($("homeReports")) $("homeReports").innerHTML = home;
  if ($("allReports")) $("allReports").innerHTML = all;
}

/* ---------- ALERTS ---------- */
function alertCard(a){
  return `<div class="item alert-history-card" data-alert-id="${esc(a.id)}">
    <span class="pill">${esc(a.severity||"INFO")}</span>
    <b>🚨 ${esc(a.title||"Alert")}</b>
    <p>${esc(a.message||"")}</p>
    <small>${esc(targetList(a.targetStates).join(", "))} · ${tm(a.createdAt)}</small>
  </div>`;
}
function renderAlerts(){
  const history=alerts.map(alertCard).join("");
  const home=alerts.slice(0,4).map(a=>`
    <div class="item alert-history-card" data-alert-id="${esc(a.id)}">
      <span class="pill">${esc(a.severity||"INFO")}</span>
      <b>🚨 ${esc(a.title||"Alert")}</b>
      <small>${esc(a.message||"")}</small>
    </div>`).join("");
  const list=$("allAlerts"), homeList=$("homeAlerts");
  if(list) list.innerHTML=history || `<div class="item">No alerts yet.</div>`;
  if(homeList) homeList.innerHTML=home || `<div class="item">No alerts yet.</div>`;
}
function showClientAlert(a) {
  let box = $("alertToast");
  if (!box) {
    box = document.createElement("div");
    box.id = "alertToast";
    box.className = "alert-toast";
    document.body.appendChild(box);
  }
  box.innerHTML = `
    <b>🚨 ${esc(a.severity || "ALERT")} WARNING</b>
    <strong>${esc(a.title || "New Alert")}</strong>
    <span>${esc(a.message || "")}</span>
  `;
  box.onclick = () => {
    box.classList.remove("show");
    openPage("alerts");
  };
  box.classList.add("show");
  clearTimeout(window.__horizonAlertTimer);
  window.__horizonAlertTimer = setTimeout(() => box.classList.remove("show"), 8000);
}

/* ---------- RESCUE DISPATCH ---------- */
function renderDispatches() {
  const active = dispatches.filter(d => d.status !== "COMPLETED").slice(0, 3);
  const html = active.map(d => `
    <div class="item">
      <span class="pill">${esc(d.status || "DISPATCHED")}</span>
      <b>🚑 ${esc(d.unitId || "Rescue Unit")}</b>
      <small>Response team assigned · ${tm(d.createdAt)}</small>
    </div>
  `).join("") || `<div class="item">No rescue dispatch updates.</div>`;
  if ($("homeDispatches")) $("homeDispatches").innerHTML = html;
}

/* ---------- SOS ---------- */
window.sendSOS = async () => {
  if (!confirm("Send an emergency SOS to the regional control room?")) return;

  let latitude = null, longitude = null;
  try {
    const pos = await new Promise((resolve, reject) =>
      navigator.geolocation.getCurrentPosition(resolve, reject, {enableHighAccuracy:true, timeout:7000})
    );
    latitude = pos.coords.latitude;
    longitude = pos.coords.longitude;
  } catch (_) {}

  try {
    const result = await push(ref(db, "sos"), {
      userName: "Mobile User",
      state: "North-East India",
      latitude,
      longitude,
      note: "Emergency SOS from Horizon mobile client",
      status: "ACTIVE",
      responseStatus: "WAITING",
      createdAt: serverTimestamp()
    });
    alert("🆘 SOS sent to the control room.");
  } catch (e) {
    console.error(e);
    alert("SOS could not be sent. Check Firebase rules/connection.");
  }
};

/* ---------- REPORT SUBMISSION ---------- */
window.submitReport = async () => {
  const category = $("hazard")?.value || "Other";
  const state = $("stateSelect")?.value || "North-East India";
  const city = $("city")?.value.trim() || "";
  const description = $("description")?.value.trim() || "";

  if (!description) {
    $("reportMsg").textContent = "Please describe the hazard.";
    return;
  }

  try {
    await push(ref(db, "reports"), {
      category, state, city, description,
      status: "UNVERIFIED",
      createdAt: serverTimestamp()
    });
    $("description").value = "";
    $("city").value = "";
    $("reportMsg").textContent = "✓ Report sent to the control room.";
  } catch (e) {
    console.error(e);
    $("reportMsg").textContent = "✕ Could not send report.";
  }
};

/* ---------- MAP ---------- */
function makeMap(id) {
  if (!window.L || !$(id) || maps[id]) return;
  maps[id] = L.map(id).setView([25.5, 92.8], 6);
  L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
    maxZoom: 18,
    attribution: "© OpenStreetMap"
  }).addTo(maps[id]);

  layers[id] = [];
  STATES.forEach(st => {
    const marker = L.circleMarker([st.lat, st.lon], {
      radius: 9, fillColor: riskColor(0), color: "#fff",
      weight: 2, fillOpacity: .85
    }).addTo(maps[id]);
    marker.bindTooltip(st.name);
    layers[id].push({layer:marker, name:st.name});
  });
  updateMapColors();
}

function updateMapColors() {
  Object.keys(layers).forEach(id => {
    layers[id].forEach(x => {
      const state = snapshot?.states?.find(s => s.name === x.name);
      x.layer.setStyle({fillColor: riskColor(Number(state?.score || 0))});
    });
  });
}

function initMap(id) {
  if (!$(id)) return;
  if (window.L) {
    makeMap(id);
    return;
  }
  $(id).innerHTML = `<div style="padding:30px;text-align:center;color:#71849a">Map library is still loading…</div>`;
}

/* ---------- INIT FIREBASE LISTENERS ---------- */
onValue(ref(db, "state"), snap => {
  snapshot = snap.val();
  renderState();
}, err => {
  console.error("state", err);
  setLive("FIREBASE ERROR");
});

onValue(ref(db, "reports"), snap => {
  reports = [];
  snap.forEach(x => reports.push({id:x.key, ...(x.val() || {})}));
  reports.sort((a,b) => Number(b.createdAt || 0) - Number(a.createdAt || 0));
  renderReports();
});



const alertStore = new Map();

function syncAlertArray(){
  alerts = Array.from(alertStore.values())
    .sort((a,b) => Number(b.createdAt||0) - Number(a.createdAt||0));
  cacheAlerts();
  renderAlerts();
}

function mergeAlert(a){
  if(!a || !a.id) return;
  alertStore.set(a.id, a);
  syncAlertArray();
}

onChildAdded(ref(db, "alerts"), snap => {
  const a = {id:snap.key, ...(snap.val()||{})};
  const wasKnown = alertStore.has(a.id);
  mergeAlert(a);
  firebaseAlertsLoaded = true;
  if(!wasKnown) showClientAlert(a);
});

onChildChanged(ref(db, "alerts"), snap => {
  mergeAlert({id:snap.key, ...(snap.val()||{})});
});

onChildRemoved(ref(db, "alerts"), snap => {
  alertStore.delete(snap.key);
  syncAlertArray();
});

// A one-time read hydrates the store on page load without ever replacing
// records subsequently delivered by the realtime child stream.
onValue(ref(db, "alerts"), snap => {
  snap.forEach(child => {
    const a = {id:child.key, ...(child.val()||{})};
    if(!alertStore.has(a.id)) alertStore.set(a.id, a);
  });
  firebaseAlertsLoaded = true;
  syncAlertArray();
}, err => {
  console.error("alerts read", err);
  renderAlerts();
});

onValue(ref(db, "dispatches"), snap => {
  dispatches = [];
  snap.forEach(x => dispatches.push({id:x.key, ...(x.val() || {})}));
  dispatches.sort((a,b) => Number(b.createdAt || 0) - Number(a.createdAt || 0));
  renderDispatches();
});

/* ---------- FORM / STARTUP ---------- */
$("stateSelect").innerHTML = STATES.map(s => `<option>${esc(s.name)}</option>`).join("");

loadCachedAlerts();
for(const a of alerts) alertStore.set(a.id,a);
renderState();
renderReports();
renderAlerts();
renderDispatches();

setTimeout(() => initMap("homeMap"), 400);
setTimeout(() => initMap("mainMap"), 700);

window.addEventListener("resize", () => {
  Object.values(maps).forEach(m => m.invalidateSize());
});
