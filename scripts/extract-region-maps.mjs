import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const SRC = path.join(__dirname, '../attached_assets/Pasted--DOCTYPE-html-html-lang-ko-head-meta-charset-UTF-8-meta_1784536487055.txt');
const OUT = path.join(__dirname, '../client/public');

const html = fs.readFileSync(SRC, 'utf8');

// GR 배열 추출
const grMatch = html.match(/const GR=(\[.+?\]);(?:\n|\r)/s);
if (!grMatch) { console.error('GR not found'); process.exit(1); }
const GR = JSON.parse(grMatch[1].replace(/\n/g,''));

// INSET 배열 추출
const insetMatch = html.match(/const INSET=(\[.+?\]);(?:\n|\r)/s);
if (!insetMatch) { console.error('INSET not found'); process.exit(1); }
const INSET = JSON.parse(insetMatch[1].replace(/\n/g,''));

console.log(`GR: ${GR.length}개 지역, INSET: ${INSET.length}개`);
GR.forEach(r => process.stdout.write(`  ${r.name}(${r.region}) `));
console.log('');

// 참조 HTML과 동일한 makeProjector3D
function makeProjector3D(regions, target) {
  let minX=1e9,maxX=-1e9,minY=1e9,maxY=-1e9;
  for(const r of regions) for(const poly of r.polys) for(const ring of poly) for(const pt of ring){
    if(pt[0]<minX)minX=pt[0]; if(pt[0]>maxX)maxX=pt[0];
    if(pt[1]<minY)minY=pt[1]; if(pt[1]>maxY)maxY=pt[1];
  }
  const cx=(minX+maxX)/2, cy=(minY+maxY)/2;
  const scaleLat=Math.cos(cy*Math.PI/180);
  const w=(maxX-minX)*scaleLat, h=(maxY-minY);
  const s=target/Math.max(w,h,0.0001);
  return (lon,lat)=>({x:(lon-cx)*scaleLat*s, y:(lat-cy)*s});
}

// 지역 타입 / 색상 결정
function getTypeAndColor(r, regionHint) {
  const n = r.name;
  // 광역시/특별시/특별자치시
  if (['대전','광주','부산','울산','대구','인천','서울','세종'].includes(n)) {
    if (regionHint === 'all') return { type:'metro', color:'#7c6fc4' };
    return { type: 'metro', color: '#6b7ad4' };
  }
  // 시 (광역시 제외 일반 시)
  const siNames = [
    '청주','천안','충주','제천','아산','서산','논산','계룡','당진','보령','공주',
    '전주','군산','익산','정읍','남원','김제','목포','여수','순천','나주','광양',
    '포항','경주','김천','안동','구미','영주','영천','상주','문경','경산',
    '창원','진주','통영','사천','김해','밀양','거제','양산',
    '진해','마산',
  ];
  if (siNames.includes(n)) {
    if (regionHint === 'all') {
      if (r.region === '충청') return { type:'si', color:'#5b8a6e' };
      if (r.region === '호남') return { type:'si', color:'#3a8a9a' };
      if (r.region === '부산(경남)') return { type:'si', color:'#b06a4a' };
      return { type:'si', color:'#6b7ad4' };
    }
    return { type: 'si', color: '#5b8a6e' };
  }
  if (regionHint === 'all') {
    if (r.region === '충청') return { type:'gun', color:'#3a6a4e' };
    if (r.region === '호남') return { type:'gun', color:'#2a6a7a' };
    if (r.region === '부산(경남)') return { type:'gun', color:'#905a3a' };
    return { type:'gun', color:'#4a5c8a' };
  }
  return { type: 'gun', color: '#4a6b8a' };
}

// 한 그룹(regions)을 target 스케일로 변환해 JSON 형식으로 반환
function buildGroup(regions, target, hint) {
  const proj = makeProjector3D(regions, target);
  return regions.map(r => {
    const { type, color } = getTypeAndColor(r, hint);
    const polys = r.polys.map(rings => {
      const outer = rings[0];
      return outer.map(([lon, lat]) => {
        const p = proj(lon, lat);
        return [Math.round(p.x * 10) / 10, Math.round(p.y * 10) / 10];
      });
    });
    const cp = proj(r.center[0], r.center[1]);
    return {
      name: r.name,
      type,
      color,
      polys,
      label: [Math.round(cp.x * 10) / 10, Math.round(cp.y * 10) / 10],
    };
  });
}

// 인셋: target=220 (울릉), target=280 (제주 두 시 합산)
function buildInset(regions, target) {
  const proj = makeProjector3D(regions, target);
  return regions.map(r => {
    const { type, color } = getTypeAndColor(r, null);
    const polys = r.polys.map(rings => {
      const outer = rings[0];
      return outer.map(([lon, lat]) => {
        const p = proj(lon, lat);
        return [Math.round(p.x * 10) / 10, Math.round(p.y * 10) / 10];
      });
    });
    const cp = proj(r.center[0], r.center[1]);
    return {
      name: r.name,
      type: 'inset',
      color: '#5b8a6e',
      polys,
      label: [Math.round(cp.x * 10) / 10, Math.round(cp.y * 10) / 10],
    };
  });
}

// ─────────────────────────────────────────────────────────────
// 대구광역시 구 단위 근사 폴리곤 (lat/lon 직사각형 근사)
// GR 데이터에 구 단위 폴리곤이 없으므로 실제 행정 경계에 기반한 근사값 사용
// ─────────────────────────────────────────────────────────────
const DAEGU_DISTRICT_DEFS = [
  { name:'중구',   lon:[128.574,128.623], lat:[35.849,35.893], color:'#7c6fc4', type:'metro' },
  { name:'동구',   lon:[128.623,128.740], lat:[35.870,35.978], color:'#5b72c4', type:'metro' },
  { name:'서구',   lon:[128.508,128.574], lat:[35.855,35.900], color:'#4a7ac7', type:'metro' },
  { name:'남구',   lon:[128.556,128.645], lat:[35.810,35.854], color:'#6a5aa0', type:'metro' },
  { name:'북구',   lon:[128.508,128.648], lat:[35.893,35.978], color:'#5a7fb8', type:'metro' },
  { name:'수성구', lon:[128.598,128.740], lat:[35.810,35.870], color:'#6a6fc4', type:'metro' },
  { name:'달서구', lon:[128.474,128.592], lat:[35.790,35.866], color:'#5a78b8', type:'metro' },
  { name:'달성군', lon:[128.373,128.524], lat:[35.718,35.830], color:'#4a6b8a', type:'gun'   },
];

function makeRect(lon0, lon1, lat0, lat1) {
  return [ [[lon0,lat1],[lon1,lat1],[lon1,lat0],[lon0,lat0]] ];
}

function buildDaeguDistricts(target) {
  // makeProjector3D에서 bounds를 계산하기 위해 region-like 객체 구성
  const fake = DAEGU_DISTRICT_DEFS.map(d => ({
    name: d.name,
    polys: [makeRect(d.lon[0], d.lon[1], d.lat[0], d.lat[1])],
    center: [(d.lon[0]+d.lon[1])/2, (d.lat[0]+d.lat[1])/2],
  }));
  const proj = makeProjector3D(fake, target);
  return DAEGU_DISTRICT_DEFS.map((d, i) => {
    const pts = fake[i].polys[0][0];
    const polys = [pts.map(([lon, lat]) => {
      const p = proj(lon, lat);
      return [Math.round(p.x*10)/10, Math.round(p.y*10)/10];
    })];
    const c = fake[i].center;
    const cp = proj(c[0], c[1]);
    return {
      name: d.name,
      type: d.type,
      color: d.color,
      polys,
      label: [Math.round(cp.x*10)/10, Math.round(cp.y*10)/10],
    };
  });
}

// ─────────────────────────────────────────────────────────────
// 전체 지도 (4개 권역 + 제주 전체를 하나의 스케일로 투영)
// ─────────────────────────────────────────────────────────────
function buildAllMap(target) {
  // 대구경북 : 대구 단일 + 경북 / 충청 / 호남 / 부산경남 (울릉 제외 — 너무 멀리 있어 스케일 왜곡)
  const all = GR.concat(INSET.filter(r => r.name === '제주시' || r.name === '서귀포'));
  const proj = makeProjector3D(all, target);

  const REGION_COLORS = {
    '대구(경북)': { metro:'#7c6fc4', si:'#6b7ad4', gun:'#4a5c8a' },
    '충청':       { metro:'#5b8a6e', si:'#5b9a7e', gun:'#3a6a4e' },
    '호남':       { metro:'#3a8a9a', si:'#3a9ab0', gun:'#2a6a7a' },
    '부산(경남)': { metro:'#c47a5a', si:'#b07050', gun:'#905a3a' },
  };

  return all.map(r => {
    const rc = REGION_COLORS[r.region] ?? { metro:'#6b7ad4', si:'#5b8a6e', gun:'#4a6b8a' };
    const siNames = [
      '청주','천안','충주','제천','아산','서산','논산','계룡','당진','보령','공주',
      '전주','군산','익산','정읍','남원','김제','목포','여수','순천','나주','광양',
      '포항','경주','김천','안동','구미','영주','영천','상주','문경','경산',
      '창원','진주','통영','사천','김해','밀양','거제','양산','진해','마산',
    ];
    let type, color;
    if (['대전','광주','부산','울산','대구','세종'].includes(r.name)) { type='metro'; color=rc.metro; }
    else if (siNames.includes(r.name)) { type='si'; color=rc.si; }
    else { type='gun'; color=rc.gun; }

    const polys = r.polys.map(rings => {
      const outer = rings[0];
      return outer.map(([lon, lat]) => {
        const p = proj(lon, lat);
        return [Math.round(p.x*10)/10, Math.round(p.y*10)/10];
      });
    });
    const cp = proj(r.center[0], r.center[1]);
    return {
      name: r.name,
      type,
      color,
      polys,
      label: [Math.round(cp.x*10)/10, Math.round(cp.y*10)/10],
    };
  });
}

// ─────────────────────────────────────────────────────────────
// 지역 그룹 분류
// ─────────────────────────────────────────────────────────────
const daeguRegions = GR.filter(r => r.region === '대구(경북)');
const busanRegions = GR.filter(r => r.region === '부산(경남)');
const chungcheongRegions = GR.filter(r => r.region === '충청');
const honamRegions = GR.filter(r => r.region === '호남');

const gbOnly = daeguRegions.filter(r => r.name !== '대구');
const ulleungInset = INSET.filter(r => r.name === '울릉');
const jejuInset = INSET.filter(r => r.name === '제주시' || r.name === '서귀포');

console.log(`\n대구 구 단위: ${DAEGU_DISTRICT_DEFS.length}개, 경북: ${gbOnly.length}개`);
console.log(`충청: ${chungcheongRegions.length}개, 호남: ${honamRegions.length}개, 부산(경남): ${busanRegions.length}개`);
console.log(`울릉: ${ulleungInset.length}개, 제주: ${jejuInset.length}개`);

// JSON 생성
const daeguJSON        = buildDaeguDistricts(500);
const gbJSON           = buildGroup(gbOnly, 1200);
const ulleungJSON      = buildInset(ulleungInset, 220);
const chungcheongJSON  = buildGroup(chungcheongRegions, 900);
const honamJSON        = buildGroup(honamRegions, 900);
const busanJSON        = buildGroup(busanRegions, 900);
const jejuJSON         = buildInset(jejuInset, 280);
const allJSON          = buildAllMap(1800);

// 파일 저장
const files = [
  ['map-data-daegu.json',        daeguJSON],
  ['map-data-gb.json',           gbJSON],
  ['map-data-ulleung.json',      ulleungJSON],
  ['map-data-chungcheong.json',  chungcheongJSON],
  ['map-data-honam.json',        honamJSON],
  ['map-data-buulgyeong.json',   busanJSON],
  ['map-data-jeju.json',         jejuJSON],
  ['map-data-all.json',          allJSON],
];

files.forEach(([name, data]) => {
  const fp = path.join(OUT, name);
  fs.writeFileSync(fp, JSON.stringify(data));
  console.log(`✅ ${name}: ${data.length}개 지역 (${fs.statSync(fp).size} bytes)`);
});

console.log('\n✅ 완료!');
