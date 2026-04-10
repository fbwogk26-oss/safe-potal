import { useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { queryClient, apiRequest } from "@/lib/queryClient";
import { useAuth } from "@/hooks/use-auth";
import { useToast } from "@/hooks/use-toast";
import { format } from "date-fns";
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer,
  PieChart, Pie, Cell, Label as ReLabel,
} from "recharts";
import {
  BarChart2, CheckCircle2, AlertCircle, Download, Search, Paperclip,
} from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Checkbox } from "@/components/ui/checkbox";
import type { EducationTask } from "@shared/schema";

const FIELD_COLORS: Record<string, string> = {
  "안전/보건": "#6366f1",
  "법령": "#8b5cf6",
  "이벤트": "#a78bfa",
};
const DONE_COLOR = "#6366f1";
const TODO_COLOR = "#e0e7ff";

export default function EducationStatus() {
  const { user } = useAuth();
  const { toast } = useToast();
  const isEditor = user?.role === "admin" || user?.role === "deptHead" || user?.role === "manager";
  const [search, setSearch] = useState("");
  const [selectedIds, setSelectedIds] = useState<Set<number>>(new Set());
  const [confirmIds, setConfirmIds] = useState<number[]>([]);

  const { data: tasks = [], isLoading } = useQuery<EducationTask[]>({
    queryKey: ["/api/education-tasks"],
  });

  const bulkConfirmMutation = useMutation({
    mutationFn: (ids: number[]) => apiRequest("POST", "/api/education-tasks/bulk-confirm", { ids }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/education-tasks"] });
      setSelectedIds(new Set());
      setConfirmIds([]);
      toast({ title: "완료 처리되었습니다." });
    },
    onError: (e: any) => toast({ title: "처리 실패", description: e.message, variant: "destructive" }),
  });

  const allFields = ["안전/보건", "법령", "이벤트"];
  const chartData = allFields.map(field => {
    const fieldTasks = tasks.filter(t => t.field === field);
    return {
      name: field,
      완료: fieldTasks.filter(t => t.status === "완료").length,
      미완료: fieldTasks.filter(t => t.status !== "완료").length,
    };
  });

  const totalTasks = tasks.length;
  const incompleteTasks = tasks.filter(t => t.status !== "완료");
  const noAttachment = incompleteTasks.filter(t => !t.attachmentUrl);

  const totalIncomplete = incompleteTasks.length;
  const totalNoAttachment = noAttachment.length;

  const donutDataNoAttachment = [
    { name: "첨부 미등록", value: totalNoAttachment },
    { name: "첨부 있음", value: Math.max(0, totalTasks - totalNoAttachment) },
  ];
  const donutDataIncomplete = [
    { name: "미완료", value: totalIncomplete },
    { name: "완료", value: Math.max(0, totalTasks - totalIncomplete) },
  ];

  const filtered = tasks.filter(t =>
    !search || t.title.toLowerCase().includes(search.toLowerCase()) ||
    (t.department || "").toLowerCase().includes(search.toLowerCase())
  );

  const allChecked = filtered.length > 0 && filtered.every(t => selectedIds.has(t.id));
  const toggleAll = () => {
    const s = new Set(selectedIds);
    if (allChecked) filtered.forEach(t => s.delete(t.id));
    else filtered.forEach(t => s.add(t.id));
    setSelectedIds(s);
  };
  const toggleOne = (id: number) => {
    const s = new Set(selectedIds);
    s.has(id) ? s.delete(id) : s.add(id);
    setSelectedIds(s);
  };

  const DonutChart = ({ data, label, color }: { data: any[]; label: string; color: string }) => (
    <div className="flex flex-col items-center gap-2">
      <p className="text-sm font-medium text-muted-foreground">{label}</p>
      <div className="w-36 h-36">
        <ResponsiveContainer width="100%" height="100%">
          <PieChart>
            <Pie
              data={data}
              cx="50%"
              cy="50%"
              innerRadius={42}
              outerRadius={60}
              startAngle={90}
              endAngle={-270}
              dataKey="value"
            >
              {data.map((_, i) => (
                <Cell key={i} fill={i === 0 ? color : "#e5e7eb"} />
              ))}
              <ReLabel
                content={({ viewBox }: any) => {
                  const cx = viewBox?.cx ?? 0;
                  const cy = viewBox?.cy ?? 0;
                  return (
                    <text x={cx} y={cy} textAnchor="middle" dominantBaseline="middle">
                      <tspan x={cx} dy="-4" fontSize="22" fontWeight="bold" fill="#374151">{data[0].value}</tspan>
                      <tspan x={cx} dy="18" fontSize="10" fill="#9ca3af">건</tspan>
                    </text>
                  );
                }}
              />
            </Pie>
          </PieChart>
        </ResponsiveContainer>
      </div>
    </div>
  );

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h1 className="text-xl sm:text-2xl font-bold flex items-center gap-2">
          <BarChart2 className="w-6 h-6 text-primary" />
          교육업무 현황
        </h1>
      </div>

      {/* 차트 영역 */}
      <div className="grid grid-cols-1 lg:grid-cols-5 gap-4">
        {/* 분야별 현황 바 차트 */}
        <Card className="lg:col-span-3">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-semibold flex items-center gap-2">
              <BarChart2 className="w-4 h-4 text-primary" />
              업무 분야별 현황
            </CardTitle>
          </CardHeader>
          <CardContent>
            {isLoading ? (
              <div className="h-48 flex items-center justify-center">
                <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary" />
              </div>
            ) : (
              <ResponsiveContainer width="100%" height={200}>
                <BarChart data={chartData} margin={{ top: 10, right: 20, left: -20, bottom: 0 }}>
                  <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f0f0f0" />
                  <XAxis dataKey="name" tick={{ fontSize: 12 }} />
                  <YAxis allowDecimals={false} tick={{ fontSize: 11 }} />
                  <Tooltip
                    contentStyle={{ borderRadius: 8, border: "1px solid #e5e7eb", fontSize: 12 }}
                  />
                  <Legend iconSize={10} wrapperStyle={{ fontSize: 12 }} />
                  <Bar dataKey="완료" fill={DONE_COLOR} radius={[4, 4, 0, 0]} />
                  <Bar dataKey="미완료" fill={TODO_COLOR} stroke="#c7d2fe" radius={[4, 4, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            )}
          </CardContent>
        </Card>

        {/* 미완료 내역 도넛 차트 */}
        <Card className="lg:col-span-2">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-semibold flex items-center gap-2">
              <AlertCircle className="w-4 h-4 text-amber-500" />
              미완료 내역
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="flex justify-around items-center h-full py-2">
              <DonutChart
                data={donutDataNoAttachment}
                label="첨부 미등록"
                color="#f59e0b"
              />
              <div className="h-24 w-px bg-border" />
              <DonutChart
                data={donutDataIncomplete}
                label="전체 미완료"
                color="#6366f1"
              />
            </div>
          </CardContent>
        </Card>
      </div>

      {/* 요약 통계 카드 */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        {[
          { label: "전체 업무", value: totalTasks, color: "text-primary", bg: "bg-primary/10" },
          { label: "완료", value: totalTasks - totalIncomplete, color: "text-emerald-600", bg: "bg-emerald-50 dark:bg-emerald-900/20" },
          { label: "미완료", value: totalIncomplete, color: "text-amber-600", bg: "bg-amber-50 dark:bg-amber-900/20" },
          { label: "첨부 미등록", value: totalNoAttachment, color: "text-red-500", bg: "bg-red-50 dark:bg-red-900/20" },
        ].map(({ label, value, color, bg }) => (
          <Card key={label} className="overflow-hidden">
            <CardContent className="p-3">
              <p className="text-xs text-muted-foreground">{label}</p>
              <p className={`text-2xl font-bold mt-1 ${color}`}>{value}</p>
              <div className={`h-1 mt-2 rounded-full ${bg}`} />
            </CardContent>
          </Card>
        ))}
      </div>

      {/* 상세 내역 테이블 */}
      <Card>
        <CardHeader className="pb-0">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <CardTitle className="text-sm font-semibold flex items-center gap-2">
              📋 상세 내역
            </CardTitle>
            <div className="flex items-center gap-2">
              {isEditor && selectedIds.size > 0 && (
                <Button
                  size="sm"
                  variant="outline"
                  className="h-8 text-xs gap-1"
                  onClick={() => setConfirmIds(Array.from(selectedIds))}
                  data-testid="button-confirm-status"
                >
                  <CheckCircle2 className="w-3.5 h-3.5" /> Confirm ({selectedIds.size})
                </Button>
              )}
              <div className="relative">
                <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-muted-foreground" />
                <Input
                  className="pl-8 h-8 w-48 text-xs"
                  placeholder="검색어를 입력하세요..."
                  value={search}
                  onChange={e => setSearch(e.target.value)}
                  data-testid="input-status-search"
                />
              </div>
            </div>
          </div>
        </CardHeader>
        <CardContent className="p-0 mt-3">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-y bg-muted/20">
                  {isEditor && (
                    <th className="w-10 px-3 py-2.5">
                      <Checkbox checked={allChecked} onCheckedChange={toggleAll} data-testid="checkbox-all-status" />
                    </th>
                  )}
                  <th className="px-3 py-2.5 text-left font-medium text-muted-foreground text-xs">분야</th>
                  <th className="px-3 py-2.5 text-left font-medium text-muted-foreground text-xs">본부</th>
                  <th className="px-3 py-2.5 text-left font-medium text-muted-foreground text-xs">팀</th>
                  <th className="px-3 py-2.5 text-left font-medium text-muted-foreground text-xs min-w-[180px]">업무명</th>
                  <th className="px-3 py-2.5 text-left font-medium text-muted-foreground text-xs whitespace-nowrap">시작일</th>
                  <th className="px-3 py-2.5 text-left font-medium text-muted-foreground text-xs whitespace-nowrap">종료일</th>
                  <th className="px-3 py-2.5 text-left font-medium text-muted-foreground text-xs">완료상태</th>
                  <th className="px-3 py-2.5 text-left font-medium text-muted-foreground text-xs">증빙자료</th>
                </tr>
              </thead>
              <tbody>
                {isLoading ? (
                  Array.from({ length: 5 }).map((_, i) => (
                    <tr key={i} className="border-b">
                      {Array.from({ length: 9 }).map((_, j) => (
                        <td key={j} className="px-3 py-3"><div className="h-4 bg-muted rounded animate-pulse" /></td>
                      ))}
                    </tr>
                  ))
                ) : filtered.length === 0 ? (
                  <tr>
                    <td colSpan={9} className="px-3 py-12 text-center text-muted-foreground text-sm">
                      데이터가 없습니다.
                    </td>
                  </tr>
                ) : (
                  filtered.map(t => (
                    <tr
                      key={t.id}
                      className="border-b hover:bg-muted/30 transition-colors"
                      data-testid={`status-row-${t.id}`}
                    >
                      {isEditor && (
                        <td className="px-3 py-3">
                          <Checkbox
                            checked={selectedIds.has(t.id)}
                            onCheckedChange={() => toggleOne(t.id)}
                            data-testid={`checkbox-status-${t.id}`}
                          />
                        </td>
                      )}
                      <td className="px-3 py-3">
                        <Badge
                          variant="secondary"
                          className="text-[10px]"
                          style={{ backgroundColor: `${FIELD_COLORS[t.field] || "#6366f1"}20`, color: FIELD_COLORS[t.field] || "#6366f1" }}
                        >
                          {t.field}
                        </Badge>
                      </td>
                      <td className="px-3 py-3 text-xs text-muted-foreground">{t.headquarters || "-"}</td>
                      <td className="px-3 py-3 text-xs text-muted-foreground">{t.department || "-"}</td>
                      <td className="px-3 py-3 max-w-[220px]">
                        <span className="text-xs sm:text-sm font-medium line-clamp-2">{t.title}</span>
                      </td>
                      <td className="px-3 py-3 text-xs text-muted-foreground whitespace-nowrap">{t.startDate}</td>
                      <td className="px-3 py-3 text-xs text-muted-foreground whitespace-nowrap">{t.endDate}</td>
                      <td className="px-3 py-3">
                        {t.status === "완료" ? (
                          <Badge className="bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-400 text-[10px] gap-1">
                            <CheckCircle2 className="w-3 h-3" /> 완료
                          </Badge>
                        ) : (
                          <Badge variant="outline" className="text-amber-600 border-amber-300 text-[10px]">미완료</Badge>
                        )}
                      </td>
                      <td className="px-3 py-3">
                        {t.attachmentUrl ? (
                          <a
                            href={t.attachmentUrl}
                            target="_blank"
                            rel="noopener noreferrer"
                            download={t.attachmentName || true}
                          >
                            <Button
                              size="sm"
                              variant="outline"
                              className="h-7 text-xs gap-1 text-primary border-primary/30 hover:bg-primary/10"
                              data-testid={`button-download-${t.id}`}
                            >
                              <Download className="w-3 h-3" />
                              다운로드
                            </Button>
                          </a>
                        ) : (
                          <span className="text-xs text-muted-foreground flex items-center gap-1">
                            <Paperclip className="w-3 h-3" /> 미등록
                          </span>
                        )}
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </CardContent>
      </Card>

      {/* Confirm 확인 */}
      <AlertDialog open={confirmIds.length > 0} onOpenChange={v => { if (!v) setConfirmIds([]); }}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>업무 완료 처리</AlertDialogTitle>
            <AlertDialogDescription>
              선택한 {confirmIds.length}개 업무를 완료 처리하시겠습니까?
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>취소</AlertDialogCancel>
            <AlertDialogAction onClick={() => bulkConfirmMutation.mutate(confirmIds)}>
              완료 처리
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
