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
import { Download, RefreshCw, AlertTriangle, Trophy, AlertCircle } from "lucide-react";
import { TeamEditDialog } from "@/components/TeamEditDialog";
import { cn } from "@/lib/utils";
import { motion } from "framer-motion";

export default function Dashboard() {
  const [year, setYear] = useState(2025);
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
          <h2 className="text-2xl font-display font-bold text-foreground">Overview</h2>
          <p className="text-muted-foreground">Safety performance metrics and analysis</p>
        </div>
        
        <div className="flex flex-wrap items-center gap-3">
          <div className="flex items-center gap-2 bg-background p-1 rounded-lg border">
            <span className="text-xs font-medium px-2 text-muted-foreground">Year</span>
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
            <span className="text-xs font-medium px-2 text-muted-foreground">Base Vehicles</span>
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
            Refresh
          </Button>

          <Button variant="secondary" size="sm" className="bg-emerald-600 hover:bg-emerald-700 text-white border-0">
            <Download className="w-4 h-4 mr-2" />
            Export
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
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
             <Card className="lg:col-span-2 shadow-lg border-border/50">
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <Trophy className="w-5 h-5 text-yellow-500" />
                  Team Performance Ranking
                </CardTitle>
                <CardDescription>Real-time safety score distribution</CardDescription>
              </CardHeader>
              <CardContent className="h-[350px]">
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={sortedTeams} margin={{ top: 20, right: 30, left: 0, bottom: 5 }}>
                    <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="var(--border)" opacity={0.5} />
                    <XAxis 
                      dataKey="name" 
                      axisLine={false} 
                      tickLine={false} 
                      tick={{ fill: 'var(--muted-foreground)', fontSize: 12 }} 
                      dy={10}
                    />
                    <YAxis 
                      hide 
                      domain={[0, 110]} 
                    />
                    <Tooltip 
                      cursor={{ fill: 'var(--muted)', opacity: 0.2 }}
                      contentStyle={{ borderRadius: '12px', border: 'none', boxShadow: '0 10px 15px -3px rgba(0, 0, 0, 0.1)' }}
                    />
                    <Bar dataKey="totalScore" radius={[8, 8, 0, 0]} barSize={40} animationDuration={1000}>
                      {sortedTeams.map((entry, index) => (
                        <Cell key={`cell-${index}`} fill={getScoreColor(entry.totalScore)} />
                      ))}
                    </Bar>
                  </BarChart>
                </ResponsiveContainer>
              </CardContent>
             </Card>

             <Card className="shadow-lg border-border/50 flex flex-col justify-center">
               <CardHeader>
                 <CardTitle>Score Legend</CardTitle>
               </CardHeader>
               <CardContent className="space-y-4">
                 <div className="flex items-center gap-4 p-4 rounded-xl bg-green-50 border border-green-100 dark:bg-green-900/10 dark:border-green-900/30">
                   <div className="w-10 h-10 rounded-full bg-green-500 flex items-center justify-center text-white font-bold text-lg shadow-lg shadow-green-500/30">A</div>
                   <div>
                     <div className="font-bold text-green-700 dark:text-green-400">Excellent (90+)</div>
                     <div className="text-xs text-green-600/80">Target Performance</div>
                   </div>
                 </div>
                 <div className="flex items-center gap-4 p-4 rounded-xl bg-yellow-50 border border-yellow-100 dark:bg-yellow-900/10 dark:border-yellow-900/30">
                   <div className="w-10 h-10 rounded-full bg-yellow-500 flex items-center justify-center text-white font-bold text-lg shadow-lg shadow-yellow-500/30">B</div>
                   <div>
                     <div className="font-bold text-yellow-700 dark:text-yellow-400">Warning (80-89)</div>
                     <div className="text-xs text-yellow-600/80">Needs Attention</div>
                   </div>
                 </div>
                 <div className="flex items-center gap-4 p-4 rounded-xl bg-red-50 border border-red-100 dark:bg-red-900/10 dark:border-red-900/30">
                   <div className="w-10 h-10 rounded-full bg-red-500 flex items-center justify-center text-white font-bold text-lg shadow-lg shadow-red-500/30">C</div>
                   <div>
                     <div className="font-bold text-red-700 dark:text-red-400">Critical (&lt;80)</div>
                     <div className="text-xs text-red-600/80">Action Required</div>
                   </div>
                 </div>
               </CardContent>
             </Card>
          </div>

          {/* Table Section */}
          <Card className="shadow-lg border-border/50 overflow-hidden">
            <div className="overflow-x-auto">
              <Table>
                <TableHeader className="bg-muted/30">
                  <TableRow>
                    <TableHead className="w-[150px]">Team</TableHead>
                    <TableHead className="text-center">Vehicles</TableHead>
                    <TableHead className="text-center text-red-600">Work Acc.</TableHead>
                    <TableHead className="text-center text-orange-600">Vehicle Acc.</TableHead>
                    <TableHead className="text-center text-orange-600">Speed</TableHead>
                    <TableHead className="text-center text-orange-600">Signal</TableHead>
                    <TableHead className="text-center text-orange-600">Lane</TableHead>
                    <TableHead className="text-center text-red-600">Insp. Miss</TableHead>
                    <TableHead className="text-center text-green-600">Suggestion</TableHead>
                    <TableHead className="text-center text-green-600">Activity</TableHead>
                    <TableHead className="text-right font-bold">Total Score</TableHead>
                    <TableHead className="w-[50px]"></TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {sortedTeams.map((team, idx) => (
                    <motion.tr 
                      key={team.id}
                      initial={{ opacity: 0, y: 20 }}
                      animate={{ opacity: 1, y: 0 }}
                      transition={{ delay: idx * 0.05 }}
                      className="group hover:bg-muted/30 transition-colors"
                    >
                      <TableCell className="font-medium font-display">{team.name}</TableCell>
                      <TableCell className="text-center text-muted-foreground">{team.vehicleCount}</TableCell>
                      <TableCell className="text-center font-mono text-red-600/80">{team.workAccident || "-"}</TableCell>
                      <TableCell className="text-center font-mono text-orange-600/80">
                         {calculateVehicleAccidentCount(team.vehicleAccidents) || "-"}
                      </TableCell>
                      <TableCell className="text-center text-muted-foreground">{team.fineSpeed || "-"}</TableCell>
                      <TableCell className="text-center text-muted-foreground">{team.fineSignal || "-"}</TableCell>
                      <TableCell className="text-center text-muted-foreground">{team.fineLane || "-"}</TableCell>
                      <TableCell className="text-center font-mono text-red-600/80">{team.inspectionMiss || "-"}</TableCell>
                      <TableCell className="text-center font-mono text-green-600/80">{team.suggestion || "-"}</TableCell>
                      <TableCell className="text-center font-mono text-green-600/80">{team.activity || "-"}</TableCell>
                      <TableCell className="text-right">
                        <span className={cn(
                          "px-2.5 py-1 rounded-lg text-sm font-bold border",
                          getScoreBadge(team.totalScore)
                        )}>
                          {team.totalScore}
                        </span>
                      </TableCell>
                      <TableCell>
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
