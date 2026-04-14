import { T, s, SidebarStrip, MockupFrame, Badge, ProgressBar } from "./_theme";

const checklist = [
  { label: "소화기 비치 및 유효기간 확인", done: true },
  { label: "비상구 표시등 점등 여부", done: true },
  { label: "개인 보호구 착용 여부 확인", done: true },
  { label: "전기 설비 절연 상태 점검", done: false },
  { label: "위험물 보관 상태 확인", done: true },
  { label: "안전통로 장애물 제거 여부", done: false },
  { label: "작업환경 소음·분진 측정", done: false },
];

const teamStatus = [
  { name: "동대구운용팀", date: "04.12", score: 95, status: "양호", sColor: "green" },
  { name: "서대구운용팀", date: "04.11", score: 78, status: "주의", sColor: "yellow" },
  { name: "포항운용팀",   date: "04.10", score: 62, status: "불량", sColor: "red"   },
];

export default function InspectionsMockup() {
  return (
    <MockupFrame label="④ 안전점검">
      <SidebarStrip activeIndex={4} />
      <div style={s.pageContent}>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 8 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
            <div style={{ width: 32, height: 32, borderRadius: 8, background: "rgba(16,185,129,0.2)", display: "flex", alignItems: "center", justifyContent: "center" }}>
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#34D399" strokeWidth="2"><path d="M9 11l3 3L22 4" /><path d="M21 12v7a2 2 0 01-2 2H5a2 2 0 01-2-2V5a2 2 0 012-2h11" /></svg>
            </div>
            <div>
              <div style={{ fontSize: 14, fontWeight: 700, color: T.text }}>안전점검</div>
              <div style={{ fontSize: 10, color: T.muted, marginTop: 1 }}>정기 및 수시 안전점검 관리</div>
            </div>
          </div>
          <div style={{ background: T.accent, color: "white", borderRadius: 6, padding: "5px 10px", fontSize: 10, fontWeight: 600 }}>+ 점검 등록</div>
        </div>

        <div style={{ display: "grid", gridTemplateColumns: "repeat(2,1fr)", gap: 8 }}>
          <div style={s.kpiCard}>
            <div style={s.kpiLabel}><div style={s.kpiDot(T.green)} />이번 달 점검률</div>
            <div style={{ fontSize: 22, fontWeight: 800, color: T.green }}>87<span style={{ fontSize: 11, fontWeight: 400 }}>%</span></div>
            <div style={{ marginTop: 6 }}><ProgressBar value={87} color={T.green} /></div>
          </div>
          <div style={s.kpiCard}>
            <div style={s.kpiLabel}><div style={s.kpiDot(T.yellow)} />미실시 항목</div>
            <div style={{ fontSize: 22, fontWeight: 800, color: T.yellow }}>3</div>
            <div style={{ fontSize: 9, color: T.muted, marginTop: 3 }}>조치 필요</div>
          </div>
        </div>

        <div style={{ ...s.card, flex: 1, padding: "10px 12px" }}>
          <div style={{ fontSize: 10, fontWeight: 600, color: T.muted, marginBottom: 8, display: "flex", justifyContent: "space-between" }}>
            <span>4월 안전점검 체크리스트</span>
            <span style={{ color: T.muted2 }}>2026-04-14</span>
          </div>
          {checklist.map((item, i) => (
            <div key={i} style={{
              display: "flex", alignItems: "center", gap: 6, fontSize: 10,
              padding: "5px 0", color: T.muted,
              borderBottom: i < checklist.length - 1 ? `1px solid rgba(255,255,255,0.04)` : "none",
            }}>
              <div style={{
                width: 14, height: 14, borderRadius: 3, flexShrink: 0,
                border: item.done ? "none" : `1.5px solid ${T.border}`,
                background: item.done ? T.green : "transparent",
                display: "flex", alignItems: "center", justifyContent: "center",
              }}>
                {item.done && <span style={{ fontSize: 9, color: "white" }}>✓</span>}
              </div>
              <span style={{ flex: 1 }}>{item.label}</span>
              <span style={{ fontSize: 9, fontWeight: 700, color: item.done ? T.green : i === 6 ? T.red : T.yellow }}>
                {item.done ? "완료" : "미실시"}
              </span>
            </div>
          ))}
        </div>

        <div style={{ ...s.card, padding: 0, overflow: "hidden" }}>
          <table style={{ width: "100%", borderCollapse: "collapse" }}>
            <thead>
              <tr style={{ background: "rgba(255,255,255,0.04)", borderBottom: `1px solid ${T.border}` }}>
                {["부서","점검일","점수","상태"].map(h => (
                  <th key={h} style={{ fontSize: 9, fontWeight: 600, color: T.muted2, padding: "5px 8px", textAlign: "left" }}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {teamStatus.map((r, i) => (
                <tr key={i} style={{ borderBottom: i < teamStatus.length - 1 ? `1px solid rgba(255,255,255,0.04)` : "none" }}>
                  <td style={{ fontSize: 10, color: T.text, fontWeight: 600, padding: "6px 8px" }}>{r.name}</td>
                  <td style={{ fontSize: 10, color: T.muted, padding: "6px 8px" }}>{r.date}</td>
                  <td style={{ fontSize: 10, fontWeight: 700, padding: "6px 8px", color: r.score >= 90 ? T.green : r.score >= 75 ? T.yellow : T.red }}>{r.score}</td>
                  <td style={{ padding: "6px 8px" }}><Badge color={r.sColor}>{r.status}</Badge></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </MockupFrame>
  );
}
