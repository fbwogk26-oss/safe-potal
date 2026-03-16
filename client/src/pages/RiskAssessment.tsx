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
import { ShieldAlert, Plus, Trash2, Pencil, Camera, X } from "lucide-react";
import { useState, useMemo, useRef } from "react";
import { useToast } from "@/hooks/use-toast";
import { format } from "date-fns";
import { motion, AnimatePresence } from "framer-motion";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { usePermissions } from "@/hooks/use-permissions";
import { useAuth } from "@/hooks/use-auth";
import type { RiskAssessment } from "@shared/schema";

const DEPARTMENTS = ["동대구운용팀", "서대구운용팀", "남대구운용팀", "포항운용팀", "안동운용팀", "구미운용팀", "문경운용팀", "운용지원팀", "운용계획팀", "사업지원팀", "현장경영팀", "공공망관제팀"];
const HAZARD_TYPES = ["추락", "전도", "충돌", "협착", "감전", "화재/폭발", "기타"];
const ASSESSMENT_TABS = [
  { value: "상반기정기평가", label: "상반기 정기평가" },
  { value: "하반기정기평가", label: "하반기 정기평가" },
  { value: "수시평가", label: "수시평가" },
];

const PROBABILITY_LABELS: Record<number, string> = {
  1: "매우낮음", 2: "낮음", 3: "보통", 4: "높음", 5: "매우높음",
};
const CRITICALITY_LABELS: Record<number, string> = {
  1: "비치료", 2: "휴업불필요", 3: "휴업필요", 4: "사망",
};

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

interface RiskItem {
  process: string;
  hazard: string;
  hazardType: string;
  currentControls: string;
  probability: number;
  criticality: number;
  controlMeasures: string;
  beforePhotoUrl: string;
  afterPhotoUrl: string;
}

const defaultItem = (): RiskItem => ({
  process: "",
  hazard: "",
  hazardType: "",
  currentControls: "",
  probability: 1,
  criticality: 1,
  controlMeasures: "",
  beforePhotoUrl: "",
  afterPhotoUrl: "",
});

interface FormHeader {
  title: string;
  department: string;
  assessor: string;
  assessmentDate: string;
}

export default function RiskAssessmentPage() {
  const { canEditRiskAssessment } = usePermissions();
  const { user } = useAuth();
  const { toast } = useToast();
  const [activeTab, setActiveTab] = useState("상반기정기평가");
  const [showForm, setShowForm] = useState(false);
  const [editingId, setEditingId] = useState<number | null>(null);
  const [header, setHeader] = useState<FormHeader>({
    title: "",
    department: "",
    assessor: user?.name || user?.username || "",
    assessmentDate: format(new Date(), "yyyy-MM-dd"),
  });
  const [items, setItems] = useState<RiskItem[]>([defaultItem()]);
  const [uploadingPhoto, setUploadingPhoto] = useState<string | null>(null);
  const beforePhotoRefs = useRef<(HTMLInputElement | null)[]>([]);
  const afterPhotoRefs = useRef<(HTMLInputElement | null)[]>([]);

  const { data: assessments, isLoading } = useQuery<RiskAssessment[]>({
    queryKey: [`/api/risk-assessments?type=${activeTab}`],
  });

  const batchMutation = useMutation({
    mutationFn: (payload: object[]) =>
      apiRequest("POST", "/api/risk-assessments/batch", { items: payload }),
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
    setHeader({
      title: "",
      department: "",
      assessor: user?.name || user?.username || "",
      assessmentDate: format(new Date(), "yyyy-MM-dd"),
    });
    setItems([defaultItem()]);
    setEditingId(null);
    setShowForm(false);
  };

  const handleSubmit = () => {
    if (!header.title || !header.department) {
      toast({ variant: "destructive", title: "평가명과 부서는 필수입니다." });
      return;
    }
    for (const item of items) {
      if (!item.hazard) {
        toast({ variant: "destructive", title: "모든 항목의 유해위험요인을 입력해주세요." });
        return;
      }
    }

    if (editingId !== null) {
      const item = items[0];
      const score = item.probability * item.criticality;
      const riskLevel = getRiskLevel(score);
      updateMutation.mutate({
        id: editingId,
        data: {
          ...header,
          assessmentType: activeTab,
          process: item.process,
          hazard: item.hazard,
          hazardType: item.hazardType,
          currentControls: item.currentControls,
          frequency: item.probability,
          severity: item.criticality,
          riskScore: score,
          riskLevel,
          controlMeasures: item.controlMeasures,
          beforePhotoUrl: item.beforePhotoUrl,
          afterPhotoUrl: item.afterPhotoUrl,
        },
      });
    } else {
      const payload = items.map(item => {
        const score = item.probability * item.criticality;
        return {
          ...header,
          assessmentType: activeTab,
          process: item.process,
          hazard: item.hazard,
          hazardType: item.hazardType,
          currentControls: item.currentControls,
          frequency: item.probability,
          severity: item.criticality,
          riskScore: score,
          riskLevel: getRiskLevel(score),
          controlMeasures: item.controlMeasures,
          beforePhotoUrl: item.beforePhotoUrl,
          afterPhotoUrl: item.afterPhotoUrl,
        };
      });
      batchMutation.mutate(payload);
    }
  };

  const handleEdit = (item: RiskAssessment) => {
    setHeader({
      title: item.title,
      department: item.department,
      assessor: item.assessor || user?.name || user?.username || "",
      assessmentDate: item.assessmentDate,
    });
    setItems([{
      process: item.process || "",
      hazard: item.hazard,
      hazardType: item.hazardType || "",
      currentControls: item.currentControls || "",
      probability: item.frequency,
      criticality: item.severity,
      controlMeasures: item.controlMeasures || "",
      beforePhotoUrl: (item as any).beforePhotoUrl || "",
      afterPhotoUrl: (item as any).afterPhotoUrl || "",
    }]);
    setEditingId(item.id);
    setShowForm(true);
  };

  const handleDelete = (id: number) => {
    if (confirm("이 평가를 삭제하시겠습니까?")) {
      deleteMutation.mutate(id);
    }
  };

  const addItem = () => setItems(prev => [...prev, defaultItem()]);
  const removeItem = (idx: number) => setItems(prev => prev.filter((_, i) => i !== idx));
  const updateItem = <K extends keyof RiskItem>(idx: number, key: K, value: RiskItem[K]) => {
    setItems(prev => prev.map((item, i) => i === idx ? { ...item, [key]: value } : item));
  };

  const uploadPhoto = async (idx: number, type: "before" | "after", file: File) => {
    const photoKey = type === "before" ? "beforePhotoUrl" : "afterPhotoUrl";
    setUploadingPhoto(`${idx}-${type}`);
    try {
      const fd = new FormData();
      fd.append("photo", file);
      const res = await fetch("/api/risk-assessments/upload-photo", {
        method: "POST",
        body: fd,
        credentials: "include",
      });
      if (!res.ok) throw new Error("Upload failed");
      const data = await res.json();
      updateItem(idx, photoKey as keyof RiskItem, data.photoUrl);
      toast({ title: "사진이 업로드되었습니다." });
    } catch {
      toast({ variant: "destructive", title: "사진 업로드에 실패했습니다." });
    }
    setUploadingPhoto(null);
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
              setHeader({
                title: "",
                department: "",
                assessor: user?.name || user?.username || "",
                assessmentDate: format(new Date(), "yyyy-MM-dd"),
              });
              setItems([defaultItem()]);
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
          <CardTitle className="text-sm sm:text-base">위험도 매트릭스 (가능성 × 중대성)</CardTitle>
        </CardHeader>
        <CardContent className="p-3 sm:p-4 pt-0 overflow-x-auto">
          <table className="border-collapse mx-auto" data-testid="risk-matrix">
            <thead>
              <tr>
                <th className="p-1 sm:p-2 text-xs sm:text-sm text-muted-foreground border border-border">가능성\중대성</th>
                {[1, 2, 3, 4].map(s => (
                  <th key={s} className="p-1 sm:p-2 text-xs sm:text-sm text-center border border-border min-w-[50px] sm:min-w-[60px]">
                    <div>{s}</div>
                    <div className="text-[10px] text-muted-foreground font-normal">{CRITICALITY_LABELS[s]}</div>
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {[5, 4, 3, 2, 1].map(f => (
                <tr key={f}>
                  <td className="p-1 sm:p-2 text-xs sm:text-sm font-medium text-center border border-border">
                    <div>{f}</div>
                    <div className="text-[10px] text-muted-foreground font-normal">{PROBABILITY_LABELS[f]}</div>
                  </td>
                  {[1, 2, 3, 4].map(s => {
                    const score = f * s;
                    return (
                      <td
                        key={s}
                        className={`p-1 sm:p-2 text-xs sm:text-sm font-bold text-center border border-border min-w-[50px] sm:min-w-[60px] ${getMatrixCellColor(score)}`}
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
                        <TableHead className="min-w-[60px]">가능성</TableHead>
                        <TableHead className="min-w-[60px]">중대성</TableHead>
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
                            <TableCell className="text-sm text-center">
                              <span title={PROBABILITY_LABELS[item.frequency]}>{item.frequency}</span>
                            </TableCell>
                            <TableCell className="text-sm text-center">
                              <span title={CRITICALITY_LABELS[item.severity]}>{item.severity}</span>
                            </TableCell>
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
        <DialogContent className="max-w-3xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle data-testid="dialog-title">
              {editingId ? "위험성평가 수정" : "새 위험성평가 등록"}
            </DialogTitle>
          </DialogHeader>

          <div className="space-y-4">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 p-4 bg-muted/30 rounded-lg border">
              <div className="sm:col-span-2 space-y-2">
                <Label>평가명 *</Label>
                <Input
                  value={header.title}
                  onChange={e => setHeader(h => ({ ...h, title: e.target.value }))}
                  placeholder="평가명을 입력하세요"
                  data-testid="input-title"
                />
              </div>
              <div className="space-y-2">
                <Label>부서 *</Label>
                <Select value={header.department} onValueChange={v => setHeader(h => ({ ...h, department: v }))}>
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
                <Label>평가유형</Label>
                <Input
                  value={ASSESSMENT_TABS.find(t => t.value === activeTab)?.label || activeTab}
                  disabled
                  data-testid="input-assessment-type"
                />
              </div>
              <div className="space-y-2">
                <Label>평가자</Label>
                <Input
                  value={header.assessor}
                  onChange={e => setHeader(h => ({ ...h, assessor: e.target.value }))}
                  placeholder="평가자 이름"
                  data-testid="input-assessor"
                />
              </div>
              <div className="space-y-2">
                <Label>평가일</Label>
                <Input
                  type="date"
                  value={header.assessmentDate}
                  onChange={e => setHeader(h => ({ ...h, assessmentDate: e.target.value }))}
                  data-testid="input-assessment-date"
                />
              </div>
            </div>

            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <Label className="text-base font-semibold">위험요인 항목</Label>
                {!editingId && (
                  <Button variant="outline" size="sm" onClick={addItem} className="gap-1" data-testid="button-add-item">
                    <Plus className="w-3.5 h-3.5" />
                    항목 추가
                  </Button>
                )}
              </div>

              {items.map((item, idx) => {
                const score = item.probability * item.criticality;
                const level = getRiskLevel(score);
                return (
                  <Card key={idx} className="border-primary/30">
                    <CardHeader className="p-3 pb-2 flex flex-row items-center justify-between">
                      <CardTitle className="text-sm text-primary">항목 {idx + 1}</CardTitle>
                      {items.length > 1 && (
                        <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => removeItem(idx)} data-testid={`button-remove-item-${idx}`}>
                          <X className="w-3.5 h-3.5 text-red-500" />
                        </Button>
                      )}
                    </CardHeader>
                    <CardContent className="p-3 pt-0 grid grid-cols-1 sm:grid-cols-2 gap-3">
                      <div className="space-y-1">
                        <Label className="text-xs">공정/작업</Label>
                        <Input
                          value={item.process}
                          onChange={e => updateItem(idx, "process", e.target.value)}
                          placeholder="공정 또는 작업명"
                          data-testid={`input-process-${idx}`}
                        />
                      </div>
                      <div className="space-y-1">
                        <Label className="text-xs">위험유형</Label>
                        <Select value={item.hazardType} onValueChange={v => updateItem(idx, "hazardType", v)}>
                          <SelectTrigger data-testid={`select-hazard-type-${idx}`}>
                            <SelectValue placeholder="선택" />
                          </SelectTrigger>
                          <SelectContent>
                            {HAZARD_TYPES.map(t => (
                              <SelectItem key={t} value={t}>{t}</SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      </div>
                      <div className="sm:col-span-2 space-y-1">
                        <Label className="text-xs">유해위험요인 *</Label>
                        <Input
                          value={item.hazard}
                          onChange={e => updateItem(idx, "hazard", e.target.value)}
                          placeholder="유해위험요인을 입력하세요"
                          data-testid={`input-hazard-${idx}`}
                        />
                      </div>
                      <div className="sm:col-span-2 space-y-1">
                        <Label className="text-xs">현재 안전조치</Label>
                        <Textarea
                          value={item.currentControls}
                          onChange={e => updateItem(idx, "currentControls", e.target.value)}
                          placeholder="현재 시행 중인 안전조치"
                          rows={2}
                          data-testid={`input-current-controls-${idx}`}
                        />
                      </div>
                      <div className="space-y-1">
                        <Label className="text-xs">가능성 (1~5)</Label>
                        <Select value={String(item.probability)} onValueChange={v => updateItem(idx, "probability", Number(v))}>
                          <SelectTrigger data-testid={`select-probability-${idx}`}>
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent>
                            {[1, 2, 3, 4, 5].map(n => (
                              <SelectItem key={n} value={String(n)}>{n} - {PROBABILITY_LABELS[n]}</SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      </div>
                      <div className="space-y-1">
                        <Label className="text-xs">중대성 (1~4)</Label>
                        <Select value={String(item.criticality)} onValueChange={v => updateItem(idx, "criticality", Number(v))}>
                          <SelectTrigger data-testid={`select-criticality-${idx}`}>
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent>
                            {[1, 2, 3, 4].map(n => (
                              <SelectItem key={n} value={String(n)}>{n} - {CRITICALITY_LABELS[n]}</SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      </div>
                      <div className="space-y-1">
                        <Label className="text-xs">위험도 (자동계산)</Label>
                        <div className="flex items-center gap-2">
                          <Input value={score} disabled data-testid={`input-risk-score-${idx}`} />
                          <Badge className={`${getRiskBadgeVariant(level).className} no-default-hover-elevate no-default-active-elevate shrink-0`}>
                            {level}
                          </Badge>
                        </div>
                      </div>
                      <div className="sm:col-span-2 space-y-1">
                        <Label className="text-xs">개선대책</Label>
                        <Textarea
                          value={item.controlMeasures}
                          onChange={e => updateItem(idx, "controlMeasures", e.target.value)}
                          placeholder="개선대책을 입력하세요"
                          rows={2}
                          data-testid={`input-control-measures-${idx}`}
                        />
                      </div>
                      <div className="space-y-1">
                        <Label className="text-xs">개선 전 사진</Label>
                        <input
                          ref={el => { beforePhotoRefs.current[idx] = el; }}
                          type="file"
                          accept="image/*"
                          className="hidden"
                          onChange={e => {
                            const file = e.target.files?.[0];
                            if (file) uploadPhoto(idx, "before", file);
                            e.target.value = "";
                          }}
                        />
                        {item.beforePhotoUrl ? (
                          <div className="relative inline-block">
                            <img src={item.beforePhotoUrl} alt="개선 전" className="h-20 w-32 object-cover rounded border" />
                            <button
                              type="button"
                              className="absolute top-0.5 right-0.5 bg-red-500 text-white rounded-full w-4 h-4 flex items-center justify-center text-xs"
                              onClick={() => updateItem(idx, "beforePhotoUrl", "")}
                            >
                              <X className="w-2.5 h-2.5" />
                            </button>
                          </div>
                        ) : (
                          <Button
                            variant="outline"
                            size="sm"
                            className="gap-1 text-xs"
                            disabled={uploadingPhoto === `${idx}-before`}
                            onClick={() => beforePhotoRefs.current[idx]?.click()}
                            data-testid={`button-before-photo-${idx}`}
                          >
                            <Camera className="w-3.5 h-3.5" />
                            {uploadingPhoto === `${idx}-before` ? "업로드 중..." : "사진 추가"}
                          </Button>
                        )}
                      </div>
                      <div className="space-y-1">
                        <Label className="text-xs">개선 후 사진</Label>
                        <input
                          ref={el => { afterPhotoRefs.current[idx] = el; }}
                          type="file"
                          accept="image/*"
                          className="hidden"
                          onChange={e => {
                            const file = e.target.files?.[0];
                            if (file) uploadPhoto(idx, "after", file);
                            e.target.value = "";
                          }}
                        />
                        {item.afterPhotoUrl ? (
                          <div className="relative inline-block">
                            <img src={item.afterPhotoUrl} alt="개선 후" className="h-20 w-32 object-cover rounded border" />
                            <button
                              type="button"
                              className="absolute top-0.5 right-0.5 bg-red-500 text-white rounded-full w-4 h-4 flex items-center justify-center text-xs"
                              onClick={() => updateItem(idx, "afterPhotoUrl", "")}
                            >
                              <X className="w-2.5 h-2.5" />
                            </button>
                          </div>
                        ) : (
                          <Button
                            variant="outline"
                            size="sm"
                            className="gap-1 text-xs"
                            disabled={uploadingPhoto === `${idx}-after`}
                            onClick={() => afterPhotoRefs.current[idx]?.click()}
                            data-testid={`button-after-photo-${idx}`}
                          >
                            <Camera className="w-3.5 h-3.5" />
                            {uploadingPhoto === `${idx}-after` ? "업로드 중..." : "사진 추가"}
                          </Button>
                        )}
                      </div>
                    </CardContent>
                  </Card>
                );
              })}
            </div>
          </div>

          <DialogFooter className="gap-2">
            <Button variant="outline" onClick={resetForm} data-testid="button-cancel">
              취소
            </Button>
            <Button
              onClick={handleSubmit}
              disabled={batchMutation.isPending || updateMutation.isPending}
              className="bg-red-600 text-white"
              data-testid="button-submit"
            >
              {batchMutation.isPending || updateMutation.isPending ? "처리 중..." : editingId ? "수정" : "등록"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
