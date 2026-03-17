import { useQuery } from "@tanstack/react-query";
import { Link } from "wouter";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import {
  ShieldCheck, Bell, GraduationCap, AlertTriangle,
  ClipboardCheck, FlaskConical, ShoppingCart,
  DoorOpen, Bone, BookOpen, MonitorPlay,
  ChevronRight, Users, FileWarning, Target,
  ShieldAlert, TrendingUp, FileText, Microscope,
} from "lucide-react";
import { motion } from "framer-motion";
import { format } from "date-fns";
import { ko } from "date-fns/locale";
import { useAuth } from "@/hooks/use-auth";
import { useTeams } from "@/hooks/use-teams";
import { useState } from "react";
import { cn } from "@/lib/utils";

interface Team { id: number; name: string; totalScore: number; year: number; }
interface Notice { id: number; title: string; category: string; createdAt: string; }
interface Accident { id: number; accidentType: string; department: string; occurredAt: string; severity: string; }
interface AccidentStat { total: number; byYear?: Record<string, number>; }
interface RiskAssessment { id: number; title: string; department: string; approvalStatus: string; riskLevel: string; createdAt: string; }

const CURRENT_YEAR = new Date().getFullYear();

const QUICK_IN = [
  { label: "안전점수", href: "/safety-scores", icon: ShieldCheck, color: "#3b82f6", bg: "#dbeafe" },
  { label: "위험성평가", href: "/risk-assessment", icon: Target, color: "#f97316", bg: "#ffedd5" },
  { label: "안전점검", href: "/inspections", icon: ClipboardCheck, color: "#10b981", bg: "#d1fae5" },
  { label: "사고보고", href: "/accidents", icon: AlertTriangle, color: "#ef4444", bg: "#fee2e2" },
  { label: "교육관리", href: "/education-logs", icon: GraduationCap, color: "#8b5cf6", bg: "#ede9fe" },
  { label: "MSDS검색", href: "/msds", icon: FlaskConical, color: "#06b6d4", bg: "#cffafe" },
];

const SHORTCUTS = [
  { label: "공지/알림", desc: "안전 공지 확인", href: "/notices", icon: Bell, color: "#f59e0b", bg: "#fef3c7" },
  { label: "안전수칙", desc: "수칙 자료실", href: "/rules", icon: BookOpen, color: "#64748b", bg: "#f1f5f9" },
  { label: "안전용품", desc: "용품 신청", href: "/equipment", icon: ShoppingCart, color: "#6366f1", bg: "#e0e7ff" },
  { label: "근골격계", desc: "유해요인조사", href: "/musculoskeletal", icon: Bone, color: "#ec4899", bg: "#fce7f3" },
  { label: "출입신청", desc: "외부인 출입", href: "/access", icon: DoorOpen, color: "#14b8a6", bg: "#ccfbf1" },
  { label: "전자게시판", desc: "디지털 게시판", href: "/digital-board", icon: MonitorPlay, color: "#7c3aed", bg: "#ede9fe" },
];

const CATEGORY_LABELS: Record<string, string> = {
  notice: "공지", rule: "수칙", education: "교육", equipment: "용품", access: "출입", edu: "교육",
};

const TABS = ["공지사항", "최근 사고", "승인대기"] as const;
type Tab = typeof TABS[number];

export default function HomePage() {
  const { user } = useAuth();
  const now = new Date();
  const [activeTab, setActiveTab] = useState<Tab>("공지사항");

  const { data: teams } = useTeams(CURRENT_YEAR);
  const { data: notices } = useQuery<Notice[]>({ queryKey: ["/api/notices"] });
  const { data: accidentStats } = useQuery<AccidentStat>({ queryKey: ["/api/accidents/stats"] });
  const { data: accidents } = useQuery<Accident[]>({ queryKey: ["/api/accidents"] });
  const { data: riskAssessments } = useQuery<RiskAssessment[]>({ queryKey: ["/api/risk-assessments"] });

  const teamList = Array.isArray(teams) ? teams : [];
  const avgScore = teamList.length > 0
    ? Math.round(teamList.reduce((sum, t) => sum + (t.totalScore ?? 0), 0) / teamList.length)
    : null;

  const thisYearAccidents = accidentStats?.byYear?.[String(CURRENT_YEAR)] ?? accidentStats?.total ?? 0;
  const pendingRisks = Array.isArray(riskAssessments)
    ? riskAssessments.filter(r => r.approvalStatus === "승인대기")
    : [];
  const recentNotices = Array.isArray(notices) ? notices.slice(0, 6) : [];
  const recentAccidents = Array.isArray(accidents) ? accidents.slice(0, 6) : [];
  const sortedTeams = [...teamList].sort((a, b) => b.totalScore - a.totalScore);

  return (
    <div className="min-h-screen bg-slate-50">

      {/* ── Hero Banner ── */}
      <div className="relative overflow-hidden bg-gradient-to-r from-blue-700 via-blue-600 to-blue-500 px-4 py-5 sm:px-8 sm:py-7 md:px-10 md:py-8">
        <div className="absolute inset-0 opacity-[0.07] pointer-events-none"
          style={{ backgroundImage: "repeating-linear-gradient(45deg,#fff 0,#fff 1px,transparent 0,transparent 50%)", backgroundSize: "18px 18px" }}
        />
        <div className="relative max-w-6xl mx-auto flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
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
      <div className="max-w-6xl mx-auto px-3 sm:px-4 md:px-8 py-4 sm:py-5 md:py-6">
        <div className="flex flex-col lg:flex-row gap-4 sm:gap-5">

          {/* ═══ LEFT PANEL ═══ */}
          <div className="flex-1 min-w-0 space-y-4">

            {/* Key Metrics */}
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 sm:gap-3">
              {[
                { label: "평균 안전점수", value: avgScore != null ? `${avgScore}점` : "-", icon: ShieldCheck, color: "#3b82f6", bg: "#dbeafe" },
                { label: "금년 사고건수", value: `${thisYearAccidents}건`, icon: AlertTriangle, color: thisYearAccidents > 0 ? "#ef4444" : "#10b981", bg: thisYearAccidents > 0 ? "#fee2e2" : "#d1fae5" },
                { label: "공지/알림", value: `${Array.isArray(notices) ? notices.length : 0}건`, icon: Bell, color: "#f59e0b", bg: "#fef3c7" },
                { label: "승인대기 위험성", value: `${pendingRisks.length}건`, icon: FileWarning, color: pendingRisks.length > 0 ? "#f97316" : "#64748b", bg: pendingRisks.length > 0 ? "#ffedd5" : "#f1f5f9" },
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
            <div>
              <div className="flex items-center gap-2 mb-2">
                <TrendingUp className="w-3.5 h-3.5 text-primary" />
                <h2 className="text-xs font-bold text-muted-foreground uppercase tracking-wider">Quick-in</h2>
              </div>
              <Card className="border-0 shadow-sm">
                <CardContent className="p-3 sm:p-4">
                  <div className="grid grid-cols-3 sm:grid-cols-6 gap-2 sm:gap-3">
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

            {/* Tabbed Content */}
            <div>
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

              <Card className="border-0 shadow-sm rounded-tl-none">
                <CardContent className="p-0">
                  {/* 공지사항 */}
                  {activeTab === "공지사항" && (
                    <div className="divide-y divide-border/50">
                      {recentNotices.length === 0
                        ? <p className="text-sm text-muted-foreground p-4 text-center">등록된 공지가 없습니다.</p>
                        : recentNotices.map(n => (
                          <Link key={n.id} href="/notices">
                            <div className="group flex items-center gap-3 px-4 py-2.5 hover:bg-accent/40 cursor-pointer transition-colors">
                              <Badge variant="outline" className="text-[10px] flex-shrink-0 px-1.5 py-0">
                                {CATEGORY_LABELS[n.category] ?? n.category}
                              </Badge>
                              <p className="flex-1 text-xs sm:text-sm font-medium truncate group-hover:text-primary transition-colors">{n.title}</p>
                              <p className="text-[10px] sm:text-xs text-muted-foreground flex-shrink-0">{format(new Date(n.createdAt), "yy.MM.dd")}</p>
                            </div>
                          </Link>
                        ))
                      }
                      <Link href="/notices">
                        <div className="flex items-center justify-center gap-1 py-2.5 text-xs text-primary font-medium hover:bg-accent/30 cursor-pointer transition-colors">
                          전체 보기 <ChevronRight className="w-3.5 h-3.5" />
                        </div>
                      </Link>
                    </div>
                  )}

                  {/* 최근 사고 */}
                  {activeTab === "최근 사고" && (
                    <div className="divide-y divide-border/50">
                      {recentAccidents.length === 0
                        ? <p className="text-sm text-muted-foreground p-4 text-center">등록된 사고가 없습니다.</p>
                        : recentAccidents.map(a => (
                          <Link key={a.id} href="/accidents">
                            <div className="group flex items-center gap-3 px-4 py-2.5 hover:bg-accent/40 cursor-pointer transition-colors">
                              <Badge
                                variant="outline"
                                className={cn("text-[10px] flex-shrink-0 px-1.5 py-0", a.severity === "중대" && "border-red-400 text-red-600")}
                              >
                                {a.accidentType}
                              </Badge>
                              <p className="flex-1 text-xs sm:text-sm font-medium truncate group-hover:text-primary transition-colors">{a.department}</p>
                              <p className="text-[10px] sm:text-xs text-muted-foreground flex-shrink-0">
                                {a.occurredAt ? format(new Date(a.occurredAt), "yy.MM.dd") : "-"}
                              </p>
                            </div>
                          </Link>
                        ))
                      }
                      <Link href="/accidents">
                        <div className="flex items-center justify-center gap-1 py-2.5 text-xs text-primary font-medium hover:bg-accent/30 cursor-pointer transition-colors">
                          전체 보기 <ChevronRight className="w-3.5 h-3.5" />
                        </div>
                      </Link>
                    </div>
                  )}

                  {/* 승인대기 */}
                  {activeTab === "승인대기" && (
                    <div className="divide-y divide-border/50">
                      {pendingRisks.length === 0
                        ? <p className="text-sm text-muted-foreground p-4 text-center">승인대기 항목이 없습니다.</p>
                        : pendingRisks.slice(0, 6).map(r => (
                          <Link key={r.id} href="/risk-assessment">
                            <div className="group flex items-center gap-3 px-4 py-2.5 hover:bg-accent/40 cursor-pointer transition-colors">
                              <Badge
                                variant="outline"
                                className={cn("text-[10px] flex-shrink-0 px-1.5 py-0",
                                  r.riskLevel === "A" && "border-red-400 text-red-600",
                                  r.riskLevel === "B" && "border-orange-400 text-orange-600",
                                )}
                              >
                                {r.riskLevel}등급
                              </Badge>
                              <p className="flex-1 text-xs sm:text-sm font-medium truncate group-hover:text-primary transition-colors">{r.department}</p>
                              <p className="text-[10px] sm:text-xs text-muted-foreground flex-shrink-0">
                                {r.createdAt ? format(new Date(r.createdAt), "yy.MM.dd") : "-"}
                              </p>
                            </div>
                          </Link>
                        ))
                      }
                      <Link href="/risk-assessment">
                        <div className="flex items-center justify-center gap-1 py-2.5 text-xs text-primary font-medium hover:bg-accent/30 cursor-pointer transition-colors">
                          전체 보기 <ChevronRight className="w-3.5 h-3.5" />
                        </div>
                      </Link>
                    </div>
                  )}
                </CardContent>
              </Card>
            </div>
          </div>

          {/* ═══ RIGHT PANEL ═══ */}
          <div className="w-full lg:w-64 xl:w-72 flex-shrink-0 space-y-4">

            {/* Team Safety Scores */}
            <div>
              <div className="flex items-center justify-between mb-2">
                <h2 className="text-xs font-bold text-muted-foreground uppercase tracking-wider flex items-center gap-1.5">
                  <Users className="w-3.5 h-3.5" />팀별 안전점수
                </h2>
                <Link href="/safety-scores">
                  <span className="text-[11px] text-primary font-medium flex items-center gap-0.5 hover:underline cursor-pointer">
                    전체 <ChevronRight className="w-3 h-3" />
                  </span>
                </Link>
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

            {/* Shortcuts Grid */}
            <div>
              <h2 className="text-xs font-bold text-muted-foreground uppercase tracking-wider flex items-center gap-1.5 mb-2">
                <FileText className="w-3.5 h-3.5" />메뉴 바로가기
              </h2>
              <div className="grid grid-cols-2 gap-2">
                {SHORTCUTS.map((item, i) => (
                  <motion.div key={item.href} initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.2 + i * 0.04 }}>
                    <Link href={item.href}>
                      <div className="group cursor-pointer rounded-xl border border-border/60 bg-white hover:border-transparent hover:shadow-md transition-all duration-200 p-3 flex flex-col items-start gap-1.5">
                        <div className="w-8 h-8 rounded-lg flex items-center justify-center" style={{ background: item.bg }}>
                          <item.icon className="w-4 h-4" style={{ color: item.color }} />
                        </div>
                        <div>
                          <p className="text-[11px] font-semibold text-foreground group-hover:text-primary transition-colors leading-tight">{item.label}</p>
                          <p className="text-[10px] text-muted-foreground leading-tight">{item.desc}</p>
                        </div>
                      </div>
                    </Link>
                  </motion.div>
                ))}
              </div>
            </div>

          </div>
        </div>
      </div>
    </div>
  );
}
