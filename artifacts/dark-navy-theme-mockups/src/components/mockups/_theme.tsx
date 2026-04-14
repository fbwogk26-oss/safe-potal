export const T = {
  bg: "var(--dn-bg, #0F172A)",
  surface: "var(--dn-surface, #1E293B)",
  surface2: "var(--dn-surface2, #263548)",
  border: "var(--dn-border, rgba(255,255,255,0.08))",
  accent: "var(--dn-accent, #0066CC)",
  accent2: "var(--dn-accent2, #3B82F6)",
  text: "var(--dn-text, #F1F5F9)",
  muted: "var(--dn-muted, rgba(255,255,255,0.45))",
  muted2: "var(--dn-muted2, rgba(255,255,255,0.25))",
  green: "var(--dn-green, #10B981)",
  yellow: "var(--dn-yellow, #F59E0B)",
  red: "var(--dn-red, #EF4444)",
  orange: "var(--dn-orange, #F97316)",
  purple: "var(--dn-purple, #8B5CF6)",
} as const;

export const s = {
  card: {
    background: "var(--dn-surface, #1E293B)",
    border: "1px solid var(--dn-border, rgba(255,255,255,0.08))",
    borderRadius: 10,
    padding: 12,
  } as React.CSSProperties,
  kpiCard: {
    background: "var(--dn-surface2, #263548)",
    border: "1px solid var(--dn-border, rgba(255,255,255,0.08))",
    borderRadius: 8,
    padding: 10,
  } as React.CSSProperties,
  kpiLabel: {
    fontSize: 9,
    color: "rgba(255,255,255,0.45)",
    fontWeight: 600,
    textTransform: "uppercase" as const,
    letterSpacing: "0.04em",
    marginBottom: 4,
    display: "flex",
    alignItems: "center",
    gap: 4,
  } as React.CSSProperties,
  kpiDot: (color: string): React.CSSProperties => ({
    width: 6, height: 6, borderRadius: "50%", background: color,
  }),
  pageContent: {
    flex: 1,
    background: "var(--dn-bg, #0F172A)",
    overflow: "hidden",
    padding: 14,
    display: "flex",
    flexDirection: "column" as const,
    gap: 10,
  } as React.CSSProperties,
};

export function Badge({ color, children }: { color: string; children: React.ReactNode }) {
  const map: Record<string, { bg: string; fg: string }> = {
    green: { bg: "rgba(16,185,129,0.2)", fg: "#34D399" },
    red: { bg: "rgba(239,68,68,0.2)", fg: "#F87171" },
    yellow: { bg: "rgba(245,158,11,0.2)", fg: "#FCD34D" },
    blue: { bg: "rgba(0,102,204,0.25)", fg: "#60A5FA" },
    orange: { bg: "rgba(249,115,22,0.2)", fg: "#FB923C" },
    purple: { bg: "rgba(139,92,246,0.2)", fg: "#A78BFA" },
  };
  const c = map[color] || map.blue;
  return (
    <span style={{
      display: "inline-flex", alignItems: "center", padding: "2px 6px",
      borderRadius: 4, fontSize: 9, fontWeight: 600,
      background: c.bg, color: c.fg,
    }}>
      {children}
    </span>
  );
}

export function ProgressBar({ value, color }: { value: number; color: string }) {
  return (
    <div style={{ background: "rgba(255,255,255,0.07)", borderRadius: 99, height: 4, overflow: "hidden" }}>
      <div style={{ width: `${value}%`, height: "100%", borderRadius: 99, background: color }} />
    </div>
  );
}

export function SidebarStrip({ activeIndex }: { activeIndex: number }) {
  const icons = [
    <svg key="home" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2"><path d="M3 9l9-7 9 7v11a2 2 0 01-2 2H5a2 2 0 01-2-2z" /></svg>,
    <svg key="bell" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2"><path d="M18 8A6 6 0 006 8c0 7-3 9-3 9h18s-3-2-3-9" /><path d="M13.73 21a2 2 0 01-3.46 0" /></svg>,
    <svg key="shield" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2"><path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z" /></svg>,
    <svg key="alert" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2"><path d="M10.29 3.86L1.82 18a2 2 0 001.71 3h16.94a2 2 0 001.71-3L13.71 3.86a2 2 0 00-3.42 0z" /></svg>,
    <svg key="check" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2"><path d="M9 11l3 3L22 4" /><path d="M21 12v7a2 2 0 01-2 2H5a2 2 0 01-2-2V5a2 2 0 012-2h11" /></svg>,
    <svg key="edu" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2"><path d="M2 3h6a4 4 0 014 4v14a3 3 0 00-3-3H2z" /><path d="M22 3h-6a4 4 0 00-4 4v14a3 3 0 013-3h7z" /></svg>,
  ];
  return (
    <div style={{
      width: 44, background: T.bg, borderRight: `1px solid ${T.border}`,
      padding: "12px 6px", display: "flex", flexDirection: "column", gap: 8, flexShrink: 0,
    }}>
      <div style={{
        width: 32, height: 32, background: T.accent, borderRadius: 8,
        display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center",
        marginBottom: 8,
      }}>
        <span style={{ fontSize: 7, fontWeight: 800, color: "white", lineHeight: 1.1 }}>kt</span>
        <span style={{ fontSize: 6, fontWeight: 700, color: "white", lineHeight: 1.1 }}>MOS</span>
      </div>
      {icons.map((icon, i) => (
        <div key={i} style={{
          width: 32, height: 28, borderRadius: 6,
          display: "flex", alignItems: "center", justifyContent: "center",
          background: i === activeIndex ? "rgba(255,255,255,0.12)" : "transparent",
          opacity: i === activeIndex ? 1 : 0.35,
        }}>
          <div style={{ width: 14, height: 14 }}>{icon}</div>
        </div>
      ))}
    </div>
  );
}

export function MockupFrame({
  label, children, height = 340,
}: { label: string; children: React.ReactNode; height?: number }) {
  return (
    <div style={{
      background: T.bg, border: `1px solid ${T.border}`, borderRadius: 16,
      overflow: "hidden", boxShadow: "0 8px 32px rgba(0,0,0,0.4)",
    }}>
      <div style={{
        background: T.surface, padding: "10px 16px", borderBottom: `1px solid ${T.border}`,
        display: "flex", alignItems: "center", justifyContent: "space-between",
      }}>
        <div style={{ display: "flex", gap: 6 }}>
          <div style={{ width: 10, height: 10, borderRadius: "50%", background: "#FF5F57" }} />
          <div style={{ width: 10, height: 10, borderRadius: "50%", background: "#FEBC2E" }} />
          <div style={{ width: 10, height: 10, borderRadius: "50%", background: "#28C840" }} />
        </div>
        <span style={{ fontSize: 11, fontWeight: 600, color: T.muted, letterSpacing: "0.04em" }}>{label}</span>
        <span />
      </div>
      <div style={{ display: "flex", height }}>
        {children}
      </div>
    </div>
  );
}
