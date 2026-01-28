import { useTeams } from "@/hooks/use-teams";
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
import { useState } from "react";
import { Download, RefreshCw, AlertTriangle, Trophy, AlertCircle, ShieldCheck } from "lucide-react";
import { TeamEditDialog } from "@/components/TeamEditDialog";
import { cn } from "@/lib/utils";
import { motion } from "framer-motion";

export default function Dashboard() {
  const [year, setYear] = useState(2026);
  const [baseVehicleCount, setBaseVehicleCount] = useState(15);
  
  const { data: teams, isLoading, refetch, isRefetching } = useTeams(year);
  const { data: lockData } = useLockStatus();
  const isLocked = lockData?.isLocked;

  // Sort teams by score descending
  const sortedTeams = teams ? [...teams].sort((a, b) => b.totalScore - a.totalScore) : [];

  const getScoreColor = (score: number) => {
    if (score >= 90) return "var(--score-good)";
    if (score >= 80) return "var(--score-warning)";
    return "var(--score-danger)";
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
          <p className="text-muted-foreground">안전 성능 지표 및 분석</p>
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

          <Button variant="secondary" size="sm" className="bg-emerald-600 hover:bg-emerald-700 text-white border-0">
            <Download className="w-4 h-4 mr-2" />
            내보내기
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
                    팀별 안전 성능 순위
                  </CardTitle>
                  <CardDescription>실시간 안전 점수 현황 (높을수록 우수)</CardDescription>
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
              <CardContent className="h-[280px] pt-4">
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={sortedTeams} margin={{ top: 10, right: 10, left: -20, bottom: 0 }}>
                    <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="var(--border)" opacity={0.5} />
                    <XAxis 
                      dataKey="name" 
                      axisLine={false} 
                      tickLine={false} 
                      tick={{ fill: 'var(--foreground)', fontSize: 13, fontWeight: 600 }}
                      interval={0}
                    />
                    <YAxis 
                      domain={[0, 100]} 
                      axisLine={false} 
                      tickLine={false}
                      tick={{ fill: 'var(--muted-foreground)', fontSize: 12 }}
                    />
                    <Tooltip 
                      cursor={{ fill: 'var(--primary)', opacity: 0.05 }}
                      content={({ active, payload }) => {
                        if (active && payload && payload.length) {
                          const data = payload[0].payload;
                          return (
                            <div className="bg-background/95 backdrop-blur-md border shadow-xl p-4 rounded-xl">
                              <p className="font-bold text-lg mb-2 border-b pb-1">{data.name}</p>
                              <div className="space-y-1 text-sm">
                                <div className="flex justify-between gap-4">
                                  <span className="text-muted-foreground">안전 점수:</span>
                                  <span className="font-bold text-primary">{data.totalScore}점</span>
                                </div>
                                <div className="flex justify-between gap-4">
                                  <span className="text-muted-foreground">차량 수:</span>
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
                      {sortedTeams.map((entry, index) => (
                        <Cell 
                          key={`cell-${index}`} 
                          fill={entry.totalScore >= 90 ? '#10b981' : entry.totalScore >= 80 ? '#f59e0b' : '#ef4444'} 
                          className="drop-shadow-sm"
                        />
                      ))}
                    </Bar>
                  </BarChart>
                </ResponsiveContainer>
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
                    <TableHead className="w-[180px] font-bold text-foreground py-4">부서명</TableHead>
                    <TableHead className="text-center font-bold text-foreground">차량</TableHead>
                    <TableHead className="text-center font-bold text-red-600">작업사고</TableHead>
                    <TableHead className="text-center font-bold text-orange-600">차량사고</TableHead>
                    <TableHead className="text-center font-bold text-orange-600">과속</TableHead>
                    <TableHead className="text-center font-bold text-orange-600">신호</TableHead>
                    <TableHead className="text-center font-bold text-orange-600">차선</TableHead>
                    <TableHead className="text-center font-bold text-red-600">점검미준수</TableHead>
                    <TableHead className="text-center font-bold text-green-600">우수제안</TableHead>
                    <TableHead className="text-center font-bold text-green-600">우수활동</TableHead>
                    <TableHead className="text-right font-black text-primary text-base pr-8">최종 점수</TableHead>
                    <TableHead className="w-[60px]"></TableHead>
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
                      <TableCell className="font-bold py-4 text-base">{team.name}</TableCell>
                      <TableCell className="text-center font-medium">{team.vehicleCount}</TableCell>
                      <TableCell className="text-center text-red-600 font-bold">{team.workAccident}</TableCell>
                      <TableCell className="text-center text-orange-600 font-medium">
                        {calculateVehicleAccidentCount(team.vehicleAccidents)}
                      </TableCell>
                      <TableCell className="text-center text-orange-500">{team.fineSpeed}</TableCell>
                      <TableCell className="text-center text-orange-500">{team.fineSignal}</TableCell>
                      <TableCell className="text-center text-orange-500">{team.fineLane}</TableCell>
                      <TableCell className="text-center text-red-500 font-medium">{team.inspectionMiss}</TableCell>
                      <TableCell className="text-center text-green-600 font-medium">{team.suggestion}</TableCell>
                      <TableCell className="text-center text-green-600 font-medium">{team.activity}</TableCell>
                      <TableCell className="text-right pr-8">
                        <span className={cn(
                          "inline-flex items-center justify-center w-14 h-8 rounded-lg font-black text-lg shadow-sm border",
                          getScoreBadge(team.totalScore)
                        )}>
                          {team.totalScore}
                        </span>
                      </TableCell>
                      <TableCell className="pr-4 text-right">
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
