import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { apiRequest } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { usePermissions } from "@/hooks/use-permissions";
import { motion, AnimatePresence } from "framer-motion";
import { format } from "date-fns";
import type { AccidentReport } from "@shared/schema";

import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { AlertTriangle, BarChart3, Plus, Pencil, Trash2 } from "lucide-react";
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Legend,
  ResponsiveContainer, LineChart, Line,
} from "recharts";

const ACCIDENT_TYPES = ["추락", "전도", "충돌", "협착", "감전", "화재/폭발", "교통사고", "기타"];
const CAUSES = ["불안전한 행동", "불안전한 상태", "관리적 요인", "환경적 요인", "기타"];
const SEVERITIES = ["경미", "보통", "중대", "사망"];
const STATUSES = ["접수", "조사중", "조치완료", "종결"];
const DEPARTMENTS = ["동대구운용팀", "서대구운용팀", "남대구운용팀", "포항운용팀", "안동운용팀", "구미운용팀", "문경운용팀", "운용지원팀", "운용계획팀", "사업지원팀", "현장경영팀", "공공망관제팀"];

const SEVERITY_COLORS: Record<string, string> = {
  "경미": "bg-green-100 text-green-700 border-green-200 dark:bg-green-900/30 dark:text-green-400",
  "보통": "bg-yellow-100 text-yellow-700 border-yellow-200 dark:bg-yellow-900/30 dark:text-yellow-400",
  "중대": "bg-orange-100 text-orange-700 border-orange-200 dark:bg-orange-900/30 dark:text-orange-400",
  "사망": "bg-red-100 text-red-700 border-red-200 dark:bg-red-900/30 dark:text-red-400",
};

const STATUS_COLORS: Record<string, string> = {
  "접수": "bg-gray-100 text-gray-700 border-gray-200 dark:bg-gray-900/30 dark:text-gray-400",
  "조사중": "bg-blue-100 text-blue-700 border-blue-200 dark:bg-blue-900/30 dark:text-blue-400",
  "조치완료": "bg-green-100 text-green-700 border-green-200 dark:bg-green-900/30 dark:text-green-400",
  "종결": "bg-slate-100 text-slate-700 border-slate-200 dark:bg-slate-900/30 dark:text-slate-400",
};

const CHART_COLORS = ["#6366f1", "#ec4899", "#f59e0b", "#10b981", "#8b5cf6", "#06b6d4", "#f97316", "#14b8a6"];

interface StatsData {
  total: number;
  byType: Record<string, number>;
  byCause: Record<string, number>;
  byDepartment: Record<string, number>;
  bySeverity: Record<string, number>;
  byMonth: Record<string, number>;
}

const emptyForm = {
  title: "",
  occurredAt: "",
  accidentType: "",
  cause: "",
  severity: "",
  department: "",
  location: "",
  description: "",
  injuredPerson: "",
  correctiveActions: "",
  preventiveMeasures: "",
  status: "접수",
};

export default function AccidentReports() {
  const queryClient = useQueryClient();
  const { toast } = useToast();
  const { isAdmin, role } = usePermissions();
  const canEdit = isAdmin || role === "manager";

  const [dialogOpen, setDialogOpen] = useState(false);
  const [editingId, setEditingId] = useState<number | null>(null);
  const [form, setForm] = useState({ ...emptyForm });

  const { data: reports = [], isLoading } = useQuery<AccidentReport[]>({
    queryKey: ["/api/accidents"],
  });

  const { data: stats } = useQuery<StatsData>({
    queryKey: ["/api/accidents/stats"],
  });

  const createMutation = useMutation({
    mutationFn: (data: typeof emptyForm) => apiRequest("POST", "/api/accidents", data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/accidents"] });
      queryClient.invalidateQueries({ queryKey: ["/api/accidents/stats"] });
      toast({ title: "사고보고가 등록되었습니다." });
      closeDialog();
    },
    onError: () => toast({ variant: "destructive", title: "등록에 실패했습니다." }),
  });

  const updateMutation = useMutation({
    mutationFn: ({ id, data }: { id: number; data: typeof emptyForm }) => apiRequest("PUT", `/api/accidents/${id}`, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/accidents"] });
      queryClient.invalidateQueries({ queryKey: ["/api/accidents/stats"] });
      toast({ title: "사고보고가 수정되었습니다." });
      closeDialog();
    },
    onError: () => toast({ variant: "destructive", title: "수정에 실패했습니다." }),
  });

  const deleteMutation = useMutation({
    mutationFn: (id: number) => apiRequest("DELETE", `/api/accidents/${id}`),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/accidents"] });
      queryClient.invalidateQueries({ queryKey: ["/api/accidents/stats"] });
      toast({ title: "사고보고가 삭제되었습니다." });
    },
    onError: () => toast({ variant: "destructive", title: "삭제에 실패했습니다." }),
  });

  const closeDialog = () => {
    setDialogOpen(false);
    setEditingId(null);
    setForm({ ...emptyForm });
  };

  const openCreate = () => {
    setEditingId(null);
    setForm({ ...emptyForm });
    setDialogOpen(true);
  };

  const openEdit = (report: AccidentReport) => {
    setEditingId(report.id);
    setForm({
      title: report.title,
      occurredAt: report.occurredAt,
      accidentType: report.accidentType,
      cause: report.cause,
      severity: report.severity,
      department: report.department,
      location: report.location || "",
      description: report.description,
      injuredPerson: report.injuredPerson || "",
      correctiveActions: report.correctiveActions || "",
      preventiveMeasures: report.preventiveMeasures || "",
      status: report.status,
    });
    setDialogOpen(true);
  };

  const handleSubmit = () => {
    if (!form.title || !form.occurredAt || !form.accidentType || !form.cause || !form.severity || !form.department || !form.description) {
      toast({ variant: "destructive", title: "필수 항목을 모두 입력해주세요." });
      return;
    }
    if (editingId) {
      updateMutation.mutate({ id: editingId, data: form });
    } else {
      createMutation.mutate(form);
    }
  };

  const handleDelete = (id: number) => {
    if (confirm("이 사고보고를 삭제하시겠습니까?")) {
      deleteMutation.mutate(id);
    }
  };

  const setField = (key: string, value: string) => setForm(prev => ({ ...prev, [key]: value }));

  const toChartData = (record: Record<string, number> | undefined) =>
    record ? Object.entries(record).map(([name, value]) => ({ name, value })) : [];

  const monthlyData = stats?.byMonth
    ? Object.entries(stats.byMonth)
        .sort(([a], [b]) => a.localeCompare(b))
        .map(([name, value]) => ({ name, value }))
    : [];

  return (
    <div className="max-w-6xl mx-auto space-y-6">
      <div className="flex items-center gap-4 flex-wrap">
        <div className="flex items-center gap-3">
          <div className="bg-red-100 p-2 rounded-xl text-red-600 dark:bg-red-900/30 dark:text-red-400">
            <AlertTriangle className="w-8 h-8" />
          </div>
          <div>
            <h2 className="text-2xl md:text-3xl font-display font-bold text-foreground" data-testid="text-page-title">사고보고 & 통계</h2>
            <p className="text-muted-foreground text-sm mt-1">사고 현황 관리 및 통계 분석</p>
          </div>
        </div>
      </div>

      <Tabs defaultValue="statistics" className="space-y-4">
        <TabsList data-testid="tabs-accident">
          <TabsTrigger value="statistics" data-testid="tab-statistics">
            <BarChart3 className="w-4 h-4 mr-1.5" />
            통계 분석
          </TabsTrigger>
          <TabsTrigger value="management" data-testid="tab-management">
            <AlertTriangle className="w-4 h-4 mr-1.5" />
            사고 관리
          </TabsTrigger>
        </TabsList>

        <TabsContent value="management">
          <AnimatePresence mode="wait">
            <motion.div
              key="management"
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -10 }}
              className="space-y-4"
            >
              {canEdit && (
                <div className="flex justify-end">
                  <Button onClick={openCreate} data-testid="button-add-accident">
                    <Plus className="w-4 h-4 mr-1.5" />
                    사고보고 등록
                  </Button>
                </div>
              )}

              <Card>
                <CardContent className="p-0">
                  {isLoading ? (
                    <div className="flex items-center justify-center h-40">
                      <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary" />
                    </div>
                  ) : reports.length === 0 ? (
                    <div className="flex flex-col items-center justify-center h-40 text-muted-foreground">
                      <AlertTriangle className="w-10 h-10 mb-2 opacity-30" />
                      <p>등록된 사고보고가 없습니다.</p>
                    </div>
                  ) : (
                    <div className="overflow-x-auto">
                      <Table>
                        <TableHeader>
                          <TableRow>
                            <TableHead className="min-w-[150px]">제목</TableHead>
                            <TableHead className="min-w-[100px]">발생일</TableHead>
                            <TableHead>유형</TableHead>
                            <TableHead>원인</TableHead>
                            <TableHead>심각도</TableHead>
                            <TableHead>부서</TableHead>
                            <TableHead>상태</TableHead>
                            {canEdit && <TableHead className="w-[80px]" />}
                          </TableRow>
                        </TableHeader>
                        <TableBody>
                          {reports.map((report) => (
                            <TableRow key={report.id} data-testid={`row-accident-${report.id}`}>
                              <TableCell className="font-medium" data-testid={`text-title-${report.id}`}>{report.title}</TableCell>
                              <TableCell data-testid={`text-date-${report.id}`}>
                                {report.occurredAt ? format(new Date(report.occurredAt), "yyyy-MM-dd") : "-"}
                              </TableCell>
                              <TableCell data-testid={`text-type-${report.id}`}>{report.accidentType}</TableCell>
                              <TableCell data-testid={`text-cause-${report.id}`}>{report.cause}</TableCell>
                              <TableCell>
                                <Badge variant="outline" className={SEVERITY_COLORS[report.severity] || ""} data-testid={`badge-severity-${report.id}`}>
                                  {report.severity}
                                </Badge>
                              </TableCell>
                              <TableCell data-testid={`text-dept-${report.id}`}>{report.department}</TableCell>
                              <TableCell>
                                <Badge variant="outline" className={STATUS_COLORS[report.status] || ""} data-testid={`badge-status-${report.id}`}>
                                  {report.status}
                                </Badge>
                              </TableCell>
                              {canEdit && (
                                <TableCell>
                                  <div className="flex items-center gap-1">
                                    <Button variant="ghost" size="icon" onClick={() => openEdit(report)} data-testid={`button-edit-${report.id}`}>
                                      <Pencil className="w-4 h-4" />
                                    </Button>
                                    <Button variant="ghost" size="icon" onClick={() => handleDelete(report.id)} data-testid={`button-delete-${report.id}`}>
                                      <Trash2 className="w-4 h-4 text-red-500" />
                                    </Button>
                                  </div>
                                </TableCell>
                              )}
                            </TableRow>
                          ))}
                        </TableBody>
                      </Table>
                    </div>
                  )}
                </CardContent>
              </Card>
            </motion.div>
          </AnimatePresence>
        </TabsContent>

        <TabsContent value="statistics">
          <AnimatePresence mode="wait">
            <motion.div
              key="statistics"
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -10 }}
              className="space-y-6"
            >
              <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
                <Card data-testid="card-stat-total">
                  <CardContent className="p-4 text-center">
                    <p className="text-sm text-muted-foreground">전체 사고</p>
                    <p className="text-2xl font-bold">{stats?.total ?? 0}</p>
                  </CardContent>
                </Card>
                {SEVERITIES.map((sev) => (
                  <Card key={sev} data-testid={`card-stat-${sev}`}>
                    <CardContent className="p-4 text-center">
                      <p className="text-sm text-muted-foreground">{sev}</p>
                      <p className="text-2xl font-bold">{stats?.bySeverity?.[sev] ?? 0}</p>
                    </CardContent>
                  </Card>
                ))}
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <Card>
                  <CardHeader className="pb-2">
                    <CardTitle className="text-base">사고유형별 발생건수</CardTitle>
                  </CardHeader>
                  <CardContent>
                    <div className="h-[250px]">
                      <ResponsiveContainer width="100%" height="100%">
                        <BarChart data={toChartData(stats?.byType)} margin={{ top: 20, right: 10, left: -10, bottom: 5 }}>
                          <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#e2e8f0" opacity={0.4} />
                          <XAxis dataKey="name" tick={{ fontSize: 11 }} interval={0} angle={-20} textAnchor="end" height={50} axisLine={false} tickLine={false} />
                          <YAxis allowDecimals={false} tick={{ fontSize: 11 }} axisLine={false} tickLine={false} />
                          <Tooltip content={({ active, payload }) => {
                            if (active && payload && payload.length) {
                              return (
                                <div style={{ background: 'rgba(255,255,255,0.95)', backdropFilter: 'blur(8px)', border: '1px solid rgba(0,0,0,0.08)', borderRadius: 12, padding: '10px 14px', boxShadow: '0 8px 32px rgba(0,0,0,0.08)', fontSize: 12 }}>
                                  <p style={{ fontWeight: 600, marginBottom: 2 }}>{payload[0].payload.name}</p>
                                  <p style={{ color: '#64748b' }}>{payload[0].value}건</p>
                                </div>
                              );
                            }
                            return null;
                          }} />
                          <Bar dataKey="value" name="건수" fill={CHART_COLORS[0]} radius={[6, 6, 0, 0]} maxBarSize={40} animationDuration={800} label={{ position: 'top', fontSize: 10, fontWeight: 600, fill: '#64748b' }} />
                        </BarChart>
                      </ResponsiveContainer>
                    </div>
                  </CardContent>
                </Card>

                <Card>
                  <CardHeader className="pb-2">
                    <CardTitle className="text-base">원인별 발생건수</CardTitle>
                  </CardHeader>
                  <CardContent>
                    <div className="h-[250px]">
                      <ResponsiveContainer width="100%" height="100%">
                        <BarChart data={toChartData(stats?.byCause)} margin={{ top: 20, right: 10, left: -10, bottom: 5 }}>
                          <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#e2e8f0" opacity={0.4} />
                          <XAxis dataKey="name" tick={{ fontSize: 11 }} interval={0} angle={-20} textAnchor="end" height={50} axisLine={false} tickLine={false} />
                          <YAxis allowDecimals={false} tick={{ fontSize: 11 }} axisLine={false} tickLine={false} />
                          <Tooltip content={({ active, payload }) => {
                            if (active && payload && payload.length) {
                              return (
                                <div style={{ background: 'rgba(255,255,255,0.95)', backdropFilter: 'blur(8px)', border: '1px solid rgba(0,0,0,0.08)', borderRadius: 12, padding: '10px 14px', boxShadow: '0 8px 32px rgba(0,0,0,0.08)', fontSize: 12 }}>
                                  <p style={{ fontWeight: 600, marginBottom: 2 }}>{payload[0].payload.name}</p>
                                  <p style={{ color: '#64748b' }}>{payload[0].value}건</p>
                                </div>
                              );
                            }
                            return null;
                          }} />
                          <Bar dataKey="value" name="건수" fill={CHART_COLORS[1]} radius={[6, 6, 0, 0]} maxBarSize={40} animationDuration={800} label={{ position: 'top', fontSize: 10, fontWeight: 600, fill: '#64748b' }} />
                        </BarChart>
                      </ResponsiveContainer>
                    </div>
                  </CardContent>
                </Card>

                <Card>
                  <CardHeader className="pb-2">
                    <CardTitle className="text-base">부서별 발생건수</CardTitle>
                  </CardHeader>
                  <CardContent>
                    <div className="h-[250px]">
                      <ResponsiveContainer width="100%" height="100%">
                        <BarChart data={toChartData(stats?.byDepartment)} margin={{ top: 20, right: 10, left: -10, bottom: 5 }}>
                          <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#e2e8f0" opacity={0.4} />
                          <XAxis dataKey="name" tick={{ fontSize: 11 }} interval={0} angle={-20} textAnchor="end" height={50} axisLine={false} tickLine={false} />
                          <YAxis allowDecimals={false} tick={{ fontSize: 11 }} axisLine={false} tickLine={false} />
                          <Tooltip content={({ active, payload }) => {
                            if (active && payload && payload.length) {
                              return (
                                <div style={{ background: 'rgba(255,255,255,0.95)', backdropFilter: 'blur(8px)', border: '1px solid rgba(0,0,0,0.08)', borderRadius: 12, padding: '10px 14px', boxShadow: '0 8px 32px rgba(0,0,0,0.08)', fontSize: 12 }}>
                                  <p style={{ fontWeight: 600, marginBottom: 2 }}>{payload[0].payload.name}</p>
                                  <p style={{ color: '#64748b' }}>{payload[0].value}건</p>
                                </div>
                              );
                            }
                            return null;
                          }} />
                          <Bar dataKey="value" name="건수" fill={CHART_COLORS[4]} radius={[6, 6, 0, 0]} maxBarSize={40} animationDuration={800} label={{ position: 'top', fontSize: 10, fontWeight: 600, fill: '#64748b' }} />
                        </BarChart>
                      </ResponsiveContainer>
                    </div>
                  </CardContent>
                </Card>

                <Card>
                  <CardHeader className="pb-2">
                    <CardTitle className="text-base">심각도별 발생건수</CardTitle>
                  </CardHeader>
                  <CardContent>
                    <div className="h-[250px]">
                      <ResponsiveContainer width="100%" height="100%">
                        <BarChart data={toChartData(stats?.bySeverity)} margin={{ top: 20, right: 10, left: -10, bottom: 5 }}>
                          <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#e2e8f0" opacity={0.4} />
                          <XAxis dataKey="name" tick={{ fontSize: 11 }} interval={0} axisLine={false} tickLine={false} />
                          <YAxis allowDecimals={false} tick={{ fontSize: 11 }} axisLine={false} tickLine={false} />
                          <Tooltip content={({ active, payload }) => {
                            if (active && payload && payload.length) {
                              return (
                                <div style={{ background: 'rgba(255,255,255,0.95)', backdropFilter: 'blur(8px)', border: '1px solid rgba(0,0,0,0.08)', borderRadius: 12, padding: '10px 14px', boxShadow: '0 8px 32px rgba(0,0,0,0.08)', fontSize: 12 }}>
                                  <p style={{ fontWeight: 600, marginBottom: 2 }}>{payload[0].payload.name}</p>
                                  <p style={{ color: '#64748b' }}>{payload[0].value}건</p>
                                </div>
                              );
                            }
                            return null;
                          }} />
                          <Bar dataKey="value" name="건수" fill={CHART_COLORS[2]} radius={[6, 6, 0, 0]} maxBarSize={40} animationDuration={800} label={{ position: 'top', fontSize: 10, fontWeight: 600, fill: '#64748b' }} />
                        </BarChart>
                      </ResponsiveContainer>
                    </div>
                  </CardContent>
                </Card>
              </div>

              <Card>
                <CardHeader className="pb-2">
                  <CardTitle className="text-base">월별 사고 추이</CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="h-[280px]">
                    <ResponsiveContainer width="100%" height="100%">
                      <LineChart data={monthlyData} margin={{ top: 5, right: 20, left: -10, bottom: 5 }}>
                        <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" opacity={0.4} />
                        <XAxis dataKey="name" tick={{ fontSize: 11 }} axisLine={false} tickLine={false} />
                        <YAxis allowDecimals={false} tick={{ fontSize: 11 }} axisLine={false} tickLine={false} />
                        <Tooltip content={({ active, payload }) => {
                          if (active && payload && payload.length) {
                            return (
                              <div style={{ background: 'rgba(255,255,255,0.95)', backdropFilter: 'blur(8px)', border: '1px solid rgba(0,0,0,0.08)', borderRadius: 12, padding: '10px 14px', boxShadow: '0 8px 32px rgba(0,0,0,0.08)', fontSize: 12 }}>
                                <p style={{ fontWeight: 600, marginBottom: 2 }}>{payload[0].payload.name}</p>
                                <p style={{ color: '#64748b' }}>{payload[0].value}건</p>
                              </div>
                            );
                          }
                          return null;
                        }} />
                        <Legend />
                        <Line type="monotone" dataKey="value" name="사고건수" stroke="#6366f1" strokeWidth={2.5} dot={{ r: 5, fill: '#6366f1', strokeWidth: 2, stroke: '#fff' }} activeDot={{ r: 7, fill: '#6366f1', strokeWidth: 2, stroke: '#fff' }} />
                      </LineChart>
                    </ResponsiveContainer>
                  </div>
                </CardContent>
              </Card>
            </motion.div>
          </AnimatePresence>
        </TabsContent>
      </Tabs>

      <Dialog open={dialogOpen} onOpenChange={(open) => { if (!open) closeDialog(); }}>
        <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>{editingId ? "사고보고 수정" : "사고보고 등록"}</DialogTitle>
          </DialogHeader>
          <div className="grid gap-4 py-4">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label>제목 *</Label>
                <Input value={form.title} onChange={(e) => setField("title", e.target.value)} placeholder="사고 제목" data-testid="input-title" />
              </div>
              <div className="space-y-2">
                <Label>발생일시 *</Label>
                <Input type="datetime-local" value={form.occurredAt} onChange={(e) => setField("occurredAt", e.target.value)} data-testid="input-occurred-at" />
              </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label>사고유형 *</Label>
                <Select value={form.accidentType} onValueChange={(v) => setField("accidentType", v)}>
                  <SelectTrigger data-testid="select-accident-type"><SelectValue placeholder="선택" /></SelectTrigger>
                  <SelectContent>
                    {ACCIDENT_TYPES.map((t) => <SelectItem key={t} value={t}>{t}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label>사고원인 *</Label>
                <Select value={form.cause} onValueChange={(v) => setField("cause", v)}>
                  <SelectTrigger data-testid="select-cause"><SelectValue placeholder="선택" /></SelectTrigger>
                  <SelectContent>
                    {CAUSES.map((c) => <SelectItem key={c} value={c}>{c}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <div className="space-y-2">
                <Label>심각도 *</Label>
                <Select value={form.severity} onValueChange={(v) => setField("severity", v)}>
                  <SelectTrigger data-testid="select-severity"><SelectValue placeholder="선택" /></SelectTrigger>
                  <SelectContent>
                    {SEVERITIES.map((s) => <SelectItem key={s} value={s}>{s}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label>부서 *</Label>
                <Select value={form.department} onValueChange={(v) => setField("department", v)}>
                  <SelectTrigger data-testid="select-department"><SelectValue placeholder="선택" /></SelectTrigger>
                  <SelectContent>
                    {DEPARTMENTS.map((d) => <SelectItem key={d} value={d}>{d}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label>상태</Label>
                <Select value={form.status} onValueChange={(v) => setField("status", v)}>
                  <SelectTrigger data-testid="select-status"><SelectValue placeholder="선택" /></SelectTrigger>
                  <SelectContent>
                    {STATUSES.map((s) => <SelectItem key={s} value={s}>{s}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label>사고장소</Label>
                <Input value={form.location} onChange={(e) => setField("location", e.target.value)} placeholder="사고 발생 장소" data-testid="input-location" />
              </div>
              <div className="space-y-2">
                <Label>피해자</Label>
                <Input value={form.injuredPerson} onChange={(e) => setField("injuredPerson", e.target.value)} placeholder="피해자 이름" data-testid="input-injured" />
              </div>
            </div>

            <div className="space-y-2">
              <Label>사고내용 *</Label>
              <Textarea value={form.description} onChange={(e) => setField("description", e.target.value)} placeholder="사고 상세 내용을 입력하세요" rows={3} data-testid="input-description" />
            </div>

            <div className="space-y-2">
              <Label>시정조치</Label>
              <Textarea value={form.correctiveActions} onChange={(e) => setField("correctiveActions", e.target.value)} placeholder="시정조치 내용" rows={2} data-testid="input-corrective" />
            </div>

            <div className="space-y-2">
              <Label>예방대책</Label>
              <Textarea value={form.preventiveMeasures} onChange={(e) => setField("preventiveMeasures", e.target.value)} placeholder="예방대책 내용" rows={2} data-testid="input-preventive" />
            </div>
          </div>

          <DialogFooter className="gap-2">
            <Button variant="outline" onClick={closeDialog} data-testid="button-cancel">취소</Button>
            <Button onClick={handleSubmit} disabled={createMutation.isPending || updateMutation.isPending} data-testid="button-submit">
              {(createMutation.isPending || updateMutation.isPending) ? "처리중..." : editingId ? "수정" : "등록"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
