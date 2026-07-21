import { useState, useRef, useEffect } from "react";
import {
  MapRegion, PanelOpts, RegionEntry, ThreePanel, RegionWeather,
  RegionKey, REGION_TABS, heatColorHex, heatHeightScale,
  makeLabelSprite3D, initThreePanel, RegionInfoCard,
} from "@/lib/heatwave3d";
import * as THREE from "three";

interface MapDataStore {
  all: MapRegion[]; daegubuk: MapRegion[]; ulleung: MapRegion[];
  chungcheong: MapRegion[]; honam: MapRegion[]; jeju: MapRegion[]; buulgyeong: MapRegion[];
}

function stageLabel(feels: number) {
  if (feels >= 38) return { text: "폭염경보", color: "#dc2626" };
  if (feels >= 35) return { text: "폭염주의보", color: "#ea580c" };
  if (feels >= 33) return { text: "폭염관심", color: "#d97706" };
  return { text: "해당없음", color: "#6b7280" };
}

const REGION_KEY_MAP: Record<RegionKey, string[]> = {
  all: [],
  daegubuk: ["대구","경산","경주","구미","군위","김천","문경","봉화","상주","성주","안동","영덕","영양","영주","영천","예천","울릉","울진","의성","청도","청송","칠곡","포항"],
  chungcheong: ["계룡","공주","금산","논산","당진","보령","부여","서산","서천","아산","예산","천안","청양","태안","홍성","괴산","단양","보은","영동","옥천","음성","제천","증평","진천","청주","충주"],
  honam: ["광주","강진","고흥","곡성","광양","구례","나주","담양","목포","무안","보성","순천","신안","여수","영광","영암","완도","장성","장흥","진도","함평","해남","화순","고창","군산","김제","남원","무주","부안","순창","완주","익산","임실","장수","전주","정읍","진안","제주시","서귀포"],
  buulgyeong: ["부산","거제","거창","고성","김해","남해","밀양","사천","산청","양산","의령","진주","창녕","창원","통영","하동","함안","함양","합천","경주","울산"],
};

// 통합창원시(2010년 창원·마산·진해 통합) — 기상청은 '창원' 하나만 제공하므로 별칭 처리
const CITY_ALIASES: Record<string, string> = {
  '마산': '창원',
  '진해': '창원',
};
function applyAliases(weather: Record<string, RegionWeather>): Record<string, RegionWeather> {
  const out = { ...weather };
  Object.entries(CITY_ALIASES).forEach(([alias, source]) => {
    if (out[source] && !out[alias]) out[alias] = out[source];
  });
  return out;
}

export default function HeatWaveMapReport() {
  const token = new URLSearchParams(window.location.search).get("token");

  const [selectedRegion, setSelectedRegion] = useState<RegionKey>("daegubuk");
  const [weatherData, setWeatherData] = useState<Record<string, RegionWeather>>({});
  const [dateStr, setDateStr] = useState<string>("");
  const [selectedInfo, setSelectedInfo] = useState<{ name: string; weather: RegionWeather | null } | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [mapReady, setMapReady] = useState(false);
  const [heatActive, setHeatActive] = useState(false);
  const [stats, setStats] = useState<{ maxFeels: number; avgTemp: number; avgHum: number; maxLoc: string; count: number } | null>(null);
  const [isMobile, setIsMobile] = useState(() => typeof window !== "undefined" && window.innerWidth < 768);
  const [showAllCards, setShowAllCards] = useState(false);
  const [warnings, setWarnings] = useState<{ type: string; regions: string }[]>([]);

  const allRef = useRef<HTMLDivElement>(null);
  const ulleungAllRef = useRef<HTMLDivElement>(null);
  const jejuAllRef = useRef<HTMLDivElement>(null);
  const daegubukRef = useRef<HTMLDivElement>(null);
  const ulleungRef = useRef<HTMLDivElement>(null);
  const chungcheongRef = useRef<HTMLDivElement>(null);
  const honamRef = useRef<HTMLDivElement>(null);
  const jejuRef = useRef<HTMLDivElement>(null);
  const buulgyeongRef = useRef<HTMLDivElement>(null);
  const tooltipRef = useRef<HTMLDivElement>(null);

  const panelsRef = useRef<ThreePanel[]>([]);
  const rafRef = useRef<number>(0);
  const registryRef = useRef<Record<string, RegionEntry>>({});
  const weatherRef = useRef<Record<string, RegionWeather>>({});
  const mapDataRef = useRef<MapDataStore | null>(null);

  useEffect(() => {
    const handler = () => setIsMobile(window.innerWidth < 768);
    window.addEventListener("resize", handler);
    return () => window.removeEventListener("resize", handler);
  }, []);

  // 1) 지도 JSON 로드
  useEffect(() => {
    Promise.all([
      fetch("/map-data-all.json").then(r => r.json()),
      fetch("/map-data-daegubuk.json").then(r => r.json()),
      fetch("/map-data-ulleung.json").then(r => r.json()),
      fetch("/map-data-chungcheong.json").then(r => r.json()),
      fetch("/map-data-honam.json").then(r => r.json()),
      fetch("/map-data-jeju.json").then(r => r.json()),
      fetch("/map-data-buulgyeong.json").then(r => r.json()),
    ]).then(([all, daegubuk, ulleung, chungcheong, honam, jeju, buulgyeong]) => {
      mapDataRef.current = { all, daegubuk, ulleung, chungcheong, honam, jeju, buulgyeong };
      setMapReady(true);
    });
  }, []);

  // 2) 토큰으로 날씨 데이터 로드 (현재 실시간 데이터 반환됨)
  useEffect(() => {
    if (!token) { setError("토큰이 없습니다. 이메일의 링크를 다시 클릭해 주세요."); setLoading(false); return; }
    fetch(`/api/heatwave-report-data?token=${encodeURIComponent(token)}`)
      .then(async r => {
        if (!r.ok) {
          const d = await r.json().catch(() => ({}));
          throw new Error(d.message || "보고서를 불러올 수 없습니다");
        }
        return r.json();
      })
      .then(json => {
        if (json.ok && json.weather) {
          const aliased = applyAliases(json.weather);
          weatherRef.current = aliased;
          setWeatherData(aliased);
          if (json.dateStr) setDateStr(json.dateStr);
          if (json.stats) setStats(json.stats);
          if (Array.isArray(json.warnings)) setWarnings(json.warnings);
          setHeatActive(true);
        }
        setLoading(false);
      })
      .catch(e => {
        setError(e.message || "날씨 데이터를 불러오는 중 오류가 발생했습니다");
        setLoading(false);
      });
  }, [token]);

  // 3) Three.js 패널 초기화
  // loading도 deps에 포함 — loading=false 이후 DOM에 지도 div가 생성되므로 재실행 필요
  useEffect(() => {
    if (!mapReady || loading) return;
    cancelAnimationFrame(rafRef.current);
    panelsRef.current.forEach(p => p.cleanup());
    panelsRef.current = [];
    registryRef.current = {};

    let destroyed = false;
    // rAF 한 번으로 DOM refs가 실제 attached 된 뒤 실행
    const initRafId = requestAnimationFrame(() => {
      if (destroyed) return;
      const d = mapDataRef.current!;
      const tt = tooltipRef.current;
      const handleClick = (name: string, weather: RegionWeather | null) =>
        setSelectedInfo({ name, weather });

      let newPanels: ThreePanel[] = [];

      if (selectedRegion === "all") {
        if (!allRef.current || !ulleungAllRef.current || !jejuAllRef.current) return;
        newPanels = [
          initThreePanel(allRef.current, d.all.filter((r: MapRegion) => r.name !== "제주시" && r.name !== "서귀포"), { height: 18, bevel: 1.4, radius: 2200, theta: 0, phi: Math.PI * 0.27, baseRadius: 2200, fogNear: 2400, fogFar: 6000, sun: [800, 1200, 550], labels: true, fontSize: 38, spin: false, lockView: true }, registryRef.current, tt, weatherRef, handleClick),
          initThreePanel(ulleungAllRef.current, d.ulleung, { height: 14, bevel: 0.8, radius: 320, theta: 0, phi: Math.PI * 0.25, baseRadius: 260, fogNear: 280, fogFar: 900, sun: [140, 200, 90], labels: true, fontSize: 42, spin: false }, registryRef.current, tt, weatherRef, handleClick),
          initThreePanel(jejuAllRef.current, d.jeju, { height: 18, bevel: 1.2, radius: 400, theta: 0, phi: Math.PI * 0.25, baseRadius: 380, fogNear: 400, fogFar: 1200, sun: [160, 240, 100], labels: true, fontSize: 38, spin: false }, registryRef.current, tt, weatherRef, handleClick),
        ];
      } else if (selectedRegion === "daegubuk") {
        if (!daegubukRef.current || !ulleungRef.current) return;
        newPanels = [
          initThreePanel(daegubukRef.current, d.daegubuk, { height: 26, bevel: 2.0, radius: 1700, theta: 0, phi: Math.PI * 0.27, baseRadius: 1700, fogNear: 1900, fogFar: 5000, sun: [600, 900, 400], labels: true, fontSize: 48, spin: false, lockView: true, ty: -70, tz: 60 }, registryRef.current, tt, weatherRef, handleClick),
          initThreePanel(ulleungRef.current, d.ulleung, { height: 14, bevel: 0.8, radius: 320, theta: 0, phi: Math.PI * 0.25, baseRadius: 260, fogNear: 280, fogFar: 900, sun: [140, 200, 90], labels: true, fontSize: 32, spin: false, lockView: true }, registryRef.current, tt, weatherRef, handleClick),
        ];
      } else if (selectedRegion === "chungcheong") {
        if (!chungcheongRef.current) return;
        newPanels = [
          initThreePanel(chungcheongRef.current, d.chungcheong, { height: 24, bevel: 2.0, radius: 1200, theta: 0, phi: Math.PI * 0.24, baseRadius: 1300, fogNear: 1400, fogFar: 3800, sun: [420, 630, 280], labels: true, fontSize: 46, spin: false, lockView: true }, registryRef.current, tt, weatherRef, handleClick),
        ];
      } else if (selectedRegion === "honam") {
        if (!honamRef.current || !jejuRef.current) return;
        newPanels = [
          initThreePanel(honamRef.current, d.honam, { height: 24, bevel: 2.0, radius: 1200, theta: 0, phi: Math.PI * 0.27, baseRadius: 1300, fogNear: 1400, fogFar: 3800, sun: [420, 630, 280], labels: true, fontSize: 46, spin: false, lockView: true }, registryRef.current, tt, weatherRef, handleClick),
          initThreePanel(jejuRef.current, d.jeju, { height: 18, bevel: 1.2, radius: 400, theta: 0, phi: Math.PI * 0.25, baseRadius: 380, fogNear: 400, fogFar: 1200, sun: [160, 240, 100], labels: true, fontSize: 36, spin: false, lockView: true }, registryRef.current, tt, weatherRef, handleClick),
        ];
      } else if (selectedRegion === "buulgyeong") {
        if (!buulgyeongRef.current) return;
        newPanels = [
          initThreePanel(buulgyeongRef.current, d.buulgyeong, { height: 22, bevel: 1.8, radius: 1200, theta: 0, phi: Math.PI * 0.27, baseRadius: 1300, fogNear: 1400, fogFar: 3800, sun: [420, 630, 280], labels: true, fontSize: 44, spin: false, lockView: true }, registryRef.current, tt, weatherRef, handleClick),
        ];
      }

      if (destroyed) return;
      panelsRef.current = newPanels;
      function animate() {
        rafRef.current = requestAnimationFrame(animate);
        panelsRef.current.forEach(p => { p.tick(); p.renderer.render(p.scene, p.camera); });
      }
      animate();

      if (Object.keys(weatherRef.current).length > 0) {
        Object.entries(weatherRef.current).forEach(([n, info]) => updateRegionVisual(n, info));
      }
    });

    return () => {
      destroyed = true;
      cancelAnimationFrame(initRafId);
      cancelAnimationFrame(rafRef.current);
      panelsRef.current.forEach(p => p.cleanup());
      panelsRef.current = [];
    };
  }, [mapReady, selectedRegion, loading]);  // loading 포함 → loading=false 후 DOM div 생성 시 재실행

  function updateRegionVisual(name: string, info: RegionWeather) {
    const entry = registryRef.current[name];
    if (!entry) return;
    const col = new THREE.Color(heatColorHex(info.feels));
    entry.baseColor.copy(col);
    entry.topMat.color.copy(col);
    entry.sideMat.color.copy(col.clone().multiplyScalar(0.7));
    const scale = heatHeightScale(info.feels, entry.baseDepth);
    entry.meshes.forEach(m => { m.scale.y = scale; });
    if (entry.sprite) entry.sprite.position.y = entry.baseDepth * scale + 10;
  }

  if (loading) {
    return (
      <div style={{ minHeight: "100dvh", background: "#0d1117", display: "flex", alignItems: "center", justifyContent: "center", flexDirection: "column", gap: 16 }}>
        <div style={{ width: 48, height: 48, border: "4px solid #374151", borderTopColor: "#ea580c", borderRadius: "50%", animation: "spin 0.8s linear infinite" }} />
        <div style={{ color: "#9ca3af", fontSize: 14 }}>폭염 현황 보고서를 불러오는 중...</div>
        <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
      </div>
    );
  }

  if (error) {
    return (
      <div style={{ minHeight: "100dvh", background: "#0d1117", display: "flex", alignItems: "center", justifyContent: "center", flexDirection: "column", gap: 12, padding: 24 }}>
        <div style={{ fontSize: 48 }}>⚠️</div>
        <div style={{ color: "#f87171", fontSize: 16, fontWeight: 700, textAlign: "center" }}>{error}</div>
        <div style={{ color: "#6b7280", fontSize: 13, textAlign: "center" }}>유효한 이메일 링크를 통해 접속해 주세요.</div>
      </div>
    );
  }

  const alertCnt = Object.values(weatherData).filter(w => w.feels >= 35).length;
  const watchCnt = Object.values(weatherData).filter(w => w.feels >= 33 && w.feels < 35).length;
  const interestCnt = Object.values(weatherData).filter(w => w.feels >= 31 && w.feels < 33).length;
  const maxEntry = Object.entries(weatherData).sort((a, b) => b[1].feels - a[1].feels)[0];

  const regionWeatherList = Object.entries(weatherData)
    .filter(([name]) => {
      if (selectedRegion === "all") return true;
      return (REGION_KEY_MAP[selectedRegion] || []).some(r => name.includes(r) || r.includes(name));
    })
    .sort((a, b) => b[1].feels - a[1].feels);

  const CARD_LIMIT = 12;
  const visibleCards = showAllCards ? regionWeatherList : regionWeatherList.slice(0, CARD_LIMIT);

  const mapHeight = isMobile ? "56vw" : "calc(100vh - 130px)";
  const mapMinH   = isMobile ? 220 : undefined;

  return (
    <div style={{ minHeight: "100dvh", background: "#0d1117", display: "flex", flexDirection: "column" }}>
      {/* ── 헤더 ─────────────────────────────────────────── */}
      <div style={{
        background: "linear-gradient(135deg,#1a0a00,#2d1000)",
        borderBottom: "1px solid rgba(234,88,12,0.3)",
        padding: isMobile ? "8px 12px" : "8px 16px",
        display: "flex", alignItems: "center", justifyContent: "space-between",
        flexShrink: 0, gap: 8,
      }}>
        <div style={{ display: "flex", alignItems: "center", gap: 8, minWidth: 0 }}>
          <span style={{ fontSize: isMobile ? 18 : 22, flexShrink: 0 }}>🌡</span>
          <div style={{ minWidth: 0 }}>
            <div style={{ fontSize: isMobile ? 13 : 15, fontWeight: 800, color: "#fff", lineHeight: 1.2, whiteSpace: "nowrap" }}>
              폭염 현황 보고서
            </div>
            {dateStr && (
              <div style={{ fontSize: isMobile ? 10 : 11, color: "rgba(255,255,255,0.55)", marginTop: 1 }}>{dateStr}</div>
            )}
          </div>
        </div>
        <div style={{ display: "flex", gap: isMobile ? 10 : 18, alignItems: "center", flexShrink: 0 }}>
          {maxEntry && (
            <div style={{ textAlign: "center" }}>
              <div style={{ fontSize: 9, color: "#9ca3af", fontWeight: 600, whiteSpace: "nowrap" }}>최고 체감</div>
              <div style={{ fontSize: isMobile ? 15 : 18, fontWeight: 900, color: "#ef4444", lineHeight: 1 }}>
                {maxEntry[1].feels}°<span style={{ fontSize: 10, fontWeight: 600 }}>{maxEntry[0]}</span>
              </div>
            </div>
          )}
          {alertCnt > 0 && (
            <div style={{ textAlign: "center" }}>
              <div style={{ fontSize: 9, color: "#9ca3af", fontWeight: 600 }}>경보</div>
              <div style={{ fontSize: isMobile ? 15 : 18, fontWeight: 900, color: "#dc2626", lineHeight: 1 }}>{alertCnt}<span style={{ fontSize: 10 }}>곳</span></div>
            </div>
          )}
          {watchCnt > 0 && (
            <div style={{ textAlign: "center" }}>
              <div style={{ fontSize: 9, color: "#9ca3af", fontWeight: 600 }}>주의보</div>
              <div style={{ fontSize: isMobile ? 15 : 18, fontWeight: 900, color: "#ea580c", lineHeight: 1 }}>{watchCnt}<span style={{ fontSize: 10 }}>곳</span></div>
            </div>
          )}
          {interestCnt > 0 && (
            <div style={{ textAlign: "center" }}>
              <div style={{ fontSize: 9, color: "#9ca3af", fontWeight: 600 }}>관심</div>
              <div style={{ fontSize: isMobile ? 15 : 18, fontWeight: 900, color: "#d97706", lineHeight: 1 }}>{interestCnt}<span style={{ fontSize: 10 }}>곳</span></div>
            </div>
          )}
        </div>
      </div>

      {/* ── 탭 ──────────────────────────────────────────── */}
      <div style={{ background: "#1f2937", flexShrink: 0, borderBottom: "1px solid #374151" }}>
        <div style={{ display: "flex", overflowX: "auto", scrollbarWidth: "none" }}>
          {REGION_TABS.map(tab => (
            <button
              key={tab.key}
              onClick={() => { setSelectedRegion(tab.key); setSelectedInfo(null); setShowAllCards(false); }}
              style={{
                flex: "1 0 auto",
                minWidth: isMobile ? 62 : 72,
                padding: isMobile ? "8px 4px" : "10px 8px",
                background: selectedRegion === tab.key ? "#374151" : "transparent",
                border: "none",
                borderBottom: selectedRegion === tab.key ? "2px solid #ea580c" : "2px solid transparent",
                color: selectedRegion === tab.key ? "#f9fafb" : "#9ca3af",
                fontSize: isMobile ? 10 : 11,
                fontWeight: 700,
                cursor: "pointer",
                transition: "all 0.15s",
                whiteSpace: "nowrap",
                WebkitTapHighlightColor: "transparent",
              }}
            >
              {tab.label}<br />
              <span style={{ fontSize: isMobile ? 8 : 9, fontWeight: 400, opacity: 0.7 }}>{tab.sub}</span>
            </button>
          ))}
        </div>
      </div>

      {/* ── 기상특보 패널 ────────────────────────────────── */}
      {warnings.length > 0 && (
        <div style={{
          background: "#090e14",
          borderBottom: "1px solid #232a35",
          padding: isMobile ? "8px 10px" : "8px 14px",
          flexShrink: 0,
        }}>
          <div style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 6 }}>
            <span style={{ fontSize: isMobile ? 10 : 11, fontWeight: 700, color: "#f87171", background: "rgba(239,68,68,0.15)", border: "1px solid rgba(239,68,68,0.4)", padding: "1px 8px", borderRadius: 10, lineHeight: "18px" }}>
              🚨 기상특보 {warnings.length}건
            </span>
          </div>
          <div style={{ display: "flex", flexDirection: "column", gap: 7 }}>
            {warnings.map((w, i) => {
              const isJungdae = w.type.includes("중대경보");
              const isKyungbo = w.type.includes("경보") && !w.type.includes("주의");
              const isJuibo   = w.type.includes("주의") && !w.type.includes("경보");
              const bc = isKyungbo ? "#ef4444" : isJuibo ? "#f97316" : "#3b82f6";
              const desc = isJungdae ? "[체감 38도 이상]"
                : (w.type.includes("폭염") && isKyungbo) ? "[체감 35도 이상]"
                : (w.type.includes("폭염") && isJuibo)   ? "[체감 33도 이상]"
                : w.type.includes("관심")                 ? "[체감 31도 이상]"
                : null;
              return (
                <div key={i} style={{
                  borderTop: i === 0 ? "none" : "1px solid rgba(255,255,255,0.06)",
                  paddingTop: i === 0 ? 0 : 6,
                }}>
                  <div style={{ display: "flex", alignItems: "center", gap: 5, marginBottom: 3 }}>
                    <span style={{
                      fontSize: isMobile ? 9 : 10, fontWeight: 700, color: bc,
                      background: `${bc}22`, border: `1px solid ${bc}44`,
                      padding: "1px 6px", borderRadius: 3, lineHeight: "16px", display: "inline-block",
                    }}>{w.type}</span>
                    {desc && <span style={{ fontSize: isMobile ? 8 : 9, color: "#94a3b8" }}>{desc}</span>}
                  </div>
                  <div style={{ fontSize: isMobile ? 9 : 10, color: "#fca5a5", lineHeight: 1.6 }}>
                    {w.regions}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* ── 조작 안내 (데스크탑만) ─────────────────────── */}
      {!isMobile && (
        <div style={{ background: "#111827", padding: "4px 14px", fontSize: 10, color: "#6b7280", display: "flex", gap: 14, alignItems: "center", flexShrink: 0 }}>
          <span>🖱️ 클릭 — 상세 정보</span>
          <span>⬡ 드래그 — 이동</span>
          <span>🔍 스크롤 — 확대/축소</span>
        </div>
      )}

      {/* ── 지도 영역 ────────────────────────────────────── */}
      <div style={{
        position: "relative",
        flex: isMobile ? "none" : 1,
        height: isMobile ? mapHeight : undefined,
        minHeight: mapMinH,
        overflow: "hidden",
        flexShrink: 0,
      }}>

        {/* 전체 */}
        {selectedRegion === "all" && (
          isMobile ? (
            <div style={{ display: "flex", flexDirection: "column", height: "100%" }}>
              <div style={{ flex: 1, padding: "3px 3px 2px" }}>
                <div ref={allRef} style={{ width: "100%", height: "100%", borderRadius: 8, overflow: "hidden" }} />
              </div>
              <div style={{ display: "flex", height: "22%", gap: 3, padding: "0 3px 3px" }}>
                <div ref={ulleungAllRef} style={{ flex: 1, borderRadius: 8, overflow: "hidden" }} />
                <div ref={jejuAllRef} style={{ flex: 1, borderRadius: 8, overflow: "hidden" }} />
              </div>
            </div>
          ) : (
            <div style={{ position: "absolute", inset: 0, display: "flex", gap: 4, padding: 4 }}>
              <div ref={allRef} style={{ flex: 1, borderRadius: 8, overflow: "hidden" }} />
              <div style={{ display: "flex", flexDirection: "column", gap: 4, width: "22%" }}>
                <div ref={ulleungAllRef} style={{ flex: 1, borderRadius: 8, overflow: "hidden" }} />
                <div ref={jejuAllRef} style={{ flex: 1, borderRadius: 8, overflow: "hidden" }} />
              </div>
            </div>
          )
        )}

        {/* 대구경북 */}
        {selectedRegion === "daegubuk" && (
          isMobile ? (
            <div style={{ display: "flex", flexDirection: "column", height: "100%" }}>
              <div style={{ flex: 1, padding: "3px 3px 2px" }}>
                <div ref={daegubukRef} style={{ width: "100%", height: "100%", borderRadius: 8, overflow: "hidden" }} />
              </div>
              <div style={{ display: "flex", height: "18%", padding: "0 3px 3px" }}>
                <div ref={ulleungRef} style={{ width: "28%", borderRadius: 8, overflow: "hidden" }} />
                <div style={{ flex: 1 }} />
              </div>
            </div>
          ) : (
            <div style={{ position: "absolute", inset: 0, display: "flex", gap: 4, padding: 4 }}>
              <div ref={daegubukRef} style={{ flex: 1, borderRadius: 8, overflow: "hidden" }} />
              <div ref={ulleungRef} style={{ width: "22%", borderRadius: 8, overflow: "hidden" }} />
            </div>
          )
        )}

        {/* 충청권 */}
        {selectedRegion === "chungcheong" && (
          <div style={{ ...(isMobile ? { height: "100%" } : { position: "absolute", inset: 0 }), padding: 4 }}>
            <div ref={chungcheongRef} style={{ width: "100%", height: "100%", borderRadius: 8, overflow: "hidden" }} />
          </div>
        )}

        {/* 호남권 */}
        {selectedRegion === "honam" && (
          isMobile ? (
            <div style={{ display: "flex", flexDirection: "column", height: "100%" }}>
              <div style={{ flex: 1, padding: "3px 3px 2px" }}>
                <div ref={honamRef} style={{ width: "100%", height: "100%", borderRadius: 8, overflow: "hidden" }} />
              </div>
              <div style={{ display: "flex", height: "18%", padding: "0 3px 3px" }}>
                <div ref={jejuRef} style={{ width: "38%", borderRadius: 8, overflow: "hidden" }} />
                <div style={{ flex: 1 }} />
              </div>
            </div>
          ) : (
            <div style={{ position: "absolute", inset: 0, display: "flex", gap: 4, padding: 4 }}>
              <div ref={honamRef} style={{ flex: 1, borderRadius: 8, overflow: "hidden" }} />
              <div ref={jejuRef} style={{ width: "22%", borderRadius: 8, overflow: "hidden" }} />
            </div>
          )
        )}

        {/* 부산권 */}
        {selectedRegion === "buulgyeong" && (
          <div style={{ ...(isMobile ? { height: "100%" } : { position: "absolute", inset: 0 }), padding: 4 }}>
            <div ref={buulgyeongRef} style={{ width: "100%", height: "100%", borderRadius: 8, overflow: "hidden" }} />
          </div>
        )}

        {/* 데스크탑 spacer */}
        {!isMobile && <div style={{ height: "calc(100vh - 130px)" }} />}

        {/* 클릭 정보 카드 */}
        {selectedInfo && (
          <RegionInfoCard
            info={selectedInfo}
            onClose={() => setSelectedInfo(null)}
            heatColorFn={heatColorHex}
          />
        )}
      </div>

      {/* ── 모바일: 날씨 카드 목록 ─────────────────────── */}
      {isMobile && heatActive && (
        <div style={{ background: "#111827", borderTop: "1px solid #1f2937", padding: "10px 10px 16px", flexShrink: 0 }}>
          {/* 소제목 */}
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 8 }}>
            <div style={{ fontSize: 11, color: "#9ca3af", fontWeight: 700 }}>
              {selectedRegion === "all" ? "전체" : REGION_TABS.find(t => t.key === selectedRegion)?.label} 지역 체감온도 순위
              <span style={{ color: "#4b5563", fontWeight: 400, fontSize: 9, marginLeft: 4 }}>({regionWeatherList.length}개 지역)</span>
            </div>
            {regionWeatherList.length > CARD_LIMIT && (
              <button
                onClick={() => setShowAllCards(v => !v)}
                style={{ fontSize: 10, color: "#ea580c", background: "none", border: "none", cursor: "pointer", padding: "2px 4px", fontWeight: 700 }}
              >
                {showAllCards ? "접기 ▲" : `전체보기 +${regionWeatherList.length - CARD_LIMIT}`}
              </button>
            )}
          </div>

          {/* 카드 그리드 */}
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 6 }}>
            {visibleCards.map(([name, w]) => {
              const { text, color } = stageLabel(w.feels);
              return (
                <div
                  key={name}
                  style={{
                    background: "#1f2937",
                    borderRadius: 10,
                    padding: "10px 12px",
                    display: "flex", alignItems: "center", justifyContent: "space-between",
                    border: `1px solid ${color}44`,
                    cursor: "pointer",
                    WebkitTapHighlightColor: "transparent",
                    transition: "background 0.1s",
                  }}
                  onClick={() => setSelectedInfo({ name, weather: w })}
                >
                  <div>
                    <div style={{ fontSize: 13, fontWeight: 700, color: "#f9fafb" }}>{name}</div>
                    <div style={{ fontSize: 11, color, fontWeight: 600, marginTop: 1 }}>{text}</div>
                    <div style={{ fontSize: 9, color: "#6b7280", marginTop: 2 }}>
                      {w.temp}°C · 습도 {w.hum}%
                    </div>
                  </div>
                  <div style={{ textAlign: "right" }}>
                    <div style={{ fontSize: 22, fontWeight: 900, color: heatColorHex(w.feels), lineHeight: 1 }}>{w.feels}°</div>
                    <div style={{ fontSize: 9, color: "#4b5563", marginTop: 2 }}>체감</div>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* ── 고정 툴팁 ───────────────────────────────────── */}
      <div
        ref={tooltipRef}
        style={{
          position: "fixed", pointerEvents: "none", zIndex: 9999,
          background: "rgba(18,22,30,0.96)", color: "#f0f3f7",
          padding: "8px 14px", borderRadius: 8, fontSize: 13, fontWeight: 600,
          border: "1px solid rgba(255,255,255,0.12)", display: "none",
          transform: "translate(-50%,-130%)",
          boxShadow: "0 6px 18px rgba(0,0,0,0.4)", maxWidth: 260, lineHeight: 1.6,
        }}
      />
      <style>{`.tt-sub{display:block;font-size:10px;font-weight:400;color:#9aa5b3;margin-top:1px}.tt-weather{display:block;font-size:11.5px;font-weight:600;color:#ffd9a0;margin-top:5px;line-height:1.55}`}</style>

      {/* ── 범례 + 푸터 ─────────────────────────────────── */}
      <div style={{
        background: "#111827", borderTop: "1px solid #1f2937",
        padding: isMobile ? "6px 10px 10px" : "5px 12px",
        flexShrink: 0,
      }}>
        <div style={{ display: "flex", flexWrap: "wrap", alignItems: "center", gap: 4, marginBottom: isMobile ? 6 : 0 }}>
          <span style={{ fontSize: 10, color: "#6b7280", marginRight: 2 }}>범례:</span>
          {[["#1e40af","~24°"],["#3f6212","25~27°"],["#a16207","28~30°"],["#b45309","31~32°"],["#c2410c","33~34°"],["#991b1b","35~37°"],["#7f1d1d","38°↑"]].map(([c,l]) => (
            <span key={l} style={{ display: "flex", alignItems: "center", gap: 3, fontSize: isMobile ? 9 : 10, color: "#9ca3af" }}>
              <span style={{ width: 10, height: 10, borderRadius: 2, background: c, display: "inline-block", flexShrink: 0 }} />
              {l}
            </span>
          ))}
        </div>
        {isMobile && (
          <div style={{ fontSize: 9, color: "#374151", textAlign: "center" }}>
            지도를 탭하면 지역 상세 정보를 확인할 수 있습니다
          </div>
        )}
      </div>
    </div>
  );
}
