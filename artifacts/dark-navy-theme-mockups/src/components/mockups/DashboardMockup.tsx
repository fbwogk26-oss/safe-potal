import { T, s, SidebarStrip, MockupFrame, Badge } from "./_theme";

const teams = [
  { name: "동T", score: 98, color: "#34D399", grad: "linear-gradient(to bottom,#34D399,#059669)" },
  { name: "서T", score: 91, color: "#34D399", grad: "linear-gradient(to bottom,#34D399,#059669)" },
  { name: "남T", score: 88, color: "#FBBF24", grad: "linear-gradient(to bottom,#FBBF24,#D97706)" },
  { name: "포T", score: 85, color: "#FBBF24", grad: "linear-gradient(to bottom,#FBBF24,#D97706)" },
  { name: "안T", score: 92, color: "#34D399", grad: "linear-gradient(to bottom,#34D399,#059669)" },
  { name: "구T", score: 78, color: "#FBBF24", grad: "linear-gradient(to bottom,#FBBF24,#D97706)" },
  { name: "문T", score: 72, color: "#F87171", grad: "linear-gradient(to bottom,#F87171,#DC2626)" },
  { name: "지원", score: 90, color: "#34D399", grad: "linear-gradient(to bottom,#34D399,#059669)" },
  { name: "계획", score: 87, color: "#FBBF24", grad: "linear-gradient(to bottom,#FBBF24,#D97706)" },
  { name: "사업", score: 93, color: "#34D399", grad: "linear-gradient(to bottom,#34D399,#059669)" },
  { name: "현경", score: 95, color: "#34D399", grad: "linear-gradient(to bottom,#34D399,#059669)" },
  { name: "공망", score: 80, color: "#FBBF24", grad: "linear-gradient(to bottom,#FBBF24,#D97706)" },
];

const kpis = [
  { label: "최우수", dot: T.green, value: "98점", sub: "동대구운용팀", color: T.green },
  { label: "최하위", dot: T.red, value: "72점", sub: "문경운용팀", color: T.red },
  { label: "평균 점수", dot: T.accent2, value: "87점", sub: "12개 팀", color: T.accent2 },
];

export default function DashboardMockup() {
  return (
    <MockupFrame label="① 홈 / 안전성평가제 대시보드">
      <SidebarStrip activeIndex={0} />
      <div style={s.pageContent}>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 8 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
            <div style={{ width: 32, height: 32, borderRadius: 8, background: "rgba(0,102,204,0.25)", display: "flex", alignItems: "center", justifyContent: "center" }}>
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke={T.accent2} strokeWidth="2"><path d="M3 9l9-7 9 7v11a2 2 0 01-2 2H5a2 2 0 01-2-2z" /></svg>
            </div>
            <div>
              <div style={{ fontSize: 14, fontWeight: 700, color: T.text }}>안전성평가제 현황</div>
              <div style={{ fontSize: 10, color: T.muted, marginTop: 1 }}>2026년 팀별 실시간 점수 현황</div>
            </div>
          </div>
          <div style={{ display: "flex", gap: 6, alignItems: "center" }}>
            <div style={{ background: "transparent", color: T.muted, border: `1px solid ${T.border}`, borderRadius: 6, padding: "5px 10px", fontSize: 10, display: "flex", alignItems: "center", gap: 4 }}>2026 ▾</div>
            <div style={{ background: "transparent", color: T.muted, border: `1px solid ${T.border}`, borderRadius: 6, padding: "5px 10px", fontSize: 10 }}>기준 15대</div>
            <div style={{ background: T.accent, color: "white", borderRadius: 6, padding: "5px 10px", fontSize: 10, fontWeight: 600, display: "flex", alignItems: "center", gap: 4 }}>⬇ 다운로드</div>
          </div>
        </div>

        <div style={{ display: "grid", gridTemplateColumns: "repeat(4,1fr)", gap: 8 }}>
          {kpis.map(k => (
            <div key={k.label} style={s.kpiCard}>
              <div style={s.kpiLabel}><div style={s.kpiDot(k.dot)} />{k.label}</div>
              <div style={{ fontSize: 22, fontWeight: 800, color: k.color, lineHeight: 1 }}>{k.value}</div>
              <div style={{ fontSize: 9, color: T.muted, marginTop: 3 }}>{k.sub}</div>
            </div>
          ))}
          <div style={s.kpiCard}>
            <div style={s.kpiLabel}><div style={s.kpiDot(T.purple)} />팀 현황</div>
            <div style={{ display: "flex", gap: 8, marginTop: 4 }}>
              {[{n:6,c:T.green,l:"90+"},{n:4,c:T.yellow,l:"80+"},{n:2,c:T.red,l:"80↓"}].map(x => (
                <div key={x.l} style={{ textAlign: "center" }}>
                  <div style={{ fontSize: 16, fontWeight: 800, color: x.c }}>{x.n}</div>
                  <div style={{ fontSize: 8, color: T.muted2 }}>{x.l}</div>
                </div>
              ))}
            </div>
          </div>
        </div>

        <div style={{ ...s.card, flex: 1, padding: 12 }}>
          <div style={{ fontSize: 11, fontWeight: 700, color: T.text, marginBottom: 8 }}>🏆 팀별 안전성평가제 차트</div>
          <div style={{ display: "flex", alignItems: "flex-end", gap: 5, height: 70, padding: "0 4px" }}>
            {teams.map(t => (
              <div key={t.name} style={{ display: "flex", flexDirection: "column", alignItems: "center", flex: 1, gap: 3 }}>
                <div style={{ fontSize: 7, fontWeight: 700, color: T.muted }}>{t.score}</div>
                <div style={{ width: "100%", borderRadius: "3px 3px 0 0", background: t.grad, height: `${Math.round(t.score * 0.7)}px` }} />
                <div style={{ fontSize: 7, color: T.muted2, whiteSpace: "nowrap" }}>{t.name}</div>
              </div>
            ))}
          </div>
          <div style={{ height: 1, background: T.border }} />
        </div>
      </div>
    </MockupFrame>
  );
}
