import { useTeams, useResetTeam, useResetAllTeams } from "@/hooks/use-teams";
import { useVehicles } from "@/hooks/use-vehicles";
import { useNotices } from "@/hooks/use-notices";
import { useLockStatus } from "@/hooks/use-settings";
import { useQuery } from "@tanstack/react-query";
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
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription } from "@/components/ui/dialog";
import { Checkbox } from "@/components/ui/checkbox";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useState, useRef, useMemo, useEffect } from "react";
import * as XLSX from "xlsx";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { Download, RefreshCw, AlertTriangle, Trophy, AlertCircle, ShieldCheck, RotateCcw, Upload, Car, CheckCircle, Wrench, Shield, HardHat, ChevronDown, ChevronUp, X, Settings2 } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { TeamEditDialog } from "@/components/TeamEditDialog";
import { cn } from "@/lib/utils";
import { motion, AnimatePresence } from "framer-motion";
import VehicleManagement from "./VehicleManagement";
import EquipmentStatus from "./EquipmentStatus";

type DashboardTab = "safety" | "vehicle" | "equipment";

export default function Dashboard() {
  const [activeTab, setActiveTab] = useState<DashboardTab>("safety");
  const [showDetailTable, setShowDetailTable] = useState(false);
  const [showVehicleDetail, setShowVehicleDetail] = useState(false);
  const [showEquipmentDetail, setShowEquipmentDetail] = useState(false);
  const [year, setYear] = useState(2026);
  const [baseVehicleCount, setBaseVehicleCount] = useState(15);
  const [isUploading, setIsUploading] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
  
  // Notice popup states
  const [noticePopupOpen, setNoticePopupOpen] = useState(false);
  const [currentNotice, setCurrentNotice] = useState<any>(null);
  const [dontShowAgain, setDontShowAgain] = useState(false);
  
  const { data: teams, isLoading, refetch, isRefetching } = useTeams(year);
  const { data: vehicles } = useVehicles();
  const { data: equipmentRecords } = useNotices("equip_status");
  const { data: notices } = useNotices("notice");
  const { data: lockData } = useLockStatus();
  const isLocked = lockData?.isLocked;
  const resetTeam = useResetTeam();
  const resetAllTeams = useResetAllTeams();
  const { toast } = useToast();
  
  const { data: pinnedData } = useQuery<{ pinnedNoticeId: number | null }>({
    queryKey: ["/api/settings/pinned-notice"],
  });
  
  // Check for new notices and show popup
  useEffect(() => {
    if (!notices || notices.length === 0) return;
    
    // Get dismissed notice IDs from localStorage
    const dismissedNotices = JSON.parse(localStorage.getItem('dismissedNotices') || '[]');
    const pinnedNoticeId = pinnedData?.pinnedNoticeId;
    
    // First check for pinned notice
    if (pinnedNoticeId) {
      const pinnedNotice = notices.find(n => n.id === pinnedNoticeId);
      if (pinnedNotice && !dismissedNotices.includes(pinnedNotice.id)) {
        setCurrentNotice(pinnedNotice);
        setNoticePopupOpen(true);
        return;
      }
    }
    
    // Fall back to most recent notice that hasn't been dismissed
    const latestNotice = notices
      .filter(n => !dismissedNotices.includes(n.id))
      .sort((a, b) => b.id - a.id)[0];
    
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

  // Vehicle stats (all teams - for summary dashboard)
  const vehicleStatsAll = useMemo(() => {
    if (!vehicles) return { total: 0, operating: 0, maintenance: 0, idle: 0 };
    return {
      total: vehicles.length,
      operating: vehicles.filter(v => v.status === "운행중").length,
      maintenance: vehicles.filter(v => v.status === "정비중").length,
      idle: vehicles.filter(v => v.status === "대기").length,
    };
  }, [vehicles]);

  // Equipment stats
  const equipmentStats = useMemo(() => {
    if (!equipmentRecords) return { totalQuantity: 0, registeredQty: 0, goodQty: 0, badQty: 0 };
    
    let totalQuantity = 0;
    let goodQty = 0;
    let badQty = 0;
    
    equipmentRecords.forEach(record => {
      try {
        const parsed = JSON.parse(record.content);
        if (parsed.items) {
          parsed.items.forEach((item: { quantity?: number; status?: string }) => {
            const qty = item.quantity || 0;
            totalQuantity += qty;
            if (item.status === "양호") goodQty += qty;
            if (item.status === "불량") badQty += qty;
          });
        }
      } catch {}
    });
    
    return { totalQuantity, registeredQty: goodQty + badQty, goodQty, badQty };
  }, [equipmentRecords]);

  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setIsUploading(true);
    try {
      const arrayBuffer = await file.arrayBuffer();
      const workbook = XLSX.read(arrayBuffer);
      const worksheet = workbook.Sheets[workbook.SheetNames[0]];
      const jsonData = XLSX.utils.sheet_to_json(worksheet) as Record<string, unknown>[];

      const mappedData = jsonData.map(row => ({
        name: row['팀명'] || row['name'],
        vehicleCount: Number(row['차량대수'] || row['vehicleCount']) || 0,
        workAccident: Number(row['산업재해'] || row['workAccident']) || 0,
        fineSpeed: Number(row['과속'] || row['fineSpeed']) || 0,
        fineSignal: Number(row['신호위반'] || row['fineSignal']) || 0,
        fineLane: Number(row['차선위반'] || row['fineLane']) || 0,
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

  // Fixed team order
  const teamOrder = ["동대구운용팀", "서대구운용팀", "남대구운용팀", "포항운용팀", "안동운용팀", "구미운용팀", "문경운용팀"];
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

  return (
    <div className="space-y-4 md:space-y-6">
      {/* Tab Navigation */}
      <div className="flex flex-col gap-3 glass-card p-3 sm:p-4 rounded-xl">
        <div className="flex items-center justify-between">
          <h2 className="text-lg sm:text-xl md:text-2xl font-display font-bold text-foreground">종합 현황</h2>
          <Button variant="outline" size="icon" className="h-8 w-8" onClick={() => refetch()} disabled={isRefetching}>
            <RefreshCw className={cn("w-4 h-4", isRefetching && "animate-spin")} />
          </Button>
        </div>
        
        <div className="flex gap-1 sm:gap-2 overflow-x-auto pb-1">
          <Button
            variant={activeTab === "safety" ? "default" : "outline"}
            size="sm"
            onClick={() => setActiveTab("safety")}
            className={cn("gap-1.5 h-8 text-xs sm:text-sm whitespace-nowrap", activeTab === "safety" && "bg-blue-600 hover:bg-blue-700")}
            data-testid="tab-safety"
          >
            <Trophy className="w-3.5 h-3.5" />
            <span>안전점수 현황</span>
          </Button>
          <Button
            variant={activeTab === "vehicle" ? "default" : "outline"}
            size="sm"
            onClick={() => setActiveTab("vehicle")}
            className={cn("gap-1.5 h-8 text-xs sm:text-sm whitespace-nowrap", activeTab === "vehicle" && "bg-cyan-600 hover:bg-cyan-700")}
            data-testid="tab-vehicle"
          >
            <Car className="w-3.5 h-3.5" />
            <span>차량관리 현황</span>
          </Button>
          <Button
            variant={activeTab === "equipment" ? "default" : "outline"}
            size="sm"
            onClick={() => setActiveTab("equipment")}
            className={cn("gap-1.5 h-8 text-xs sm:text-sm whitespace-nowrap", activeTab === "equipment" && "bg-amber-600 hover:bg-amber-700")}
            data-testid="tab-equipment"
          >
            <HardHat className="w-3.5 h-3.5" />
            <span>안전보호구 현황</span>
          </Button>
        </div>
      </div>

      {isLoading ? (
        <div className="h-96 flex items-center justify-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-primary"></div>
        </div>
      ) : (
        <AnimatePresence mode="wait">
          {/* Safety Score Tab */}
          {activeTab === "safety" && (
            <motion.div
              key="safety"
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -10 }}
              className="space-y-4"
            >
              {/* Controls */}
              <Card className="p-3 sm:p-4">
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
                      disabled={isLocked}
                    />
                    <span className="text-muted-foreground">대</span>
                  </div>
                  <Button 
                    variant="outline" 
                    size="sm" 
                    onClick={handleResetAll} 
                    disabled={isLocked || resetAllTeams.isPending}
                    className="text-red-600 border-red-200 hover:bg-red-50 hover:text-red-700 h-7 text-xs px-2"
                    data-testid="button-reset-all"
                  >
                    <RotateCcw className={cn("w-3 h-3 sm:mr-1", resetAllTeams.isPending && "animate-spin")} />
                    <span className="hidden sm:inline">초기화</span>
                  </Button>
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
                    disabled={isLocked || isUploading}
                  >
                    <Upload className={cn("w-3 h-3 sm:mr-1", isUploading && "animate-spin")} />
                    <span className="hidden sm:inline">업로드</span>
                  </Button>
                  <Button 
                    variant="secondary" 
                    size="sm" 
                    className="bg-emerald-600 hover:bg-emerald-700 text-white border-0 h-7 text-xs px-2"
                    onClick={() => window.location.href = `/api/teams/export?year=${year}`}
                  >
                    <Download className="w-3 h-3 sm:mr-1" />
                    <span className="hidden sm:inline">다운로드</span>
                  </Button>
                </div>
              </Card>

              {/* Chart Section */}
              <Card className="shadow-lg border-border/50">
                <CardHeader className="p-3 sm:p-4 md:p-6 pb-2 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-2">
                  <div>
                    <CardTitle className="flex items-center gap-2 text-base sm:text-lg md:text-xl">
                      <Trophy className="w-5 h-5 md:w-6 md:h-6 text-yellow-500" />
                      팀별 안전점수
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
                  </div>
                </CardHeader>
              <CardContent className="p-2 sm:p-4 md:p-6 pt-2">
                <div className="w-full h-[200px] sm:h-[240px] md:h-[280px]">
                  <ResponsiveContainer width="100%" height="100%">
                    <BarChart data={chartData} margin={{ top: 10, right: 5, left: -25, bottom: 0 }}>
                      <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#e5e7eb" opacity={0.5} />
                      <XAxis 
                        dataKey="shortName" 
                        axisLine={false} 
                        tickLine={false} 
                        tick={{ fill: '#6b21a8', fontSize: 11, fontWeight: 700 }}
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
                              <div style={{ backgroundColor: 'white', border: '1px solid #e5e7eb', padding: 12, borderRadius: 8, boxShadow: '0 4px 12px rgba(0,0,0,0.1)', fontSize: 12 }}>
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
                        radius={[4, 4, 0, 0]}
                        maxBarSize={40}
                      >
                        {chartData.map((entry, index) => (
                          <Cell 
                            key={`cell-${index}`} 
                            fill={entry.totalScore >= 90 ? '#10b981' : entry.totalScore >= 80 ? '#f59e0b' : '#ef4444'} 
                          />
                        ))}
                      </Bar>
                    </BarChart>
                  </ResponsiveContainer>
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
                    <Table className="min-w-[600px]">
                      <TableHeader className="bg-muted/50">
                        <TableRow className="hover:bg-transparent">
                          <TableHead className="w-[80px] sm:w-[100px] font-bold text-foreground py-2 text-xs sm:text-sm sticky left-0 bg-muted/50 z-10">부서</TableHead>
                          <TableHead className="text-center font-bold text-foreground text-xs sm:text-sm py-2 w-12">차량</TableHead>
                          <TableHead className="text-center font-bold text-red-600 text-xs sm:text-sm py-2 w-12">산재</TableHead>
                          <TableHead className="text-center font-bold text-orange-600 text-xs sm:text-sm py-2 w-12">사고</TableHead>
                          <TableHead className="text-center font-bold text-orange-600 text-xs sm:text-sm py-2 w-12">과속</TableHead>
                          <TableHead className="text-center font-bold text-orange-600 text-xs sm:text-sm py-2 w-12">신호</TableHead>
                          <TableHead className="text-center font-bold text-orange-600 text-xs sm:text-sm py-2 w-12">차선</TableHead>
                          <TableHead className="text-center font-bold text-red-600 text-xs sm:text-sm py-2 w-12">점검</TableHead>
                          <TableHead className="text-center font-bold text-green-600 text-xs sm:text-sm py-2 w-12">제안</TableHead>
                          <TableHead className="text-center font-bold text-green-600 text-xs sm:text-sm py-2 w-12">활동</TableHead>
                          <TableHead className="text-center font-black text-primary text-xs sm:text-sm py-2 w-14">점수</TableHead>
                          <TableHead className="w-[60px] py-2"></TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {sortedTeams.map((team, idx) => (
                          <motion.tr 
                            key={team.id}
                            initial={{ opacity: 0, x: -10 }}
                            animate={{ opacity: 1, x: 0 }}
                            transition={{ delay: idx * 0.05 }}
                            className="group border-b last:border-0 hover:bg-muted/20 transition-colors"
                          >
                            <TableCell className="font-bold py-2 text-sm sm:text-base sticky left-0 bg-card z-10">
                              <span className="text-purple-600 dark:text-purple-400">{team.name.replace('운용팀', 'T')}</span>
                            </TableCell>
                            <TableCell className="text-center font-medium text-sm sm:text-base py-2">{team.vehicleCount}</TableCell>
                            <TableCell className="text-center text-red-600 font-bold text-sm sm:text-base py-2">{team.workAccident}</TableCell>
                            <TableCell className="text-center text-orange-600 font-medium text-sm sm:text-base py-2">
                              {calculateVehicleAccidentCount(team.vehicleAccidents)}
                            </TableCell>
                            <TableCell className="text-center text-orange-500 text-sm sm:text-base py-2">{team.fineSpeed}</TableCell>
                            <TableCell className="text-center text-orange-500 text-sm sm:text-base py-2">{team.fineSignal}</TableCell>
                            <TableCell className="text-center text-orange-500 text-sm sm:text-base py-2">{team.fineLane}</TableCell>
                            <TableCell className="text-center text-red-500 font-medium text-sm sm:text-base py-2">{team.inspectionMiss}</TableCell>
                            <TableCell className="text-center text-green-600 font-medium text-sm sm:text-base py-2">{team.suggestion}</TableCell>
                            <TableCell className="text-center text-green-600 font-medium text-sm sm:text-base py-2">{team.activity}</TableCell>
                            <TableCell className="text-center py-2">
                              <span className={cn(
                                "inline-flex items-center justify-center w-12 sm:w-14 h-7 rounded-md font-bold text-sm sm:text-base shadow-sm border",
                                getScoreBadge(team.totalScore)
                              )}>
                                {team.totalScore}
                              </span>
                            </TableCell>
                            <TableCell className="pr-2 text-right flex items-center justify-end gap-0.5">
                              <Button 
                                variant="ghost" 
                                size="icon"
                                onClick={() => handleResetTeam(team.id, team.name)}
                                disabled={isLocked || resetTeam.isPending}
                                className="hover:bg-red-50 hover:text-red-600 h-7 w-7"
                                data-testid={`button-reset-team-${team.id}`}
                              >
                                <RotateCcw className="w-3.5 h-3.5" />
                              </Button>
                              <TeamEditDialog team={team} disabled={isLocked} />
                            </TableCell>
                          </motion.tr>
                        ))}
                      </TableBody>
                    </Table>
                  </div>
                </Card>
              )}
            </motion.div>
          )}

          {/* Vehicle Management Tab */}
          {activeTab === "vehicle" && (
            <motion.div
              key="vehicle"
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -10 }}
              className="space-y-4"
            >
              {/* 전체 현황 - 종합 대시보드 */}
              <Card className="shadow-lg border-border/50">
                <CardHeader className="p-3 sm:p-4 pb-2 flex flex-row items-center justify-between gap-2">
                  <div className="flex-1 min-w-0">
                    <CardTitle className="flex items-center gap-2 text-base sm:text-lg">
                      <Car className="w-5 h-5 text-cyan-500" />
                      차량 관리 현황
                    </CardTitle>
                    <CardDescription className="text-xs sm:text-sm">전체 팀</CardDescription>
                  </div>
                  <Button
                    variant={showVehicleDetail ? "default" : "outline"}
                    size="sm"
                    className="gap-1.5 border-primary/30 text-primary"
                    onClick={() => setShowVehicleDetail(!showVehicleDetail)}
                    data-testid="button-toggle-vehicle-detail"
                  >
                    <Settings2 className="w-3.5 h-3.5" />
                    현황관리
                  </Button>
                </CardHeader>
                <CardContent className="p-3 sm:p-4 pt-2">
                  <div className="grid grid-cols-2 md:grid-cols-4 gap-2 sm:gap-4">
                    <div className="bg-gradient-to-br from-slate-50 to-slate-100 dark:from-slate-900 dark:to-slate-800 border border-slate-200 dark:border-slate-700 rounded-lg p-2.5 sm:p-4 flex items-center gap-2 sm:gap-4">
                      <div className="p-2 sm:p-3 bg-slate-200 dark:bg-slate-700 rounded-lg">
                        <Car className="w-4 h-4 sm:w-5 sm:h-5 text-slate-600 dark:text-slate-300" />
                      </div>
                      <div>
                        <p className="text-lg sm:text-2xl font-bold">{vehicleStatsAll.total}</p>
                        <p className="text-xs text-muted-foreground">전체</p>
                      </div>
                    </div>
                    <div className="bg-gradient-to-br from-green-50 to-green-100 dark:from-green-900/30 dark:to-green-800/20 border border-green-200 dark:border-green-800 rounded-lg p-2.5 sm:p-4 flex items-center gap-2 sm:gap-4">
                      <div className="p-2 sm:p-3 bg-green-200 dark:bg-green-800 rounded-lg">
                        <CheckCircle className="w-4 h-4 sm:w-5 sm:h-5 text-green-600 dark:text-green-300" />
                      </div>
                      <div>
                        <p className="text-lg sm:text-2xl font-bold text-green-700 dark:text-green-400">{vehicleStatsAll.operating}</p>
                        <p className="text-xs text-muted-foreground">운행중</p>
                      </div>
                    </div>
                    <div className="bg-gradient-to-br from-amber-50 to-amber-100 dark:from-amber-900/30 dark:to-amber-800/20 border border-amber-200 dark:border-amber-800 rounded-lg p-2.5 sm:p-4 flex items-center gap-2 sm:gap-4">
                      <div className="p-2 sm:p-3 bg-amber-200 dark:bg-amber-800 rounded-lg">
                        <Wrench className="w-4 h-4 sm:w-5 sm:h-5 text-amber-600 dark:text-amber-300" />
                      </div>
                      <div>
                        <p className="text-lg sm:text-2xl font-bold text-amber-700 dark:text-amber-400">{vehicleStatsAll.maintenance}</p>
                        <p className="text-xs text-muted-foreground">정비중</p>
                      </div>
                    </div>
                    <div className="bg-gradient-to-br from-blue-50 to-blue-100 dark:from-blue-900/30 dark:to-blue-800/20 border border-blue-200 dark:border-blue-800 rounded-lg p-2.5 sm:p-4 flex items-center gap-2 sm:gap-4">
                      <div className="p-2 sm:p-3 bg-blue-200 dark:bg-blue-800 rounded-lg">
                        <Shield className="w-4 h-4 sm:w-5 sm:h-5 text-blue-600 dark:text-blue-300" />
                      </div>
                      <div>
                        <p className="text-lg sm:text-2xl font-bold text-blue-700 dark:text-blue-400">{vehicleStatsAll.idle}</p>
                        <p className="text-xs text-muted-foreground">대기</p>
                      </div>
                    </div>
                  </div>
                </CardContent>
              </Card>

              {showVehicleDetail && (
                <div className="mt-4">
                  <VehicleManagement embedded />
                </div>
              )}
            </motion.div>
          )}

          {/* Equipment Management Tab */}
          {activeTab === "equipment" && (
            <motion.div
              key="equipment"
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -10 }}
              className="space-y-4"
            >
              <Card className="shadow-lg border-border/50">
                <CardHeader className="p-3 sm:p-4 pb-2 flex flex-row items-center justify-between">
                  <div>
                    <CardTitle className="flex items-center gap-2 text-base sm:text-lg">
                      <HardHat className="w-5 h-5 text-amber-500" />
                      안전보호구 현황
                    </CardTitle>
                    <CardDescription className="text-xs sm:text-sm">보호구 관리 현황</CardDescription>
                  </div>
                  <Button
                    variant={showEquipmentDetail ? "default" : "outline"}
                    size="sm"
                    className="gap-1.5 border-primary/30 text-primary"
                    onClick={() => setShowEquipmentDetail(!showEquipmentDetail)}
                    data-testid="button-toggle-equipment-detail"
                  >
                    <Settings2 className="w-3.5 h-3.5" />
                    현황관리
                  </Button>
                </CardHeader>
                <CardContent className="p-3 sm:p-4 pt-2">
                  <div className="grid grid-cols-2 md:grid-cols-4 gap-2 sm:gap-4">
                    <div className="bg-gradient-to-br from-slate-50 to-slate-100 dark:from-slate-900 dark:to-slate-800 border border-slate-200 dark:border-slate-700 rounded-lg p-2.5 sm:p-4 flex items-center gap-2 sm:gap-4">
                      <div className="p-2 sm:p-3 bg-slate-200 dark:bg-slate-700 rounded-lg">
                        <HardHat className="w-4 h-4 sm:w-5 sm:h-5 text-slate-600 dark:text-slate-300" />
                      </div>
                      <div>
                        <p className="text-lg sm:text-2xl font-bold">{equipmentStats.totalQuantity}</p>
                        <p className="text-xs text-muted-foreground">전체 현황</p>
                      </div>
                    </div>
                    <div className="bg-gradient-to-br from-blue-50 to-blue-100 dark:from-blue-900/30 dark:to-blue-800/20 border border-blue-200 dark:border-blue-800 rounded-lg p-2.5 sm:p-4 flex items-center gap-2 sm:gap-4">
                      <div className="p-2 sm:p-3 bg-blue-200 dark:bg-blue-800 rounded-lg">
                        <Shield className="w-4 h-4 sm:w-5 sm:h-5 text-blue-600 dark:text-blue-300" />
                      </div>
                      <div>
                        <p className="text-lg sm:text-2xl font-bold text-blue-700 dark:text-blue-400">{equipmentStats.registeredQty}</p>
                        <p className="text-xs text-muted-foreground">등록</p>
                      </div>
                    </div>
                    <div className="bg-gradient-to-br from-green-50 to-green-100 dark:from-green-900/30 dark:to-green-800/20 border border-green-200 dark:border-green-800 rounded-lg p-2.5 sm:p-4 flex items-center gap-2 sm:gap-4">
                      <div className="p-2 sm:p-3 bg-green-200 dark:bg-green-800 rounded-lg">
                        <CheckCircle className="w-4 h-4 sm:w-5 sm:h-5 text-green-600 dark:text-green-300" />
                      </div>
                      <div>
                        <p className="text-lg sm:text-2xl font-bold text-green-700 dark:text-green-400">{equipmentStats.goodQty}</p>
                        <p className="text-xs text-muted-foreground">양호</p>
                      </div>
                    </div>
                    <div className="bg-gradient-to-br from-red-50 to-red-100 dark:from-red-900/30 dark:to-red-800/20 border border-red-200 dark:border-red-800 rounded-lg p-2.5 sm:p-4 flex items-center gap-2 sm:gap-4">
                      <div className="p-2 sm:p-3 bg-red-200 dark:bg-red-800 rounded-lg">
                        <AlertTriangle className="w-4 h-4 sm:w-5 sm:h-5 text-red-600 dark:text-red-300" />
                      </div>
                      <div>
                        <p className="text-lg sm:text-2xl font-bold text-red-700 dark:text-red-400">{equipmentStats.badQty}</p>
                        <p className="text-xs text-muted-foreground">불량</p>
                      </div>
                    </div>
                  </div>
                </CardContent>
              </Card>

              {showEquipmentDetail && (
                <div className="mt-4">
                  <EquipmentStatus embedded />
                </div>
              )}
            </motion.div>
          )}
        </AnimatePresence>
      )}

      {/* Notice Popup */}
      <Dialog open={noticePopupOpen} onOpenChange={setNoticePopupOpen}>
        <DialogContent className="max-w-lg max-h-[80vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-lg">
              <AlertCircle className="w-5 h-5 text-primary" />
              공지사항
            </DialogTitle>
            <DialogDescription>
              {currentNotice?.title}
            </DialogDescription>
          </DialogHeader>
          
          <div className="py-4 space-y-4">
            {currentNotice && (() => {
              try {
                const parsed = JSON.parse(currentNotice.content);
                return (
                  <>
                    {parsed.imageUrl && (
                      <div className="rounded-lg overflow-hidden border">
                        <img 
                          src={parsed.imageUrl} 
                          alt="공지 이미지" 
                          className="w-full h-auto object-cover"
                        />
                      </div>
                    )}
                    <div className="text-sm whitespace-pre-wrap leading-relaxed">
                      {parsed.message || parsed.text || currentNotice.content}
                    </div>
                  </>
                );
              } catch {
                return (
                  <div className="text-sm whitespace-pre-wrap leading-relaxed">
                    {currentNotice.content}
                  </div>
                );
              }
            })()}
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
    </div>
  );
}
