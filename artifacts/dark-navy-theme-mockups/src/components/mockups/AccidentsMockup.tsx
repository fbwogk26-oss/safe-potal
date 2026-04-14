import { T, s, SidebarStrip, MockupFrame, Badge, ProgressBar } from "./_theme";

const recentAccidents = [
  { title: "구미 현장 추락 사고", dept: "구미운용팀", severity: "중대", sColor: "red", date: "04.08" },
  { title: "교통사고 (차량 접촉)", dept: "포항운용팀", severity: "보통", sColor: "yellow", date: "03.22" },
  { title: "전도 경미 부상", dept: "남대구운용팀", severity: "경미", sColor: "green", date: "03.15" },
];

const monthBars = [
  [20,15,10],[10,8,5],[15,20,12],[25,18,8],[18,10,0],[12,5,0],
  [8,12,0],[20,14,0],[15,9,0],[10,6,0],[12,8,0],[5,3,0],
];
const monthLabels = ["1월","2월","3월","4월","5월","6월","7월","8월","9월","10월","11월","12월"];

export default function AccidentsMockup() {
  return (
    <MockupFrame label="③ 사고보고 & 통계 분석">
      <SidebarStrip activeIndex={3} />
      <div style={s.pageContent}>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 8 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
            <div style={{ width: 32, height: 32, borderRadius: 8, background: "rgba(239,68,68,0.2)", display: "flex", alignItems: "center", justifyContent: "center" }}>
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#F87171" strokeWidth="2"><path d="M10.29 3.86L1.82 18a2 2 0 001.71 3h16.94a2 2 0 001.71-3L13.71 3.86a2 2 0 00-3.42 0z" /></svg>
            </div>
            <div>
              <div style={{ fontSize: 14, fontWeight: 700, color: T.text }}>사고보고 & 통계</div>
              <div style={{ fontSize: 10, color: T.muted, marginTop: 1 }}>사고 현황 관리 및 통계 분석</div>
            </div>
          </div>
          <div style={{ background: T.accent, color: "white", borderRadius: 6, padding: "5px 10px", fontSize: 10, fontWeight: 600 }}>+ 사고보고 등록</div>
        </div>

        <div style={{ display: "flex", gap: 2, background: T.surface, borderRadius: 8, padding: 3, width: "fit-content" }}>
          {["📊 통계 분석", "⚠ 사고 관리", "📖 사고사례"].map((tab, i) => (
            <div key={tab} style={{
              padding: "4px 12px", borderRadius: 6, fontSize: 10,
              fontWeight: i === 0 ? 700 : 400,
              background: i === 0 ? T.accent : "transparent",
              color: i === 0 ? "white" : T.muted,
            }}>{tab}</div>
          ))}
        </div>

        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10, flex: 1 }}>
          <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
            <div style={{ display: "grid", gridTemplateColumns: "repeat(2,1fr)", gap: 6 }}>
              <div style={s.kpiCard}><div style={s.kpiLabel}><div style={s.kpiDot(T.red)} />2026 총계</div><div style={{ fontSize: 22, fontWeight: 800, color: T.red }}>7</div><div style={{ fontSize: 9, color: T.muted }}>전년대비 -2건</div></div>
              <div style={s.kpiCard}><div style={s.kpiLabel}><div style={s.kpiDot(T.yellow)} />중대재해</div><div style={{ fontSize: 22, fontWeight: 800, color: T.yellow }}>1</div><div style={{ fontSize: 9, color: T.muted }}>추락 1건</div></div>
            </div>
            <div style={{ ...s.card, flex: 1, padding: 10 }}>
              <div style={{ fontSize: 10, fontWeight: 600, color: T.muted, marginBottom: 8 }}>사고 유형별 분포</div>
              <div style={{ display: "flex", alignItems: "center", gap: 14 }}>
                <svg width="70" height="70" viewBox="0 0 70 70" style={{ flexShrink: 0 }}>
                  <circle cx="35" cy="35" r="28" fill="none" stroke="#263548" strokeWidth="10" />
                  <circle cx="35" cy="35" r="28" fill="none" stroke="#EF4444" strokeWidth="10" strokeDasharray="44 132" strokeDashoffset="0" transform="rotate(-90 35 35)" />
                  <circle cx="35" cy="35" r="28" fill="none" stroke="#F59E0B" strokeWidth="10" strokeDasharray="35 141" strokeDashoffset="-44" transform="rotate(-90 35 35)" />
                  <circle cx="35" cy="35" r="28" fill="none" stroke="#6366F1" strokeWidth="10" strokeDasharray="27 149" strokeDashoffset="-79" transform="rotate(-90 35 35)" />
                  <circle cx="35" cy="35" r="28" fill="none" stroke="#10B981" strokeWidth="10" strokeDasharray="70 106" strokeDashoffset="-106" transform="rotate(-90 35 35)" />
                  <text x="35" y="32" textAnchor="middle" fill="white" fontSize="10" fontWeight="700">2026</text>
                  <text x="35" y="43" textAnchor="middle" fill="#94A3B8" fontSize="8">총 7건</text>
                </svg>
                <div style={{ display: "flex", flexDirection: "column", gap: 5 }}>
                  {[["#EF4444","추락 2건"],["#F59E0B","교통사고 2건"],["#6366F1","전도 1건"],["#10B981","기타 2건"]].map(([c,l]) => (
                    <div key={l} style={{ display: "flex", alignItems: "center", gap: 5, fontSize: 9, color: T.muted }}>
                      <div style={{ width: 7, height: 7, borderRadius: "50%", background: c }} />
                      {l}
                    </div>
                  ))}
                </div>
              </div>
            </div>
          </div>

          <div style={{ ...s.card, padding: 10, display: "flex", flexDirection: "column" }}>
            <div style={{ fontSize: 10, fontWeight: 600, color: T.muted, marginBottom: 6 }}>월별 사고 추이 (3개년 비교)</div>
            <div style={{ display: "flex", gap: 8, marginBottom: 8 }}>
              {[["#6366F1","2024"],["#F59E0B","2025"],["#10B981","2026"]].map(([c,l]) => (
                <div key={l} style={{ display: "flex", alignItems: "center", gap: 3, fontSize: 8, color: T.muted2 }}>
                  <div style={{ width: 8, height: 3, borderRadius: 2, background: c }} />{l}
                </div>
              ))}
            </div>
            <div style={{ display: "flex", alignItems: "flex-end", gap: 3, height: 60, marginBottom: 4 }}>
              {monthBars.map((bars, mi) => (
                <div key={mi} style={{ display: "flex", flexDirection: "column", alignItems: "center", flex: 1, gap: 3 }}>
                  <div style={{ display: "flex", gap: 1, alignItems: "flex-end" }}>
                    {bars.map((h, bi) => h > 0 ? (
                      <div key={bi} style={{ width: 5, height: h * 2, borderRadius: "2px 2px 0 0", background: ["#6366F1","#F59E0B","#10B981"][bi] }} />
                    ) : null)}
                  </div>
                  <div style={{ fontSize: 6, color: T.muted2, whiteSpace: "nowrap" }}>{monthLabels[mi]}</div>
                </div>
              ))}
            </div>
            <div style={{ height: 1, background: T.border, marginBottom: 8 }} />
            <div style={{ fontSize: 9, color: T.muted2, fontWeight: 600, marginBottom: 4 }}>최근 사고보고</div>
            <table style={{ width: "100%", borderCollapse: "collapse" }}>
              <thead>
                <tr style={{ background: "rgba(255,255,255,0.04)", borderBottom: `1px solid ${T.border}` }}>
                  {["제목","부서","중증도","일시"].map(h => (
                    <th key={h} style={{ fontSize: 9, fontWeight: 600, color: T.muted2, padding: "4px 6px", textAlign: "left" }}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {recentAccidents.map((r, i) => (
                  <tr key={i} style={{ borderBottom: i < recentAccidents.length - 1 ? `1px solid rgba(255,255,255,0.04)` : "none" }}>
                    <td style={{ fontSize: 10, color: T.text, fontWeight: 600, padding: "5px 6px" }}>{r.title}</td>
                    <td style={{ fontSize: 10, color: T.muted, padding: "5px 6px" }}>{r.dept}</td>
                    <td style={{ padding: "5px 6px" }}><Badge color={r.sColor}>{r.severity}</Badge></td>
                    <td style={{ fontSize: 10, color: T.muted, padding: "5px 6px" }}>{r.date}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    </MockupFrame>
  );
}
