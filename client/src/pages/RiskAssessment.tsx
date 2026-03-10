import { useQuery, useMutation } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Textarea } from "@/components/ui/textarea";
import { ShieldAlert, Plus, Trash2, Pencil } from "lucide-react";
import { useState, useMemo } from "react";
import { useToast } from "@/hooks/use-toast";
import { format } from "date-fns";
import { motion, AnimatePresence } from "framer-motion";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { usePermissions } from "@/hooks/use-permissions";
import type { RiskAssessment } from "@shared/schema";

const DEPARTMENTS = ["동대구운용팀", "서대구운용팀", "남대구운용팀", "포항운용팀", "안동운용팀", "구미운용팀", "문경운용팀"];
const HAZARD_TYPES = ["추락", "전도", "충돌", "협착", "감전", "화재/폭발", "기타"];
const ASSESSMENT_TABS = [
  { value: "상반기정기평가", label: "상반기 정기평가" },
  { value: "하반기정기평가", label: "하반기 정기평가" },
  { value: "수시평가", label: "수시평가" },
];

function getRiskLevel(score: number): string {
  if (score >= 15) return "매우높음";
  if (score >= 10) return "높음";
  if (score >= 6) return "중";
  if (score >= 3) return "낮음";
  return "저";
}

function getRiskBadgeVariant(level: string) {
  switch (level) {
    case "매우높음": return { className: "bg-red-600 text-white dark:bg-red-700" };
    case "높음": return { className: "bg-orange-500 text-white dark:bg-orange-600" };
    case "중": return { className: "bg-yellow-500 text-white dark:bg-yellow-600" };
    case "낮음": return { className: "bg-green-500 text-white dark:bg-green-600" };
    default: return { className: "bg-blue-500 text-white dark:bg-blue-600" };
  }
}

function getMatrixCellColor(score: number): string {
  if (score >= 15) return "bg-red-600 text-white";
  if (score >= 10) return "bg-orange-500 text-white";
  if (score >= 6) return "bg-yellow-400 text-black dark:text-black";
  if (score >= 3) return "bg-green-500 text-white";
  return "bg-blue-400 text-white";
}

interface FormState {
  title: string;
  department: string;
  process: string;
  hazard: string;
  hazardType: string;
  currentControls: string;
  frequency: number;
  severity: number;
  controlMeasures: string;
  assessor: string;
  assessmentDate: string;
}

const defaultForm: FormState = {
  title: "",
  department: "",
  process: "",
  hazard: "",
  hazardType: "",
  currentControls: "",
  frequency: 1,
  severity: 1,
  controlMeasures: "",
  assessor: "",
  assessmentDate: format(new Date(), "yyyy-MM-dd"),
};

export default function RiskAssessmentPage() {
  const { canEditRiskAssessment } = usePermissions();
  const { toast } = useToast();
  const [activeTab, setActiveTab] = useState("상반기정기평가");
  const [showForm, setShowForm] = useState(false);
  const [editingId, setEditingId] = useState<number | null>(null);
  const [form, setForm] = useState<FormState>(defaultForm);

  const { data: assessments, isLoading } = useQuery<RiskAssessment[]>({
    queryKey: [`/api/risk-assessments?type=${activeTab}`],
  });

  const createMutation = useMutation({
    mutationFn: (data: Record<string, unknown>) =>
      apiRequest("POST", "/api/risk-assessments", data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/risk-assessments"] });
      resetForm();
      toast({ title: "위험성평가가 등록되었습니다." });
    },
    onError: () => toast({ variant: "destructive", title: "등록 실패" }),
  });

  const updateMutation = useMutation({
    mutationFn: ({ id, data }: { id: number; data: Record<string, unknown> }) =>
      apiRequest("PUT", `/api/risk-assessments/${id}`, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/risk-assessments"] });
      resetForm();
      toast({ title: "위험성평가가 수정되었습니다." });
    },
    onError: () => toast({ variant: "destructive", title: "수정 실패" }),
  });

  const deleteMutation = useMutation({
    mutationFn: (id: number) =>
      apiRequest("DELETE", `/api/risk-assessments/${id}`),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/risk-assessments"] });
      toast({ title: "위험성평가가 삭제되었습니다." });
    },
    onError: () => toast({ variant: "destructive", title: "삭제 실패" }),
  });

  const resetForm = () => {
    setForm(defaultForm);
    setEditingId(null);
    setShowForm(false);
  };

  const riskScore = form.frequency * form.severity;
  const riskLevel = getRiskLevel(riskScore);

  const handleSubmit = () => {
    if (!form.title || !form.department || !form.hazard) {
      toast({ variant: "destructive", title: "평가명, 부서, 유해위험요인은 필수입니다." });
      return;
    }
    const payload = {
      ...form,
      assessmentType: activeTab,
      riskScore,
      riskLevel,
    };
    if (editingId) {
      updateMutation.mutate({ id: editingId, data: payload });
    } else {
      createMutation.mutate(payload);
    }
  };

  const handleEdit = (item: RiskAssessment) => {
    setForm({
      title: item.title,
      department: item.department,
      process: item.process || "",
      hazard: item.hazard,
      hazardType: item.hazardType || "",
      currentControls: item.currentControls || "",
      frequency: item.frequency,
      severity: item.severity,
      controlMeasures: item.controlMeasures || "",
      assessor: item.assessor || "",
      assessmentDate: item.assessmentDate,
    });
    setEditingId(item.id);
    setShowForm(true);
  };

  const handleDelete = (id: number) => {
    if (confirm("이 평가를 삭제하시겠습니까?")) {
      deleteMutation.mutate(id);
    }
  };

  const updateField = <K extends keyof FormState>(key: K, value: FormState[K]) => {
    setForm(prev => ({ ...prev, [key]: value }));
  };

  const riskStats = useMemo(() => {
    if (!assessments || assessments.length === 0) return null;
    const counts = { "매우높음": 0, "높음": 0, "중": 0, "낮음": 0, "저": 0 };
    for (const a of assessments) {
      const lvl = a.riskLevel as keyof typeof counts;
      if (lvl in counts) counts[lvl]++;
    }
    return counts;
  }, [assessments]);

  return (
    <div className="max-w-6xl mx-auto space-y-4 sm:space-y-6">
      <div className="flex items-center justify-between gap-2 flex-wrap">
        <div className="flex items-center gap-2 sm:gap-3">
          <div className="bg-red-100 p-2 sm:p-2.5 rounded-lg text-red-600 dark:bg-red-900/30 dark:text-red-400">
            <ShieldAlert className="w-5 h-5 sm:w-6 sm:h-6 md:w-8 md:h-8" />
          </div>
          <div>
            <h2 className="text-xl sm:text-2xl md:text-3xl font-display font-bold text-foreground">
              위험성평가
            </h2>
            <p className="text-xs sm:text-sm text-muted-foreground">KRAS 위험성평가 관리</p>
          </div>
        </div>
        {canEditRiskAssessment && (
          <Button
            onClick={() => {
              setForm(defaultForm);
              setEditingId(null);
              setShowForm(true);
            }}
            className="bg-red-600 text-white gap-2"
            data-testid="button-add-assessment"
          >
            <Plus className="w-4 h-4" />
            새 평가 등록
          </Button>
        )}
      </div>

      <Card>
        <CardHeader className="p-3 sm:p-4">
          <CardTitle className="text-sm sm:text-base">위험도 매트릭스 (빈도 × 강도)</CardTitle>
        </CardHeader>
        <CardContent className="p-3 sm:p-4 pt-0 overflow-x-auto">
          <table className="border-collapse mx-auto" data-testid="risk-matrix">
            <thead>
              <tr>
                <th className="p-1 sm:p-2 text-xs sm:text-sm text-muted-foreground border border-border">빈도\강도</th>
                {[1, 2, 3, 4, 5].map(s => (
                  <th key={s} className="p-1 sm:p-2 text-xs sm:text-sm text-center border border-border min-w-[40px] sm:min-w-[50px]">{s}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {[5, 4, 3, 2, 1].map(f => (
                <tr key={f}>
                  <td className="p-1 sm:p-2 text-xs sm:text-sm font-medium text-center border border-border">{f}</td>
                  {[1, 2, 3, 4, 5].map(s => {
                    const score = f * s;
                    return (
                      <td
                        key={s}
                        className={`p-1 sm:p-2 text-xs sm:text-sm font-bold text-center border border-border min-w-[40px] sm:min-w-[50px] ${getMatrixCellColor(score)}`}
                      >
                        {score}
                      </td>
                    );
                  })}
                </tr>
              ))}
            </tbody>
          </table>
          <div className="flex flex-wrap gap-2 sm:gap-3 mt-3 justify-center text-xs sm:text-sm">
            <span className="flex items-center gap-1"><span className="w-3 h-3 rounded-sm bg-red-600 inline-block" />매우높음(≥15)</span>
            <span className="flex items-center gap-1"><span className="w-3 h-3 rounded-sm bg-orange-500 inline-block" />높음(≥10)</span>
            <span className="flex items-center gap-1"><span className="w-3 h-3 rounded-sm bg-yellow-400 inline-block" />중(≥6)</span>
            <span className="flex items-center gap-1"><span className="w-3 h-3 rounded-sm bg-green-500 inline-block" />낮음(≥3)</span>
            <span className="flex items-center gap-1"><span className="w-3 h-3 rounded-sm bg-blue-400 inline-block" />저(&lt;3)</span>
          </div>
        </CardContent>
      </Card>

      <Tabs value={activeTab} onValueChange={setActiveTab}>
        <TabsList className="w-full" data-testid="tabs-assessment-type">
          {ASSESSMENT_TABS.map(tab => (
            <TabsTrigger key={tab.value} value={tab.value} className="flex-1" data-testid={`tab-${tab.value}`}>
              {tab.label}
            </TabsTrigger>
          ))}
        </TabsList>

        {ASSESSMENT_TABS.map(tab => (
          <TabsContent key={tab.value} value={tab.value} className="space-y-4 mt-4">
            {riskStats && (
              <div className="flex flex-wrap gap-2">
                {(Object.entries(riskStats) as [string, number][]).map(([level, count]) => (
                  <Badge key={level} className={`${getRiskBadgeVariant(level).className} no-default-hover-elevate no-default-active-elevate`} data-testid={`stat-${level}`}>
                    {level}: {count}건
                  </Badge>
                ))}
              </div>
            )}

            {isLoading ? (
              <div className="text-center py-8 text-muted-foreground">로딩 중...</div>
            ) : !assessments || assessments.length === 0 ? (
              <Card>
                <CardContent className="py-12 text-center text-muted-foreground">
                  등록된 평가가 없습니다.
                </CardContent>
              </Card>
            ) : (
              <Card>
                <CardContent className="p-0 overflow-x-auto">
                  <Table data-testid="table-assessments">
                    <TableHeader>
                      <TableRow>
                        <TableHead className="min-w-[50px]">No</TableHead>
                        <TableHead className="min-w-[120px]">평가명</TableHead>
                        <TableHead className="min-w-[100px]">부서</TableHead>
                        <TableHead className="min-w-[100px]">공정/작업</TableHead>
                        <TableHead className="min-w-[120px]">유해위험요인</TableHead>
                        <TableHead className="min-w-[80px]">위험유형</TableHead>
                        <TableHead className="min-w-[50px]">빈도</TableHead>
                        <TableHead className="min-w-[50px]">강도</TableHead>
                        <TableHead className="min-w-[60px]">위험도</TableHead>
                        <TableHead className="min-w-[80px]">위험등급</TableHead>
                        <TableHead className="min-w-[80px]">평가자</TableHead>
                        <TableHead className="min-w-[90px]">평가일</TableHead>
                        {canEditRiskAssessment && <TableHead className="min-w-[80px]">관리</TableHead>}
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      <AnimatePresence>
                        {assessments.map((item, idx) => (
                          <motion.tr
                            key={item.id}
                            initial={{ opacity: 0, y: 10 }}
                            animate={{ opacity: 1, y: 0 }}
                            exit={{ opacity: 0, y: -10 }}
                            className="border-b border-border"
                            data-testid={`row-assessment-${item.id}`}
                          >
                            <TableCell className="text-sm">{idx + 1}</TableCell>
                            <TableCell className="text-sm font-medium">{item.title}</TableCell>
                            <TableCell className="text-sm">{item.department}</TableCell>
                            <TableCell className="text-sm">{item.process || "-"}</TableCell>
                            <TableCell className="text-sm">{item.hazard}</TableCell>
                            <TableCell className="text-sm">{item.hazardType || "-"}</TableCell>
                            <TableCell className="text-sm text-center">{item.frequency}</TableCell>
                            <TableCell className="text-sm text-center">{item.severity}</TableCell>
                            <TableCell className="text-sm text-center font-bold">{item.riskScore}</TableCell>
                            <TableCell>
                              <Badge className={`${getRiskBadgeVariant(item.riskLevel).className} no-default-hover-elevate no-default-active-elevate`} data-testid={`badge-risk-${item.id}`}>
                                {item.riskLevel}
                              </Badge>
                            </TableCell>
                            <TableCell className="text-sm">{item.assessor || "-"}</TableCell>
                            <TableCell className="text-sm">{item.assessmentDate}</TableCell>
                            {canEditRiskAssessment && (
                              <TableCell>
                                <div className="flex gap-1">
                                  <Button
                                    variant="ghost"
                                    size="icon"
                                    onClick={() => handleEdit(item)}
                                    data-testid={`button-edit-${item.id}`}
                                  >
                                    <Pencil className="w-4 h-4" />
                                  </Button>
                                  <Button
                                    variant="ghost"
                                    size="icon"
                                    onClick={() => handleDelete(item.id)}
                                    data-testid={`button-delete-${item.id}`}
                                  >
                                    <Trash2 className="w-4 h-4 text-red-500" />
                                  </Button>
                                </div>
                              </TableCell>
                            )}
                          </motion.tr>
                        ))}
                      </AnimatePresence>
                    </TableBody>
                  </Table>
                </CardContent>
              </Card>
            )}
          </TabsContent>
        ))}
      </Tabs>

      <Dialog open={showForm} onOpenChange={(open) => { if (!open) resetForm(); }}>
        <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle data-testid="dialog-title">
              {editingId ? "위험성평가 수정" : "새 위험성평가 등록"}
            </DialogTitle>
          </DialogHeader>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label>평가명 *</Label>
              <Input
                value={form.title}
                onChange={e => updateField("title", e.target.value)}
                placeholder="평가명을 입력하세요"
                data-testid="input-title"
              />
            </div>

            <div className="space-y-2">
              <Label>평가유형</Label>
              <Input
                value={ASSESSMENT_TABS.find(t => t.value === activeTab)?.label || activeTab}
                disabled
                data-testid="input-assessment-type"
              />
            </div>

            <div className="space-y-2">
              <Label>부서 *</Label>
              <Select value={form.department} onValueChange={v => updateField("department", v)}>
                <SelectTrigger data-testid="select-department">
                  <SelectValue placeholder="부서 선택" />
                </SelectTrigger>
                <SelectContent>
                  {DEPARTMENTS.map(d => (
                    <SelectItem key={d} value={d}>{d}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-2">
              <Label>공정/작업</Label>
              <Input
                value={form.process}
                onChange={e => updateField("process", e.target.value)}
                placeholder="공정 또는 작업명"
                data-testid="input-process"
              />
            </div>

            <div className="sm:col-span-2 space-y-2">
              <Label>유해위험요인 *</Label>
              <Input
                value={form.hazard}
                onChange={e => updateField("hazard", e.target.value)}
                placeholder="유해위험요인을 입력하세요"
                data-testid="input-hazard"
              />
            </div>

            <div className="space-y-2">
              <Label>위험유형</Label>
              <Select value={form.hazardType} onValueChange={v => updateField("hazardType", v)}>
                <SelectTrigger data-testid="select-hazard-type">
                  <SelectValue placeholder="위험유형 선택" />
                </SelectTrigger>
                <SelectContent>
                  {HAZARD_TYPES.map(t => (
                    <SelectItem key={t} value={t}>{t}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="sm:col-span-2 space-y-2">
              <Label>현재 안전조치</Label>
              <Textarea
                value={form.currentControls}
                onChange={e => updateField("currentControls", e.target.value)}
                placeholder="현재 시행 중인 안전조치"
                data-testid="input-current-controls"
              />
            </div>

            <div className="space-y-2">
              <Label>빈도 (1~5)</Label>
              <Select value={String(form.frequency)} onValueChange={v => updateField("frequency", Number(v))}>
                <SelectTrigger data-testid="select-frequency">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {[1, 2, 3, 4, 5].map(n => (
                    <SelectItem key={n} value={String(n)}>{n}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-2">
              <Label>강도 (1~5)</Label>
              <Select value={String(form.severity)} onValueChange={v => updateField("severity", Number(v))}>
                <SelectTrigger data-testid="select-severity">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {[1, 2, 3, 4, 5].map(n => (
                    <SelectItem key={n} value={String(n)}>{n}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-2">
              <Label>위험도 (자동계산)</Label>
              <div className="flex items-center gap-2">
                <Input value={riskScore} disabled data-testid="input-risk-score" />
                <Badge className={`${getRiskBadgeVariant(riskLevel).className} no-default-hover-elevate no-default-active-elevate shrink-0`}>
                  {riskLevel}
                </Badge>
              </div>
            </div>

            <div className="sm:col-span-2 space-y-2">
              <Label>개선대책</Label>
              <Textarea
                value={form.controlMeasures}
                onChange={e => updateField("controlMeasures", e.target.value)}
                placeholder="개선대책을 입력하세요"
                data-testid="input-control-measures"
              />
            </div>

            <div className="space-y-2">
              <Label>평가자</Label>
              <Input
                value={form.assessor}
                onChange={e => updateField("assessor", e.target.value)}
                placeholder="평가자 이름"
                data-testid="input-assessor"
              />
            </div>

            <div className="space-y-2">
              <Label>평가일</Label>
              <Input
                type="date"
                value={form.assessmentDate}
                onChange={e => updateField("assessmentDate", e.target.value)}
                data-testid="input-assessment-date"
              />
            </div>
          </div>

          <DialogFooter className="gap-2">
            <Button variant="outline" onClick={resetForm} data-testid="button-cancel">
              취소
            </Button>
            <Button
              onClick={handleSubmit}
              disabled={createMutation.isPending || updateMutation.isPending}
              className="bg-red-600 text-white"
              data-testid="button-submit"
            >
              {editingId ? "수정" : "등록"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
