import { T, s, SidebarStrip, MockupFrame, Badge, ProgressBar } from "./_theme";

const materials = [
  { icon: "📄", title: "2026년 안전보건교육 교재", meta: "PDF · 3.2MB · 04.01", badge: "PDF", bColor: "purple" },
  { icon: "🎬", title: "화재 대피 훈련 영상 2026", meta: "동영상 · 245MB · 03.20", badge: "동영상", bColor: "orange" },
  { icon: "📊", title: "중대재해처벌법 설명자료", meta: "PPT · 8.7MB · 03.10", badge: "PPT", bColor: "yellow" },
  { icon: "📋", title: "개인보호구 착용 안내문", meta: "Word · 1.1MB · 02.28", badge: "Word", bColor: "green" },
];

const teamCompletion = [
  { name: "동대구운용팀", pct: 100, color: "#10B981" },
  { name: "서대구운용팀", pct: 92,  color: "#10B981" },
  { name: "남대구운용팀", pct: 75,  color: "#F59E0B" },
  { name: "포항운용팀",   pct: 67,  color: "#F59E0B" },
  { name: "안동운용팀",   pct: 45,  color: "#EF4444" },
  { name: "구미운용팀",   pct: 58,  color: "#EF4444" },
];

export default function EducationMockup() {
  return (
    <MockupFrame label="⑤ 교육업무 관리">
      <SidebarStrip activeIndex={5} />
      <div style={s.pageContent}>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 8 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
            <div style={{ width: 32, height: 32, borderRadius: 8, background: "rgba(99,102,241,0.2)", display: "flex", alignItems: "center", justifyContent: "center" }}>
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#A78BFA" strokeWidth="2"><path d="M22 10v6M2 10l10-5 10 5-10 5-10-5z" /><path d="M6 12v5c3 3 9 3 12 0v-5" /></svg>
            </div>
            <div>
              <div style={{ fontSize: 14, fontWeight: 700, color: T.text }}>교육업무 관리</div>
              <div style={{ fontSize: 10, color: T.muted, marginTop: 1 }}>안전 교육 자료 및 이수 현황</div>
            </div>
          </div>
          <div style={{ display: "flex", gap: 6 }}>
            <div style={{ background: "rgba(255,255,255,0.06)", border: `1px solid ${T.border}`, borderRadius: 6, padding: "4px 10px", fontSize: 10, color: T.muted }}>🔍 검색...</div>
            <div style={{ background: "linear-gradient(135deg,#6366F1,#8B5CF6)", color: "white", borderRadius: 6, padding: "5px 10px", fontSize: 10, fontWeight: 600 }}>+ 새 자료</div>
          </div>
        </div>

        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10, flex: 1 }}>
          <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
            <div style={{ display: "flex", gap: 5 }}>
              {["전체", "PDF", "PPT", "동영상"].map((t, i) => (
                <div key={t} style={{
                  padding: "3px 8px", borderRadius: 20, fontSize: 9, fontWeight: 600,
                  border: `1px solid ${i === 0 ? T.accent : T.border}`,
                  background: i === 0 ? T.accent : "transparent",
                  color: i === 0 ? "white" : T.muted,
                }}>{t}</div>
              ))}
            </div>
            <div style={{ ...s.card, flex: 1, padding: 0, overflow: "hidden" }}>
              {materials.map((m, i) => (
                <div key={i} style={{
                  display: "flex", alignItems: "center", gap: 10, padding: "8px 10px",
                  borderBottom: i < materials.length - 1 ? `1px solid ${T.border}` : "none",
                }}>
                  <div style={{ width: 28, height: 28, borderRadius: 6, fontSize: 13, display: "flex", alignItems: "center", justifyContent: "center", background: "rgba(255,255,255,0.06)" }}>{m.icon}</div>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontSize: 11, fontWeight: 600, color: T.text, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{m.title}</div>
                    <div style={{ fontSize: 9, color: T.muted, marginTop: 1 }}>{m.meta}</div>
                  </div>
                  <Badge color={m.bColor}>{m.badge}</Badge>
                </div>
              ))}
              <div style={{ padding: "6px 10px", fontSize: 9, color: T.muted2, borderTop: `1px solid ${T.border}` }}>총 4개</div>
            </div>
          </div>

          <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
            <div style={{ display: "grid", gridTemplateColumns: "repeat(2,1fr)", gap: 6 }}>
              <div style={s.kpiCard}>
                <div style={s.kpiLabel}><div style={s.kpiDot(T.accent2)} />이수율</div>
                <div style={{ fontSize: 22, fontWeight: 800, color: T.accent2 }}>76<span style={{ fontSize: 11, fontWeight: 400 }}>%</span></div>
                <div style={{ marginTop: 5 }}><ProgressBar value={76} color={T.accent2} /></div>
              </div>
              <div style={s.kpiCard}>
                <div style={s.kpiLabel}><div style={s.kpiDot(T.orange)} />미이수</div>
                <div style={{ fontSize: 22, fontWeight: 800, color: T.orange }}>24<span style={{ fontSize: 11, fontWeight: 400 }}>명</span></div>
                <div style={{ fontSize: 9, color: T.muted, marginTop: 3 }}>독려 필요</div>
              </div>
            </div>
            <div style={{ ...s.card, flex: 1, padding: 10 }}>
              <div style={{ fontSize: 10, fontWeight: 600, color: T.muted, marginBottom: 8 }}>팀별 이수 현황</div>
              <div style={{ display: "flex", flexDirection: "column", gap: 7 }}>
                {teamCompletion.map(tc => (
                  <div key={tc.name}>
                    <div style={{ display: "flex", justifyContent: "space-between", fontSize: 9, color: T.muted, marginBottom: 3 }}>
                      <span>{tc.name}</span>
                      <span style={{ color: tc.color, fontWeight: 700 }}>{tc.pct}%</span>
                    </div>
                    <ProgressBar value={tc.pct} color={tc.color} />
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>
      </div>
    </MockupFrame>
  );
}
