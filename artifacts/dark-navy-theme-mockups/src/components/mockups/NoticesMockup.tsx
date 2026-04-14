import { T, s, SidebarStrip, MockupFrame } from "./_theme";

const notices = [
  { pinned: true, icon: "📌", title: "2026년 상반기 안전교육 일정 안내", meta: "전체 대상 · 이미지 첨부", date: "03.15" },
  { pinned: false, icon: "🔔", title: "4월 소방훈련 실시 안내", meta: "전 직원 참여 · 04.20 14:00", date: "04.10" },
  { pinned: false, icon: "🖼", title: "개인 보호구 지급 일정 공지", meta: "이미지 첨부 · 각 팀장 전달", date: "04.08" },
  { pinned: false, icon: "🔔", title: "안전관리규정 개정 안내 (v2.3)", meta: "전 직원 열람 필수", date: "04.05" },
  { pinned: false, icon: "🔔", title: "시스템 점검 안내 (04/14 02:00)", meta: "서비스 일시 중단 예정", date: "04.03" },
];

export default function NoticesMockup() {
  return (
    <MockupFrame label="② 공지 / 알림">
      <SidebarStrip activeIndex={1} />
      <div style={s.pageContent}>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 8 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
            <div style={{ width: 32, height: 32, borderRadius: 8, background: "rgba(249,115,22,0.2)", display: "flex", alignItems: "center", justifyContent: "center" }}>
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#FB923C" strokeWidth="2"><path d="M18 8A6 6 0 006 8c0 7-3 9-3 9h18s-3-2-3-9" /><path d="M13.73 21a2 2 0 01-3.46 0" /></svg>
            </div>
            <div>
              <div style={{ fontSize: 14, fontWeight: 700, color: T.text }}>공지 및 알림</div>
              <div style={{ fontSize: 10, color: T.muted, marginTop: 1 }}>시스템 공지사항</div>
            </div>
          </div>
          <div style={{ background: "linear-gradient(135deg,#F97316,#D97706)", color: "white", borderRadius: 6, padding: "5px 10px", fontSize: 10, fontWeight: 600 }}>+ 공지 등록</div>
        </div>

        <div style={{ background: "rgba(255,255,255,0.06)", border: `1px solid ${T.border}`, borderRadius: 6, padding: "4px 10px", fontSize: 10, color: T.muted }}>🔍 검색...</div>

        <div style={{ ...s.card, padding: 0, flex: 1, overflow: "hidden" }}>
          {notices.map((n, i) => (
            <div key={i} style={{
              display: "flex", alignItems: "center", gap: 10, padding: "8px 10px",
              borderBottom: i < notices.length - 1 ? `1px solid ${T.border}` : "none",
              background: n.pinned ? "rgba(249,115,22,0.06)" : "transparent",
            }}>
              <div style={{
                width: 28, height: 28, borderRadius: 6, fontSize: 13,
                display: "flex", alignItems: "center", justifyContent: "center",
                background: n.pinned ? "rgba(249,115,22,0.25)" : "rgba(255,255,255,0.06)",
              }}>{n.icon}</div>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ display: "flex", alignItems: "center", gap: 5 }}>
                  {n.pinned && (
                    <span style={{ background: "rgba(249,115,22,0.25)", color: "#FB923C", fontSize: 8, fontWeight: 700, padding: "1px 5px", borderRadius: 3 }}>고정</span>
                  )}
                  <span style={{ fontSize: 11, fontWeight: 600, color: T.text, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{n.title}</span>
                </div>
                <div style={{ fontSize: 9, color: T.muted, marginTop: 1 }}>{n.meta}</div>
              </div>
              <div style={{ fontSize: 9, color: T.muted, flexShrink: 0 }}>{n.date}</div>
            </div>
          ))}
          <div style={{ padding: "6px 10px", fontSize: 9, color: T.muted2, borderTop: `1px solid ${T.border}` }}>총 5개 · 클릭하여 상세보기</div>
        </div>
      </div>
    </MockupFrame>
  );
}
