import { useTeams, useResetTeam, useResetAllTeams } from "@/hooks/use-teams";
import { useSafetyScoreItems } from "@/hooks/use-safety-score-items";
import { useHeadquarters } from "@/contexts/HeadquartersContext";
import { 
  BarChart, 
  Bar, 
  XAxis, 
  YAxis, 
  CartesianGrid, 
  Tooltip, 
  ResponsiveContainer,
  Cell
} from 'recharts';
import { 
  Table, 
  TableBody, 
  TableCell, 
  TableHead, 
  TableHeader, 
  TableRow 
} from "@/components/ui/table";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useState, useRef, useMemo, useCallback, useEffect } from "react";
import ExcelJS from "exceljs";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { Download, RefreshCw, AlertTriangle, Trophy, ShieldCheck, RotateCcw, Upload, Settings2, Medal, TrendingUp, Users, Copy, Check, DatabaseZap } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { TeamEditDialog } from "@/components/TeamEditDialog";
import { cn } from "@/lib/utils";
import { motion, AnimatePresence } from "framer-motion";
import { usePermissions } from "@/hooks/use-permissions";
import html2canvas from "html2canvas";
import { Link } from "wouter";
import { ListChecks } from "lucide-react";

function getTeamItemCount(team: any, key: string): number {
  const accidents = team.vehicleAccidents || {};
  switch (key) {
    case "workAccident": return team.workAccident || 0;
    case "fineSpeed": return team.fineSpeed || 0;
    case "fineSignal": return team.fineSignal || 0;
    case "fineLane": return team.fineLane || 0;
    case "inspectionMiss": return team.inspectionMiss || 0;
    case "suggestion": return team.suggestion || 0;
    case "activity": return team.activity || 0;
    case "accident_p50_59": return accidents.p50_59 || 0;
    case "accident_p60_69": return accidents.p60_69 || 0;
    case "accident_p70_79": return accidents.p70_79 || 0;
    case "accident_p80_89": return accidents.p80_89 || 0;
    case "accident_p90_99": return accidents.p90_99 || 0;
    case "accident_p100": return accidents.p100 || 0;
    default: return (team.customItemValues || {})[key] || 0;
  }
}

function getItemHeadColor(points: number): string {
  if (points <= -5) return "text-red-600";
  if (points < 0) return "text-orange-600";
  if (points > 0) return "text-green-600";
  return "text-foreground";
}

function getItemCellColor(points: number): string {
  if (points <= -5) return "text-red-600 font-bold";
  if (points < 0) return "text-orange-500";
  if (points > 0) return "text-green-600 font-medium";
  return "";
}

export default function Dashboard() {
  const { headquarters, departments } = useHeadquarters();
  const { data: scoreItems = [] } = useSafetyScoreItems();
  const activeItems = useMemo(
    () => [...scoreItems].filter(i => i.isActive).sort((a, b) => a.sortOrder - b.sortOrder || a.id - b.id),
    [scoreItems]
  );
  const [showDetailTable, setShowDetailTable] = useState(false);
  const [year, setYear] = useState(2026);
  const [baseVehicleCount, setBaseVehicleCount] = useState(15);
  const [isUploading, setIsUploading] = useState(false);
  const [isCopying, setIsCopying] = useState(false);
  const [copied, setCopied] = useState(false);
  const [isSyncing, setIsSyncing] = useState(false);
  const [nowStr, setNowStr] = useState(() => {
    const d = new Date();
    return d.toLocaleDateString("ko-KR", { year: "numeric", month: "2-digit", day: "2-digit" }).replace(/\. /g, ".").replace(/\.$/, "") +
      " " + d.toLocaleTimeString("ko-KR", { hour: "2-digit", minute: "2-digit", second: "2-digit", hour12: false });
  });

  useEffect(() => {
    const fmt = () => {
      const d = new Date();
      return d.toLocaleDateString("ko-KR", { year: "numeric", month: "2-digit", day: "2-digit" }).replace(/\. /g, ".").replace(/\.$/, "") +
        " " + d.toLocaleTimeString("ko-KR", { hour: "2-digit", minute: "2-digit", second: "2-digit", hour12: false });
    };
    const id = setInterval(() => setNowStr(fmt()), 1000);
    return () => clearInterval(id);
  }, []);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const chartRef = useRef<HTMLDivElement>(null);
  const sectionRef = useRef<HTMLDivElement>(null);
  const { canEditDashboard, canEditSafetyScores, canUploadDashboardData } = usePermissions();
  
  const { data: teams, isLoading, refetch, isRefetching } = useTeams(year);
  const resetTeam = useResetTeam();
  const resetAllTeams = useResetAllTeams();
  const { toast } = useToast();

  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setIsUploading(true);
    try {
      const arrayBuffer = await file.arrayBuffer();
      const workbook = new ExcelJS.Workbook();
      await workbook.xlsx.load(arrayBuffer);
      const worksheet = workbook.worksheets[0];
      const headers: string[] = [];
      worksheet.getRow(1).eachCell((cell, colNumber) => {
        headers[colNumber - 1] = String(cell.value ?? '');
      });
      const jsonData: Record<string, unknown>[] = [];
      worksheet.eachRow((row, rowNumber) => {
        if (rowNumber === 1) return;
        const rowData: Record<string, unknown> = {};
        row.eachCell((cell, colNumber) => {
          const header = headers[colNumber - 1];
          if (header) rowData[header] = cell.value;
        });
        jsonData.push(rowData);
      });

      const mappedData = jsonData.map(row => ({
        name: row['팀명'] || row['name'],
        vehicleCount: Number(row['차량대수'] || row['vehicleCount']) || 0,
        workAccident: Number(row['산업재해'] || row['workAccident']) || 0,
        fineSpeed: Number(row['과속'] || row['fineSpeed']) || 0,
        fineSignal: Number(row['신호위반'] || row['fineSignal']) || 0,
        fineLane: Number(row['법규위반'] || row['차선위반'] || row['fineLane']) || 0,
        inspectionMiss: Number(row['점검미실시'] || row['inspectionMiss']) || 0,
        suggestion: Number(row['제안'] || row['suggestion']) || 0,
        activity: Number(row['활동'] || row['activity']) || 0,
      }));

      await apiRequest('POST', '/api/teams/import', { data: mappedData, year });
      queryClient.invalidateQueries({ queryKey: ['/api/teams'] });
      toast({ title: "업로드 완료", description: `${mappedData.length}개 팀 데이터가 업로드되었습니다.` });
    } catch (err) {
      console.error(err);
      toast({ variant: "destructive", title: "업로드 실패", description: "엑셀 파일 형식을 확인해주세요." });
    } finally {
      setIsUploading(false);
      if (fileInputRef.current) fileInputRef.current.value = '';
    }
  };

  const handleResetAll = () => {
    if (confirm(`${year}년도 모든 팀의 점수를 초기화하시겠습니까?`)) {
      resetAllTeams.mutate(year, {
        onSuccess: (data) => {
          toast({ title: "초기화 완료", description: `${data.count}개 팀의 점수가 초기화되었습니다.` });
        }
      });
    }
  };

  const handleResetTeam = (id: number, name: string) => {
    if (confirm(`${name}의 점수를 초기화하시겠습니까?`)) {
      resetTeam.mutate(id, {
        onSuccess: () => {
          toast({ title: "초기화 완료", description: `${name}의 점수가 초기화되었습니다.` });
        }
      });
    }
  };

  const handleSyncFromRecords = async () => {
    if (!confirm(`과태료·사고 현황 데이터를 기준으로 ${year}년 모든 팀 점수를 재동기화하시겠습니까?\n(수기 입력 값은 실제 등록된 레코드 건수로 덮어씁니다)`)) return;
    setIsSyncing(true);
    try {
      const res = await apiRequest("POST", "/api/teams/sync-from-records", { year });
      const data = await res.json();
      toast({ title: "재동기화 완료", description: `${data.synced}개 팀의 점수가 과태료·사고 데이터와 동기화되었습니다.` });
      queryClient.invalidateQueries({ queryKey: ["/api/teams"] });
    } catch (e: any) {
      toast({ title: "오류", description: e.message, variant: "destructive" });
    } finally {
      setIsSyncing(false);
    }
  };

  // Fixed team order
  const teamOrder = departments;
  const orderedTeams = teams ? teamOrder.map(name => teams.find(t => t.name === name)).filter(Boolean) as typeof teams : [];
  
  // Chart data with shortened team names
  const chartData = orderedTeams.map(team => ({
    ...team,
    shortName: team.name.replace('운용팀', 'T')
  }));
  
  // Sort teams by score descending for table
  const sortedTeams = teams ? [...teams].sort((a, b) => b.totalScore - a.totalScore) : [];

  const getScoreColor = (score: number) => {
    if (score >= 90) return "#10b981";
    if (score >= 80) return "#f59e0b";
    return "#ef4444";
  };

  const getScoreBadge = (score: number) => {
    if (score >= 90) return "bg-green-100 text-green-700 border-green-200 dark:bg-green-900/30 dark:text-green-400";
    if (score >= 80) return "bg-yellow-100 text-yellow-700 border-yellow-200 dark:bg-yellow-900/30 dark:text-yellow-400";
    return "bg-red-100 text-red-700 border-red-200 dark:bg-red-900/30 dark:text-red-400";
  };

  const calculateVehicleAccidentCount = (json: unknown) => {
    const data = json as Record<string, number>;
    if (!data) return 0;
    return Object.values(data).reduce((a, b) => a + b, 0);
  };

  const handleCopyAll = useCallback(async () => {
    if (!teams || !sectionRef.current) return;
    setIsCopying(true);

    const wasHidden = !showDetailTable;
    if (wasHidden) setShowDetailTable(true);

    try {
      await document.fonts.ready;
      await new Promise(r => setTimeout(r, wasHidden ? 400 : 100));

      const root = sectionRef.current;

      // Step 1: Reset scroll positions only — do NOT change widths
      // (changing width breaks the full-width layout of chart and table)
      type SavedScroll = { el: HTMLElement; scrollLeft: number };
      const savedScrolls: SavedScroll[] = [];
      root.querySelectorAll<HTMLElement>("*").forEach(node => {
        if (node.scrollLeft > 0) {
          savedScrolls.push({ el: node, scrollLeft: node.scrollLeft });
          node.scrollLeft = 0;
        }
      });

      // Step 2: Measure the natural render width of the section (full container width)
      await new Promise(r => requestAnimationFrame(r));
      await new Promise(r => requestAnimationFrame(r));

      const fullW = root.offsetWidth;
      const fullH = root.scrollHeight;

      const canvas = await html2canvas(root, {
        backgroundColor: "#ffffff",
        scale: 2,
        useCORS: true,
        allowTaint: true,
        logging: false,
        width: fullW,
        height: fullH,
        // 1440px로 고정해야 sm:/md: Tailwind 반응형 클래스가 올바르게 적용됨
        windowWidth: 1440,
        windowHeight: fullH,
        ignoreElements: (el) => el.hasAttribute("data-copy-ignore"),
        onclone: (_doc, el) => {
          // data-copy-ignore 요소는 layout에서도 제거
          el.querySelectorAll<HTMLElement>("[data-copy-ignore]").forEach(node => {
            node.style.display = "none";
          });

          // backdropFilter 제거 (렌더링 오류 방지)
          el.querySelectorAll<HTMLElement>("*").forEach(node => {
            node.style.backdropFilter = "none";
            node.style.webkitBackdropFilter = "none";
          });

          // overflow 해제 (차트/테이블 잘림 방지)
          el.querySelectorAll<HTMLElement>(".overflow-x-auto, .overflow-x-scroll").forEach(node => {
            node.style.overflowX = "visible";
            node.scrollLeft = 0;
          });

          // 컨테이너 너비 고정 (캡처 기준 너비로)
          el.style.width = fullW + "px";

          // Tailwind grid 반응형 클래스가 클론 환경에서 적용 안 될 수 있으므로 인라인 스타일로 강제
          el.querySelectorAll<HTMLElement>(".grid").forEach(node => {
            const cls = node.className || "";
            if (cls.includes("sm:grid-cols-4") || cls.includes("grid-cols-4")) {
              node.style.gridTemplateColumns = "repeat(4, minmax(0, 1fr))";
              node.style.display = "grid";
            } else if (cls.includes("sm:grid-cols-3") || cls.includes("grid-cols-3")) {
              node.style.gridTemplateColumns = "repeat(3, minmax(0, 1fr))";
              node.style.display = "grid";
            } else if (cls.includes("sm:grid-cols-2") || cls.includes("grid-cols-2")) {
              node.style.gridTemplateColumns = "repeat(2, minmax(0, 1fr))";
              node.style.display = "grid";
            }
          });

          // flex 레이아웃 강제 (숨겨진 sm:flex 등)
          el.querySelectorAll<HTMLElement>(".flex").forEach(node => {
            if (!node.style.display) node.style.display = "flex";
          });

          // SVG linearGradient url() 참조가 클론 시 깨지는 문제 → 직접 색상으로 대체
          el.querySelectorAll<Element>("[fill]").forEach(node => {
            const fill = node.getAttribute("fill") || "";
            if (fill.includes("gradGreen")) node.setAttribute("fill", "#059669");
            else if (fill.includes("gradYellow")) node.setAttribute("fill", "#d97706");
            else if (fill.includes("gradRed")) node.setAttribute("fill", "#dc2626");
          });
        },
      });

      // Step 3: Restore scroll positions
      savedScrolls.forEach(({ el, scrollLeft }) => { el.scrollLeft = scrollLeft; });

      const blob = await new Promise<Blob>((resolve, reject) => {
        canvas.toBlob((b) => b ? resolve(b) : reject(new Error("blob null")), "image/png");
      });

      await navigator.clipboard.write([
        new ClipboardItem({ "image/png": blob })
      ]);

      setCopied(true);
      toast({ title: "복사 완료", description: "이미지로 복사되었습니다. 엑셀에 붙여넣기(Ctrl+V) 하세요." });
      setTimeout(() => setCopied(false), 2500);
    } catch (err) {
      console.error("Copy failed:", err);
      toast({ title: "복사 실패", description: "클립보드 접근이 허용되지 않았습니다.", variant: "destructive" });
    } finally {
      if (wasHidden) setShowDetailTable(false);
      setIsCopying(false);
    }
  }, [teams, showDetailTable]);

  return (
    <div ref={sectionRef} className="space-y-4 md:space-y-6">
      <div className="flex items-center justify-between glass-card p-3 sm:p-4 rounded-xl">
        <h2 className="text-lg sm:text-xl md:text-2xl font-display font-bold text-foreground flex items-center gap-2">
          <Trophy className="w-5 h-5 md:w-6 md:h-6 text-yellow-500" />
          안전성평가제 현황
        </h2>
        <div className="flex items-center gap-2">
          <span className="text-xs sm:text-sm font-mono text-muted-foreground tabular-nums select-none">
            {nowStr}
          </span>
          <Button variant="outline" size="icon" className="h-8 w-8" onClick={() => refetch()} disabled={isRefetching} data-copy-ignore>
            <RefreshCw className={cn("w-4 h-4", isRefetching && "animate-spin")} />
          </Button>
        </div>
      </div>

      {isLoading ? (
        <div className="h-96 flex items-center justify-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-primary"></div>
        </div>
      ) : (
        <AnimatePresence mode="wait">
            <motion.div
              key="safety"
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -10 }}
              className="space-y-4"
            >
              {/* Controls */}
              <Card className="p-3 sm:p-4" data-copy-ignore>
                <div className="flex flex-wrap items-center gap-1.5 sm:gap-2">
                  <Select value={String(year)} onValueChange={(v) => setYear(Number(v))}>
                    <SelectTrigger className="h-8 w-20 sm:w-24 text-xs sm:text-sm">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="2024">2024</SelectItem>
                      <SelectItem value="2025">2025</SelectItem>
                      <SelectItem value="2026">2026</SelectItem>
                    </SelectContent>
                  </Select>
                  <div className="flex items-center gap-1 bg-background px-2 py-1 rounded-lg border text-xs">
                    <span className="text-muted-foreground">기준</span>
                    <Input 
                      type="number" 
                      value={baseVehicleCount} 
                      onChange={(e) => setBaseVehicleCount(Number(e.target.value))}
                      className="h-6 w-10 border-0 shadow-none focus-visible:ring-0 text-right text-xs p-0"
                    />
                    <span className="text-muted-foreground">대</span>
                  </div>
                  {canEditSafetyScores && (
                    <Link href="/safety-score-items">
                      <Button 
                        variant="outline" 
                        size="sm" 
                        className="h-7 text-xs px-2"
                        data-testid="link-safety-score-items"
                      >
                        <ListChecks className="w-3 h-3 sm:mr-1" />
                        평가항목 관리
                      </Button>
                    </Link>
                  )}
                  {canEditSafetyScores && (
                    <Button 
                      variant="outline" 
                      size="sm" 
                      onClick={handleResetAll} 
                      disabled={resetAllTeams.isPending}
                      className="text-red-600 border-red-200 hover:bg-red-50 hover:text-red-700 h-7 text-xs px-2"
                      data-testid="button-reset-all"
                    >
                      <RotateCcw className={cn("w-3 h-3 sm:mr-1", resetAllTeams.isPending && "animate-spin")} />
                      초기화
                    </Button>
                  )}
                  {canEditDashboard && canUploadDashboardData && (
                    <>
                      <input
                        type="file"
                        ref={fileInputRef}
                        onChange={handleFileUpload}
                        accept=".xlsx,.xls"
                        className="hidden"
                        data-testid="input-team-upload"
                      />
                      <Button 
                        variant="outline" 
                        size="sm"
                        className="h-7 text-xs px-2"
                        onClick={() => fileInputRef.current?.click()}
                        disabled={isUploading}
                      >
                        <Upload className={cn("w-3 h-3 sm:mr-1", isUploading && "animate-spin")} />
                        업로드
                      </Button>
                    </>
                  )}
                  <Button 
                    variant="secondary" 
                    size="sm" 
                    className="bg-emerald-600 hover:bg-emerald-700 text-white border-0 h-7 text-xs px-2"
                    onClick={() => window.location.href = `/api/teams/export?year=${year}`}
                  >
                    <Download className="w-3 h-3 sm:mr-1" />
                    다운로드
                  </Button>
                </div>
              </Card>

              {/* ── KPI 요약 카드 ── */}
              {orderedTeams.length > 0 && (() => {
                const scores = orderedTeams.map(t => t.totalScore);
                const maxScore = Math.max(...scores);
                const minScore = Math.min(...scores);
                const topTeams = orderedTeams.filter(t => t.totalScore === maxScore);
                const botTeams = orderedTeams.filter(t => t.totalScore === minScore);
                const avg = Math.round(scores.reduce((a, b) => a + b, 0) / scores.length);
                const above90 = scores.filter(s => s >= 90).length;
                const above80 = scores.filter(s => s >= 80 && s < 90).length;
                const below80 = scores.filter(s => s < 80).length;
                return (
                  <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                    {/* 최우수 - 동점 모두 표시 */}
                    <Card className="border-0 shadow-sm bg-gradient-to-br from-emerald-50 to-emerald-100/60 dark:from-emerald-950/40 dark:to-emerald-900/20">
                      <CardContent className="p-3 sm:p-4">
                        <div className="flex items-center gap-1.5 mb-1.5">
                          <Trophy className="w-3.5 h-3.5 text-emerald-500" />
                          <p className="text-[11px] font-semibold text-emerald-600 dark:text-emerald-400">최우수</p>
                          {topTeams.length > 1 && (
                            <span className="text-[9px] bg-emerald-200 dark:bg-emerald-800/60 text-emerald-700 dark:text-emerald-300 px-1 py-0.5 rounded font-bold">동점 {topTeams.length}팀</span>
                          )}
                        </div>
                        <div className="space-y-0.5 mb-1">
                          {topTeams.map(t => (
                            <p key={t.id} className="text-sm font-black text-emerald-700 dark:text-emerald-300 leading-tight truncate">
                              {t.name.replace('운용팀','').replace('팀','')}
                            </p>
                          ))}
                        </div>
                        <p className="text-2xl font-black text-emerald-700 dark:text-emerald-300">{maxScore}<span className="text-xs font-normal ml-0.5">점</span></p>
                      </CardContent>
                    </Card>
                    {/* 최하위 - 동점 모두 표시 */}
                    <Card className="border-0 shadow-sm bg-gradient-to-br from-rose-50 to-rose-100/60 dark:from-rose-950/40 dark:to-rose-900/20">
                      <CardContent className="p-3 sm:p-4">
                        <div className="flex items-center gap-1.5 mb-1.5">
                          <AlertTriangle className="w-3.5 h-3.5 text-rose-500" />
                          <p className="text-[11px] font-semibold text-rose-600 dark:text-rose-400">최하위</p>
                          {botTeams.length > 1 && (
                            <span className="text-[9px] bg-rose-200 dark:bg-rose-800/60 text-rose-700 dark:text-rose-300 px-1 py-0.5 rounded font-bold">동점 {botTeams.length}팀</span>
                          )}
                        </div>
                        <div className="space-y-0.5 mb-1">
                          {botTeams.map(t => (
                            <p key={t.id} className="text-sm font-black text-rose-700 dark:text-rose-300 leading-tight truncate">
                              {t.name.replace('운용팀','').replace('팀','')}
                            </p>
                          ))}
                        </div>
                        <p className="text-2xl font-black text-rose-700 dark:text-rose-300">{minScore}<span className="text-xs font-normal ml-0.5">점</span></p>
                      </CardContent>
                    </Card>
                    {/* 평균 점수 */}
                    <Card className="border-0 shadow-sm bg-gradient-to-br from-blue-50 to-blue-100/60 dark:from-blue-950/40 dark:to-blue-900/20">
                      <CardContent className="p-3 sm:p-4">
                        <div className="flex items-center gap-1.5 mb-1">
                          <TrendingUp className="w-3.5 h-3.5 text-blue-500" />
                          <p className="text-[11px] font-semibold text-blue-600 dark:text-blue-400">평균 점수</p>
                        </div>
                        <p className="text-3xl font-black text-blue-700 dark:text-blue-300 mt-2">{avg}<span className="text-xs font-normal ml-0.5">점</span></p>
                      </CardContent>
                    </Card>
                    {/* 팀 현황 */}
                    <Card className="border-0 shadow-sm bg-gradient-to-br from-violet-50 to-violet-100/60 dark:from-violet-950/40 dark:to-violet-900/20">
                      <CardContent className="p-3 sm:p-4">
                        <div className="flex items-center gap-1.5 mb-2">
                          <Users className="w-3.5 h-3.5 text-violet-500" />
                          <p className="text-[11px] font-semibold text-violet-600 dark:text-violet-400">팀 현황</p>
                          <span className="ml-auto text-[10px] text-muted-foreground">{orderedTeams.length}개팀</span>
                        </div>
                        <div className="flex items-end gap-3">
                          <div className="text-center">
                            <p className="text-2xl font-black text-emerald-600">{above90}</p>
                            <p className="text-[10px] text-muted-foreground font-medium">90+</p>
                          </div>
                          <div className="text-center">
                            <p className="text-2xl font-black text-yellow-500">{above80}</p>
                            <p className="text-[10px] text-muted-foreground font-medium">80+</p>
                          </div>
                          <div className="text-center">
                            <p className="text-2xl font-black text-rose-500">{below80}</p>
                            <p className="text-[10px] text-muted-foreground font-medium">80↓</p>
                          </div>
                        </div>
                      </CardContent>
                    </Card>
                  </div>
                );
              })()}

              {/* Chart Section */}
              <Card className="shadow-lg border-border/50">
                <CardHeader className="p-3 sm:p-4 md:p-6 pb-2 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-2">
                  <div>
                    <CardTitle className="flex items-center gap-2 text-base sm:text-lg md:text-xl">
                      <Trophy className="w-5 h-5 md:w-6 md:h-6 text-yellow-500" />
                      팀별 안전성평가제
                    </CardTitle>
                    <CardDescription className="text-xs sm:text-sm">실시간 안전 점수 현황</CardDescription>
                  </div>
                  <div className="flex items-center gap-2">
                    <div className="flex items-center gap-2 sm:gap-3 text-[10px] sm:text-xs text-muted-foreground">
                      <div className="flex items-center gap-1">
                        <span className="w-2 h-2 rounded-full bg-green-500"></span>
                        <span>90이상</span>
                      </div>
                      <div className="flex items-center gap-1">
                        <span className="w-2 h-2 rounded-full bg-yellow-500"></span>
                        <span>80-89</span>
                      </div>
                      <div className="flex items-center gap-1">
                        <span className="w-2 h-2 rounded-full bg-red-500"></span>
                        <span>80미만</span>
                      </div>
                    </div>
                    <div className="flex items-center gap-2" data-copy-ignore>
                      <Button
                        variant="outline"
                        size="sm"
                        className={cn("gap-1.5 transition-all", copied ? "border-green-500 text-green-600 bg-green-50 dark:bg-green-900/20" : "border-primary/30 text-primary")}
                        onClick={handleCopyAll}
                        disabled={isCopying || !teams}
                        data-testid="button-copy-all"
                      >
                        {copied ? <Check className="w-3.5 h-3.5" /> : isCopying ? <RefreshCw className="w-3.5 h-3.5 animate-spin" /> : <Copy className="w-3.5 h-3.5" />}
                        {copied ? "복사됨" : "복사"}
                      </Button>
                      <Button
                        variant={showDetailTable ? "default" : "outline"}
                        size="sm"
                        className="gap-1.5 border-primary/30 text-primary"
                        onClick={() => setShowDetailTable(!showDetailTable)}
                        data-testid="button-toggle-detail"
                      >
                        <Settings2 className="w-3.5 h-3.5" />
                        현황관리
                      </Button>
                      {canEditSafetyScores && (
                        <Button
                          variant="outline"
                          size="sm"
                          className="gap-1.5 border-blue-300 text-blue-600 hover:bg-blue-50 dark:hover:bg-blue-900/20"
                          onClick={handleSyncFromRecords}
                          disabled={isSyncing}
                          title="과태료·사고 현황에서 팀 점수 자동 동기화"
                          data-testid="button-sync-from-records"
                        >
                          {isSyncing ? <RefreshCw className="w-3.5 h-3.5 animate-spin" /> : <DatabaseZap className="w-3.5 h-3.5" />}
                          데이터 연동
                        </Button>
                      )}
                    </div>
                  </div>
                </CardHeader>
              <CardContent className="p-2 sm:p-4 md:p-6 pt-2">
                <div ref={chartRef} className="w-full overflow-x-auto bg-white dark:bg-card">
                  <div style={{ minWidth: Math.max(480, (chartData.length * 56) + 60), height: 280 }}>
                  <ResponsiveContainer width="100%" height="100%">
                    <BarChart data={chartData} margin={{ top: 20, right: 5, left: -25, bottom: 0 }}>
                      <defs>
                        <linearGradient id="gradGreen" x1="0" y1="0" x2="0" y2="1">
                          <stop offset="0%" stopColor="#34d399" />
                          <stop offset="100%" stopColor="#059669" />
                        </linearGradient>
                        <linearGradient id="gradYellow" x1="0" y1="0" x2="0" y2="1">
                          <stop offset="0%" stopColor="#fbbf24" />
                          <stop offset="100%" stopColor="#d97706" />
                        </linearGradient>
                        <linearGradient id="gradRed" x1="0" y1="0" x2="0" y2="1">
                          <stop offset="0%" stopColor="#f87171" />
                          <stop offset="100%" stopColor="#dc2626" />
                        </linearGradient>
                      </defs>
                      <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#e2e8f0" opacity={0.4} />
                      <XAxis 
                        dataKey="shortName" 
                        axisLine={false} 
                        tickLine={false} 
                        tick={{ fill: '#475569', fontSize: 11, fontWeight: 700 }}
                        interval={0}
                        height={35}
                      />
                      <YAxis 
                        domain={[0, 100]} 
                        axisLine={false} 
                        tickLine={false}
                        tick={{ fill: '#64748b', fontSize: 10 }}
                        width={30}
                      />
                      <Tooltip 
                        cursor={{ fill: '#3b82f6', opacity: 0.05 }}
                        content={({ active, payload }) => {
                          if (active && payload && payload.length) {
                            const data = payload[0].payload;
                            return (
                              <div style={{ background: 'rgba(255,255,255,0.95)', backdropFilter: 'blur(8px)', border: '1px solid rgba(0,0,0,0.08)', borderRadius: 12, padding: '10px 14px', boxShadow: '0 8px 32px rgba(0,0,0,0.08)', fontSize: 12 }}>
                                <p style={{ fontWeight: 'bold', fontSize: 14, marginBottom: 4 }}>{data.name}</p>
                                <div>
                                  <span style={{ color: '#64748b' }}>점수: </span>
                                  <span style={{ fontWeight: 'bold', color: '#3b82f6' }}>{data.totalScore}점</span>
                                </div>
                              </div>
                            );
                          }
                          return null;
                        }}
                      />
                      <Bar 
                        dataKey="totalScore" 
                        radius={[6, 6, 0, 0]}
                        maxBarSize={36}
                        animationDuration={800}
                        label={{ position: 'top', fontSize: 11, fontWeight: 700, fill: '#475569' }}
                      >
                        {chartData.map((entry, index) => (
                          <Cell 
                            key={`cell-${index}`} 
                            fill={entry.totalScore >= 90 ? 'url(#gradGreen)' : entry.totalScore >= 80 ? 'url(#gradYellow)' : 'url(#gradRed)'} 
                          />
                        ))}
                      </Bar>
                    </BarChart>
                  </ResponsiveContainer>
                  </div>
                </div>
              </CardContent>
              </Card>

              {/* Table Section - Conditional */}
              {showDetailTable && (
                <Card className="shadow-xl border-border/50 overflow-hidden">
                  <div className="bg-muted/30 px-3 sm:px-6 py-2 sm:py-4 border-b flex items-center justify-between">
                    <h3 className="font-bold text-sm sm:text-base md:text-lg flex items-center gap-2">
                      <ShieldCheck className="w-4 h-4 sm:w-5 sm:h-5 text-primary" />
                      상세 데이터
                    </h3>
                    <span className="text-[10px] sm:text-xs text-muted-foreground font-medium">단위: 건수</span>
                  </div>
                  <div className="overflow-x-auto">
                    <Table className="min-w-[640px]">
                      <TableHeader>
                        <TableRow className="hover:bg-transparent border-b-2 border-border">
                          {/* 부서 */}
                          <TableHead className="font-bold text-foreground py-3 px-3 text-xs sm:text-sm sticky left-0 bg-muted/60 z-10 border-r border-border min-w-[72px]">
                            부서
                          </TableHead>
                          {/* 차량 */}
                          <TableHead className="text-center font-bold text-foreground text-xs py-3 px-1 bg-muted/60 min-w-[36px]">
                            차량
                          </TableHead>
                          {/* 동적 항목 */}
                          {activeItems.map(item => {
                            const isNeg = item.points < 0;
                            const isStrongNeg = item.points <= -5;
                            const isPos = item.points > 0;
                            const bgCls = isStrongNeg
                              ? "bg-red-50 dark:bg-red-950/30"
                              : isNeg
                              ? "bg-orange-50 dark:bg-orange-950/20"
                              : isPos
                              ? "bg-green-50 dark:bg-green-950/20"
                              : "bg-muted/60";
                            const textCls = isStrongNeg
                              ? "text-red-700 dark:text-red-400"
                              : isNeg
                              ? "text-orange-700 dark:text-orange-400"
                              : isPos
                              ? "text-green-700 dark:text-green-400"
                              : "text-foreground";
                            const ptsCls = isStrongNeg
                              ? "bg-red-100 text-red-700 dark:bg-red-900/40 dark:text-red-300"
                              : isNeg
                              ? "bg-orange-100 text-orange-700 dark:bg-orange-900/40 dark:text-orange-300"
                              : isPos
                              ? "bg-green-100 text-green-700 dark:bg-green-900/40 dark:text-green-300"
                              : "bg-muted text-muted-foreground";
                            return (
                              <TableHead
                                key={item.id}
                                className={cn("text-center py-3 px-1.5 min-w-[60px]", bgCls)}
                                title={`${item.label} (${item.points > 0 ? "+" : ""}${item.points}점/건)`}
                              >
                                <div className={cn("text-[11px] font-bold leading-tight whitespace-normal break-keep mb-1", textCls)}>
                                  {item.label}
                                </div>
                                <span className={cn("inline-block rounded-full px-1.5 py-0.5 text-[10px] font-semibold leading-none", ptsCls)}>
                                  {item.points > 0 ? "+" : ""}{item.points}점
                                </span>
                              </TableHead>
                            );
                          })}
                          {/* 점수 */}
                          <TableHead className="text-center font-black text-primary text-xs sm:text-sm py-3 px-2 bg-primary/5 min-w-[52px] border-l border-border">
                            점수
                          </TableHead>
                          <TableHead className="min-w-[56px] py-3 bg-muted/60" data-copy-ignore></TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {sortedTeams.map((team, idx) => (
                          <motion.tr 
                            key={team.id}
                            initial={{ opacity: 0, x: -10 }}
                            animate={{ opacity: 1, x: 0 }}
                            transition={{ delay: idx * 0.05 }}
                            className="group border-b last:border-0 hover:bg-muted/30 transition-colors"
                          >
                            <TableCell className="font-bold py-2.5 px-3 text-sm sticky left-0 bg-card group-hover:bg-muted/30 z-10 border-r border-border transition-colors">
                              <span className="text-purple-600 dark:text-purple-400 whitespace-nowrap">{team.name.replace('운용팀', 'T')}</span>
                            </TableCell>
                            <TableCell className="text-center font-medium text-sm py-2.5 px-1 text-muted-foreground">{team.vehicleCount}</TableCell>
                            {activeItems.map(item => {
                              const count = getTeamItemCount(team, item.key);
                              const hasValue = count !== 0;
                              const isNeg = item.points < 0;
                              const isStrongNeg = item.points <= -5;
                              const isPos = item.points > 0;
                              const cellCls = hasValue
                                ? isStrongNeg
                                  ? "text-red-600 dark:text-red-400 font-bold bg-red-50/60 dark:bg-red-950/20"
                                  : isNeg
                                  ? "text-orange-600 dark:text-orange-400 font-semibold bg-orange-50/40 dark:bg-orange-950/10"
                                  : isPos
                                  ? "text-green-600 dark:text-green-400 font-semibold bg-green-50/40 dark:bg-green-950/10"
                                  : ""
                                : "text-muted-foreground/50";
                              return (
                                <TableCell
                                  key={item.id}
                                  className={cn("text-center text-sm py-2.5 px-1 tabular-nums transition-colors", cellCls)}
                                >
                                  {count}
                                </TableCell>
                              );
                            })}
                            <TableCell className="text-center py-2.5 px-2 border-l border-border">
                              <span className={cn(
                                "inline-flex items-center justify-center min-w-[44px] h-7 rounded-lg font-black text-sm shadow-sm border-2",
                                getScoreBadge(team.totalScore)
                              )}>
                                {team.totalScore}
                              </span>
                            </TableCell>
                            <TableCell className="pr-2 py-2.5" data-copy-ignore>
                              <div className="flex items-center justify-end gap-0.5">
                              {canEditSafetyScores && (
                                <>
                                  <Button 
                                    variant="ghost" 
                                    size="icon"
                                    onClick={() => handleResetTeam(team.id, team.name)}
                                    disabled={resetTeam.isPending}
                                    className="hover:bg-red-50 hover:text-red-600 h-7 w-7"
                                    data-testid={`button-reset-team-${team.id}`}
                                  >
                                    <RotateCcw className="w-3.5 h-3.5" />
                                  </Button>
                                  <TeamEditDialog team={team} disabled={false} />
                                </>
                              )}
                              </div>
                            </TableCell>
                          </motion.tr>
                        ))}
                      </TableBody>
                    </Table>
                  </div>
                </Card>
              )}
            </motion.div>
        </AnimatePresence>
      )}

    </div>
  );
}
