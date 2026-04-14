import { type ReactNode } from "react";
import { NoticeTicker } from "@/components/NoticeTicker";
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
  RefreshCw, AlertCircle, Shield,
} from "lucide-react";
import { motion } from "framer-motion";
import { format } from "date-fns";
import { ko } from "date-fns/locale";
import { useAuth } from "@/hooks/use-auth";
import { usePermissions } from "@/hooks/use-permissions";
import { useTeams } from "@/hooks/use-teams";
import { useState, useEffect, useMemo } from "react";
import { cn } from "@/lib/utils";

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

const CURRENT_YEAR = new Date().getFullYear();

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
    { label: "안전성평가제", href: "/safety-scores", icon: ShieldCheck, color: "#3b82f6", bg: "#dbeafe", show: canViewDashboard },
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

  const [liveTime, setLiveTime] = useState(new Date());
  useEffect(() => {
    const timer = setInterval(() => setLiveTime(new Date()), 1000);
    return () => clearInterval(timer);
  }, []);
  const now = liveTime;
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
    <div className="min-h-screen bg-slate-50 dark:bg-gray-950">

      {/* ── Hero Banner Header ── */}
      <div className="bg-white dark:bg-gray-900 border-b border-slate-100 dark:border-gray-800">
        {/* 상단: 날짜 + 인사 + 시각 */}
        <div className="px-4 sm:px-5 pt-4 pb-3 flex items-center justify-between gap-3">
          {/* 좌측 */}
          <div className="flex items-center gap-3 min-w-0">
            <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-blue-500 to-indigo-600 flex items-center justify-center shadow-sm flex-shrink-0">
              <Shield className="w-5 h-5 text-white" />
            </div>
            <div className="min-w-0">
              <div className="flex items-center gap-2 flex-wrap">
                <p className="text-sm font-bold text-slate-800 dark:text-gray-100 leading-tight">
                  {format(now, "yyyy년 M월 d일 (EEE)", { locale: ko })}
                </p>
                <span className="hidden sm:inline-flex items-center gap-1 px-1.5 py-0.5 bg-emerald-50 dark:bg-emerald-950/40 rounded-full flex-shrink-0 border border-emerald-100 dark:border-emerald-900/50">
                  <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse" />
                  <span className="text-[10px] font-bold text-emerald-600 dark:text-emerald-400">시스템 정상</span>
                </span>
              </div>
              <p className="text-[11px] text-slate-400 dark:text-gray-500 mt-0.5">
                안녕하세요,{" "}
                <span className="font-semibold text-slate-600 dark:text-gray-300">{user?.name ?? user?.username}</span>
                님. 오늘도 안전한 하루 되세요.
              </p>
            </div>
          </div>
          {/* 우측: 실시간 시각 */}
          <div className="hidden sm:flex flex-col items-end flex-shrink-0 gap-0.5">
            <div className="flex items-baseline gap-0.5">
              <p className="text-2xl font-bold text-slate-800 dark:text-gray-100 tabular-nums leading-none tracking-tight">
                {format(now, "HH:mm")}
              </p>
              <p className="text-sm font-semibold text-slate-400 dark:text-gray-500 tabular-nums leading-none">
                :{format(now, "ss")}
              </p>
            </div>
            <p className="text-[10px] text-slate-400 dark:text-gray-500 tracking-wide">
              현재 시각
            </p>
          </div>
        </div>

        {/* 하단: 공지 티커 (배너 안에 통합) */}
        <NoticeTicker inline />
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
              ].map((item) => (
                <div key={item.label} className="flex items-center gap-3 rounded-xl p-4 bg-white dark:bg-gray-900 border border-slate-100 dark:border-gray-800">
                  <div className="w-10 h-10 rounded-full flex items-center justify-center flex-shrink-0" style={{ background: item.bg }}>
                    <item.icon className="w-5 h-5" style={{ color: item.color }} />
                  </div>
                  <div className="min-w-0">
                    <p className="text-[10px] font-semibold uppercase tracking-wider text-slate-400 dark:text-gray-500 truncate">{item.label}</p>
                    <p className="text-xl sm:text-2xl font-bold leading-tight text-foreground">{item.value}</p>
                  </div>
                </div>
              ))}
            </div>

            {/* Quick-in */}
            {QUICK_IN.length > 0 && (
              <div>
                <p className="text-[10px] font-bold uppercase tracking-widest text-slate-400 dark:text-gray-500 mb-2.5">QUICK-IN</p>
                <div className="bg-white dark:bg-gray-900 border border-slate-100 dark:border-gray-800 rounded-xl p-3 sm:p-4">
                  <div className={`grid gap-2 sm:gap-3 ${QUICK_IN.length <= 3 ? "grid-cols-3" : "grid-cols-3 sm:grid-cols-6"}`}>
                    {QUICK_IN.map((item) => (
                      <Link key={item.href} href={item.href}>
                        <div className="group flex flex-col items-center gap-1.5 cursor-pointer">
                          <div className="w-12 h-12 sm:w-13 sm:h-13 rounded-2xl flex items-center justify-center transition-all group-hover:scale-105" style={{ background: item.bg }}>
                            <item.icon className="w-6 h-6" style={{ color: item.color }} />
                          </div>
                          <p className="text-[11px] font-semibold text-slate-600 dark:text-gray-400 group-hover:text-slate-900 dark:group-hover:text-gray-100 transition-colors text-center leading-tight">{item.label}</p>
                        </div>
                      </Link>
                    ))}
                  </div>
                </div>
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
                  <Users className="w-3.5 h-3.5" />팀별 안전성평가제
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
                          <div className="flex-1 h-1.5 bg-slate-100 dark:bg-gray-700 rounded-full overflow-hidden">
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
              <div className="rounded-lg overflow-hidden border" id="notice-image-wrap">
                <img
                  src={currentNotice.imageUrl}
                  alt="공지 이미지"
                  className="w-full h-auto object-cover max-h-64"
                  onError={(e) => {
                    const wrap = (e.currentTarget as HTMLImageElement).closest("#notice-image-wrap") as HTMLElement | null;
                    if (wrap) wrap.style.display = "none";
                  }}
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
