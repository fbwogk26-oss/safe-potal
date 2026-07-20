import { useState, useRef, useEffect } from "react";
import { useLocation } from "wouter";
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

export default function HeatWaveMapReport() {
  const [, navigate] = useLocation();
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
  const [isMobile, setIsMobile] = useState(() => typeof window !== "undefined" && window.innerWidth < 640);

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
    const handler = () => setIsMobile(window.innerWidth < 640);
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

  // 2) 토큰으로 날씨 데이터 로드
  useEffect(() => {
    if (!token) { setError("토큰이 없습니다. 이메일의 '지도로 보기' 링크를 다시 클릭해 주세요."); setLoading(false); return; }
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
          weatherRef.current = json.weather;
          setWeatherData({ ...json.weather });
          if (json.dateStr) setDateStr(json.dateStr);
          if (json.stats) setStats(json.stats);
          setHeatActive(true);
        }
        setLoading(false);
      })
      .catch(e => {
        setError(e.message || "날씨 데이터를 불러오는 중 오류가 발생했습니다");
        setLoading(false);
      });
  }, [token]);

  // 3) Three.js 패널 초기화 (지도 + 날씨 준비 후)
  useEffect(() => {
    if (!mapReady) return;
    cancelAnimationFrame(rafRef.current);
    panelsRef.current.forEach(p => p.cleanup());
    panelsRef.current = [];
    registryRef.current = {};

    let destroyed = false;
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

      // 탭 전환 시 날씨 색상 즉시 복원
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
  }, [mapReady, selectedRegion]);

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

  const mapH = isMobile ? "calc(100vh - 130px)" : "calc(100vh - 110px)";
  const sideW = isMobile ? "25%" : "22%";

  if (loading) {
    return (
      <div style={{ minHeight: "100vh", background: "#0d1117", display: "flex", alignItems: "center", justifyContent: "center", flexDirection: "column", gap: 16 }}>
        <div style={{ width: 48, height: 48, border: "4px solid #374151", borderTopColor: "#ea580c", borderRadius: "50%", animation: "spin 0.8s linear infinite" }} />
        <div style={{ color: "#9ca3af", fontSize: 14 }}>폭염 현황 보고서를 불러오는 중...</div>
        <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
      </div>
    );
  }

  if (error) {
    return (
      <div style={{ minHeight: "100vh", background: "#0d1117", display: "flex", alignItems: "center", justifyContent: "center", flexDirection: "column", gap: 12, padding: 24 }}>
        <div style={{ fontSize: 48 }}>⚠️</div>
        <div style={{ color: "#f87171", fontSize: 16, fontWeight: 700, textAlign: "center" }}>{error}</div>
        <div style={{ color: "#6b7280", fontSize: 13, textAlign: "center" }}>유효한 이메일 링크를 통해 접속해 주세요.</div>
      </div>
    );
  }

  const alertCnt = Object.values(weatherData).filter(w => w.feels >= 35).length;
  const watchCnt = Object.values(weatherData).filter(w => w.feels >= 33 && w.feels < 35).length;
  const maxEntry = Object.entries(weatherData).sort((a, b) => b[1].feels - a[1].feels)[0];

  return (
    <div style={{ minHeight: "100vh", background: "#0d1117", display: "flex", flexDirection: "column", overflow: "hidden" }}>
      {/* 헤더 */}
      <div style={{ background: "linear-gradient(135deg,#1a0a00,#2d1000)", borderBottom: "1px solid rgba(234,88,12,0.3)", padding: "8px 16px", display: "flex", alignItems: "center", justifyContent: "space-between", flexShrink: 0, minHeight: 52 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
          <span style={{ fontSize: 20 }}>🌡</span>
          <div>
            <div style={{ fontSize: 14, fontWeight: 800, color: "#fff", lineHeight: 1.2 }}>폭염 현황 보고서</div>
            {dateStr && <div style={{ fontSize: 11, color: "rgba(255,255,255,0.55)", marginTop: 1 }}>{dateStr}</div>}
          </div>
        </div>
        {/* 핵심 지표 */}
        <div style={{ display: "flex", gap: 16, alignItems: "center" }}>
          {maxEntry && (
            <div style={{ textAlign: "center" }}>
              <div style={{ fontSize: 9, color: "#9ca3af", fontWeight: 600 }}>최고 체감</div>
              <div style={{ fontSize: 16, fontWeight: 900, color: "#ef4444", lineHeight: 1 }}>{maxEntry[1].feels}°<span style={{ fontSize: 10 }}>{maxEntry[0]}</span></div>
            </div>
          )}
          {alertCnt > 0 && (
            <div style={{ textAlign: "center" }}>
              <div style={{ fontSize: 9, color: "#9ca3af", fontWeight: 600 }}>폭염경보</div>
              <div style={{ fontSize: 16, fontWeight: 900, color: "#dc2626", lineHeight: 1 }}>{alertCnt}<span style={{ fontSize: 10 }}>개소</span></div>
            </div>
          )}
          {watchCnt > 0 && (
            <div style={{ textAlign: "center" }}>
              <div style={{ fontSize: 9, color: "#9ca3af", fontWeight: 600 }}>주의보</div>
              <div style={{ fontSize: 16, fontWeight: 900, color: "#ea580c", lineHeight: 1 }}>{watchCnt}<span style={{ fontSize: 10 }}>개소</span></div>
            </div>
          )}
          {!heatActive && (
            <div style={{ fontSize: 12, color: "#6b7280" }}>날씨 데이터 없음</div>
          )}
        </div>
      </div>

      {/* 탭 */}
      <div style={{ background: "#1f2937", flexShrink: 0 }}>
        <div style={{ display: "flex", overflowX: "auto" }}>
          {REGION_TABS.map(tab => (
            <button
              key={tab.key}
              onClick={() => { setSelectedRegion(tab.key); setSelectedInfo(null); }}
              style={{
                flex: "1 0 auto", minWidth: 64, padding: isMobile ? "8px 4px" : "10px 6px",
                background: selectedRegion === tab.key ? "#374151" : "transparent",
                border: "none", borderBottom: selectedRegion === tab.key ? "2px solid #ea580c" : "2px solid transparent",
                color: selectedRegion === tab.key ? "#f9fafb" : "#9ca3af",
                fontSize: isMobile ? 10 : 11, fontWeight: 700, cursor: "pointer",
                transition: "all 0.15s", whiteSpace: "nowrap",
              }}
            >
              {tab.label}<br />
              <span style={{ fontSize: 9, fontWeight: 400, opacity: 0.7 }}>{tab.sub}</span>
            </button>
          ))}
        </div>
      </div>

      {/* 안내 */}
      {!isMobile && (
        <div style={{ background: "#111827", padding: "4px 14px", fontSize: 10, color: "#6b7280", display: "flex", gap: 12, alignItems: "center", flexShrink: 0 }}>
          <span>🖱️ 클릭 — 상세 정보</span>
          <span>⬡ 드래그 — 이동</span>
          <span>🔍 스크롤 — 확대/축소</span>
        </div>
      )}

      {/* 지도 영역 */}
      <div style={{ position: "relative", flex: 1, overflow: "hidden" }}>
        {/* 전체 */}
        <div style={{ position: "absolute", inset: 0, display: selectedRegion === "all" ? "flex" : "none", gap: 4, padding: 4 }}>
          <div ref={allRef} style={{ flex: 1, borderRadius: 8, overflow: "hidden" }} />
          <div style={{ display: "flex", flexDirection: "column", gap: 4, width: sideW }}>
            <div ref={ulleungAllRef} style={{ flex: 1, borderRadius: 8, overflow: "hidden" }} />
            <div ref={jejuAllRef} style={{ flex: 1, borderRadius: 8, overflow: "hidden" }} />
          </div>
        </div>
        {/* 대구경북 */}
        <div style={{ position: "absolute", inset: 0, display: selectedRegion === "daegubuk" ? "flex" : "none", gap: 4, padding: 4 }}>
          <div ref={daegubukRef} style={{ flex: 1, borderRadius: 8, overflow: "hidden" }} />
          <div ref={ulleungRef} style={{ width: sideW, borderRadius: 8, overflow: "hidden" }} />
        </div>
        {/* 충청권 */}
        <div style={{ position: "absolute", inset: 0, display: selectedRegion === "chungcheong" ? "flex" : "none", padding: 4 }}>
          <div ref={chungcheongRef} style={{ flex: 1, borderRadius: 8, overflow: "hidden" }} />
        </div>
        {/* 호남권 */}
        <div style={{ position: "absolute", inset: 0, display: selectedRegion === "honam" ? "flex" : "none", gap: 4, padding: 4 }}>
          <div ref={honamRef} style={{ flex: 1, borderRadius: 8, overflow: "hidden" }} />
          <div ref={jejuRef} style={{ width: sideW, borderRadius: 8, overflow: "hidden" }} />
        </div>
        {/* 부산권 */}
        <div style={{ position: "absolute", inset: 0, display: selectedRegion === "buulgyeong" ? "flex" : "none", padding: 4 }}>
          <div ref={buulgyeongRef} style={{ flex: 1, borderRadius: 8, overflow: "hidden" }} />
        </div>

        {/* 클릭 정보 카드 */}
        {selectedInfo && (
          <RegionInfoCard
            info={selectedInfo}
            onClose={() => setSelectedInfo(null)}
            heatColorFn={heatColorHex}
          />
        )}
      </div>

      {/* 고정 툴팁 */}
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

      {/* 범례 + 푸터 */}
      <div style={{ background: "#111827", borderTop: "1px solid #1f2937", padding: "4px 12px", display: "flex", flexWrap: "wrap", alignItems: "center", gap: 4, flexShrink: 0 }}>
        <span style={{ fontSize: 10, color: "#6b7280", marginRight: 4 }}>범례:</span>
        {[["#1e40af","~24°C"],["#3f6212","25~27°C"],["#a16207","28~30°C"],["#b45309","31~32°C"],["#c2410c","33~34°C"],["#991b1b","35~37°C"],["#7f1d1d","38°C↑"]].map(([c,l]) => (
          <span key={l} style={{ display: "inline-flex", alignItems: "center", gap: 3, fontSize: 10, color: "#9ca3af", whiteSpace: "nowrap" }}>
            <span style={{ width: 10, height: 10, borderRadius: 2, background: c, display: "inline-block" }} />{l}
          </span>
        ))}
        <span style={{ marginLeft: "auto", fontSize: 10, color: "#4b5563" }}>SafeBoard 폭염 현황 보고서 · {dateStr}</span>
      </div>
    </div>
  );
}
