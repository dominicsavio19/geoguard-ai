export const STATES = [
  {name:"Arunachal Pradesh", capital:"Itanagar", lat:27.0844, lon:93.6053, terrain:.92, exposure:.74},
  {name:"Assam", capital:"Dispur / Guwahati", lat:26.1445, lon:91.7362, terrain:.44, exposure:.62},
  {name:"Manipur", capital:"Imphal", lat:24.8170, lon:93.9368, terrain:.77, exposure:.69},
  {name:"Meghalaya", capital:"Shillong", lat:25.5788, lon:91.8933, terrain:.82, exposure:.76},
  {name:"Mizoram", capital:"Aizawl", lat:23.7271, lon:92.7176, terrain:.90, exposure:.82},
  {name:"Nagaland", capital:"Kohima", lat:25.6751, lon:94.1086, terrain:.88, exposure:.72},
  {name:"Sikkim", capital:"Gangtok", lat:27.3389, lon:88.6065, terrain:.86, exposure:.78},
  {name:"Tripura", capital:"Agartala", lat:23.8315, lon:91.2868, terrain:.42, exposure:.57}
];

export function level(score) {
  return score >= 80 ? "CRITICAL" : score >= 65 ? "HIGH" : score >= 45 ? "MODERATE" : "LOW";
}
export function riskColor(score) {
  return score >= 80 ? "#e25562" : score >= 65 ? "#f0a35c" : score >= 45 ? "#e6c84f" : "#35b779";
}
