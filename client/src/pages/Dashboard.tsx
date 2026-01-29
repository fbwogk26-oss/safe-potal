import { useTeams, useResetTeam, useResetAllTeams } from "@/hooks/use-teams";
import { useLockStatus } from "@/hooks/use-settings";
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
import { useState, useRef } from "react";
import * as XLSX from "xlsx";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { Download, RefreshCw, AlertTriangle, Trophy, AlertCircle, ShieldCheck, RotateCcw, Upload } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { TeamEditDialog } from "@/components/TeamEditDialog";
import { cn } from "@/lib/utils";
import { motion } from "framer-motion";

export default function Dashboard() {
  const [year, setYear] = useState(2026);
  const [baseVehicleCount, setBaseVehicleCount] = useState(15);
  const [isUploading, setIsUploading] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
  
  const { data: teams, isLoading, refetch, isRefetching } = useTeams(year);
  const { data: lockData } = useLockStatus();
  const isLocked = lockData?.isLocked;
  const resetTeam = useResetTeam();
  const resetAllTeams = useResetAllTeams();
  const { toast } = useToast();

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
    <div className="space-y-6">
      <div className="flex flex-col md:flex-row gap-4 items-start md:items-center justify-between glass-card p-6 rounded-2xl">
        <div>
          <h2 className="text-2xl font-display font-bold text-foreground">종합 현황</h2>
        </div>
        
        <div className="flex flex-wrap items-center gap-3">
          <div className="flex items-center gap-2 bg-background p-1 rounded-lg border">
            <span className="text-xs font-medium px-2 text-muted-foreground">연도</span>
            <Select value={String(year)} onValueChange={(v) => setYear(Number(v))}>
              <SelectTrigger className="h-8 w-24 border-0 shadow-none focus:ring-0">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="2024">2024</SelectItem>
                <SelectItem value="2025">2025</SelectItem>
                <SelectItem value="2026">2026</SelectItem>
              </SelectContent>
            </Select>
          </div>

          <div className="flex items-center gap-2 bg-background p-1 rounded-lg border">
            <span className="text-xs font-medium px-2 text-muted-foreground">기준 차량수</span>
            <Input 
              type="number" 
              value={baseVehicleCount} 
              onChange={(e) => setBaseVehicleCount(Number(e.target.value))}
              className="h-8 w-16 border-0 shadow-none focus-visible:ring-0 text-right"
              disabled={isLocked}
            />
          </div>

          <Button variant="outline" size="sm" onClick={() => refetch()} disabled={isRefetching}>
            <RefreshCw className={cn("w-4 h-4 mr-2", isRefetching && "animate-spin")} />
            새로고침
          </Button>

          <Button 
            variant="outline" 
            size="sm" 
            onClick={handleResetAll} 
            disabled={isLocked || resetAllTeams.isPending}
            className="text-red-600 border-red-200 hover:bg-red-50 hover:text-red-700"
            data-testid="button-reset-all"
          >
            <RotateCcw className={cn("w-4 h-4 mr-2", resetAllTeams.isPending && "animate-spin")} />
            전체 초기화
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
            onClick={() => fileInputRef.current?.click()}
            disabled={isLocked || isUploading}
          >
            <Upload className={cn("w-4 h-4 mr-2", isUploading && "animate-spin")} />
            엑셀 업로드
          </Button>
          <Button 
            variant="secondary" 
            size="sm" 
            className="bg-emerald-600 hover:bg-emerald-700 text-white border-0"
            onClick={() => window.location.href = `/api/teams/export?year=${year}`}
          >
            <Download className="w-4 h-4 mr-2" />
            엑셀 다운로드
          </Button>
        </div>
      </div>

      {isLoading ? (
        <div className="h-96 flex items-center justify-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-primary"></div>
        </div>
      ) : (
        <>
          {/* Chart Section */}
          <div className="grid grid-cols-1 gap-6">
             <Card className="shadow-lg border-border/50">
              <CardHeader className="pb-2 flex flex-row items-start justify-between gap-4">
                <div>
                  <CardTitle className="flex items-center gap-2 text-xl">
                    <Trophy className="w-6 h-6 text-yellow-500" />
                    팀별 안전점수
                  </CardTitle>
                  <CardDescription>실시간 안전 점수 현황</CardDescription>
                </div>
                <div className="flex items-center gap-3 text-xs text-muted-foreground">
                  <div className="flex items-center gap-1">
                    <span className="w-2 h-2 rounded-full bg-green-500"></span>
                    <span>우수 90+</span>
                  </div>
                  <div className="flex items-center gap-1">
                    <span className="w-2 h-2 rounded-full bg-yellow-500"></span>
                    <span>주의 80-89</span>
                  </div>
                  <div className="flex items-center gap-1">
                    <span className="w-2 h-2 rounded-full bg-red-500"></span>
                    <span>심각 80미만</span>
                  </div>
                </div>
              </CardHeader>
              <CardContent className="pt-4">
                <div style={{ width: '100%', height: 280, minHeight: 280 }}>
                  <ResponsiveContainer width="100%" height={280}>
                    <BarChart data={orderedTeams} margin={{ top: 10, right: 10, left: -20, bottom: 0 }}>
                      <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#e5e7eb" opacity={0.5} />
                      <XAxis 
                        dataKey="name" 
                        axisLine={false} 
                        tickLine={false} 
                        tick={{ fill: '#1e293b', fontSize: 13, fontWeight: 600 }}
                        interval={0}
                      />
                      <YAxis 
                        domain={[0, 100]} 
                        axisLine={false} 
                        tickLine={false}
                        tick={{ fill: '#64748b', fontSize: 12 }}
                      />
                      <Tooltip 
                        cursor={{ fill: '#3b82f6', opacity: 0.05 }}
                        content={({ active, payload }) => {
                          if (active && payload && payload.length) {
                            const data = payload[0].payload;
                            return (
                              <div style={{ backgroundColor: 'white', border: '1px solid #e5e7eb', padding: 16, borderRadius: 12, boxShadow: '0 10px 25px rgba(0,0,0,0.1)' }}>
                                <p style={{ fontWeight: 'bold', fontSize: 18, marginBottom: 8, borderBottom: '1px solid #e5e7eb', paddingBottom: 4 }}>{data.name}</p>
                                <div style={{ fontSize: 14 }}>
                                  <div style={{ display: 'flex', justifyContent: 'space-between', gap: 16 }}>
                                    <span style={{ color: '#64748b' }}>안전 점수:</span>
                                    <span style={{ fontWeight: 'bold', color: '#3b82f6' }}>{data.totalScore}점</span>
                                  </div>
                                  <div style={{ display: 'flex', justifyContent: 'space-between', gap: 16 }}>
                                    <span style={{ color: '#64748b' }}>차량 수:</span>
                                    <span>{data.vehicleCount}대</span>
                                  </div>
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
                        barSize={45}
                      >
                        {orderedTeams.map((entry, index) => (
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
          </div>

          {/* Table Section */}
          <Card className="shadow-xl border-border/50 overflow-hidden">
            <div className="bg-muted/30 px-6 py-4 border-b flex items-center justify-between">
              <h3 className="font-bold text-lg flex items-center gap-2">
                <ShieldCheck className="w-5 h-5 text-primary" />
                상세 데이터 분석
              </h3>
              <span className="text-xs text-muted-foreground font-medium">단위: 건수 / 점수</span>
            </div>
            <div className="overflow-x-auto">
              <Table>
                <TableHeader className="bg-muted/50">
                  <TableRow className="hover:bg-transparent">
                    <TableHead className="w-[140px] font-bold text-foreground py-1 text-xs">부서명</TableHead>
                    <TableHead className="text-center font-bold text-foreground text-xs py-1">차량</TableHead>
                    <TableHead className="text-center font-bold text-red-600 text-xs py-1"><div>작업</div><div>사고</div></TableHead>
                    <TableHead className="text-center font-bold text-orange-600 text-xs py-1"><div>차량</div><div>사고</div></TableHead>
                    <TableHead className="text-center font-bold text-orange-600 text-xs py-1">과속</TableHead>
                    <TableHead className="text-center font-bold text-orange-600 text-xs py-1">신호</TableHead>
                    <TableHead className="text-center font-bold text-orange-600 text-xs py-1">차선</TableHead>
                    <TableHead className="text-center font-bold text-red-600 text-xs py-1"><div>점검</div><div>미준수</div></TableHead>
                    <TableHead className="text-center font-bold text-green-600 text-xs py-1"><div>우수</div><div>제안</div></TableHead>
                    <TableHead className="text-center font-bold text-green-600 text-xs py-1"><div>우수</div><div>활동</div></TableHead>
                    <TableHead className="text-right font-black text-primary text-xs pr-6 py-1"><div>최종</div><div>점수</div></TableHead>
                    <TableHead className="w-[50px] py-1"></TableHead>
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
                      <TableCell className="font-bold py-1 text-sm">{team.name}</TableCell>
                      <TableCell className="text-center font-medium text-sm py-1">{team.vehicleCount}</TableCell>
                      <TableCell className="text-center text-red-600 font-bold text-sm py-1">{team.workAccident}</TableCell>
                      <TableCell className="text-center text-orange-600 font-medium text-sm py-1">
                        {calculateVehicleAccidentCount(team.vehicleAccidents)}
                      </TableCell>
                      <TableCell className="text-center text-orange-500 text-sm py-1">{team.fineSpeed}</TableCell>
                      <TableCell className="text-center text-orange-500 text-sm py-1">{team.fineSignal}</TableCell>
                      <TableCell className="text-center text-orange-500 text-sm py-1">{team.fineLane}</TableCell>
                      <TableCell className="text-center text-red-500 font-medium text-sm py-1">{team.inspectionMiss}</TableCell>
                      <TableCell className="text-center text-green-600 font-medium text-sm py-1">{team.suggestion}</TableCell>
                      <TableCell className="text-center text-green-600 font-medium text-sm py-1">{team.activity}</TableCell>
                      <TableCell className="text-right pr-6 py-1">
                        <span className={cn(
                          "inline-flex items-center justify-center w-12 h-7 rounded-lg font-bold text-sm shadow-sm border",
                          getScoreBadge(team.totalScore)
                        )}>
                          {team.totalScore}
                        </span>
                      </TableCell>
                      <TableCell className="pr-4 text-right flex items-center justify-end gap-1">
                        <Button 
                          variant="ghost" 
                          size="icon"
                          onClick={() => handleResetTeam(team.id, team.name)}
                          disabled={isLocked || resetTeam.isPending}
                          className="hover:bg-red-50 hover:text-red-600"
                          data-testid={`button-reset-team-${team.id}`}
                        >
                          <RotateCcw className="w-4 h-4" />
                        </Button>
                        <TeamEditDialog team={team} disabled={isLocked} />
                      </TableCell>
                    </motion.tr>
                  ))}
                </TableBody>
              </Table>
            </div>
          </Card>
        </>
      )}
    </div>
  );
}
