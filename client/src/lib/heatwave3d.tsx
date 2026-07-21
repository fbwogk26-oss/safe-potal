import * as THREE from "three";

// ─── Types ──────────────────────────────────────────────────────────────────
export interface MapRegion { name: string; type: string; color: string; polys: number[][][]; label: number[]; }
export interface PanelOpts {
  height: number; bevel: number; radius: number; theta: number; phi: number;
  baseRadius: number; fogNear: number; fogFar: number; sun: [number,number,number];
  labels: boolean; fontSize: number; spin: boolean; lockView?: boolean;
  tx?: number; ty?: number; tz?: number;
}
export interface RegionEntry { meshes: THREE.Mesh[]; topMat: THREE.MeshStandardMaterial; sideMat: THREE.MeshStandardMaterial; baseColor: THREE.Color; baseDepth: number; sprite: THREE.Sprite | null; }
export interface ThreePanel { scene: THREE.Scene; camera: THREE.PerspectiveCamera; renderer: THREE.WebGLRenderer; tick: () => void; cleanup: () => void; }
export type HourlyWeather = { time: string; temp: number | null; hum: number | null; feels: number; stage: string; rainType: string; rain: string; wind: number | null; windLevel: string };
export interface RegionWeather { feels: number; temp: number | null; hum: number | null; stage: string; time: string; rainType?: string; rain?: string; wind?: number | null; windLevel?: string; hourly?: HourlyWeather[]; }
export type RegionKey = 'all' | 'daegubuk' | 'chungcheong' | 'honam' | 'buulgyeong';
export const REGION_TABS: { key: RegionKey; label: string; sub: string }[] = [
  { key: 'all',         label: '전체 지도', sub: '전체 권역' },
  { key: 'chungcheong', label: '충청본부',  sub: '대전·세종·충북·충남' },
  { key: 'honam',       label: '호남본부',  sub: '광주·전북·전남·제주' },
  { key: 'buulgyeong',  label: '부산본부',  sub: '부산·울산·경남' },
  { key: 'daegubuk',    label: '대구본부',  sub: '대구·경북' },
];

// ─── Color helpers ──────────────────────────────────────────────────────────
function rgbHex(c: [number,number,number]): string { return '#' + c.map(v => v.toString(16).padStart(2,'0')).join(''); }
export function heatColorHex(t: number): string {
  const stops: [number, [number,number,number]][] = [
    [20, [0x3a,0xa0,0xa0]], [28, [0xf2,0xd2,0x4b]], [31, [0xf7,0xb7,0x33]],
    [33, [0xf2,0x71,0x1c]], [35, [0xe0,0x39,0x2b]], [38, [0x8b,0x1e,0x1e]],
  ];
  if (t <= stops[0][0]) return rgbHex(stops[0][1]);
  for (let i = 0; i < stops.length - 1; i++) {
    const [t0, c0] = stops[i], [t1, c1] = stops[i+1];
    if (t >= t0 && t <= t1) {
      const f = (t - t0) / (t1 - t0);
      return rgbHex(c0.map((v, idx) => Math.round(v + (c1[idx] - v) * f)) as [number,number,number]);
    }
  }
  return rgbHex(stops[stops.length-1][1]);
}
export function heatHeightScale(t: number, base: number): number {
  const h = 10 + (t - 20) * 4.2;
  return Math.max(8, Math.min(95, h)) / base;
}

// ─── Sprite label ───────────────────────────────────────────────────────────
export function makeLabelSprite3D(text: string, fontSize: number): THREE.Sprite {
  const c2 = document.createElement('canvas');
  const ctx2 = c2.getContext('2d')!;
  ctx2.font = `700 ${fontSize}px 'Malgun Gothic', sans-serif`;
  const padX = 16, tw = Math.ceil(ctx2.measureText(text).width) + padX*2, th = fontSize + 20;
  c2.width = tw*2; c2.height = th*2;
  ctx2.scale(2,2);
  ctx2.font = `700 ${fontSize}px 'Malgun Gothic', sans-serif`;
  ctx2.textBaseline = 'middle'; ctx2.textAlign = 'center';
  ctx2.fillStyle = 'rgba(12,15,20,0.72)';
  const rr = 8;
  ctx2.beginPath();
  ctx2.moveTo(rr,0); ctx2.arcTo(tw,0,tw,th,rr); ctx2.arcTo(tw,th,0,th,rr);
  ctx2.arcTo(0,th,0,0,rr); ctx2.arcTo(0,0,tw,0,rr);
  ctx2.closePath(); ctx2.fill();
  ctx2.fillStyle = '#f2f5f8';
  ctx2.fillText(text, tw/2, th/2+1);
  const tex = new THREE.CanvasTexture(c2);
  tex.minFilter = THREE.LinearFilter;
  const mat = new THREE.SpriteMaterial({ map: tex, depthTest: true, depthWrite: false, transparent: true });
  const sprite = new THREE.Sprite(mat);
  sprite.scale.set(tw*0.36, th*0.36, 1);
  return sprite;
}

// ─── Panel initializer ───────────────────────────────────────────────────────
export function initThreePanel(
  mount: HTMLElement,
  regions: MapRegion[],
  opts: PanelOpts,
  registry: Record<string, RegionEntry>,
  tooltipEl: HTMLElement | null,
  weatherRef: { current: Record<string, RegionWeather> },
  onRegionClick?: (name: string, weather: RegionWeather | null) => void
): ThreePanel {
  const W = () => mount.clientWidth, H = () => mount.clientHeight;
  const scene = new THREE.Scene();
  scene.background = new THREE.Color(0x0d1117);
  scene.fog = new THREE.Fog(0x0d1117, opts.fogNear, opts.fogFar);
  const camera = new THREE.PerspectiveCamera(42, W()/H(), 1, 5000);
  const renderer = new THREE.WebGLRenderer({ antialias: true, preserveDrawingBuffer: true });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio,2));
  renderer.setSize(W(), H());
  renderer.shadowMap.enabled = true;
  mount.appendChild(renderer.domElement);
  scene.add(new THREE.HemisphereLight(0xd4e8ff, 0x1a1f28, 1.2));
  const sun = new THREE.DirectionalLight(0xfff8f0, 1.6);
  sun.position.set(...opts.sun); sun.castShadow = true;
  sun.shadow.mapSize.set(1024,1024);
  const fs = opts.fogFar*0.6;
  (sun.shadow.camera as any).left=-fs; (sun.shadow.camera as any).right=fs;
  (sun.shadow.camera as any).top=fs; (sun.shadow.camera as any).bottom=-fs;
  (sun.shadow.camera as any).near=10; (sun.shadow.camera as any).far=opts.fogFar*2;
  sun.shadow.bias=-0.0018; scene.add(sun);
  const root = new THREE.Group(); scene.add(root);
  const base = new THREE.Mesh(new THREE.CircleGeometry(opts.baseRadius,64), new THREE.MeshStandardMaterial({color:0x0c1018,roughness:0.9,metalness:0.12}));
  base.rotation.x = -Math.PI/2; base.position.y = -2; base.receiveShadow = true; root.add(base);
  const grid = new THREE.GridHelper(opts.baseRadius*2, 28, 0x1e2535, 0x141b26);
  (grid as any).position.y = -1.8; root.add(grid);
  const HEIGHT = opts.height, raycastTargets: THREE.Mesh[] = [];
  regions.forEach(region => {
    const baseColor = new THREE.Color(region.color);
    const topMat = new THREE.MeshStandardMaterial({color:baseColor.clone(),roughness:0.6,metalness:0.12,side:THREE.DoubleSide});
    const sideMat = new THREE.MeshStandardMaterial({color:baseColor.clone().multiplyScalar(0.65),roughness:0.85,metalness:0.06,side:THREE.DoubleSide});
    const entry: RegionEntry = { meshes: [], topMat, sideMat, baseColor, baseDepth: HEIGHT, sprite: null };
    registry[region.name] = entry;
    region.polys.forEach(ring => {
      if (ring.length < 3) return;
      const shape = new THREE.Shape();
      shape.moveTo(ring[0][0], ring[0][1]);
      for (let i=1;i<ring.length;i++) shape.lineTo(ring[i][0], ring[i][1]);
      shape.closePath();
      const geo = new THREE.ExtrudeGeometry(shape,{depth:HEIGHT,bevelEnabled:true,bevelThickness:opts.bevel,bevelSize:opts.bevel,bevelSegments:2,steps:1});
      geo.rotateX(-Math.PI/2);
      const mesh = new THREE.Mesh(geo,[topMat,sideMat]);
      mesh.castShadow = true; mesh.receiveShadow = true;
      mesh.userData.name = region.name; mesh.userData.type = region.type;
      mesh.userData.topMat = topMat; mesh.userData.baseColor = baseColor;
      root.add(mesh); raycastTargets.push(mesh); entry.meshes.push(mesh);
      const edgePts = [...ring, ring[0]].map(([x,y]) => new THREE.Vector3(x, HEIGHT + opts.bevel + 0.8, -y));
      const edgeGeo2 = new THREE.BufferGeometry().setFromPoints(edgePts);
      const edgeMat2 = new THREE.LineBasicMaterial({ color: 0xffffff, opacity: 0.35, transparent: true });
      const edgeLine2 = new THREE.Line(edgeGeo2, edgeMat2);
      edgeLine2.renderOrder = 1;
      root.add(edgeLine2);
    });
    if (opts.labels && region.label) {
      const sprite = makeLabelSprite3D(region.name, opts.fontSize);
      sprite.position.set(region.label[0], HEIGHT+10, -region.label[1]);
      sprite.renderOrder = 2; root.add(sprite); entry.sprite = sprite;
    }
    // 면적이 작은 지역(계룡·증평 등)을 위한 투명 히트박스 구체
    // — visible=true + opacity=0 이어야 Raycaster가 감지함
    if (region.label) {
      const hitGeo = new THREE.SphereGeometry(48, 8, 8);
      const hitMat = new THREE.MeshBasicMaterial({ transparent: true, opacity: 0, depthWrite: false });
      const hitMesh = new THREE.Mesh(hitGeo, hitMat);
      hitMesh.position.set(region.label[0], HEIGHT * 0.5, -region.label[1]);
      hitMesh.userData.name = region.name;
      hitMesh.userData.type = region.type;
      hitMesh.userData.topMat = entry.topMat;
      hitMesh.userData.baseColor = entry.baseColor;
      root.add(hitMesh); raycastTargets.push(hitMesh);
    }
  });
  let radius = opts.radius, theta = opts.theta, phi = opts.phi;
  const target = new THREE.Vector3(opts.tx ?? 0, opts.ty ?? 0, opts.tz ?? 0);
  function updateCam() {
    camera.position.x = target.x + radius*Math.sin(phi)*Math.sin(theta);
    camera.position.y = target.y + radius*Math.cos(phi);
    camera.position.z = target.z + radius*Math.sin(phi)*Math.cos(theta);
    camera.lookAt(target);
  }
  updateCam();
  let dragging = false, lastX = 0, lastY = 0;
  const dom = renderer.domElement;
  const raycaster = new THREE.Raycaster(), mouseNDC = new THREE.Vector2();
  let hovered: THREE.Mesh | null = null;
  function setHi(mesh: THREE.Mesh | null, on: boolean) {
    if (!mesh) return;
    const c = (mesh.userData.baseColor as THREE.Color).clone();
    if (on) c.multiplyScalar(1.35);
    (mesh.userData.topMat as THREE.MeshStandardMaterial).color.copy(c);
  }
  function pick(cx: number, cy: number): THREE.Mesh | null {
    const rect = dom.getBoundingClientRect();
    mouseNDC.x = ((cx-rect.left)/rect.width)*2-1;
    mouseNDC.y = -((cy-rect.top)/rect.height)*2+1;
    raycaster.setFromCamera(mouseNDC, camera);
    const hits = raycaster.intersectObjects(raycastTargets);
    return hits.length ? hits[0].object as THREE.Mesh : null;
  }
  let downX = 0, downY = 0;
  // 멀티 터치(핀치줌) 추적
  const activePointers = new Map<number, {x:number,y:number}>();
  let lastPinchDist = 0;
  const onPD = (e: PointerEvent) => {
    activePointers.set(e.pointerId, {x:e.clientX, y:e.clientY});
    downX=e.clientX; downY=e.clientY;
    const isTouch = e.pointerType === 'touch';
    // 터치는 lockView 무시하고 드래그 허용
    if (!opts.lockView || isTouch) {
      if (activePointers.size === 1) { dragging=true; lastX=e.clientX; lastY=e.clientY; }
      else { dragging=false; } // 두 손가락이면 드래그 중단
    }
  };
  const onPM = (e: PointerEvent) => {
    activePointers.set(e.pointerId, {x:e.clientX, y:e.clientY});
    // 핀치줌: 두 포인터
    if (activePointers.size >= 2) {
      dragging = false;
      const pts = [...activePointers.values()];
      const dist = Math.hypot(pts[1].x-pts[0].x, pts[1].y-pts[0].y);
      if (lastPinchDist > 0) {
        const delta = lastPinchDist - dist;
        radius = Math.max(opts.radius*0.35, Math.min(opts.radius*2.2, radius + delta*(opts.radius*0.004)));
        updateCam();
      }
      lastPinchDist = dist;
      return;
    }
    lastPinchDist = 0;
    if (dragging) {
      const dx=e.clientX-lastX, dy=e.clientY-lastY;
      lastX=e.clientX; lastY=e.clientY;
      if (tooltipEl) tooltipEl.style.display='none';
      const camDir=new THREE.Vector3(target.x-camera.position.x,target.y-camera.position.y,target.z-camera.position.z).normalize();
      const right=new THREE.Vector3().crossVectors(camDir,new THREE.Vector3(0,1,0)).normalize();
      const up=new THREE.Vector3().crossVectors(right,camDir).normalize();
      const panScale=radius*0.0015;
      target.addScaledVector(right,-dx*panScale);
      target.addScaledVector(up,dy*panScale);
      updateCam();
      return;
    }
    const obj = pick(e.clientX, e.clientY);
    if (obj !== hovered) { setHi(hovered,false); hovered=obj; setHi(hovered,true); }
    if (tooltipEl) {
      if (obj) {
        tooltipEl.style.display='block';
        tooltipEl.style.left=e.clientX+'px'; tooltipEl.style.top=e.clientY+'px';
        const typeLabel = obj.userData.type==='metro' ? '(광역시)' : (obj.userData.type==='si' ? '(시)' : obj.userData.type==='gun' ? '(군)' : '');
        const w = weatherRef.current[obj.userData.name];
        let html = `<strong>${obj.userData.name}</strong><span class="tt-sub">${typeLabel}</span>`;
        if (w) html += `<span class="tt-weather">체감 ${w.feels}°C · 기온 ${w.temp??'-'}°C · 습도 ${w.hum??'-'}%${w.stage?'<br>'+w.stage:''}${w.time?' ('+w.time+' 기준)':''}</span>`;
        tooltipEl.innerHTML = html;
      } else tooltipEl.style.display='none';
    }
  };
  const onPL = () => { if (tooltipEl) tooltipEl.style.display='none'; };
  const onPU = (e: PointerEvent) => {
    activePointers.delete(e.pointerId);
    lastPinchDist = 0;
    if (activePointers.size === 0) {
      dragging=false;
      if (Math.abs(e.clientX-downX) < 8 && Math.abs(e.clientY-downY) < 8) {
        const obj = pick(e.clientX, e.clientY);
        if (obj && onRegionClick) onRegionClick(obj.userData.name, weatherRef.current[obj.userData.name] ?? null);
      }
    } else {
      dragging = false;
    }
  };
  const onWh = (e: WheelEvent) => {
    e.preventDefault();
    const rect=dom.getBoundingClientRect();
    const ndcX=((e.clientX-rect.left)/rect.width)*2-1;
    const ndcY=-((e.clientY-rect.top)/rect.height)*2+1;
    const oldRadius=radius;
    radius=Math.max(opts.radius*0.35,Math.min(opts.radius*2.2,radius+e.deltaY*(opts.radius*0.0006)));
    const moved=oldRadius-radius;
    if (Math.abs(moved)>0.01) {
      const camDir=new THREE.Vector3(target.x-camera.position.x,target.y-camera.position.y,target.z-camera.position.z).normalize();
      const right=new THREE.Vector3().crossVectors(camDir,new THREE.Vector3(0,1,0)).normalize();
      const up=new THREE.Vector3().crossVectors(right,camDir).normalize();
      const shift=moved*0.38;
      target.addScaledVector(right,ndcX*shift);
      target.addScaledVector(up,ndcY*shift);
    }
    updateCam();
  };
  const onRS = () => { camera.aspect=W()/H(); camera.updateProjectionMatrix(); renderer.setSize(W(),H()); };
  dom.addEventListener('pointerdown',onPD);
  dom.style.touchAction = 'none'; // 브라우저 기본 터치 스크롤 방지
  window.addEventListener('pointermove',onPM as any);
  window.addEventListener('pointerup',onPU);
  dom.addEventListener('pointerleave',onPL);
  dom.addEventListener('wheel',onWh,{passive:false});
  window.addEventListener('resize',onRS);
  function tick() { if(opts.spin){ theta+=0.0016; updateCam(); } }
  function cleanup() {
    dom.removeEventListener('pointerdown',onPD);
    window.removeEventListener('pointermove',onPM as any);
    window.removeEventListener('pointerup',onPU);
    dom.removeEventListener('pointerleave',onPL);
    dom.removeEventListener('wheel',onWh);
    window.removeEventListener('resize',onRS);
    renderer.dispose();
    if (dom.parentElement) dom.parentElement.removeChild(dom);
  }
  return { scene, camera, renderer, tick, cleanup };
}

// ─── Warning badge helper ────────────────────────────────────────────────────
function warningBadgeStyle(type: string): { bg: string; color: string; border: string } {
  if (type.includes('태풍')) return { bg: '#4a1d96', color: '#c4b5fd', border: '#6d28d9' };
  if (type.includes('호우') && type.includes('경보')) return { bg: '#1e3a5f', color: '#93c5fd', border: '#1d4ed8' };
  if (type.includes('호우')) return { bg: '#1e3799', color: '#bfdbfe', border: '#3b82f6' };
  if (type.includes('강풍') && type.includes('경보')) return { bg: '#374151', color: '#e5e7eb', border: '#6b7280' };
  if (type.includes('강풍')) return { bg: '#1f2937', color: '#d1d5db', border: '#9ca3af' };
  if (type.includes('폭염') && type.includes('경보')) return { bg: '#7f1d1d', color: '#fca5a5', border: '#dc2626' };
  if (type.includes('폭염')) return { bg: '#7c2d12', color: '#fdba74', border: '#ea580c' };
  if (type.includes('열대야') && type.includes('경보')) return { bg: '#3b0764', color: '#e9d5ff', border: '#7c3aed' };
  if (type.includes('열대야')) return { bg: '#4c1d95', color: '#ddd6fe', border: '#8b5cf6' };
  if (type.includes('대설') && type.includes('경보')) return { bg: '#1e3a5f', color: '#bae6fd', border: '#0284c7' };
  if (type.includes('대설')) return { bg: '#0c4a6e', color: '#e0f2fe', border: '#0ea5e9' };
  if (type.includes('한파') && type.includes('경보')) return { bg: '#1e3a5f', color: '#a5f3fc', border: '#06b6d4' };
  if (type.includes('한파')) return { bg: '#164e63', color: '#cffafe', border: '#22d3ee' };
  if (type.includes('경보')) return { bg: '#7f1d1d', color: '#fca5a5', border: '#dc2626' };
  if (type.includes('주의보')) return { bg: '#78350f', color: '#fde68a', border: '#d97706' };
  return { bg: '#374151', color: '#e5e7eb', border: '#6b7280' };
}

// ─── Region Info Card ────────────────────────────────────────────────────────
export function RegionInfoCard({
  info,
  onClose,
  heatColorFn,
  warnings,
}: {
  info: { name: string; weather: RegionWeather | null };
  onClose: () => void;
  heatColorFn: (t: number) => string;
  warnings?: { type: string; regions: string }[];
}) {
  const w = info.weather;

  // 이 지역에 해당하는 특보 필터링 (regions 텍스트에 도시명 포함 여부)
  const cityWarnings = (warnings ?? []).filter(wn => {
    if (!wn.regions) return false;
    // 단순 포함 여부 (예: '대구' → '대구중부, 달성남부' 등도 매칭)
    return wn.regions.includes(info.name);
  });

  return (
    <div style={{
      position:'absolute', top:8, left:8, zIndex:20,
      background:'rgba(10,14,22,0.93)',
      border:'1px solid rgba(255,255,255,0.13)',
      borderRadius:12, padding:'10px 14px',
      backdropFilter:'blur(6px)',
      WebkitBackdropFilter:'blur(6px)',
      minWidth:160, maxWidth:240,
      boxShadow:'0 8px 24px rgba(0,0,0,0.5)',
      pointerEvents:'auto',
    }}>
      <div style={{display:'flex', justifyContent:'space-between', alignItems:'flex-start', marginBottom:8}}>
        <span style={{fontSize:15, fontWeight:700, color:'#e8ecf1', lineHeight:1.2}}>{info.name}</span>
        <button
          onClick={onClose}
          style={{background:'none',border:'none',color:'#697384',cursor:'pointer',fontSize:16,padding:'0 0 0 8px',lineHeight:1,flexShrink:0}}
        >✕</button>
      </div>
      {w ? (
        <>
          <div style={{display:'flex', alignItems:'baseline', gap:4, marginBottom:6}}>
            <span style={{fontSize:32, fontWeight:800, color: heatColorFn(w.feels), lineHeight:1}}>{w.feels}</span>
            <span style={{fontSize:14, color: heatColorFn(w.feels), fontWeight:600}}>°C</span>
            <span style={{fontSize:11, color:'#9aa5b3', marginLeft:2}}>체감</span>
          </div>
          <div style={{display:'grid', gridTemplateColumns:'auto 1fr', columnGap:10, rowGap:4, fontSize:12}}>
            <span style={{color:'#697384'}}>기온</span>
            <span style={{color:'#c5cdd7', fontWeight:600}}>{w.temp != null ? `${w.temp}°C` : '-'}</span>
            <span style={{color:'#697384'}}>습도</span>
            <span style={{color:'#7dd3fc', fontWeight:600}}>{w.hum != null ? `${w.hum}%` : '-'}</span>
            {w.wind != null && <>
              <span style={{color:'#697384'}}>풍속</span>
              <span style={{color:'#a3c4f3', fontWeight:600}}>{w.wind}m/s</span>
            </>}
          </div>
          {w.stage && (
            <div style={{marginTop:8, fontSize:11, fontWeight:600, color:'#ffd9a0',
              background:'rgba(255,200,100,0.08)', borderRadius:5, padding:'3px 7px',
              display:'inline-block'}}>
              {w.stage}
            </div>
          )}
          {w.time && (
            <div style={{marginTop:4, fontSize:10, color:'#4a5568'}}>{w.time} 기준</div>
          )}
        </>
      ) : (
        <div style={{fontSize:12, color:'#697384'}}>데이터 없음</div>
      )}
      {/* 기상청 특보 배지 */}
      {cityWarnings.length > 0 && (
        <div style={{marginTop:8, display:'flex', flexDirection:'column', gap:3}}>
          <div style={{fontSize:9, color:'#697384', letterSpacing:'0.5px', marginBottom:1}}>📢 기상청 특보</div>
          {cityWarnings.map((wn, i) => {
            const st = warningBadgeStyle(wn.type);
            return (
              <span key={i} style={{
                display:'inline-block', fontSize:10, fontWeight:700,
                padding:'2px 6px', borderRadius:4,
                background:st.bg, color:st.color,
                border:`1px solid ${st.border}`,
              }}>{wn.type}</span>
            );
          })}
        </div>
      )}
    </div>
  );
}
