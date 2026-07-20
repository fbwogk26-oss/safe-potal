// 한국 권역별 3D 지도 데이터 생성 스크립트
// Usage: node scripts/generate-korea-regions.mjs

import fs from 'fs';

const KM_PER_DEG_LAT = 111.0;
const SCALE = 4.5; // units per km (GB 맵과 동일한 스케일)

function kmPerDegLon(lat) { return 111.0 * Math.cos(lat * Math.PI / 180); }

function pos(lat, lon, cLat, cLon) {
  return [
    +((lon - cLon) * kmPerDegLon(cLat) * SCALE).toFixed(1),
    +((lat - cLat) * KM_PER_DEG_LAT * SCALE).toFixed(1)
  ];
}

function makePoly(cx, cy, r, n = 8) {
  return Array.from({ length: n }, (_, i) => {
    const a = (i / n) * 2 * Math.PI + Math.PI / n;
    return [+(cx + r * Math.cos(a)).toFixed(1), +(cy + r * Math.sin(a)).toFixed(1)];
  });
}

function radius(areaKm2, f = 0.65) {
  return Math.max(18, Math.min(78, Math.sqrt(areaKm2 / Math.PI) * SCALE * f));
}

function makeRegion(cities, cLat, cLon) {
  return cities.map(c => {
    const [cx, cy] = pos(c.lat, c.lon, cLat, cLon);
    const r = radius(c.area, c.f || 0.65);
    return { name: c.name, type: c.type, color: c.color, polys: [makePoly(cx, cy, r)], label: [cx, cy] };
  });
}

// ── 충청권 ──────────────────────────────────────────────────────────────
const CC_LAT = 36.5, CC_LON = 127.2;
const ccCities = [
  { name:'대전',   lat:36.35, lon:127.38, area:540,  type:'metro', color:'#6b7ad4' },
  { name:'세종',   lat:36.47, lon:127.29, area:465,  type:'si',    color:'#5b8a6e' },
  { name:'청주시', lat:36.64, lon:127.49, area:940,  type:'si',    color:'#7e5fae' },
  { name:'충주시', lat:36.99, lon:127.93, area:984,  type:'si',    color:'#8e6fbe' },
  { name:'제천시', lat:37.13, lon:128.19, area:882,  type:'si',    color:'#8a6bba' },
  { name:'보은군', lat:36.49, lon:127.73, area:584,  type:'gun',   color:'#9e7fce' },
  { name:'옥천군', lat:36.30, lon:127.57, area:537,  type:'gun',   color:'#9a7bca' },
  { name:'영동군', lat:36.17, lon:127.78, area:845,  type:'gun',   color:'#967ac6' },
  { name:'증평군', lat:36.78, lon:127.58, area:82,   type:'gun',   color:'#ae8fce' },
  { name:'진천군', lat:36.85, lon:127.43, area:407,  type:'gun',   color:'#a888c6' },
  { name:'괴산군', lat:36.81, lon:127.79, area:842,  type:'gun',   color:'#a484c2' },
  { name:'음성군', lat:36.94, lon:127.69, area:521,  type:'gun',   color:'#a080be' },
  { name:'단양군', lat:36.98, lon:128.37, area:780,  type:'gun',   color:'#9c7cba' },
  { name:'천안시', lat:36.81, lon:127.15, area:636,  type:'si',    color:'#4e8a7a' },
  { name:'공주시', lat:36.44, lon:127.12, area:864,  type:'si',    color:'#4a8676' },
  { name:'보령시', lat:36.33, lon:126.61, area:590,  type:'si',    color:'#468272' },
  { name:'아산시', lat:36.79, lon:127.00, area:542,  type:'si',    color:'#427e6e' },
  { name:'서산시', lat:36.78, lon:126.45, area:741,  type:'si',    color:'#3e7a6a' },
  { name:'논산시', lat:36.19, lon:127.10, area:555,  type:'si',    color:'#3a7666' },
  { name:'계룡시', lat:36.27, lon:127.25, area:61,   type:'si',    color:'#367262' },
  { name:'당진시', lat:36.89, lon:126.63, area:696,  type:'si',    color:'#326e5e' },
  { name:'금산군', lat:36.11, lon:127.49, area:578,  type:'gun',   color:'#5e9e8e' },
  { name:'부여군', lat:36.27, lon:126.91, area:624,  type:'gun',   color:'#5a9a8a' },
  { name:'서천군', lat:36.08, lon:126.69, area:362,  type:'gun',   color:'#569686' },
  { name:'청양군', lat:36.45, lon:126.80, area:480,  type:'gun',   color:'#529282' },
  { name:'홍성군', lat:36.60, lon:126.66, area:444,  type:'gun',   color:'#4e8e7e' },
  { name:'예산군', lat:36.68, lon:126.85, area:543,  type:'gun',   color:'#4a8a7a' },
  { name:'태안군', lat:36.75, lon:126.30, area:507,  type:'gun',   color:'#468676' },
];

// ── 호남권 ──────────────────────────────────────────────────────────────
const HN_LAT = 35.0, HN_LON = 126.9;
const hnCities = [
  { name:'광주',   lat:35.16, lon:126.85, area:501,  type:'metro', color:'#c45b6b' },
  { name:'전주시', lat:35.82, lon:127.15, area:206,  type:'si',    color:'#c47a3e' },
  { name:'군산시', lat:35.97, lon:126.74, area:396,  type:'si',    color:'#c0763a' },
  { name:'익산시', lat:35.95, lon:126.96, area:507,  type:'si',    color:'#bc7236' },
  { name:'정읍시', lat:35.57, lon:126.85, area:694,  type:'si',    color:'#b86e32' },
  { name:'남원시', lat:35.41, lon:127.39, area:752,  type:'si',    color:'#b46a2e' },
  { name:'김제시', lat:35.80, lon:126.88, area:546,  type:'si',    color:'#b0662a' },
  { name:'완주군', lat:35.91, lon:127.16, area:821,  type:'gun',   color:'#d4964e' },
  { name:'진안군', lat:35.79, lon:127.43, area:789,  type:'gun',   color:'#d0924a' },
  { name:'무주군', lat:35.90, lon:127.66, area:632,  type:'gun',   color:'#cc8e46' },
  { name:'장수군', lat:35.64, lon:127.52, area:534,  type:'gun',   color:'#c88a42' },
  { name:'임실군', lat:35.61, lon:127.28, area:597,  type:'gun',   color:'#c4863e' },
  { name:'순창군', lat:35.37, lon:127.14, area:496,  type:'gun',   color:'#c0823a' },
  { name:'고창군', lat:35.44, lon:126.70, area:605,  type:'gun',   color:'#bc7e36' },
  { name:'부안군', lat:35.73, lon:126.73, area:492,  type:'gun',   color:'#b87a32' },
  { name:'목포시', lat:34.81, lon:126.39, area:47,   type:'si',    color:'#c4643e', f:0.9 },
  { name:'여수시', lat:34.76, lon:127.66, area:512,  type:'si',    color:'#c0603a' },
  { name:'순천시', lat:34.95, lon:127.49, area:906,  type:'si',    color:'#bc5c36' },
  { name:'나주시', lat:35.02, lon:126.71, area:608,  type:'si',    color:'#b85832' },
  { name:'광양시', lat:34.94, lon:127.70, area:429,  type:'si',    color:'#b4542e' },
  { name:'담양군', lat:35.32, lon:126.99, area:454,  type:'gun',   color:'#d4845e' },
  { name:'곡성군', lat:35.28, lon:127.29, area:547,  type:'gun',   color:'#d0805a' },
  { name:'구례군', lat:35.20, lon:127.46, area:443,  type:'gun',   color:'#cc7c56' },
  { name:'고흥군', lat:34.60, lon:127.28, area:799,  type:'gun',   color:'#c87852' },
  { name:'보성군', lat:34.77, lon:127.08, area:663,  type:'gun',   color:'#c4744e' },
  { name:'화순군', lat:35.07, lon:126.99, area:786,  type:'gun',   color:'#c0704a' },
  { name:'장흥군', lat:34.68, lon:126.91, area:620,  type:'gun',   color:'#bc6c46' },
  { name:'강진군', lat:34.64, lon:126.77, area:500,  type:'gun',   color:'#b86842' },
  { name:'해남군', lat:34.57, lon:126.60, area:1007, type:'gun',   color:'#b4643e' },
  { name:'영암군', lat:34.80, lon:126.70, area:604,  type:'gun',   color:'#b0603a' },
  { name:'무안군', lat:34.99, lon:126.48, area:449,  type:'gun',   color:'#ac5c36' },
  { name:'함평군', lat:35.07, lon:126.52, area:393,  type:'gun',   color:'#a85832' },
  { name:'영광군', lat:35.28, lon:126.51, area:474,  type:'gun',   color:'#a4542e' },
  { name:'장성군', lat:35.30, lon:126.78, area:521,  type:'gun',   color:'#a0502a' },
  { name:'완도군', lat:34.31, lon:126.76, area:394,  type:'gun',   color:'#9c4c26' },
  { name:'진도군', lat:34.49, lon:126.26, area:430,  type:'gun',   color:'#984822' },
  { name:'신안군', lat:34.83, lon:126.10, area:655,  type:'gun',   color:'#94441e' },
];

// ── 제주 ────────────────────────────────────────────────────────────────
const JJ_LAT = 33.4, JJ_LON = 126.55;
const jjCities = [
  { name:'제주시',   lat:33.51, lon:126.52, area:978,  type:'si', color:'#3ea6c4' },
  { name:'서귀포시', lat:33.25, lon:126.56, area:875,  type:'si', color:'#3aa2c0' },
];

// ── 부울경 ──────────────────────────────────────────────────────────────
const BU_LAT = 35.3, BU_LON = 128.4;
const buCities = [
  { name:'부산',   lat:35.18, lon:129.05, area:770,  type:'metro', color:'#3e5e9e' },
  { name:'울산',   lat:35.54, lon:129.25, area:1060, type:'metro', color:'#5878b4' },
  { name:'창원시', lat:35.23, lon:128.68, area:747,  type:'si',    color:'#3e7e9e' },
  { name:'진주시', lat:35.18, lon:128.11, area:713,  type:'si',    color:'#3a7a9a' },
  { name:'통영시', lat:34.85, lon:128.43, area:240,  type:'si',    color:'#367696' },
  { name:'사천시', lat:35.00, lon:128.06, area:399,  type:'si',    color:'#327292' },
  { name:'김해시', lat:35.23, lon:128.88, area:463,  type:'si',    color:'#2e6e8e' },
  { name:'밀양시', lat:35.50, lon:128.75, area:799,  type:'si',    color:'#2a6a8a' },
  { name:'거제시', lat:34.88, lon:128.62, area:401,  type:'si',    color:'#266686' },
  { name:'양산시', lat:35.34, lon:129.03, area:485,  type:'si',    color:'#226282' },
  { name:'의령군', lat:35.32, lon:128.26, area:481,  type:'gun',   color:'#4e8ea4' },
  { name:'함안군', lat:35.27, lon:128.41, area:418,  type:'gun',   color:'#4a8aa0' },
  { name:'창녕군', lat:35.54, lon:128.49, area:533,  type:'gun',   color:'#46869c' },
  { name:'고성군', lat:34.98, lon:128.32, area:517,  type:'gun',   color:'#428298' },
  { name:'남해군', lat:34.84, lon:127.89, area:358,  type:'gun',   color:'#3e7e94' },
  { name:'하동군', lat:35.07, lon:127.75, area:675,  type:'gun',   color:'#3a7a90' },
  { name:'산청군', lat:35.41, lon:127.87, area:794,  type:'gun',   color:'#36768c' },
  { name:'함양군', lat:35.52, lon:127.73, area:726,  type:'gun',   color:'#327288' },
  { name:'거창군', lat:35.69, lon:127.91, area:803,  type:'gun',   color:'#2e6e84' },
  { name:'합천군', lat:35.57, lon:128.16, area:984,  type:'gun',   color:'#2a6a80' },
];

// ── 생성 및 저장 ─────────────────────────────────────────────────────────
const OUT_DIR = 'client/public';

fs.writeFileSync(`${OUT_DIR}/map-data-chungcheong.json`, JSON.stringify(makeRegion(ccCities, CC_LAT, CC_LON)));
fs.writeFileSync(`${OUT_DIR}/map-data-honam.json`, JSON.stringify(makeRegion(hnCities, HN_LAT, HN_LON)));
fs.writeFileSync(`${OUT_DIR}/map-data-jeju.json`, JSON.stringify(makeRegion(jjCities, JJ_LAT, JJ_LON)));
fs.writeFileSync(`${OUT_DIR}/map-data-buulgyeong.json`, JSON.stringify(makeRegion(buCities, BU_LAT, BU_LON)));

console.log('✅ 충청권:', makeRegion(ccCities, CC_LAT, CC_LON).length, '개 지역');
console.log('✅ 호남권:', makeRegion(hnCities, HN_LAT, HN_LON).length, '개 지역');
console.log('✅ 제주:', makeRegion(jjCities, JJ_LAT, JJ_LON).length, '개 지역');
console.log('✅ 부울경:', makeRegion(buCities, BU_LAT, BU_LON).length, '개 지역');
