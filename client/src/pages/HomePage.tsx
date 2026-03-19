import { type ReactNode } from "react";
import { useQuery } from "@tanstack/react-query";
import { Link } from "wouter";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription } from "@/components/ui/dialog";
import WeatherSafetyDialog from "@/components/WeatherSafetyDialog";
import { Checkbox } from "@/components/ui/checkbox";
import { Button } from "@/components/ui/button";
import {
  ShieldCheck, Bell, GraduationCap, AlertTriangle,
  ClipboardCheck, FlaskConical,
  ChevronRight, Users, FileWarning, Target,
  ShieldAlert, TrendingUp,
  Siren, RefreshCw, AlertCircle,
} from "lucide-react";
import { motion } from "framer-motion";
import { format } from "date-fns";
import { ko } from "date-fns/locale";
import { useAuth } from "@/hooks/use-auth";
import { usePermissions } from "@/hooks/use-permissions";
import { useTeams } from "@/hooks/use-teams";
import { useState, useEffect, useMemo } from "react";
import { cn } from "@/lib/utils";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { useMutation } from "@tanstack/react-query";

interface Team { id: number; name: string; totalScore: number; year: number; }
interface Notice { id: number; title: string; category: string; createdAt: string; }
interface Accident { id: number; accidentType: string; department: string; occurredAt: string; severity: string; }
interface AccidentStat { total: number; byYear?: Record<string, number>; }
interface RiskAssessment { id: number; title: string; department: string; approvalStatus: string; riskLevel: string; createdAt: string; }
interface TrafficFine { id: number; violationDate: string; department: string; licensePlate: string; violationType: string; amount: number; paymentStatus: string; }
interface EduSession { id: number; title: string; educationDate: string; department: string; status: string; educationType: string; totalParticipants: number; signatureCount: number; }
interface WeatherData {
  city: string;
  tempC: number;
  feelsLikeC: number;
  tempMaxC: number;
  tempMinC: number;
  humidity: number;
  windspeedKmph: number;
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
  fetchedAt: string;
}

interface KoshaMajorAccident {
  dsptYr: string; dsptMm: string; bizplcNm: string; accdntDt: string;
  indstryNm: string; accdntTpNm: string; accdntCausNm: string;
  dthNum: number; injuNum: number; locNm: string;
  imageUrl?: string; srnNo?: string;
}
interface KoshaResult { accidents: KoshaMajorAccident[]; configured: boolean; fetchedAt: string | null; isSampleData?: boolean; }

const CURRENT_YEAR = new Date().getFullYear();

function getAccidentVisual(type: string): { bg: string; sceneBg: string; icon: string; color: string; borderColor: string } {
  const map: Record<string, { bg: string; sceneBg: string; icon: string; color: string; borderColor: string }> = {
    "떨어짐": { bg: "from-orange-600 to-red-600", sceneBg: "#1c1917", icon: "🏗️", color: "#f97316", borderColor: "#ea580c" },
    "끼임":   { bg: "from-slate-700 to-slate-900", sceneBg: "#1e293b", icon: "⚙️", color: "#64748b", borderColor: "#475569" },
    "부딪힘": { bg: "from-yellow-600 to-orange-600", sceneBg: "#292524", icon: "🚛", color: "#d97706", borderColor: "#ca8a04" },
    "폭발·파열": { bg: "from-red-700 to-orange-700", sceneBg: "#1c0a00", icon: "💥", color: "#dc2626", borderColor: "#b91c1c" },
    "화재":   { bg: "from-red-600 to-rose-700", sceneBg: "#1c0000", icon: "🔥", color: "#ef4444", borderColor: "#dc2626" },
    "무너짐": { bg: "from-stone-600 to-stone-800", sceneBg: "#1c1917", icon: "🏚️", color: "#78716c", borderColor: "#57534e" },
    "감전":   { bg: "from-yellow-500 to-amber-600", sceneBg: "#1c1300", icon: "⚡", color: "#eab308", borderColor: "#ca8a04" },
    "질식":   { bg: "from-blue-700 to-cyan-800", sceneBg: "#071e2e", icon: "🫁", color: "#0284c7", borderColor: "#0369a1" },
    "유해물질 노출": { bg: "from-green-700 to-teal-800", sceneBg: "#071c14", icon: "☣️", color: "#16a34a", borderColor: "#15803d" },
  };
  return map[type] ?? { bg: "from-gray-600 to-gray-800", sceneBg: "#111827", icon: "⚠️", color: "#6b7280", borderColor: "#4b5563" };
}

function getPreventionTips(type: string, cause: string): string[] {
  const tips: Record<string, string[]> = {
    "떨어짐": ["고소작업 시 안전벨트·안전망을 반드시 설치하고 개구부에는 덮개를 고정하세요.", "작업 전 추락 위험요소를 파악하고 2m 이상 높이 작업은 추락방지 조치를 하세요."],
    "끼임": ["기계 정비·청소 시 반드시 전원을 차단(LOTO)하고 잠금장치를 설치하세요.", "회전체·협착 위험 부위에는 방호덮개를 설치하고 작업복은 달라붙는 것을 착용하세요."],
    "부딪힘": ["차량 운행 경로와 작업자 보행 동선을 안전하게 분리하세요.", "후진 경보장치를 설치하고 필요 시 유도자를 배치하세요."],
    "폭발·파열": ["밀폐공간 진입 전 유해가스·산소 농도를 측정하고 충분히 환기하세요.", "인화성 물질 주변 화기 작업은 허가서를 발급받고 감시자를 배치하세요."],
    "화재": ["가연성·인화성 물질 보관 장소에 소화기를 비치하고 사용법을 숙지하세요.", "화기 작업 전 작업허가를 받고 작업 후 화기 잔존 여부를 확인하세요."],
    "무너짐": ["굴착 작업 전 지반 상태를 조사하고 토류판 등 붕괴방지 조치를 하세요.", "적재물 높이 제한을 준수하고 구조물 주변 하중 변화를 상시 점검하세요."],
    "감전": ["전기 설비 점검 전 반드시 전원을 차단하고 검전기로 무전압을 확인하세요.", "활선 작업 시 절연 보호구·절연 공구를 사용하고 고압선 접근 금지구역을 설정하세요."],
    "질식": ["밀폐공간 진입 전 산소 농도(18% 이상)와 유해가스 농도를 측정하세요.", "환기설비를 충분히 가동하고 공기공급식 호흡기를 착용하세요."],
    "유해물질 노출": ["MSDS를 확인하고 작업에 적합한 개인보호구(마스크·장갑)를 착용하세요.", "유해물질 취급 후에는 피부 노출 부위를 충분히 세척하세요."],
  };
  return tips[type] ?? [
    `${cause} 재발 방지를 위한 안전조치를 철저히 이행하세요.`,
    "작업 전 안전점검을 실시하고 위험요인을 사전에 제거하세요.",
  ];
}

function KoshaSirenCard({ item }: { item: KoshaMajorAccident }) {
  const visual = getAccidentVisual(item.accdntTpNm);
  const prevention = getPreventionTips(item.accdntTpNm, item.accdntCausNm);
  const dateStr = item.accdntDt
    ? item.accdntDt.replace(/-/g, ".").substring(2)
    : `${item.dsptYr}.${String(item.dsptMm).padStart(2, "0")}`;

  return (
    <a
      href="https://www.kosha.or.kr/kosha/accident/siren.do"
      target="_blank"
      rel="noopener noreferrer"
      className="block rounded-xl overflow-hidden border border-border shadow-sm hover:shadow-md transition-shadow bg-white dark:bg-card"
    >
      {/* 헤더: 중대재해 발생 알림 */}
      <div className={`bg-gradient-to-r ${visual.bg} px-3 py-2.5`}>
        <div className="flex items-center justify-between">
          <p className="text-white font-bold text-[13px] leading-tight tracking-tight">중대재해 발생 알림</p>
          <div className="flex items-center gap-1">
            {Number(item.dthNum) > 0 && (
              <span className="text-[9px] font-bold bg-white/20 text-white px-1.5 py-0.5 rounded">사망 {item.dthNum}</span>
            )}
            {Number(item.injuNum) > 0 && (
              <span className="text-[9px] font-bold bg-white/20 text-white px-1.5 py-0.5 rounded">부상 {item.injuNum}</span>
            )}
          </div>
        </div>
        <div className="flex items-center gap-2 mt-0.5">
          <span className="text-[9px] text-white/80">발생일시</span>
          <span className="text-[9px] font-semibold text-white">{dateStr}</span>
          {item.locNm && (
            <>
              <span className="text-white/40">·</span>
              <span className="text-[9px] text-white/80 truncate">{item.locNm}</span>
            </>
          )}
        </div>
      </div>

      {/* 사고 장면 영역 */}
      <div className="relative overflow-hidden" style={{ background: visual.sceneBg, height: 130 }}>
        {item.imageUrl ? (
          <img
            src={item.imageUrl}
            alt={`${item.accdntTpNm} 사고 현장`}
            className="w-full h-full object-cover"
            onError={(e) => {
              const target = e.currentTarget;
              target.style.display = "none";
              const fallback = target.nextElementSibling as HTMLElement;
              if (fallback) fallback.style.display = "flex";
            }}
          />
        ) : null}
        {/* 이미지 없을 때 / 이미지 로드 실패 시 폴백 */}
        <div
          className="absolute inset-0 items-center justify-center"
          style={{ display: item.imageUrl ? "none" : "flex" }}
        >
          <span className="text-6xl opacity-50 select-none">{visual.icon}</span>
          <div
            className="absolute inset-0 opacity-20"
            style={{
              backgroundImage: "repeating-linear-gradient(45deg, rgba(255,255,255,0.05) 0, rgba(255,255,255,0.05) 1px, transparent 0, transparent 50%)",
              backgroundSize: "12px 12px",
            }}
          />
        </div>
        {/* 중대재해사이렌 뱃지 */}
        <div className="absolute top-2 left-2 flex items-center gap-1 bg-red-600 text-white px-2 py-0.5 rounded text-[9px] font-bold shadow-sm">
          <Siren className="w-2.5 h-2.5" />
          <span>중대재해사이렌</span>
        </div>
        {/* 업종/재해유형 뱃지 */}
        <div className="absolute bottom-2 left-2 right-2 flex gap-1.5 flex-wrap">
          <span className="text-[9px] px-1.5 py-0.5 rounded bg-black/60 text-white font-medium backdrop-blur-sm">
            업종: {item.indstryNm}
          </span>
          <span className="text-[9px] px-1.5 py-0.5 rounded font-bold text-white backdrop-blur-sm" style={{ background: visual.borderColor + "cc" }}>
            {item.accdntTpNm}
          </span>
        </div>
      </div>

      {/* 사고 내용 */}
      <div className="px-3 py-2.5 space-y-2">
        <p className="text-[11px] font-bold text-foreground leading-snug line-clamp-2">
          {item.bizplcNm} 소재 {item.locNm ? `${item.locNm} ` : ""}{item.accdntCausNm}으로 인해
          <span className="text-red-600"> {item.accdntTpNm} 재해 발생</span>
        </p>

        {/* 예방 대책 */}
        <div className="bg-amber-50 dark:bg-amber-950/30 border border-amber-200 dark:border-amber-800 rounded-md px-2.5 py-2">
          <p className="text-[9px] font-bold text-amber-800 dark:text-amber-300 mb-1.5 flex items-center gap-1">
            <span className="text-amber-500">⚠</span> 예방 대책
          </p>
          {prevention.map((tip, i) => (
            <p key={i} className="text-[9px] text-amber-700 dark:text-amber-400 leading-snug flex gap-1 mb-0.5 last:mb-0">
              <span className="shrink-0 text-amber-500 font-bold">•</span>
              <span>{tip}</span>
            </p>
          ))}
        </div>
      </div>

      {/* 푸터 */}
      <div className="px-3 py-1.5 border-t border-border/50 flex items-center justify-between">
        <div className="flex items-center gap-1">
          <span className="text-[8px] font-bold bg-green-600 text-white px-1 py-0.5 rounded-sm">OPEN</span>
          <span className="text-[8px] font-bold bg-blue-700 text-white px-1 py-0.5 rounded-sm">공공</span>
        </div>
        <span className="text-[8px] text-muted-foreground font-medium">고용노동부 · 산업안전보건공단</span>
      </div>
    </a>
  );
}

const CATEGORY_LABELS: Record<string, string> = {
  notice: "공지", rule: "수칙", education: "교육", equipment: "용품", access: "출입", edu: "교육",
  safe_message: "세이프메시지", equip_request: "용품신청",
};

const KOREAN_CITIES = ["대구","구미","문경","안동","포항","울릉도","울진"];

function getWeatherEmojiUI(code: string, tempC: number): string {
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

type Tab = "공지사항" | "최근 사고" | "승인대기" | "과태료" | "교육내역" | "용품 신청" | "출입신청";

export default function HomePage() {
  const { user } = useAuth();
  const {
    canViewNotices,
    canViewAccidents,
    canViewRiskAssessment,
    canViewDashboard,
    canViewInspections,
    canViewEducationLogs,
    canViewMsds,
    canViewVehicleLogs,
    canViewEquipment,
    canViewAccess,
  } = usePermissions();

  const QUICK_IN = [
    { label: "안전점수", href: "/safety-scores", icon: ShieldCheck, color: "#3b82f6", bg: "#dbeafe", show: canViewDashboard },
    { label: "위험성평가", href: "/risk-assessment", icon: Target, color: "#f97316", bg: "#ffedd5", show: canViewRiskAssessment },
    { label: "안전점검", href: "/inspections", icon: ClipboardCheck, color: "#10b981", bg: "#d1fae5", show: canViewInspections },
    { label: "사고보고", href: "/accidents", icon: AlertTriangle, color: "#ef4444", bg: "#fee2e2", show: canViewAccidents },
    { label: "교육관리", href: "/education-logs", icon: GraduationCap, color: "#8b5cf6", bg: "#ede9fe", show: canViewEducationLogs },
    { label: "MSDS검색", href: "/msds", icon: FlaskConical, color: "#06b6d4", bg: "#cffafe", show: canViewMsds },
  ].filter(item => item.show);

  const TABS = [
    canViewNotices && "공지사항",
    canViewAccidents && "최근 사고",
    canViewVehicleLogs && "과태료",
    canViewEducationLogs && "교육내역",
    canViewRiskAssessment && "승인대기",
    canViewEquipment && "용품 신청",
    canViewAccess && "출입신청",
  ].filter(Boolean) as Tab[];

  const now = new Date();
  const [activeTab, setActiveTab] = useState<Tab>("공지사항");

  useEffect(() => {
    if (TABS.length > 0 && !TABS.includes(activeTab)) {
      setActiveTab(TABS[0]);
    }
  }, [TABS.length]);

  const { data: teams } = useTeams(CURRENT_YEAR);
  const { data: notices } = useQuery<Notice[]>({ queryKey: ["/api/notices"] });
  const { data: accidentStats } = useQuery<AccidentStat>({ queryKey: ["/api/accidents/stats"] });
  const { data: accidents } = useQuery<Accident[]>({ queryKey: ["/api/accidents"] });
  const { data: riskAssessments } = useQuery<RiskAssessment[]>({ queryKey: ["/api/risk-assessments"] });
  const { data: trafficFines } = useQuery<TrafficFine[]>({ queryKey: ["/api/traffic-fines"], enabled: canViewVehicleLogs });
  const { data: eduSessions } = useQuery<EduSession[]>({ queryKey: ["/api/education-sessions"], enabled: canViewEducationLogs });
  const [weatherCity, setWeatherCity] = useState("대구");
  const { data: weather, isLoading: weatherLoading } = useQuery<WeatherData>({
    queryKey: ["/api/weather/current", weatherCity],
    queryFn: () => fetch(`/api/weather/current?city=${encodeURIComponent(weatherCity)}`, { credentials: "include" }).then(r => r.json()),
    staleTime: 10 * 60 * 1000,
    refetchInterval: 10 * 60 * 1000,
  });

  const { data: koshaData, isLoading: koshaLoading } = useQuery<KoshaResult>({
    queryKey: ["/api/kosha/major-accidents"],
    refetchInterval: 60 * 60 * 1000,
    staleTime: 55 * 60 * 1000,
  });
  const koshaRefreshMutation = useMutation({
    mutationFn: () => apiRequest("POST", "/api/kosha/refresh"),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["/api/kosha/major-accidents"] }),
  });

  const { data: pinnedData } = useQuery<{ pinnedNoticeId: number | null }>({
    queryKey: ["/api/settings/pinned-notice"],
  });

  const [noticePopupOpen, setNoticePopupOpen] = useState(false);
  const [currentNotice, setCurrentNotice] = useState<any>(null);
  const [dontShowAgain, setDontShowAgain] = useState(false);

  const [safetyMsgOpen, setSafetyMsgOpen] = useState(false);

  useEffect(() => {
    const noticeList = Array.isArray(notices) ? notices.filter((n: any) => n.category === "notice") : [];
    if (noticeList.length === 0) return;

    const dismissedNotices = JSON.parse(localStorage.getItem('dismissedNotices') || '[]');
    const pinnedNoticeId = pinnedData?.pinnedNoticeId;

    if (pinnedNoticeId) {
      const pinnedNotice = noticeList.find((n: any) => n.id === pinnedNoticeId);
      if (pinnedNotice && !dismissedNotices.includes(pinnedNotice.id)) {
        setCurrentNotice(pinnedNotice);
        setNoticePopupOpen(true);
        return;
      }
    }

    const latestNotice = noticeList
      .filter((n: any) => !dismissedNotices.includes(n.id))
      .sort((a: any, b: any) => b.id - a.id)[0];

    if (latestNotice) {
      setCurrentNotice(latestNotice);
      setNoticePopupOpen(true);
    }
  }, [notices, pinnedData]);

  const handleCloseNoticePopup = () => {
    if (dontShowAgain && currentNotice) {
      const dismissedNotices = JSON.parse(localStorage.getItem('dismissedNotices') || '[]');
      dismissedNotices.push(currentNotice.id);
      localStorage.setItem('dismissedNotices', JSON.stringify(dismissedNotices));
    }
    setNoticePopupOpen(false);
    setDontShowAgain(false);
  };

  const teamList = Array.isArray(teams) ? teams : [];
  const avgScore = teamList.length > 0
    ? Math.round(teamList.reduce((sum, t) => sum + (t.totalScore ?? 0), 0) / teamList.length)
    : null;

  const thisYearAccidents = accidentStats?.byYear?.[String(CURRENT_YEAR)] ?? accidentStats?.total ?? 0;
  const pendingRisks = Array.isArray(riskAssessments)
    ? riskAssessments.filter(r => r.approvalStatus === "승인대기")
    : [];
  const recentNotices = Array.isArray(notices)
    ? notices.filter((n: any) => n.category === "notice").slice(0, 7)
    : [];
  const recentAccess = Array.isArray(notices)
    ? notices.filter((n: any) => n.category === "access").slice(0, 7)
    : [];
  const recentAccidents = Array.isArray(accidents) ? accidents.slice(0, 7) : [];
  const recentFines = Array.isArray(trafficFines) ? trafficFines.slice(0, 7) : [];
  const groupedEduSessions = useMemo(() => {
    if (!Array.isArray(eduSessions)) return [];
    const groups: { key: string; title: string; date: string; type: string; deptCount: number; totalParticipants: number; totalSigned: number }[] = [];
    const map = new Map<string, typeof groups[0]>();
    for (const s of eduSessions) {
      const gKey = `${s.title}__${s.educationDate}`;
      if (!map.has(gKey)) {
        const g = { key: gKey, title: s.title, date: s.educationDate, type: s.educationType || "정기교육", deptCount: 0, totalParticipants: 0, totalSigned: 0 };
        map.set(gKey, g);
        groups.push(g);
      }
      const g = map.get(gKey)!;
      g.deptCount += 1;
      g.totalParticipants += s.totalParticipants ?? 0;
      g.totalSigned += s.signatureCount ?? 0;
    }
    return groups.slice(0, 7);
  }, [eduSessions]);
  const recentEduSessions = groupedEduSessions;
  const recentEquipNotices = Array.isArray(notices)
    ? notices.filter((n: any) => n.category === "equipment" || n.category === "equip_request")
    : [];
  const recentRequests = recentEquipNotices
    .map((n: any) => ({
      _type: "notice" as const,
      key: `notice-${n.id}`,
      href: "/equipment/request",
      title: n.title,
      createdAt: n.createdAt,
      urgency: null as string | null,
      status: null as string | null,
    }))
    .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime())
    .slice(0, 7);
  const sortedTeams = [...teamList].sort((a, b) => b.totalScore - a.totalScore);

  return (
    <div className="min-h-screen bg-slate-50">

      {/* ── Hero Banner ── */}
      <div className="relative overflow-hidden bg-gradient-to-r from-blue-700 via-blue-600 to-blue-500 px-4 py-5 sm:px-8 sm:py-7 md:px-10 md:py-8">
        <div className="absolute inset-0 opacity-[0.07] pointer-events-none"
          style={{ backgroundImage: "repeating-linear-gradient(45deg,#fff 0,#fff 1px,transparent 0,transparent 50%)", backgroundSize: "18px 18px" }}
        />
        <div className="relative w-full flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-xl bg-white/20 flex items-center justify-center shadow flex-shrink-0">
              <ShieldAlert className="w-5 h-5 text-white" />
            </div>
            <div>
              <p className="text-blue-100 text-[11px] font-medium tracking-widest uppercase">KT MOS남부</p>
              <h1 className="text-lg sm:text-xl md:text-2xl font-bold text-white leading-tight">종합안전포털시스템</h1>
            </div>
          </div>
          <div className="flex flex-col items-start sm:items-end gap-0.5">
            <p className="text-white text-base sm:text-lg font-bold">{format(now, "yyyy년 M월 d일 (EEE)", { locale: ko })}</p>
            <p className="text-blue-100 text-xs sm:text-sm">안전한 하루 되세요, <span className="font-semibold text-white">{user?.name ?? user?.username}</span>님</p>
          </div>
        </div>
      </div>

      {/* ── Main Grid ── */}
      <div className="w-full px-3 sm:px-4 md:px-6 py-4 sm:py-5 md:py-6">
        <div className="flex flex-col lg:flex-row gap-4 sm:gap-5 lg:items-stretch">

          {/* ═══ LEFT PANEL ═══ */}
          <div className="flex-1 min-w-0 flex flex-col gap-4">

            {/* Key Metrics */}
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 sm:gap-3">
              {[
                { label: "평균 안전점수", value: avgScore != null ? `${avgScore}점` : "-", icon: ShieldCheck, color: "#3b82f6", bg: "#dbeafe" },
                { label: "금년 사고건수", value: `${thisYearAccidents}건`, icon: AlertTriangle, color: thisYearAccidents > 0 ? "#ef4444" : "#10b981", bg: thisYearAccidents > 0 ? "#fee2e2" : "#d1fae5" },
                { label: "공지/알림", value: `${Array.isArray(notices) ? notices.filter((n: any) => n.category === "notice").length : 0}건`, icon: Bell, color: "#f59e0b", bg: "#fef3c7" },
                { label: "승인대기 위험성평가", value: `${pendingRisks.length}건`, icon: FileWarning, color: pendingRisks.length > 0 ? "#f97316" : "#64748b", bg: pendingRisks.length > 0 ? "#ffedd5" : "#f1f5f9" },
              ].map((item, i) => (
                <motion.div key={item.label} initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: i * 0.05 }}>
                  <Card className="border-0 shadow-sm hover:shadow transition-shadow">
                    <CardContent className="p-3 flex items-center gap-2.5">
                      <div className="w-9 h-9 rounded-lg flex items-center justify-center flex-shrink-0" style={{ background: item.bg }}>
                        <item.icon className="w-4 h-4" style={{ color: item.color }} />
                      </div>
                      <div className="min-w-0">
                        <p className="text-[10px] sm:text-xs text-muted-foreground truncate">{item.label}</p>
                        <p className="text-base sm:text-lg font-bold leading-tight" style={{ color: item.color }}>{item.value}</p>
                      </div>
                    </CardContent>
                  </Card>
                </motion.div>
              ))}
            </div>

            {/* Quick-in */}
            {QUICK_IN.length > 0 && (
              <div>
                <div className="flex items-center gap-2 mb-2">
                  <TrendingUp className="w-3.5 h-3.5 text-primary" />
                  <h2 className="text-xs font-bold text-muted-foreground uppercase tracking-wider">Quick-in</h2>
                </div>
                <Card className="border-0 shadow-sm">
                  <CardContent className="p-3 sm:p-4">
                    <div className={`grid gap-2 sm:gap-3 ${QUICK_IN.length <= 3 ? "grid-cols-3" : "grid-cols-3 sm:grid-cols-6"}`}>
                      {QUICK_IN.map((item, i) => (
                        <motion.div key={item.href} initial={{ opacity: 0, scale: 0.9 }} animate={{ opacity: 1, scale: 1 }} transition={{ delay: 0.1 + i * 0.05 }}>
                          <Link href={item.href}>
                            <div className="group flex flex-col items-center gap-1.5 cursor-pointer">
                              <div className="w-12 h-12 sm:w-14 sm:h-14 rounded-2xl flex items-center justify-center shadow-sm group-hover:shadow-md transition-all group-hover:scale-105" style={{ background: item.bg }}>
                                <item.icon className="w-6 h-6 sm:w-7 sm:h-7" style={{ color: item.color }} />
                              </div>
                              <p className="text-[11px] sm:text-xs font-semibold text-foreground group-hover:text-primary transition-colors text-center leading-tight">{item.label}</p>
                            </div>
                          </Link>
                        </motion.div>
                      ))}
                    </div>
                  </CardContent>
                </Card>
              </div>
            )}

            {/* Tabbed Content */}
            <div className="flex-1 flex flex-col min-h-0">
              <div className="flex items-center border-b border-border mb-0">
                {TABS.map(tab => (
                  <button
                    key={tab}
                    onClick={() => setActiveTab(tab)}
                    className={cn(
                      "px-3 sm:px-4 py-2 text-xs sm:text-sm font-semibold border-b-2 transition-colors -mb-px",
                      activeTab === tab
                        ? "border-primary text-primary"
                        : "border-transparent text-muted-foreground hover:text-foreground"
                    )}
                  >
                    {tab}
                  </button>
                ))}
              </div>

              <Card className="border-0 shadow-sm rounded-tl-none flex-1 flex flex-col min-h-0">
                <CardContent className="p-0 flex-1 overflow-y-auto">

                  {/* ── 탭 본문: 콤팩트 한 줄 행을 최대한 많이 ── */}
                  {(() => {
                    type TabItem = {
                      key: string | number;
                      href: string;
                      badge: ReactNode;
                      main: ReactNode;
                      sub: ReactNode;
                    };

                    let items: TabItem[] = [];
                    let emptyMsg = "";

                    if (activeTab === "공지사항") {
                      emptyMsg = "등록된 공지가 없습니다.";
                      items = recentNotices.map(n => ({
                        key: n.id, href: "/notices",
                        badge: <Badge variant="outline" className="text-[10px] shrink-0 px-1.5 py-0 whitespace-nowrap">{CATEGORY_LABELS[n.category] ?? n.category}</Badge>,
                        main: <span className="flex-1 text-xs font-medium min-w-0 truncate group-hover:text-primary transition-colors">{n.title}</span>,
                        sub: <span className="text-[10px] text-muted-foreground shrink-0 whitespace-nowrap">{format(new Date(n.createdAt), "yy.MM.dd")}</span>,
                      }));
                    } else if (activeTab === "최근 사고") {
                      emptyMsg = "등록된 사고가 없습니다.";
                      items = recentAccidents.map(a => ({
                        key: a.id, href: "/accidents",
                        badge: <Badge variant="outline" className={cn("text-[10px] shrink-0 px-1.5 py-0 whitespace-nowrap", a.severity === "중대" && "border-red-400 text-red-600")}>{a.accidentType}</Badge>,
                        main: <span className="flex-1 text-xs font-medium min-w-0 truncate group-hover:text-primary transition-colors">{a.department}</span>,
                        sub: <span className="text-[10px] text-muted-foreground shrink-0 whitespace-nowrap">{a.occurredAt ? format(new Date(a.occurredAt), "yy.MM.dd") : "-"}</span>,
                      }));
                    } else if (activeTab === "승인대기") {
                      emptyMsg = "승인대기 항목이 없습니다.";
                      items = pendingRisks.slice(0, 7).map(r => ({
                        key: r.id, href: "/risk-assessment",
                        badge: <Badge variant="outline" className={cn("text-[10px] shrink-0 px-1.5 py-0 whitespace-nowrap", r.riskLevel === "A" && "border-red-400 text-red-600", r.riskLevel === "B" && "border-orange-400 text-orange-600")}>{r.riskLevel}등급</Badge>,
                        main: <span className="flex-1 text-xs font-medium min-w-0 truncate group-hover:text-primary transition-colors">{r.department}</span>,
                        sub: <span className="text-[10px] text-muted-foreground shrink-0 whitespace-nowrap">{r.createdAt ? format(new Date(r.createdAt), "yy.MM.dd") : "-"}</span>,
                      }));
                    } else if (activeTab === "과태료") {
                      emptyMsg = "등록된 과태료 내역이 없습니다.";
                      items = recentFines.map(f => ({
                        key: f.id, href: "/traffic-fines",
                        badge: <Badge variant="outline" className={cn("text-[10px] shrink-0 px-1.5 py-0 whitespace-nowrap", f.paymentStatus === "미납" ? "border-red-400 text-red-600" : "border-emerald-400 text-emerald-600")}>{f.paymentStatus}</Badge>,
                        main: <span className="flex-1 text-xs font-medium min-w-0 truncate group-hover:text-primary transition-colors">{f.department} · {f.violationType}</span>,
                        sub: <span className="text-[10px] text-muted-foreground shrink-0 whitespace-nowrap">{f.violationDate ? format(new Date(f.violationDate), "yy.MM.dd") : "-"}</span>,
                      }));
                    } else if (activeTab === "교육내역") {
                      emptyMsg = "등록된 교육내역이 없습니다.";
                      items = recentEduSessions.map(g => {
                        const pct = g.totalParticipants > 0
                          ? Math.min(100, Math.round((g.totalSigned / g.totalParticipants) * 100))
                          : 0;
                        return {
                          key: g.key, href: "/education-logs",
                          badge: <Badge variant="outline" className="text-[10px] shrink-0 px-1.5 py-0 whitespace-nowrap border-blue-400 text-blue-600">{g.type}</Badge>,
                          main: (
                            <div className="flex-1 min-w-0 flex flex-col gap-0.5">
                              <span className="text-xs font-medium truncate group-hover:text-primary transition-colors">{g.title}</span>
                              <div className="flex items-center gap-2 text-[10px] text-muted-foreground">
                                <span className="shrink-0">{g.date}</span>
                                <span className="shrink-0">{g.deptCount}개 부서</span>
                                <span className="shrink-0">{g.totalSigned}/{g.totalParticipants}명</span>
                              </div>
                            </div>
                          ),
                          sub: <span className={cn("text-xs font-semibold shrink-0 whitespace-nowrap", pct === 100 ? "text-emerald-600" : pct > 0 ? "text-blue-600" : "text-red-500")}>{pct}%</span>,
                        };
                      });
                    } else if (activeTab === "용품 신청") {
                      emptyMsg = "등록된 용품 신청이 없습니다.";
                      items = recentRequests.map(r => ({
                        key: r.key, href: r.href,
                        badge: r._type === "notice"
                          ? <Badge variant="outline" className="text-[10px] shrink-0 px-1.5 py-0 whitespace-nowrap border-green-400 text-green-600">용품신청</Badge>
                          : <Badge variant="outline" className={cn("text-[10px] shrink-0 px-1.5 py-0 whitespace-nowrap", r.urgency === "긴급" ? "border-red-400 text-red-600" : r.urgency === "높음" ? "border-orange-400 text-orange-600" : "border-slate-400 text-slate-600")}>{r.urgency || "신규요청"}</Badge>,
                        main: <span className="flex-1 text-xs font-medium min-w-0 truncate group-hover:text-primary transition-colors">{r.title}</span>,
                        sub: r._type === "request" && r.status
                          ? <Badge variant="secondary" className="text-[10px] px-1.5 py-0 shrink-0 whitespace-nowrap">{r.status}</Badge>
                          : <span className="text-[10px] text-muted-foreground shrink-0 whitespace-nowrap">{format(new Date(r.createdAt), "yy.MM.dd")}</span>,
                      }));
                    } else if (activeTab === "출입신청") {
                      emptyMsg = "등록된 출입신청이 없습니다.";
                      items = recentAccess.map((n: any) => ({
                        key: n.id, href: "/access",
                        badge: <Badge variant="outline" className="text-[10px] shrink-0 px-1.5 py-0 whitespace-nowrap border-purple-400 text-purple-600">출입</Badge>,
                        main: <span className="flex-1 text-xs font-medium min-w-0 truncate group-hover:text-primary transition-colors">{n.title}</span>,
                        sub: <span className="text-[10px] text-muted-foreground shrink-0 whitespace-nowrap">{format(new Date(n.createdAt), "yy.MM.dd")}</span>,
                      }));
                    }

                    if (items.length === 0) {
                      return (
                        <div className="flex items-center justify-center py-8">
                          <p className="text-sm text-muted-foreground">{emptyMsg}</p>
                        </div>
                      );
                    }

                    return (
                      <div className="divide-y divide-border/50">
                        {items.map(item => (
                          <Link key={item.key} href={item.href}>
                            <div className="group flex items-center gap-2 px-3 py-2 hover:bg-accent/40 cursor-pointer transition-colors">
                              {item.badge}
                              {item.main}
                              {item.sub}
                            </div>
                          </Link>
                        ))}
                      </div>
                    );
                  })()}

                </CardContent>
                {/* 전체보기 - 하단 고정 */}
                <div className="border-t border-border/50 mt-auto">
                  <Link href={
                    activeTab === "공지사항" ? "/notices" :
                    activeTab === "최근 사고" ? "/accidents" :
                    activeTab === "과태료" ? "/traffic-fines" :
                    activeTab === "교육내역" ? "/education-logs" :
                    activeTab === "용품 신청" ? "/equipment" :
                    activeTab === "출입신청" ? "/access" :
                    "/risk-assessment"
                  }>
                    <div className="flex items-center justify-center gap-1 py-2 text-xs text-primary font-medium hover:bg-accent/30 cursor-pointer transition-colors">
                      전체 보기 <ChevronRight className="w-3.5 h-3.5" />
                    </div>
                  </Link>
                </div>
              </Card>
            </div>
          </div>

          {/* ═══ RIGHT PANEL ═══ */}
          <div className="w-full lg:w-[340px] xl:w-[400px] flex-shrink-0 flex flex-col gap-4">

            {/* Team Safety Scores */}
            <div>
              <div className="flex items-center justify-between mb-2">
                <h2 className="text-xs font-bold text-muted-foreground uppercase tracking-wider flex items-center gap-1.5">
                  <Users className="w-3.5 h-3.5" />팀별 안전점수
                </h2>
                {canViewDashboard && (
                  <Link href="/safety-scores">
                    <span className="text-[11px] text-primary font-medium flex items-center gap-0.5 hover:underline cursor-pointer">
                      전체 <ChevronRight className="w-3 h-3" />
                    </span>
                  </Link>
                )}
              </div>
              <Card className="border-0 shadow-sm">
                <CardContent className="p-3 space-y-2">
                  {sortedTeams.length === 0
                    ? <p className="text-xs text-muted-foreground text-center py-2">데이터 없음</p>
                    : sortedTeams.map((team, idx) => {
                      const score = Math.min(100, Math.max(0, team.totalScore ?? 0));
                      const color = score >= 90 ? "#10b981" : score >= 70 ? "#f59e0b" : "#ef4444";
                      return (
                        <div key={team.id} className="flex items-center gap-2">
                          <span className="text-[10px] text-muted-foreground w-4 flex-shrink-0 font-bold">{idx + 1}</span>
                          <p className="text-[11px] text-foreground w-14 truncate flex-shrink-0 font-medium">
                            {team.name.replace(/운용팀$/, '').replace(/팀$/, '')}
                          </p>
                          <div className="flex-1 h-1.5 bg-slate-100 rounded-full overflow-hidden">
                            <motion.div
                              className="h-full rounded-full"
                              style={{ background: color }}
                              initial={{ width: 0 }}
                              animate={{ width: `${score}%` }}
                              transition={{ duration: 0.6, delay: 0.3 + idx * 0.03 }}
                            />
                          </div>
                          <p className="text-[11px] font-bold w-8 text-right flex-shrink-0" style={{ color }}>{score}</p>
                        </div>
                      );
                    })
                  }
                </CardContent>
              </Card>
            </div>

            {/* 날씨 위젯 */}
            <div className="flex-1 flex flex-col min-h-0">
              <div className="flex items-center justify-between mb-2">
                <h2 className="text-xs font-bold text-muted-foreground uppercase tracking-wider flex items-center gap-1.5">
                  <span>🌤️</span> 현재 날씨
                </h2>
                <select
                  value={weatherCity}
                  onChange={e => setWeatherCity(e.target.value)}
                  className="text-[10px] border border-border rounded px-1.5 py-0.5 bg-background text-foreground cursor-pointer"
                >
                  {KOREAN_CITIES.map(c => <option key={c} value={c}>{c}</option>)}
                </select>
              </div>
              <Card className="border-0 shadow-sm overflow-hidden flex-1 flex flex-col min-h-0">
                {weatherLoading || !weather ? (
                  <CardContent className="p-4 flex items-center justify-center h-40">
                    <RefreshCw className="w-5 h-5 text-muted-foreground animate-spin" />
                  </CardContent>
                ) : (
                  <CardContent className="p-3 space-y-2.5 flex-1 overflow-y-auto">
                    {/* 기온 */}
                    <div className="flex items-center gap-2">
                      <span className="text-3xl leading-none">{getWeatherEmojiUI(weather.weatherCode, weather.tempC)}</span>
                      <div>
                        <p className="text-2xl font-bold leading-none">{weather.tempC}°C</p>
                        <p className="text-[10px] text-muted-foreground mt-0.5">최고 {weather.tempMaxC}°C · 최저 {weather.tempMinC}°C</p>
                      </div>
                    </div>

                    {/* 경고/위험/안전 */}
                    <div className="space-y-1 text-[11px]">
                      <div className="flex gap-1.5">
                        <span className="font-bold text-yellow-600 flex-shrink-0">경고요인</span>
                        <span className="text-foreground/80 leading-tight">{weather.warningFactor || "해당없음"}</span>
                      </div>
                      <div className="flex gap-1.5">
                        <span className="font-bold text-red-600 flex-shrink-0">위험요인</span>
                        <span className="text-foreground/80 leading-tight">{weather.riskFactor || "해당없음"}</span>
                      </div>
                      <div className="flex gap-1.5">
                        <span className="font-bold text-blue-600 flex-shrink-0">안전조치</span>
                        <span className="text-foreground/80 leading-tight">{weather.safetyAction || "일반 주의"}</span>
                      </div>
                    </div>

                    {/* 기상특보 */}
                    <div className="flex items-start gap-1.5 bg-blue-50 dark:bg-blue-950/30 rounded-lg px-2.5 py-1.5">
                      <AlertCircle className="w-3 h-3 text-blue-500 flex-shrink-0 mt-0.5" />
                      <p className="text-[10px] text-blue-700 dark:text-blue-300 leading-snug">{weather.specialReport || "발효중인 특보 없음"}</p>
                    </div>

                    {/* 상세 수치 */}
                    <div className="grid grid-cols-2 gap-x-3 gap-y-1 text-[10px]">
                      {[
                        { label: "강수량", value: `${weather.precipMM}mm` },
                        { label: "강수확률", value: `${weather.precipProb}%` },
                        { label: "풍속", value: `${weather.windspeedMs}m/s` },
                        { label: "습도", value: `${weather.humidity}%` },
                        { label: "적설량", value: weather.snowCM > 0 ? `${weather.snowCM}cm` : "적설없음" },
                        { label: "미세먼지", value: weather.pm10 != null ? `${weather.pm10}μg/m³` : "-", color: weather.pm10Color ?? undefined },
                      ].map(({ label, value, color }) => (
                        <div key={label} className="flex justify-between">
                          <span className="text-muted-foreground">{label}</span>
                          <span className="font-semibold" style={color ? { color } : undefined}>{value}</span>
                        </div>
                      ))}
                    </div>

                    {/* Safety Message 팝업 */}
                    <button
                      onClick={() => setSafetyMsgOpen(true)}
                      className="w-full flex items-center justify-between bg-primary text-primary-foreground rounded-lg px-3 py-1.5 hover:opacity-90 transition-opacity"
                    >
                      <span className="text-[11px] font-semibold">Safety message</span>
                      <ChevronRight className="w-3.5 h-3.5" />
                    </button>
                  </CardContent>
                )}
              </Card>
            </div>

          </div>
        </div>

        {/* ══ 중대재해사이렌 (전체 너비) ══ */}
        <div className="mt-4 sm:mt-5">
          {/* 헤더 */}
          <div className="flex items-center justify-between mb-3">
            <div className="flex items-center gap-2">
              <div className="w-7 h-7 rounded-lg bg-red-100 flex items-center justify-center">
                <Siren className="w-4 h-4 text-red-600" />
              </div>
              <div>
                <h2 className="text-sm font-bold text-foreground leading-tight">중대재해사이렌</h2>
                <p className="text-[10px] text-muted-foreground leading-tight">산업안전보건공단 최근 발생 알림</p>
              </div>
            </div>
            <div className="flex items-center gap-2">
              {koshaData?.fetchedAt && (
                <span className="text-[9px] text-muted-foreground hidden sm:block">
                  {format(new Date(koshaData.fetchedAt), "HH:mm 기준")}
                </span>
              )}
              <a
                href="https://www.kosha.or.kr/kosha/accident/siren.do"
                target="_blank"
                rel="noopener noreferrer"
                className="text-[10px] px-2 py-1 rounded-full bg-red-50 text-red-600 hover:bg-red-100 transition-colors font-medium border border-red-200"
              >
                KOSHA 바로가기
              </a>
              <button
                onClick={() => koshaRefreshMutation.mutate()}
                disabled={koshaRefreshMutation.isPending || koshaLoading}
                className="p-1.5 rounded-lg hover:bg-accent transition-colors"
                title="새로고침"
              >
                <RefreshCw className={cn("w-3.5 h-3.5 text-muted-foreground", (koshaRefreshMutation.isPending || koshaLoading) && "animate-spin")} />
              </button>
            </div>
          </div>

          {!koshaData?.configured ? (
            <div className="p-8 text-center bg-white dark:bg-card rounded-xl border border-border shadow-sm">
              <Siren className="w-8 h-8 text-muted-foreground mx-auto mb-2" />
              <p className="text-sm text-muted-foreground font-medium">API 키 미설정</p>
              <p className="text-xs text-muted-foreground mt-1">KOSHA_SERVICE_KEY를 설정하면 실시간 중대재해 정보를 표시합니다.</p>
            </div>
          ) : koshaLoading ? (
            <div className="p-8 text-center bg-white dark:bg-card rounded-xl border border-border shadow-sm">
              <RefreshCw className="w-6 h-6 text-muted-foreground mx-auto animate-spin" />
              <p className="text-xs text-muted-foreground mt-2">불러오는 중...</p>
            </div>
          ) : !koshaData?.accidents?.length ? (
            <div className="p-8 text-center bg-white dark:bg-card rounded-xl border border-border shadow-sm">
              <p className="text-xs text-muted-foreground">중대재해 데이터가 없습니다.</p>
            </div>
          ) : (
            <div className="space-y-3">
              {koshaData.isSampleData && (
                <div className="px-3 py-2 bg-amber-50 dark:bg-amber-950/30 rounded-lg border border-amber-200 dark:border-amber-800">
                  <span className="text-[10px] text-amber-700 dark:text-amber-400 font-medium">
                    📋 KOSHA 통계 기반 참고 데이터입니다 ·{" "}
                    <a
                      href="https://www.kosha.or.kr/kosha/accident/siren.do"
                      target="_blank"
                      rel="noopener noreferrer"
                      className="underline hover:text-amber-900 dark:hover:text-amber-200"
                    >
                      KOSHA 홈페이지에서 실시간 확인
                    </a>
                  </span>
                </div>
              )}
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                {koshaData.accidents.slice(0, 3).map((item, idx) => (
                  <KoshaSirenCard key={idx} item={item} />
                ))}
              </div>
              <p className="text-[9px] text-muted-foreground text-center">출처: 고용노동부 · 산업안전보건공단 중대재해사이렌</p>
            </div>
          )}
        </div>

      </div>

      {/* 공지사항 팝업 */}
      <Dialog open={noticePopupOpen} onOpenChange={setNoticePopupOpen}>
        <DialogContent className="max-w-lg max-h-[80vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-lg">
              <AlertCircle className="w-5 h-5 text-primary" />
              공지사항
            </DialogTitle>
            <DialogDescription className="sr-only">공지 내용</DialogDescription>
          </DialogHeader>

          <div className="py-4 space-y-4">
            {currentNotice?.imageUrl && (
              <div className="rounded-lg overflow-hidden border">
                <img
                  src={currentNotice.imageUrl}
                  alt="공지 이미지"
                  className="w-full h-auto object-cover max-h-64"
                />
              </div>
            )}
            <h3 className="font-semibold text-foreground">{currentNotice?.title}</h3>
            <div className="text-sm whitespace-pre-wrap leading-relaxed text-foreground/80">
              {currentNotice?.content}
            </div>
          </div>

          <DialogFooter className="flex-col sm:flex-row gap-3">
            <div className="flex items-center gap-2">
              <Checkbox
                id="dontShowAgain"
                checked={dontShowAgain}
                onCheckedChange={(checked) => setDontShowAgain(checked as boolean)}
                data-testid="checkbox-dont-show-again"
              />
              <label htmlFor="dontShowAgain" className="text-sm text-muted-foreground cursor-pointer">
                다시 보지 않기
              </label>
            </div>
            <Button onClick={handleCloseNoticePopup} data-testid="button-close-notice">
              닫기
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Safety Message Dialog */}
      <WeatherSafetyDialog
        open={safetyMsgOpen}
        onOpenChange={setSafetyMsgOpen}
        initialCity={weatherCity}
      />
    </div>
  );
}
