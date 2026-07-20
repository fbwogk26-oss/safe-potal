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
function getTypeAndColor(r) {
  const n = r.name;
  // 광역시/특별시/특별자치시
  if (['대전','광주','부산','울산','대구','인천','서울','세종'].includes(n)) {
    return { type: 'metro', color: '#6b7ad4' };
  }
  // 시 (광역시 제외 일반 시)
  const siNames = [
    // 충청
    '청주','천안','충주','제천','아산','서산','논산','계룡','당진','보령','공주',
    // 호남
    '전주','군산','익산','정읍','남원','김제','목포','여수','순천','나주','광양',
    // 경북
    '포항','경주','김천','안동','구미','영주','영천','상주','문경','경산',
    // 경남
    '창원','진주','통영','사천','김해','밀양','거제','양산',
    // 진해/마산은 창원으로 통합됐지만 GR에 남아 있음
    '진해','마산',
  ];
  if (siNames.includes(n)) return { type: 'si', color: '#5b8a6e' };
  return { type: 'gun', color: '#4a6b8a' };
}

// 한 그룹(regions)을 target 스케일로 변환해 JSON 형식으로 반환
function buildGroup(regions, target) {
  const proj = makeProjector3D(regions, target);
  return regions.map(r => {
    const { type, color } = getTypeAndColor(r);
    // polys: 외곽 링만 사용 (참조 HTML도 rings[0]만 shape로 씀)
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
    const { type, color } = getTypeAndColor(r);
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

// 대구(경북) — 대구/경북 각각 별도 스케일
const daeguRegions = GR.filter(r => r.region === '대구(경북)');
const busanRegions = GR.filter(r => r.region === '부산(경남)');
const chungcheongRegions = GR.filter(r => r.region === '충청');
const honamRegions = GR.filter(r => r.region === '호남');

// 대구 단독 (광역시만 추출)
const daeguOnly = daeguRegions.filter(r => r.name === '대구' || ['중구','동구','서구','남구','북구','수성구','달서구','달성군'].includes(r.name));
// 나머지 경북
const gbOnly = daeguRegions.filter(r => !(['중구','동구','서구','남구','북구','수성구','달서구','달성군'].includes(r.name)) && r.name !== '대구');

// 울릉 인셋
const ulleungInset = INSET.filter(r => r.name === '울릉');
// 제주 인셋
const jejuInset = INSET.filter(r => r.name === '제주시' || r.name === '서귀포');

console.log(`\n대구: ${daeguOnly.length}개, 경북: ${gbOnly.length}개`);
console.log(`충청: ${chungcheongRegions.length}개, 호남: ${honamRegions.length}개, 부산(경남): ${busanRegions.length}개`);
console.log(`울릉: ${ulleungInset.length}개, 제주: ${jejuInset.length}개`);

// JSON 생성 — target은 참조 HTML의 주 지도 target=900을 기준으로 각 권역에 맞게 조정
// 대구: target=500 (작은 광역시), 경북: target=1200 (큰 도), 충청/호남/부울경: target=900
const daeguJSON = buildGroup(daeguOnly.length > 0 ? daeguOnly : daeguRegions.slice(0,8), 500);
const gbJSON    = buildGroup(gbOnly.length > 0 ? gbOnly : daeguRegions.slice(8), 1200);
const ulleungJSON = buildInset(ulleungInset, 220);
const chungcheongJSON = buildGroup(chungcheongRegions, 900);
const honamJSON       = buildGroup(honamRegions, 900);
const busanJSON       = buildGroup(busanRegions, 900);
const jejuJSON        = buildInset(jejuInset, 280);

// 파일 저장
const files = [
  ['map-data-daegu.json', daeguJSON],
  ['map-data-gb.json', gbJSON],
  ['map-data-ulleung.json', ulleungJSON],
  ['map-data-chungcheong.json', chungcheongJSON],
  ['map-data-honam.json', honamJSON],
  ['map-data-buulgyeong.json', busanJSON],
  ['map-data-jeju.json', jejuJSON],
];

files.forEach(([name, data]) => {
  const fp = path.join(OUT, name);
  fs.writeFileSync(fp, JSON.stringify(data));
  console.log(`✅ ${name}: ${data.length}개 지역 (${fs.statSync(fp).size} bytes)`);
});

console.log('\n✅ 완료!');
