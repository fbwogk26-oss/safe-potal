import {
  LayoutDashboard,
  Bell,
  ShieldCheck,
  Shield,
  HeartPulse,
  Home,
  ChevronDown,
  ChevronRight,
  AlertTriangle,
  FileWarning,
  Target,
  ClipboardCheck,
  GraduationCap,
  FlaskConical,
  ShieldAlert,
  Briefcase,
  Car,
  Users,
  RefreshCw,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { useQuery } from "@tanstack/react-query";
import { usePermissions } from "@/hooks/use-permissions";
import { useAuth } from "@/hooks/use-auth";
import { format } from "date-fns";
import { ko } from "date-fns/locale";
import { Sidebar } from "@/components/Sidebar";
import { NoticeTicker } from "@/components/NoticeTicker";

interface AccidentStat { total: number; byYear?: Record<string, number>; }
interface Notice { id: number; title: string; category: string; createdAt: string; }
interface RiskAssessment { id: number; approvalStatus: string; }

const CURRENT_YEAR = new Date().getFullYear();

/* ─── New-Design Sidebar ─── */
const NEW_NAV_ITEMS = [
  { label: "홈", icon: Home, active: true },
  { label: "공지/알림", icon: Bell, active: false },
  { label: "안전수칙", icon: ShieldCheck, active: false },
  { label: "안전관리", icon: Shield, active: false, chevron: true },
  { label: "보건관리", icon: HeartPulse, active: false, chevron: true },
  { label: "하도급관리", icon: Briefcase, active: false, chevron: true },
  { label: "차량관리", icon: Car, active: false, chevron: true },
  { label: "시스템 관리", icon: Users, active: false, chevron: true },
];

function NewSidebar() {
  return (
    <div
      className="flex flex-col h-full"
      style={{ background: "#0F172A", width: "200px", minWidth: "200px" }}
    >
      {/* Logo */}
      <div className="px-4 py-4" style={{ borderBottom: "1px solid rgba(255,255,255,0.08)" }}>
        <div className="flex items-center gap-2.5">
          <div
            className="w-8 h-8 rounded-xl flex flex-col items-center justify-center text-white shrink-0"
            style={{ background: "#0066CC" }}
          >
            <span className="text-[8px] font-bold leading-none">kt</span>
            <span className="text-[6px] font-semibold leading-none">MOS</span>
          </div>
          <div className="min-w-0">
            <p className="font-bold text-[12px] text-white leading-tight truncate">종합안전포털시스템</p>
            <p className="text-[9px]" style={{ color: "rgba(148,163,184,0.8)" }}>Safety Portal System</p>
          </div>
        </div>
      </div>

      {/* Nav */}
      <nav className="flex-1 px-2 py-3 flex flex-col gap-0.5 overflow-hidden">
        {NEW_NAV_ITEMS.map((item) => (
          <div
            key={item.label}
            className="flex items-center gap-2.5 px-2.5 py-2 rounded-lg cursor-default"
            style={
              item.active
                ? { background: "rgba(255,255,255,0.1)" }
                : undefined
            }
          >
            <item.icon
              className="shrink-0 w-4 h-4"
              style={{ color: item.active ? "#ffffff" : "rgba(255,255,255,0.45)" }}
            />
            <span
              className="flex-1 text-[12px] font-medium"
              style={{ color: item.active ? "#ffffff" : "rgba(255,255,255,0.45)" }}
            >
              {item.label}
            </span>
            {item.active && (
              <span
                className="w-5 h-5 rounded-full flex items-center justify-center text-[10px] font-bold"
                style={{ background: "#ffffff", color: "#0F172A" }}
              >
                ●
              </span>
            )}
            {item.chevron && !item.active && (
              <ChevronDown className="w-3 h-3" style={{ color: "rgba(255,255,255,0.25)" }} />
            )}
          </div>
        ))}
      </nav>

      {/* User avatar area */}
      <div
        className="px-3 py-3 flex items-center gap-2.5"
        style={{ borderTop: "1px solid rgba(255,255,255,0.08)" }}
      >
        <div
          className="w-7 h-7 rounded-full flex items-center justify-center text-[10px] font-bold text-white shrink-0"
          style={{ background: "#3B82F6" }}
        >
          관
        </div>
        <div className="min-w-0">
          <p className="text-[11px] font-semibold text-white truncate">관리자</p>
          <p className="text-[9px]" style={{ color: "rgba(148,163,184,0.6)" }}>admin</p>
        </div>
      </div>
    </div>
  );
}

/* ─── New-Design Header ─── */
function NewHeader({ userName }: { userName: string }) {
  const now = new Date();
  return (
    <div
      className="flex items-center px-5 py-3"
      style={{
        background: "#ffffff",
        borderBottom: "1px solid #e2e8f0",
        minHeight: "52px",
      }}
    >
      <div>
        <p className="text-[13px] font-bold text-slate-800">
          {format(now, "yyyy년 M월 d일 (EEE)", { locale: ko })}
        </p>
        <p className="text-[11px] text-slate-400">안녕하세요, <span className="font-semibold text-slate-600">{userName}</span>님</p>
      </div>
    </div>
  );
}

/* ─── New-Design Notice Ticker (pill) ─── */
function NewNoticeTicker({ text }: { text: string }) {
  return (
    <div className="flex items-center px-5 py-2.5" style={{ background: "#f8fafc" }}>
      <div
        className="inline-flex items-center gap-2 px-3 py-1.5 rounded-full"
        style={{ border: "1px solid #e2e8f0" }}
      >
        <span className="w-1.5 h-1.5 rounded-full bg-blue-500 shrink-0" />
        <span className="text-[10px] font-bold text-slate-500 uppercase tracking-wider">공지</span>
        <span className="w-px h-3 bg-slate-200 shrink-0" />
        <span
          className="text-[11px] font-medium text-slate-700 truncate"
          style={{ maxWidth: "340px" }}
        >
          {text}
        </span>
        <ChevronRight className="w-3 h-3 text-slate-400 shrink-0" />
      </div>
    </div>
  );
}

/* ─── New-Design Stat Cards ─── */
interface StatCardItem {
  label: string;
  value: string;
  color: string;
  bg: string;
  icon: React.ComponentType<{ className?: string; style?: React.CSSProperties }>;
}

function NewStatCards({ items }: { items: StatCardItem[] }) {
  return (
    <div className="grid grid-cols-2 gap-3 px-5 py-4">
      {items.map((item) => (
        <div
          key={item.label}
          className="flex items-center gap-3 rounded-xl p-4"
          style={{ border: "1px solid #f1f5f9", background: "#ffffff" }}
        >
          <div
            className="w-10 h-10 rounded-full flex items-center justify-center shrink-0"
            style={{ background: item.bg }}
          >
            <item.icon className="w-5 h-5" style={{ color: item.color }} />
          </div>
          <div className="min-w-0">
            <p className="text-[10px] font-semibold uppercase tracking-wider" style={{ color: "#94a3b8" }}>
              {item.label}
            </p>
            <p className="text-2xl font-bold leading-tight" style={{ color: "#1e293b" }}>{item.value}</p>
          </div>
        </div>
      ))}
    </div>
  );
}

/* ─── New-Design Quick-in ─── */
const QUICK_IN_ITEMS = [
  { label: "안전성평가제", icon: ShieldCheck, color: "#3b82f6", bg: "#dbeafe" },
  { label: "위험성평가", icon: Target, color: "#f97316", bg: "#ffedd5" },
  { label: "안전점검", icon: ClipboardCheck, color: "#10b981", bg: "#d1fae5" },
  { label: "사고보고", icon: AlertTriangle, color: "#ef4444", bg: "#fee2e2" },
  { label: "교육관리", icon: GraduationCap, color: "#8b5cf6", bg: "#ede9fe" },
  { label: "MSDS검색", icon: FlaskConical, color: "#06b6d4", bg: "#cffafe" },
];

function NewQuickIn() {
  return (
    <div className="px-5 pb-4">
      <p className="text-[10px] font-bold uppercase tracking-widest text-slate-400 mb-3">QUICK-IN</p>
      <div className="grid grid-cols-6 gap-2">
        {QUICK_IN_ITEMS.map((item) => (
          <div key={item.label} className="flex flex-col items-center gap-1.5 cursor-default">
            <div
              className="w-11 h-11 rounded-2xl flex items-center justify-center"
              style={{ background: item.bg }}
            >
              <item.icon className="w-5 h-5" style={{ color: item.color }} />
            </div>
            <p className="text-[10px] font-semibold text-slate-600 text-center leading-tight">{item.label}</p>
          </div>
        ))}
      </div>
    </div>
  );
}

/* ─── New-Design Recent Feed ─── */
function NewRecentFeed({ notices }: { notices: Notice[] }) {
  const items = notices.filter((n) => n.category === "notice").slice(0, 6);
  return (
    <div className="px-5 pb-5">
      <p className="text-[10px] font-bold uppercase tracking-widest text-slate-400 mb-2">최근 현황</p>
      <div style={{ border: "1px solid #f1f5f9", borderRadius: "12px", overflow: "hidden" }}>
        {items.length === 0 ? (
          <p className="text-[11px] text-slate-400 p-4 text-center">등록된 공지가 없습니다.</p>
        ) : (
          items.map((n, i) => (
            <div
              key={n.id}
              className="flex items-center gap-3 px-4 py-2.5 transition-colors cursor-default"
              style={{
                borderTop: i > 0 ? "1px solid #f1f5f9" : undefined,
              }}
              onMouseEnter={(e) => { (e.currentTarget as HTMLDivElement).style.background = "#f8fafc"; }}
              onMouseLeave={(e) => { (e.currentTarget as HTMLDivElement).style.background = ""; }}
            >
              <div className="w-1.5 h-1.5 rounded-full bg-blue-400 shrink-0" />
              <span className="flex-1 text-[11px] font-medium text-slate-700 truncate">{n.title}</span>
              <span className="text-[10px] text-slate-400 shrink-0 whitespace-nowrap">
                {format(new Date(n.createdAt), "MM.dd")}
              </span>
            </div>
          ))
        )}
      </div>
    </div>
  );
}

/* ─── Full New-Design Layout (right panel) ─── */
function NewDesignLayout({
  userName,
  tickerText,
  statItems,
  notices,
}: {
  userName: string;
  tickerText: string;
  statItems: StatCardItem[];
  notices: Notice[];
}) {
  return (
    <div className="flex h-full" style={{ background: "#f8fafc" }}>
      <NewSidebar />
      <div className="flex-1 flex flex-col min-w-0 overflow-y-auto">
        <NewHeader userName={userName} />
        <NewNoticeTicker text={tickerText} />
        <NewStatCards items={statItems} />
        <NewQuickIn />
        <NewRecentFeed notices={notices} />
      </div>
    </div>
  );
}

/* ─── Current-Design Layout (left panel) ─── */
function CurrentDesignLayout() {
  return (
    <div className="flex h-full overflow-hidden" style={{ background: "#f8fafc" }}>
      {/* Scaled-down actual Sidebar */}
      <div className="relative shrink-0" style={{ width: "130px", overflow: "hidden" }}>
        <div
          style={{
            transformOrigin: "top left",
            transform: "scale(0.582)",
            width: "224px",
            pointerEvents: "none",
          }}
        >
          <Sidebar />
        </div>
      </div>

      {/* Scaled-down actual NoticeTicker + placeholder content */}
      <div className="flex-1 flex flex-col min-w-0 overflow-hidden">
        {/* Actual header placeholder */}
        <div
          className="flex items-center px-3 py-2.5 shrink-0"
          style={{
            background: "rgba(255,255,255,0.95)",
            borderBottom: "1px solid rgba(214,220,240,0.7)",
            boxShadow: "0 1px 6px rgba(30,64,175,0.06)",
          }}
        >
          <div className="flex-1" />
          <div className="flex items-center gap-1.5 px-2 py-1 rounded-lg border border-slate-200">
            <div className="w-5 h-5 rounded-full bg-blue-50 flex items-center justify-center text-[9px] font-bold text-blue-600">관</div>
            <span className="text-[11px] font-medium text-slate-700">관리자</span>
          </div>
        </div>

        {/* Hero banner (mini) */}
        <div
          className="px-3 py-3 shrink-0"
          style={{ background: "linear-gradient(to right, #1d4ed8, #3b82f6)" }}
        >
          <p className="text-[9px] text-blue-200 uppercase tracking-widest">KT MOS남부</p>
          <p className="text-[13px] font-bold text-white leading-tight">종합안전포털시스템</p>
        </div>

        {/* NoticeTicker */}
        <div className="shrink-0" style={{ pointerEvents: "none" }}>
          <NoticeTicker inline />
        </div>

        {/* Stat cards (mini) */}
        <div className="grid grid-cols-2 gap-1.5 px-2 py-2">
          {[
            { label: "평균 안전점수", color: "#3b82f6", bg: "#dbeafe" },
            { label: "금년 사고건수", color: "#ef4444", bg: "#fee2e2" },
            { label: "공지/알림", color: "#f59e0b", bg: "#fef3c7" },
            { label: "승인대기 위험성평가", color: "#f97316", bg: "#ffedd5" },
          ].map((item) => (
            <div key={item.label} className="flex items-center gap-1.5 rounded-lg p-2 bg-white shadow-sm border border-slate-100">
              <div className="w-6 h-6 rounded-md flex items-center justify-center shrink-0" style={{ background: item.bg }}>
                <ShieldAlert className="w-3 h-3" style={{ color: item.color }} />
              </div>
              <div className="min-w-0">
                <p className="text-[8px] text-slate-400 truncate">{item.label}</p>
                <p className="text-[11px] font-bold" style={{ color: item.color }}>-</p>
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

/* ─── Page ─── */
export default function UiMockupPreview() {
  const { user } = useAuth();
  const { canViewAccidents, canViewRiskAssessment, canViewNotices } = usePermissions();

  const { data: accidentStats } = useQuery<AccidentStat>({
    queryKey: ["/api/accidents/stats"],
    enabled: canViewAccidents,
  });

  const { data: notices } = useQuery<Notice[]>({
    queryKey: ["/api/notices"],
    enabled: canViewNotices,
  });

  const { data: riskAssessments } = useQuery<RiskAssessment[]>({
    queryKey: ["/api/risk-assessments"],
    enabled: canViewRiskAssessment,
  });

  const { data: pinnedData } = useQuery<{ pinnedNoticeId: number | null }>({
    queryKey: ["/api/settings/pinned-notice"],
  });

  const noticeList = Array.isArray(notices) ? notices.filter((n) => n.category === "notice") : [];
  const noticeCount = noticeList.length;
  const accidentCount = accidentStats?.byYear?.[String(CURRENT_YEAR)] ?? accidentStats?.total ?? 0;
  const pendingRisks = Array.isArray(riskAssessments)
    ? riskAssessments.filter((r) => r.approvalStatus === "승인대기").length
    : 0;

  const pinnedNoticeId = pinnedData?.pinnedNoticeId;
  const tickerNotice = (() => {
    if (!noticeList.length) return null;
    if (pinnedNoticeId) {
      const pinned = noticeList.find((n) => n.id === pinnedNoticeId);
      if (pinned) return pinned;
    }
    return [...noticeList].sort((a, b) => b.id - a.id)[0] ?? null;
  })();
  const tickerText = tickerNotice?.title ?? "시스템 정상 작동 중. 현재 활성화된 긴급 알림이 없습니다.";

  const userName = user?.name ?? user?.username ?? "관리자";

  const statItems: StatCardItem[] = [
    {
      label: "금년 사고건수",
      value: `${accidentCount}건`,
      color: accidentCount > 0 ? "#ef4444" : "#10b981",
      bg: accidentCount > 0 ? "#fee2e2" : "#d1fae5",
      icon: AlertTriangle,
    },
    {
      label: "공지/알림",
      value: `${noticeCount}건`,
      color: "#f59e0b",
      bg: "#fef3c7",
      icon: Bell,
    },
    {
      label: "승인대기 위험성평가",
      value: `${pendingRisks}건`,
      color: pendingRisks > 0 ? "#f97316" : "#64748b",
      bg: pendingRisks > 0 ? "#ffedd5" : "#f1f5f9",
      icon: FileWarning,
    },
    {
      label: "안전관리",
      value: "정상",
      color: "#3b82f6",
      bg: "#dbeafe",
      icon: ShieldCheck,
    },
  ];

  return (
    <div className="min-h-screen bg-slate-100 flex flex-col">
      {/* Page header */}
      <div
        className="px-6 py-5 border-b shrink-0"
        style={{ background: "#ffffff", borderColor: "#e2e8f0" }}
        data-testid="mockup-page-header"
      >
        <div className="flex items-center gap-3 mb-1">
          <div
            className="w-8 h-8 rounded-xl flex items-center justify-center"
            style={{ background: "#0F172A" }}
          >
            <LayoutDashboard className="w-4 h-4 text-white" />
          </div>
          <div>
            <h1 className="text-lg font-bold text-slate-900">심플·모던 UI 목업 미리보기</h1>
            <p className="text-[12px] text-slate-500">
              좌측: 현재 디자인 &nbsp;/&nbsp; 우측: 새 클린 모던 디자인 — 실제 API 데이터 적용
            </p>
          </div>
        </div>
      </div>

      {/* Side-by-side panels */}
      <div className="flex flex-1 gap-4 p-4 min-h-0" style={{ height: "calc(100vh - 88px)" }}>

        {/* LEFT: Current design */}
        <div className="flex flex-col flex-1 min-w-0" data-testid="panel-current">
          <div
            className="px-3 py-2 rounded-t-xl text-[11px] font-bold uppercase tracking-wider"
            style={{ background: "#e2e8f0", color: "#64748b" }}
          >
            현재 UI (Before)
          </div>
          <div
            className="flex-1 rounded-b-xl overflow-hidden border"
            style={{ borderColor: "#e2e8f0", borderTop: "none", background: "#f8fafc" }}
          >
            <CurrentDesignLayout />
          </div>
        </div>

        {/* RIGHT: New clean design */}
        <div className="flex flex-col flex-1 min-w-0" data-testid="panel-new">
          <div
            className="px-3 py-2 rounded-t-xl text-[11px] font-bold uppercase tracking-wider"
            style={{ background: "#0F172A", color: "rgba(255,255,255,0.7)" }}
          >
            새 디자인 (After) — 실제 데이터 적용
          </div>
          <div
            className="flex-1 rounded-b-xl overflow-hidden border"
            style={{ borderColor: "#0F172A", borderTop: "none" }}
          >
            <NewDesignLayout
              userName={userName}
              tickerText={tickerText}
              statItems={statItems}
              notices={Array.isArray(notices) ? notices : []}
            />
          </div>
        </div>

      </div>

      {/* Bottom CTA */}
      <div
        className="px-6 py-4 text-center shrink-0"
        style={{ background: "#ffffff", borderTop: "1px solid #e2e8f0" }}
        data-testid="section-cta"
      >
        <p className="text-[12px] text-slate-500">
          새 디자인이 마음에 드시면{" "}
          <span className="font-bold text-slate-800">"이 디자인으로 적용해줘"</span>
          라고 말씀해 주세요.
        </p>
      </div>
    </div>
  );
}
