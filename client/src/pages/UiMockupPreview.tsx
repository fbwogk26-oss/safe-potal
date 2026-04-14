import {
  LayoutDashboard,
  Bell,
  ShieldCheck,
  Shield,
  HeartPulse,
  Home,
  ChevronDown,
  ChevronRight,
  AlertCircle,
  RefreshCw,
  Cloud,
  Droplets,
  Wind,
  Thermometer,
  ShieldAlert,
  FileWarning,
} from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import { Sidebar } from "@/components/Sidebar";
import { NoticeTicker } from "@/components/NoticeTicker";
import { useQuery } from "@tanstack/react-query";
import { usePermissions } from "@/hooks/use-permissions";

interface WeatherData {
  city: string;
  tempC: number;
  feelsLikeC: number;
  tempMaxC: number;
  tempMinC: number;
  humidity: number;
  windspeedMs: number;
  precipMM: number;
  precipProb: number;
  snowCM: number;
  weatherDesc: string;
  weatherCode: string;
  pm10: number | null;
  pm10Grade: string | null;
  pm10Color: string | null;
  warningFactor: string;
  riskFactor: string;
  safetyAction: string;
  specialReport: string;
}

interface AccidentStat { total: number; byYear?: Record<string, number>; }
interface Notice { id: number; title: string; category: string; createdAt: string; }
interface RiskAssessment { id: number; approvalStatus: string; }

const CURRENT_YEAR = new Date().getFullYear();

function getWeatherEmoji(code: string, tempC: number): string {
  const c = Number(code);
  if ([389, 392, 395].includes(c)) return "⛈️";
  if ([371, 374, 377, 350].includes(c)) return "🌨️";
  if ([338, 335, 332, 329, 326, 323, 320, 317, 314, 311].includes(c)) return "❄️";
  if ([308, 305, 302, 299, 296, 293, 266, 263].includes(c)) return "🌧️";
  if ([176].includes(c)) return "🌦️";
  if ([260, 248, 143].includes(c)) return "🌫️";
  if ([122, 119].includes(c)) return "☁️";
  if ([116].includes(c)) return "⛅";
  if ([113].includes(c)) return tempC >= 30 ? "☀️🌡️" : "🌤️";
  return "🌤️";
}

function SectionHeader({ num, title, desc }: { num: number; title: string; desc: string }) {
  return (
    <div className="flex items-start gap-3 mb-4">
      <div className="w-8 h-8 rounded-full bg-primary text-primary-foreground flex items-center justify-center text-sm font-bold shrink-0">
        {num}
      </div>
      <div>
        <h2 className="text-base font-bold text-foreground">{title}</h2>
        <p className="text-xs text-muted-foreground mt-0.5">{desc}</p>
      </div>
    </div>
  );
}

function CompareLabel({ variant }: { variant: "before" | "after" }) {
  return (
    <div className={cn(
      "inline-flex items-center gap-1 text-[11px] font-bold px-2 py-0.5 rounded mb-2",
      variant === "before"
        ? "bg-slate-100 text-slate-600"
        : "bg-blue-600 text-white"
    )}>
      {variant === "before" ? "현재 (Before)" : "개선안 (After)"}
    </div>
  );
}

function MockupPane({ children, className }: { children: React.ReactNode; className?: string }) {
  return (
    <div className={cn("rounded-xl border overflow-hidden", className)}>
      {children}
    </div>
  );
}

function CodeTag({ children }: { children: string }) {
  return <code className="bg-slate-100 px-1 rounded">{children}</code>;
}

function ChangeNote({ items }: { items: React.ReactNode[] }) {
  return (
    <div className="mt-3 bg-white rounded-xl border border-slate-200 px-4 py-3 text-[12px] text-slate-600 space-y-1">
      <p><span className="font-bold text-slate-800">개선 포인트:</span></p>
      <ul className="list-disc pl-4 space-y-0.5">
        {items.map((item, i) => (
          <li key={i}>{item}</li>
        ))}
      </ul>
    </div>
  );
}

function SidebarAfterMockup() {
  const navItems = [
    { label: "홈", icon: Home, active: true },
    { label: "공지/알림", icon: Bell, active: false },
    { label: "안전수칙", icon: ShieldCheck, active: false },
  ];

  return (
    <MockupPane className="bg-slate-900 border-slate-700">
      <div className="w-44 bg-slate-900 h-72 flex flex-col border-r border-slate-700/50">
        <div className="px-3 py-3 border-b border-slate-700/60">
          <div className="flex items-center gap-2">
            <div className="w-7 h-7 rounded-lg bg-[#0066CC] flex items-center justify-center text-white shadow-lg shrink-0">
              <div className="flex flex-col items-center leading-none">
                <span className="text-[7px] font-bold">kt</span>
                <span className="text-[5px] font-semibold">MOS</span>
              </div>
            </div>
            <div>
              <p className="font-bold text-[11px] text-white leading-tight">종합안전포털시스템</p>
              <p className="text-[9px] text-slate-400">Safety Portal System</p>
            </div>
          </div>
        </div>
        <nav className="flex-1 px-2 py-2 flex flex-col gap-0.5 overflow-hidden">
          {navItems.map((item) => (
            <div
              key={item.label}
              className={cn(
                "flex items-center gap-2 px-2.5 py-1.5 rounded-lg text-[11px] font-medium",
                item.active
                  ? "bg-blue-500/20 text-blue-300 border border-blue-500/30"
                  : "text-slate-400"
              )}
            >
              <item.icon className={cn("w-3.5 h-3.5 shrink-0", item.active ? "text-blue-400" : "opacity-50")} />
              <span>{item.label}</span>
              {item.active && <span className="ml-auto w-1.5 h-1.5 rounded-full bg-blue-400" />}
            </div>
          ))}
          {[
            { label: "안전관리", icon: Shield },
            { label: "보건관리", icon: HeartPulse },
          ].map((item) => (
            <div key={item.label} className="flex items-center gap-2 px-2.5 py-1.5 rounded-lg text-[11px] font-medium text-slate-400">
              <item.icon className="w-3.5 h-3.5 shrink-0 opacity-50" />
              <span className="flex-1">{item.label}</span>
              <ChevronDown className="w-3 h-3 opacity-30" />
            </div>
          ))}
        </nav>
        <div className="px-3 py-1.5 border-t border-slate-700/60 text-[9px] text-slate-600">v3.0.0</div>
      </div>
    </MockupPane>
  );
}

function HeaderAfterMockup() {
  return (
    <MockupPane className="bg-background border-border w-full">
      <header
        className="border-b"
        style={{
          background: "rgba(255,255,255,0.72)",
          backdropFilter: "blur(16px) saturate(180%)",
          WebkitBackdropFilter: "blur(16px) saturate(180%)",
          borderColor: "rgba(214,220,240,0.6)",
          boxShadow: "0 1px 20px 0 rgba(30,64,175,0.06)",
        }}
      >
        <div className="flex items-center px-3 py-2.5 gap-3">
          <div className="flex-1" />
          <div
            className="flex items-center gap-1.5 px-2 py-1 rounded-lg"
            style={{ background: "rgba(59,130,246,0.08)", border: "1px solid rgba(59,130,246,0.18)" }}
          >
            <div className="w-5 h-5 rounded-full bg-blue-500 flex items-center justify-center text-[9px] font-bold text-white">관</div>
            <span className="text-xs font-medium">관리자</span>
            <span className="px-1 py-0.5 text-[9px] rounded bg-primary text-primary-foreground font-bold">관리자</span>
          </div>
        </div>
      </header>
      <div className="p-2 text-[10px] text-muted-foreground bg-white">← 글래스모피즘: backdrop-blur + 반투명 배경 + 파란 글로우 섀도우</div>
    </MockupPane>
  );
}

function TickerAfterMockup({ noticeText }: { noticeText: string }) {
  return (
    <MockupPane className="w-full bg-slate-50 border-slate-200">
      <div className="p-3 flex justify-center">
        <div
          className="inline-flex items-center gap-2 px-4 py-1.5 rounded-full"
          style={{
            background: "linear-gradient(135deg, #1e3a8a 0%, #1d4ed8 50%, #2563eb 100%)",
            boxShadow: "0 4px 16px 0 rgba(37,99,235,0.3)",
          }}
        >
          <span className="w-1.5 h-1.5 rounded-full bg-yellow-300 animate-pulse shrink-0" />
          <span className="text-[10px] font-bold text-white uppercase tracking-wider whitespace-nowrap">공지</span>
          <span className="w-px h-3 bg-white/30" />
          <span className="text-[11px] font-semibold text-white whitespace-nowrap max-w-[280px] truncate">
            {noticeText}
          </span>
          <ChevronRight className="w-3.5 h-3.5 text-white/60" />
        </div>
      </div>
      <div className="px-3 pb-2 text-[10px] text-muted-foreground">← 개선안: 플로팅 Pill 형태 — 배경에 떠있는 캡슐 배지</div>
    </MockupPane>
  );
}

function WeatherBeforeMockup({ weather }: { weather: WeatherData }) {
  return (
    <MockupPane className="bg-card border-border w-full">
      <div className="p-4">
        <div className="flex items-center gap-2 mb-3">
          <span className="text-2xl">{getWeatherEmoji(weather.weatherCode, weather.tempC)}</span>
          <div>
            <p className="text-2xl font-bold leading-none">{weather.tempC}°C</p>
            <p className="text-[10px] text-muted-foreground">최고 {weather.tempMaxC}°C · 최저 {weather.tempMinC}°C</p>
          </div>
        </div>
        <div className="space-y-1 text-[11px]">
          <div className="flex gap-1.5">
            <span className="font-bold text-yellow-600 shrink-0">경고요인</span>
            <span className="text-foreground/80">{weather.warningFactor || "해당없음"}</span>
          </div>
          <div className="flex gap-1.5">
            <span className="font-bold text-red-600 shrink-0">위험요인</span>
            <span className="text-foreground/80">{weather.riskFactor || "해당없음"}</span>
          </div>
          <div className="flex gap-1.5">
            <span className="font-bold text-blue-600 shrink-0">안전조치</span>
            <span className="text-foreground/80">{weather.safetyAction || "일반 주의"}</span>
          </div>
        </div>
        <div className="flex items-start gap-1.5 bg-blue-50 dark:bg-blue-950/30 rounded-lg px-2.5 py-1.5 mt-2">
          <AlertCircle className="w-3 h-3 text-blue-500 shrink-0 mt-0.5" />
          <p className="text-[10px] text-blue-700 dark:text-blue-300">{weather.specialReport || "발효중인 특보 없음"}</p>
        </div>
        <div className="grid grid-cols-2 gap-x-3 gap-y-1 text-[10px] mt-2">
          {[
            { label: "강수량", value: `${weather.precipMM}mm` },
            { label: "강수확률", value: `${weather.precipProb}%` },
            { label: "풍속", value: `${weather.windspeedMs}m/s` },
            { label: "습도", value: `${weather.humidity}%` },
          ].map(({ label, value }) => (
            <div key={label} className="flex justify-between">
              <span className="text-muted-foreground">{label}</span>
              <span className="font-semibold">{value}</span>
            </div>
          ))}
        </div>
      </div>
      <div className="px-4 pb-2 text-[10px] text-muted-foreground border-t border-border/40">← 현재: 텍스트 위주, 일반 카드</div>
    </MockupPane>
  );
}

function WeatherAfterMockup({ weather }: { weather: WeatherData }) {
  return (
    <MockupPane className="w-full border-0 overflow-hidden">
      <div
        className="p-4"
        style={{
          background: "linear-gradient(145deg, #1e3a8a 0%, #1e40af 35%, #2563eb 70%, #3b82f6 100%)",
        }}
      >
        <div className="flex items-center justify-between mb-1">
          <span className="text-[10px] font-bold text-blue-200 uppercase tracking-widest">{weather.city} · 현재 날씨</span>
          <RefreshCw className="w-3 h-3 text-blue-300 opacity-60" />
        </div>
        <div className="flex items-end gap-3 mb-3">
          <span className="text-4xl leading-none">{getWeatherEmoji(weather.weatherCode, weather.tempC)}</span>
          <div>
            <p className="text-4xl font-bold text-white leading-none">{weather.tempC}°</p>
            <p className="text-[11px] text-blue-200 mt-0.5">최고 {weather.tempMaxC}° · 최저 {weather.tempMinC}°</p>
          </div>
          <div className="ml-auto text-right">
            <p className="text-[11px] font-semibold text-white">{weather.weatherDesc}</p>
            <p className="text-[10px] text-blue-200">체감 {weather.feelsLikeC}°C</p>
          </div>
        </div>

        <div className="grid grid-cols-4 gap-2 mb-3">
          {[
            { icon: Droplets, label: "습도", value: `${weather.humidity}%` },
            { icon: Wind, label: "풍속", value: `${weather.windspeedMs}m/s` },
            { icon: Cloud, label: "강수", value: `${weather.precipProb}%` },
            { icon: Thermometer, label: "미세먼지", value: weather.pm10Grade ?? "-" },
          ].map(({ icon: Icon, label, value }) => (
            <div
              key={label}
              className="flex flex-col items-center gap-1 rounded-xl py-2"
              style={{ background: "rgba(255,255,255,0.12)" }}
            >
              <Icon className="w-3.5 h-3.5 text-blue-200" />
              <span className="text-[9px] text-blue-200">{label}</span>
              <span className="text-[11px] font-bold text-white">{value}</span>
            </div>
          ))}
        </div>

        <div
          className="rounded-xl px-3 py-2"
          style={{ background: "rgba(255,255,255,0.10)", border: "1px solid rgba(255,255,255,0.15)" }}
        >
          <div className="flex items-center gap-1.5 mb-1">
            <AlertCircle className="w-3 h-3 text-yellow-300" />
            <span className="text-[10px] font-bold text-yellow-200">경고요인</span>
          </div>
          <p className="text-[10px] text-white/90 leading-snug">
            {weather.warningFactor || "해당없음"}{weather.riskFactor ? ` — ${weather.riskFactor}` : ""}
          </p>
        </div>
      </div>
      <div className="bg-card px-4 py-2 text-[10px] text-muted-foreground border-t border-border">← 개선안: 블루 그라데이션 프리미엄 위젯</div>
    </MockupPane>
  );
}

function MetricCardBefore({ items }: { items: { label: string; value: string; color: string; bg: string }[] }) {
  return (
    <div className="grid grid-cols-2 gap-3">
      {items.map((item) => (
        <div key={item.label} className="bg-card border border-border rounded-xl p-3 flex items-center gap-2.5 shadow-sm">
          <div className="w-8 h-8 rounded-lg flex items-center justify-center flex-shrink-0" style={{ background: item.bg }}>
            <ShieldAlert className="w-4 h-4" style={{ color: item.color }} />
          </div>
          <div className="min-w-0">
            <p className="text-[10px] text-muted-foreground truncate">{item.label}</p>
            <p className="text-base font-bold leading-tight" style={{ color: item.color }}>{item.value}</p>
          </div>
        </div>
      ))}
    </div>
  );
}

function MetricCardAfter({ items }: { items: { label: string; value: string; color: string; bg: string; grad: string; glow: string }[] }) {
  return (
    <div className="grid grid-cols-2 gap-3">
      {items.map((item) => (
        <div
          key={item.label}
          className="rounded-xl p-3 flex items-center gap-2.5"
          style={{
            background: "#fff",
            boxShadow: `0 2px 12px 0 ${item.glow}, 0 1px 3px 0 rgba(0,0,0,0.06)`,
            border: "1px solid rgba(0,0,0,0.05)",
          }}
        >
          <div
            className="w-9 h-9 rounded-xl flex items-center justify-center flex-shrink-0 shadow-sm"
            style={{ background: item.grad }}
          >
            <ShieldAlert className="w-4 h-4" style={{ color: item.color }} />
          </div>
          <div className="min-w-0">
            <p className="text-[10px] text-muted-foreground truncate">{item.label}</p>
            <p className="text-base font-bold leading-tight" style={{ color: item.color }}>{item.value}</p>
          </div>
        </div>
      ))}
    </div>
  );
}

const SECTIONS = [
  { label: "사이드바", num: 1 },
  { label: "헤더", num: 2 },
  { label: "공지 티커", num: 3 },
  { label: "날씨 위젯", num: 4 },
  { label: "카드 스타일", num: 5 },
];

export default function UiMockupPreview() {
  const { canViewAccidents, canViewRiskAssessment, canViewNotices } = usePermissions();

  const { data: weather, isLoading: weatherLoading } = useQuery<WeatherData>({
    queryKey: ["/api/weather/current", "대구"],
    queryFn: () => fetch("/api/weather/current?city=대구", { credentials: "include" }).then((r) => r.json()),
    staleTime: 10 * 60 * 1000,
  });

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
  const pendingRisks = Array.isArray(riskAssessments) ? riskAssessments.filter((r) => r.approvalStatus === "승인대기").length : 0;

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

  const metricItemsBefore = [
    { label: "금년 사고건수", value: `${accidentCount}건`, color: accidentCount > 0 ? "#ef4444" : "#10b981", bg: accidentCount > 0 ? "#fee2e2" : "#d1fae5" },
    { label: "공지/알림", value: `${noticeCount}건`, color: "#f59e0b", bg: "#fef3c7" },
    { label: "승인대기 위험성평가", value: `${pendingRisks}건`, color: pendingRisks > 0 ? "#f97316" : "#64748b", bg: pendingRisks > 0 ? "#ffedd5" : "#f1f5f9" },
    { label: "안전관리", value: "점검 중", color: "#3b82f6", bg: "#dbeafe" },
  ];

  const metricItemsAfter = metricItemsBefore.map((item) => ({
    ...item,
    grad: `linear-gradient(135deg, ${item.bg}, ${item.bg.replace("e2", "ca").replace("c7", "8a").replace("d5", "aa").replace("f9", "f1")})`,
    glow: `${item.color}26`,
  }));

  return (
    <div className="min-h-screen bg-slate-50">
      <div
        className="px-6 py-6 border-b border-slate-200"
        style={{ background: "linear-gradient(135deg, #1e3a8a 0%, #1d4ed8 60%, #2563eb 100%)" }}
      >
        <div className="max-w-5xl mx-auto">
          <div className="flex items-center gap-3 mb-1">
            <div className="w-8 h-8 rounded-xl bg-white/20 flex items-center justify-center">
              <LayoutDashboard className="w-4 h-4 text-white" />
            </div>
            <Badge className="bg-white/20 text-white border-0 text-[10px] font-bold tracking-widest uppercase">
              디자인 목업 미리보기
            </Badge>
          </div>
          <h1 className="text-2xl font-bold text-white mt-2">UI 리디자인 개선안</h1>
          <p className="text-blue-200 text-sm mt-1">
            아래 5가지 개선 요소의 현재(Before) / 개선안(After) 비교 목업입니다.
            마음에 드시면{" "}
            <span className="text-white font-semibold">"이 디자인으로 적용해줘"</span>
            라고 말씀해 주세요.
          </p>
          <div className="flex flex-wrap gap-2 mt-4">
            {SECTIONS.map((s) => (
              <button
                key={s.num}
                onClick={() => document.getElementById(`section-${s.num}`)?.scrollIntoView({ behavior: "smooth" })}
                className="px-3 py-1 rounded-full text-[11px] font-semibold text-white bg-white/15 hover:bg-white/25 transition-colors border border-white/20"
                data-testid={`button-jump-section-${s.num}`}
              >
                {s.num}. {s.label}
              </button>
            ))}
          </div>
        </div>
      </div>

      <div className="max-w-5xl mx-auto px-4 py-8 space-y-12">

        {/* ─── Section 1: Sidebar ─── */}
        <section id="section-1" data-testid="section-sidebar">
          <SectionHeader
            num={1}
            title="다크 네이비 사이드바"
            desc="현재 밝은 카드 배경(bg-card/90) → 다크 네이비(bg-slate-900) 로 전환. 아이콘·텍스트는 슬레이트 화이트 계열로 조정."
          />
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <CompareLabel variant="before" />
              <MockupPane className="border-border">
                <div className="relative overflow-hidden" style={{ height: "288px" }}>
                  <div
                    style={{
                      transformOrigin: "top left",
                      transform: "scale(0.82)",
                      width: "calc(100% / 0.82)",
                      pointerEvents: "none",
                    }}
                  >
                    <Sidebar />
                  </div>
                </div>
              </MockupPane>
            </div>
            <div>
              <CompareLabel variant="after" />
              <SidebarAfterMockup />
            </div>
          </div>
          <ChangeNote items={[
            <span>사이드바 배경: <CodeTag>bg-card/90</CodeTag> → <CodeTag>bg-slate-900</CodeTag></span>,
            <span>텍스트: muted-foreground → <CodeTag>text-slate-400</CodeTag> / hover 시 <CodeTag>text-slate-200</CodeTag></span>,
            <span>활성 항목: primary/10 → 반투명 파란 테두리 + 블루 텍스트 (blue-300)</span>,
            <span>구분선: border-border/50 → <CodeTag>border-slate-700/60</CodeTag></span>,
          ]} />
        </section>

        {/* ─── Section 2: Header ─── */}
        <section id="section-2" data-testid="section-header">
          <SectionHeader
            num={2}
            title="글래스모피즘 헤더"
            desc="현재 단순 배경+테두리 헤더 → backdrop-blur + 반투명 배경으로 유리처럼 투과되는 글래스 효과 적용."
          />
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <CompareLabel variant="before" />
              <MockupPane className="bg-background border-border w-full">
                <header className="bg-background/95 backdrop-blur-sm border-b border-border/70 shadow-sm">
                  <div className="flex items-center px-3 py-2.5 gap-3">
                    <div className="flex-1" />
                    <div className="flex items-center gap-1.5 px-2 py-1 rounded-lg border border-border">
                      <div className="w-5 h-5 rounded-full bg-primary/10 flex items-center justify-center text-[9px] font-bold text-primary">관</div>
                      <span className="text-xs font-medium">관리자</span>
                      <span className="px-1 py-0.5 text-[9px] rounded bg-primary text-primary-foreground font-bold">관리자</span>
                    </div>
                  </div>
                </header>
                <div className="p-2 text-[10px] text-muted-foreground">← 기존 헤더: 단순 배경 + 명확한 테두리</div>
              </MockupPane>
            </div>
            <div>
              <CompareLabel variant="after" />
              <HeaderAfterMockup />
            </div>
          </div>
          <ChangeNote items={[
            <span>배경: <CodeTag>bg-background/95</CodeTag> → <CodeTag>rgba(255,255,255,0.72)</CodeTag></span>,
            <span><CodeTag>backdrop-blur-xl saturate-180</CodeTag> 필터 추가</span>,
            <span>테두리: 반투명 (<CodeTag>rgba(214,220,240,0.6)</CodeTag>)</span>,
            <span>그림자: 부드러운 파란 글로우 (<CodeTag>0 1px 20px rgba(30,64,175,0.06)</CodeTag>)</span>,
          ]} />
        </section>

        {/* ─── Section 3: Notice Ticker ─── */}
        <section id="section-3" data-testid="section-ticker">
          <SectionHeader
            num={3}
            title="플로팅 Pill 형태 공지 티커"
            desc="현재 화면 전체 너비를 차지하는 파란 배너 → 컨텐츠 영역 중앙에 떠있는 캡슐(Pill) 형태로 변경. 실제 공지 데이터 기반."
          />
          <div className="grid grid-cols-1 gap-4">
            <div>
              <CompareLabel variant="before" />
              <MockupPane className="border-border w-full overflow-hidden">
                <div style={{ pointerEvents: "none" }}>
                  <NoticeTicker inline />
                </div>
                <div className="p-2 bg-white text-[10px] text-muted-foreground">← 현재: 풀-위드 배너 (전체 너비 파란 띠, 실제 공지 데이터)</div>
              </MockupPane>
            </div>
            <div>
              <CompareLabel variant="after" />
              <TickerAfterMockup noticeText={tickerText} />
            </div>
          </div>
          <ChangeNote items={[
            <span>레이아웃: 전체 너비 수평 배너 → inline 캡슐 (rounded-full) 가운데 배치</span>,
            <span>그라데이션: 깊은 네이비-파랑 세로 그라데이션 적용</span>,
            <span>그림자: <CodeTag>box-shadow: 0 4px 16px rgba(37,99,235,0.3)</CodeTag> 글로우 효과</span>,
            <span>동일 공지 데이터 사용 (실제 NoticeTicker와 동일 공지 표시)</span>,
          ]} />
        </section>

        {/* ─── Section 4: Weather Widget ─── */}
        <section id="section-4" data-testid="section-weather">
          <SectionHeader
            num={4}
            title="프리미엄 날씨 위젯"
            desc="현재 텍스트 위주 일반 카드 → 블루 그라데이션 배경 + 아이콘 정보 그리드 + 글로우 경고 패널. 실제 날씨 API 데이터 기반."
          />
          {weatherLoading || !weather ? (
            <div className="flex items-center justify-center h-40 gap-2 text-muted-foreground">
              <RefreshCw className="w-4 h-4 animate-spin" />
              <span className="text-sm">날씨 데이터 불러오는 중…</span>
            </div>
          ) : (
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <CompareLabel variant="before" />
                <WeatherBeforeMockup weather={weather} />
              </div>
              <div>
                <CompareLabel variant="after" />
                <WeatherAfterMockup weather={weather} />
              </div>
            </div>
          )}
          <ChangeNote items={[
            <span>배경: 흰 카드 → 네이비-파랑 그라데이션 145deg</span>,
            <span>기상 수치: 텍스트 리스트 → 4열 아이콘 그리드 (글라스 패널, 동일 데이터 표시)</span>,
            <span>경고 패널: 연한 파란 배경 → 반투명 화이트 글라스 (dark 모드 대응)</span>,
            <span>기온 표시: 24px → 40px 대형 폰트, white 텍스트</span>,
          ]} />
        </section>

        {/* ─── Section 5: Cards ─── */}
        <section id="section-5" data-testid="section-cards">
          <SectionHeader
            num={5}
            title="소프트 섀도우·그라데이션 포인트 카드"
            desc="현재 단색 배경 아이콘 + 기본 shadow-sm → 색상별 그라데이션 아이콘 배경 + 컬러 글로우 섀도우. 실제 통계 데이터 기반."
          />
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <CompareLabel variant="before" />
              <div className="p-4 bg-white rounded-xl border border-slate-200">
                <MetricCardBefore items={metricItemsBefore} />
              </div>
            </div>
            <div>
              <CompareLabel variant="after" />
              <div className="p-4 bg-slate-50 rounded-xl border border-slate-200">
                <MetricCardAfter items={metricItemsAfter} />
              </div>
            </div>
          </div>
          <ChangeNote items={[
            <span>아이콘 배경: 단색 → 컬러별 그라데이션 (같은 계열 2단계, 동일 색상 변수)</span>,
            <span>카드 그림자: <CodeTag>shadow-sm</CodeTag> → 컬러 글로우 + 기본 그림자 조합</span>,
            <span>테두리: <CodeTag>border-border</CodeTag> → 매우 연한 검정 (<CodeTag>rgba(0,0,0,0.05)</CodeTag>)</span>,
            <span>아이콘 컨테이너: rounded-lg (8px) → rounded-xl (12px) + w-9 h-9</span>,
          ]} />
        </section>

        {/* CTA */}
        <section className="text-center py-6" data-testid="section-cta">
          <div
            className="inline-flex flex-col items-center gap-2 px-8 py-5 rounded-2xl border"
            style={{
              background: "linear-gradient(135deg, #f0f7ff, #e8f4fd)",
              borderColor: "rgba(59,130,246,0.2)",
            }}
          >
            <FileWarning className="w-6 h-6 text-blue-500" />
            <p className="text-sm font-bold text-slate-800">이 디자인을 실제 앱에 적용하려면</p>
            <p className="text-sm text-slate-600">
              원하시는 항목을 말씀해 주세요. 예:<br />
              <span className="font-semibold text-blue-700">"사이드바 + 날씨 위젯 개선안으로 적용해줘"</span>
            </p>
          </div>
        </section>

      </div>
    </div>
  );
}
