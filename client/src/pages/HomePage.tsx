import { useQuery } from "@tanstack/react-query";
import { Link } from "wouter";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import {
  ShieldCheck, Bell, GraduationCap, AlertTriangle,
  ClipboardCheck, FlaskConical, ShoppingCart,
  DoorOpen, Bone, BookOpen, MonitorPlay,
  ChevronRight, TrendingUp, Users, FileWarning,
  ShieldAlert, Target
} from "lucide-react";
import { motion } from "framer-motion";
import { format } from "date-fns";
import { ko } from "date-fns/locale";
import { useAuth } from "@/hooks/use-auth";

interface Team { id: number; name: string; totalScore: number; year: number; }
interface Notice { id: number; title: string; category: string; createdAt: string; }
interface AccidentStat { total: number; byYear?: Record<string, number>; }

const CURRENT_YEAR = new Date().getFullYear();

const FEATURES = [
  { label: "안전점수", href: "/safety-scores", icon: ShieldCheck, color: "#3b82f6", bg: "#eff6ff", desc: "팀별 안전점수 현황" },
  { label: "공지/알림", href: "/notices", icon: Bell, color: "#f59e0b", bg: "#fffbeb", desc: "안전 공지 및 알림" },
  { label: "안전수칙", href: "/rules", icon: BookOpen, color: "#64748b", bg: "#f8fafc", desc: "안전수칙 자료실" },
  { label: "전자게시판", href: "/digital-board", icon: MonitorPlay, color: "#7c3aed", bg: "#f5f3ff", desc: "디지털 안전 게시판" },
  { label: "사고보고", href: "/accidents", icon: AlertTriangle, color: "#ef4444", bg: "#fef2f2", desc: "사고 경위서 관리" },
  { label: "안전점검", href: "/inspections", icon: ClipboardCheck, color: "#10b981", bg: "#ecfdf5", desc: "현장 안전점검 일지" },
  { label: "위험성평가", href: "/risk-assessment", icon: Target, color: "#f97316", bg: "#fff7ed", desc: "KRAS 위험성평가" },
  { label: "교육관리", href: "/education-logs", icon: GraduationCap, color: "#8b5cf6", bg: "#f5f3ff", desc: "안전교육 이력 관리" },
  { label: "MSDS검색", href: "/msds", icon: FlaskConical, color: "#06b6d4", bg: "#ecfeff", desc: "화학물질 안전보건자료" },
  { label: "근골격계", href: "/musculoskeletal", icon: Bone, color: "#ec4899", bg: "#fdf2f8", desc: "근골격계 유해요인조사" },
  { label: "안전용품", href: "/equipment", icon: ShoppingCart, color: "#6366f1", bg: "#eef2ff", desc: "안전용품 신청 관리" },
  { label: "출입신청", href: "/access", icon: DoorOpen, color: "#14b8a6", bg: "#f0fdfa", desc: "외부인 출입 신청" },
];

const CATEGORY_LABELS: Record<string, string> = {
  notice: "공지", rule: "수칙", education: "교육", equipment: "용품", access: "출입",
};

export default function HomePage() {
  const { user } = useAuth();
  const now = new Date();

  const { data: teams } = useQuery<Team[]>({ queryKey: ["/api/teams", CURRENT_YEAR], queryFn: () => fetch(`/api/teams?year=${CURRENT_YEAR}`).then(r => r.json()) });
  const { data: notices } = useQuery<Notice[]>({ queryKey: ["/api/notices"] });
  const { data: accidentStats } = useQuery<AccidentStat>({ queryKey: ["/api/accidents/stats"] });
  const { data: riskAssessments } = useQuery<any[]>({ queryKey: ["/api/risk-assessments"] });

  const avgScore = teams && teams.length > 0
    ? Math.round(teams.reduce((sum, t) => sum + (t.totalScore ?? 0), 0) / teams.length)
    : null;

  const thisYearAccidents = accidentStats?.byYear?.[String(CURRENT_YEAR)] ?? accidentStats?.total ?? 0;

  const pendingRisks = riskAssessments?.filter(r => r.approvalStatus === "승인대기").length ?? 0;

  const recentNotices = (notices ?? []).slice(0, 5);

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-50 to-blue-50/30">
      {/* Hero Banner */}
      <div className="relative overflow-hidden bg-gradient-to-r from-blue-700 via-blue-600 to-blue-500 px-6 py-10 md:px-12 md:py-14 shadow-xl">
        <div className="absolute inset-0 opacity-10 pointer-events-none"
          style={{ backgroundImage: "repeating-linear-gradient(45deg, #fff 0, #fff 1px, transparent 0, transparent 50%)", backgroundSize: "20px 20px" }}
        />
        <div className="relative max-w-6xl mx-auto">
          <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4">
            <div>
              <div className="flex items-center gap-3 mb-2">
                <div className="w-10 h-10 rounded-xl bg-white/20 flex items-center justify-center shadow">
                  <ShieldAlert className="w-6 h-6 text-white" />
                </div>
                <span className="text-blue-100 text-sm font-medium tracking-widest uppercase">KT MOS남부</span>
              </div>
              <h1 className="text-2xl md:text-4xl font-bold text-white leading-tight mb-1">
                종합안전포털시스템
              </h1>
              <p className="text-blue-100 text-sm md:text-base">
                안전한 현장을 위한 통합 안전 관리 플랫폼
              </p>
            </div>
            <div className="flex flex-col items-start md:items-end gap-1">
              <p className="text-white text-2xl font-bold">{format(now, "yyyy년 M월 d일", { locale: ko })}</p>
              <p className="text-blue-100 text-sm">{format(now, "EEEE", { locale: ko })} · {user?.name ?? user?.username}님 환영합니다</p>
            </div>
          </div>
        </div>
      </div>

      <div className="max-w-6xl mx-auto px-4 md:px-8 py-8 space-y-8">

        {/* Key Metrics */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          {[
            {
              label: "평균 안전점수",
              value: avgScore != null ? `${avgScore}점` : "-",
              sub: `${CURRENT_YEAR}년 전체팀`,
              icon: ShieldCheck,
              color: "#3b82f6",
              bg: "#eff6ff",
            },
            {
              label: "금년 사고건수",
              value: `${thisYearAccidents}건`,
              sub: `${CURRENT_YEAR}년 누계`,
              icon: AlertTriangle,
              color: thisYearAccidents > 0 ? "#ef4444" : "#10b981",
              bg: thisYearAccidents > 0 ? "#fef2f2" : "#ecfdf5",
            },
            {
              label: "공지/알림",
              value: `${notices?.length ?? 0}건`,
              sub: "전체 등록 건수",
              icon: Bell,
              color: "#f59e0b",
              bg: "#fffbeb",
            },
            {
              label: "승인대기 위험성",
              value: `${pendingRisks}건`,
              sub: "위험성평가 검토 필요",
              icon: FileWarning,
              color: pendingRisks > 0 ? "#f97316" : "#64748b",
              bg: pendingRisks > 0 ? "#fff7ed" : "#f8fafc",
            },
          ].map((item, i) => (
            <motion.div key={item.label} initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: i * 0.07 }}>
              <Card className="border-0 shadow-sm hover:shadow-md transition-shadow">
                <CardContent className="p-4 flex items-center gap-3">
                  <div className="w-11 h-11 rounded-xl flex items-center justify-center flex-shrink-0" style={{ background: item.bg }}>
                    <item.icon className="w-5 h-5" style={{ color: item.color }} />
                  </div>
                  <div className="min-w-0">
                    <p className="text-xs text-muted-foreground truncate">{item.label}</p>
                    <p className="text-xl font-bold leading-tight" style={{ color: item.color }}>{item.value}</p>
                    <p className="text-xs text-muted-foreground truncate">{item.sub}</p>
                  </div>
                </CardContent>
              </Card>
            </motion.div>
          ))}
        </div>

        {/* Feature Grid + Recent Notices */}
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">

          {/* Feature Navigation */}
          <div className="lg:col-span-2">
            <h2 className="text-base font-bold text-foreground mb-3 flex items-center gap-2">
              <TrendingUp className="w-4 h-4 text-primary" />
              메뉴 바로가기
            </h2>
            <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
              {FEATURES.map((feat, i) => (
                <motion.div key={feat.href} initial={{ opacity: 0, scale: 0.95 }} animate={{ opacity: 1, scale: 1 }} transition={{ delay: 0.1 + i * 0.04 }}>
                  <Link href={feat.href}>
                    <div className="group cursor-pointer rounded-xl border border-border/60 bg-white hover:border-transparent hover:shadow-md transition-all duration-200 p-4 flex flex-col items-start gap-2">
                      <div className="w-10 h-10 rounded-xl flex items-center justify-center flex-shrink-0" style={{ background: feat.bg }}>
                        <feat.icon className="w-5 h-5" style={{ color: feat.color }} />
                      </div>
                      <div>
                        <p className="text-sm font-semibold text-foreground group-hover:text-primary transition-colors">{feat.label}</p>
                        <p className="text-xs text-muted-foreground leading-snug mt-0.5">{feat.desc}</p>
                      </div>
                    </div>
                  </Link>
                </motion.div>
              ))}
            </div>
          </div>

          {/* Recent Notices */}
          <div>
            <h2 className="text-base font-bold text-foreground mb-3 flex items-center gap-2">
              <Bell className="w-4 h-4 text-primary" />
              최근 공지/알림
            </h2>
            <Card className="border-0 shadow-sm h-fit">
              <CardContent className="p-0 divide-y divide-border/50">
                {recentNotices.length === 0 ? (
                  <p className="text-sm text-muted-foreground p-4">등록된 공지가 없습니다.</p>
                ) : (
                  recentNotices.map((notice) => (
                    <Link key={notice.id} href="/notices">
                      <div className="group flex items-start gap-3 px-4 py-3 hover:bg-accent/40 transition-colors cursor-pointer">
                        <Badge variant="outline" className="text-xs mt-0.5 flex-shrink-0">
                          {CATEGORY_LABELS[notice.category] ?? notice.category}
                        </Badge>
                        <div className="min-w-0 flex-1">
                          <p className="text-sm font-medium truncate group-hover:text-primary transition-colors">{notice.title}</p>
                          <p className="text-xs text-muted-foreground mt-0.5">
                            {format(new Date(notice.createdAt), "yyyy.MM.dd")}
                          </p>
                        </div>
                        <ChevronRight className="w-4 h-4 text-muted-foreground/50 flex-shrink-0 mt-0.5" />
                      </div>
                    </Link>
                  ))
                )}
                <Link href="/notices">
                  <div className="flex items-center justify-center gap-1 py-3 text-xs text-primary font-medium hover:bg-accent/40 transition-colors cursor-pointer rounded-b-xl">
                    전체 공지 보기 <ChevronRight className="w-3.5 h-3.5" />
                  </div>
                </Link>
              </CardContent>
            </Card>

            {/* Team Safety Score Mini */}
            {teams && teams.length > 0 && (
              <div className="mt-4">
                <h2 className="text-base font-bold text-foreground mb-3 flex items-center gap-2">
                  <Users className="w-4 h-4 text-primary" />
                  팀별 안전점수
                </h2>
                <Card className="border-0 shadow-sm">
                  <CardContent className="p-3 space-y-2">
                    {[...teams].sort((a, b) => b.totalScore - a.totalScore).slice(0, 5).map((team) => {
                      const score = Math.min(100, Math.max(0, team.totalScore ?? 0));
                      const color = score >= 90 ? "#10b981" : score >= 70 ? "#f59e0b" : "#ef4444";
                      return (
                        <div key={team.id} className="flex items-center gap-2">
                          <p className="text-xs text-muted-foreground w-20 truncate flex-shrink-0">
                            {team.name.replace(/운용팀$/, '').replace(/팀$/, '')}
                          </p>
                          <div className="flex-1 h-2 bg-slate-100 rounded-full overflow-hidden">
                            <div className="h-full rounded-full transition-all" style={{ width: `${score}%`, background: color }} />
                          </div>
                          <p className="text-xs font-bold w-10 text-right flex-shrink-0" style={{ color }}>{score}점</p>
                        </div>
                      );
                    })}
                    <Link href="/safety-scores">
                      <div className="flex items-center justify-center gap-1 pt-1 text-xs text-primary font-medium hover:underline cursor-pointer">
                        전체 보기 <ChevronRight className="w-3.5 h-3.5" />
                      </div>
                    </Link>
                  </CardContent>
                </Card>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
