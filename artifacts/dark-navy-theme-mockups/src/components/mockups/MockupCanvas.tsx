import DashboardMockup from "./DashboardMockup";
import NoticesMockup from "./NoticesMockup";
import AccidentsMockup from "./AccidentsMockup";
import InspectionsMockup from "./InspectionsMockup";
import EducationMockup from "./EducationMockup";

const colors = [
  { hex: "#0F172A", label: "배경", border: "1px solid #334155" },
  { hex: "#1E293B", label: "카드" },
  { hex: "#0066CC", label: "포인트" },
  { hex: "#F1F5F9", label: "텍스트", border: "1px solid #475569" },
];

export default function MockupCanvas() {
  return (
    <div style={{
      minHeight: "100vh",
      background: "var(--dn-bg, #0F172A)",
      fontFamily: "'Segoe UI', -apple-system, BlinkMacSystemFont, sans-serif",
      padding: "32px 24px",
      color: "#F1F5F9",
    }}>
      <h1 style={{ textAlign: "center", fontSize: 22, fontWeight: 700, marginBottom: 8, letterSpacing: "-0.02em" }}>
        종합안전포털시스템 — 다크 네이비 테마 목업
      </h1>
      <p style={{ textAlign: "center", fontSize: 13, color: "rgba(255,255,255,0.45)", marginBottom: 24 }}>
        사이드바 색상 톤앤매너(#0F172A · #1E293B · #0066CC) 기반 5개 페이지 디자인 목업
      </p>

      {/* Color Legend */}
      <div style={{ display: "flex", justifyContent: "center", gap: 20, marginBottom: 32, flexWrap: "wrap" }}>
        {colors.map(c => (
          <div key={c.label} style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 12, color: "rgba(255,255,255,0.45)" }}>
            <div style={{ width: 12, height: 12, borderRadius: "50%", background: c.hex, border: c.border }} />
            {c.label} {c.hex}
          </div>
        ))}
      </div>

      {/* Row 1: Dashboard (2/3) + Notices (1/3) */}
      <div style={{ display: "grid", gridTemplateColumns: "2fr 1fr", gap: 20, marginBottom: 20, maxWidth: 1400, margin: "0 auto 20px" }}>
        <DashboardMockup />
        <NoticesMockup />
      </div>

      {/* Row 2: Accidents (2/3) + Inspections (1/3) */}
      <div style={{ display: "grid", gridTemplateColumns: "2fr 1fr", gap: 20, marginBottom: 20, maxWidth: 1400, margin: "0 auto 20px" }}>
        <AccidentsMockup />
        <InspectionsMockup />
      </div>

      {/* Row 3: Education (full width) */}
      <div style={{ maxWidth: 1400, margin: "0 auto" }}>
        <EducationMockup />
      </div>
    </div>
  );
}
