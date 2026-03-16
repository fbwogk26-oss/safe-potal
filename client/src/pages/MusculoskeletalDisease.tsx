import { useQuery, useMutation } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Textarea } from "@/components/ui/textarea";
import { Bone, Plus, Trash2, Pencil, Search } from "lucide-react";
import { useState, useMemo } from "react";
import { useToast } from "@/hooks/use-toast";
import { format } from "date-fns";
import { motion, AnimatePresence } from "framer-motion";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { usePermissions } from "@/hooks/use-permissions";
import { useAuth } from "@/hooks/use-auth";
import type { MusculoskeletalAssessment } from "@shared/schema";

const DEPARTMENTS = ["동대구운용팀", "서대구운용팀", "남대구운용팀", "포항운용팀", "안동운용팀", "구미운용팀", "문경운용팀"];
const RISK_LEVELS = ["높음", "중간", "낮음"];
const STATUS_OPTIONS = ["진행중", "완료", "보류"];

function getRiskBadgeClass(level: string) {
  switch (level) {
    case "높음": return "bg-red-600 text-white dark:bg-red-700";
    case "중간": return "bg-yellow-500 text-white dark:bg-yellow-600";
    case "낮음": return "bg-green-500 text-white dark:bg-green-600";
    default: return "bg-gray-500 text-white dark:bg-gray-600";
  }
}

function getStatusBadgeClass(status: string) {
  switch (status) {
    case "완료": return "bg-green-500 text-white dark:bg-green-600";
    case "보류": return "bg-orange-500 text-white dark:bg-orange-600";
    default: return "bg-blue-500 text-white dark:bg-blue-600";
  }
}

interface FormState {
  department: string;
  task: string;
  hazardFactor: string;
  riskLevel: string;
  currentMeasures: string;
  improvementPlan: string;
  assessmentDate: string;
  assessor: string;
  status: string;
}

const defaultForm: FormState = {
  department: "",
  task: "",
  hazardFactor: "",
  riskLevel: "중간",
  currentMeasures: "",
  improvementPlan: "",
  assessmentDate: format(new Date(), "yyyy-MM-dd"),
  assessor: "",
  status: "진행중",
};

export default function MusculoskeletalDisease() {
  const { canEditMusculoskeletal } = usePermissions();
  const canEdit = canEditMusculoskeletal;
  const { user } = useAuth();
  const isOwner = (createdBy?: string | null) => !createdBy || user?.role === "admin" || user?.username === createdBy;
  const { toast } = useToast();
  const [showForm, setShowForm] = useState(false);
  const [editingId, setEditingId] = useState<number | null>(null);
  const [form, setForm] = useState<FormState>(defaultForm);
  const [searchQuery, setSearchQuery] = useState("");

  const { data: assessments, isLoading } = useQuery<MusculoskeletalAssessment[]>({
    queryKey: ["/api/musculoskeletal-assessments"],
  });

  const createMutation = useMutation({
    mutationFn: (data: FormState) =>
      apiRequest("POST", "/api/musculoskeletal-assessments", data as unknown as Record<string, unknown>),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/musculoskeletal-assessments"] });
      resetForm();
      toast({ title: "근골격계 유해요인조사가 등록되었습니다." });
    },
    onError: () => toast({ variant: "destructive", title: "등록 실패" }),
  });

  const updateMutation = useMutation({
    mutationFn: ({ id, data }: { id: number; data: FormState }) =>
      apiRequest("PUT", `/api/musculoskeletal-assessments/${id}`, data as unknown as Record<string, unknown>),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/musculoskeletal-assessments"] });
      resetForm();
      toast({ title: "근골격계 유해요인조사가 수정되었습니다." });
    },
    onError: () => toast({ variant: "destructive", title: "수정 실패" }),
  });

  const deleteMutation = useMutation({
    mutationFn: (id: number) =>
      apiRequest("DELETE", `/api/musculoskeletal-assessments/${id}`),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/musculoskeletal-assessments"] });
      toast({ title: "근골격계 유해요인조사가 삭제되었습니다." });
    },
    onError: () => toast({ variant: "destructive", title: "삭제 실패" }),
  });

  const resetForm = () => {
    setForm(defaultForm);
    setEditingId(null);
    setShowForm(false);
  };

  const handleSubmit = () => {
    if (!form.department || !form.task || !form.hazardFactor) {
      toast({ variant: "destructive", title: "부서, 작업내용, 유해요인은 필수입니다." });
      return;
    }
    if (editingId) {
      updateMutation.mutate({ id: editingId, data: form });
    } else {
      createMutation.mutate(form);
    }
  };

  const handleEdit = (item: MusculoskeletalAssessment) => {
    setForm({
      department: item.department,
      task: item.task,
      hazardFactor: item.hazardFactor,
      riskLevel: item.riskLevel,
      currentMeasures: item.currentMeasures || "",
      improvementPlan: item.improvementPlan || "",
      assessmentDate: item.assessmentDate || format(new Date(), "yyyy-MM-dd"),
      assessor: item.assessor || "",
      status: item.status,
    });
    setEditingId(item.id);
    setShowForm(true);
  };

  const handleDelete = (id: number) => {
    if (confirm("이 유해요인조사를 삭제하시겠습니까?")) {
      deleteMutation.mutate(id);
    }
  };

  const updateField = <K extends keyof FormState>(key: K, value: FormState[K]) => {
    setForm(prev => ({ ...prev, [key]: value }));
  };

  const filteredAssessments = useMemo(() => {
    if (!assessments) return [];
    if (!searchQuery) return assessments;
    const q = searchQuery.toLowerCase();
    return assessments.filter(a =>
      a.department.toLowerCase().includes(q) ||
      a.task.toLowerCase().includes(q) ||
      a.hazardFactor.toLowerCase().includes(q) ||
      (a.assessor && a.assessor.toLowerCase().includes(q))
    );
  }, [assessments, searchQuery]);

  const riskStats = useMemo(() => {
    if (!assessments || assessments.length === 0) return null;
    const counts = { "높음": 0, "중간": 0, "낮음": 0 };
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
          <div className="bg-purple-100 p-2 sm:p-2.5 rounded-lg text-purple-600 dark:bg-purple-900/30 dark:text-purple-400">
            <Bone className="w-5 h-5 sm:w-6 sm:h-6 md:w-8 md:h-8" />
          </div>
          <div>
            <h2 className="text-xl sm:text-2xl md:text-3xl font-display font-bold text-foreground" data-testid="text-page-title">
              근골격계질환 유해요인조사
            </h2>
            <p className="text-xs sm:text-sm text-muted-foreground">근골격계질환 예방을 위한 유해요인 조사 관리</p>
          </div>
        </div>
        {canEdit && (
          <Button
            onClick={() => {
              setForm(defaultForm);
              setEditingId(null);
              setShowForm(true);
            }}
            className="bg-purple-600 text-white gap-2"
            data-testid="button-add-assessment"
          >
            <Plus className="w-4 h-4" />
            새 조사 등록
          </Button>
        )}
      </div>

      <div className="flex flex-wrap items-center gap-3">
        <div className="relative flex-1 min-w-[200px] max-w-md">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
          <Input
            value={searchQuery}
            onChange={e => setSearchQuery(e.target.value)}
            placeholder="부서, 작업, 유해요인, 평가자 검색..."
            className="pl-9"
            data-testid="input-search"
          />
        </div>
        {riskStats && (
          <div className="flex flex-wrap gap-2">
            {(Object.entries(riskStats) as [string, number][]).map(([level, count]) => (
              <Badge key={level} className={`${getRiskBadgeClass(level)} no-default-hover-elevate no-default-active-elevate`} data-testid={`stat-${level}`}>
                {level}: {count}건
              </Badge>
            ))}
          </div>
        )}
      </div>

      {isLoading ? (
        <div className="text-center py-8 text-muted-foreground">로딩 중...</div>
      ) : !filteredAssessments || filteredAssessments.length === 0 ? (
        <Card>
          <CardContent className="py-12 text-center text-muted-foreground" data-testid="text-empty">
            {searchQuery ? "검색 결과가 없습니다." : "등록된 유해요인조사가 없습니다."}
          </CardContent>
        </Card>
      ) : (
        <Card>
          <CardContent className="p-0 overflow-x-auto">
            <Table data-testid="table-assessments">
              <TableHeader>
                <TableRow>
                  <TableHead className="min-w-[50px]">No</TableHead>
                  <TableHead className="min-w-[100px]">부서</TableHead>
                  <TableHead className="min-w-[120px]">작업내용</TableHead>
                  <TableHead className="min-w-[120px]">유해요인</TableHead>
                  <TableHead className="min-w-[80px]">위험수준</TableHead>
                  <TableHead className="min-w-[120px]">현재 조치사항</TableHead>
                  <TableHead className="min-w-[120px]">개선계획</TableHead>
                  <TableHead className="min-w-[80px]">평가자</TableHead>
                  <TableHead className="min-w-[90px]">평가일</TableHead>
                  <TableHead className="min-w-[70px]">상태</TableHead>
                  {canEdit && <TableHead className="min-w-[80px]">관리</TableHead>}
                </TableRow>
              </TableHeader>
              <TableBody>
                <AnimatePresence>
                  {filteredAssessments.map((item, idx) => (
                    <motion.tr
                      key={item.id}
                      initial={{ opacity: 0, y: 10 }}
                      animate={{ opacity: 1, y: 0 }}
                      exit={{ opacity: 0, y: -10 }}
                      className="border-b border-border"
                      data-testid={`row-assessment-${item.id}`}
                    >
                      <TableCell className="text-sm">{idx + 1}</TableCell>
                      <TableCell className="text-sm">{item.department}</TableCell>
                      <TableCell className="text-sm font-medium">{item.task}</TableCell>
                      <TableCell className="text-sm">{item.hazardFactor}</TableCell>
                      <TableCell>
                        <Badge className={`${getRiskBadgeClass(item.riskLevel)} no-default-hover-elevate no-default-active-elevate`} data-testid={`badge-risk-${item.id}`}>
                          {item.riskLevel}
                        </Badge>
                      </TableCell>
                      <TableCell className="text-sm">{item.currentMeasures || "-"}</TableCell>
                      <TableCell className="text-sm">{item.improvementPlan || "-"}</TableCell>
                      <TableCell className="text-sm">{item.assessor || "-"}</TableCell>
                      <TableCell className="text-sm">{item.assessmentDate || "-"}</TableCell>
                      <TableCell>
                        <Badge className={`${getStatusBadgeClass(item.status)} no-default-hover-elevate no-default-active-elevate`} data-testid={`badge-status-${item.id}`}>
                          {item.status}
                        </Badge>
                      </TableCell>
                      {canEdit && (
                        <TableCell>
                          <div className="flex gap-1">
                            {isOwner(item.createdBy) && (
                              <>
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
                              </>
                            )}
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

      <Dialog open={showForm} onOpenChange={(open) => { if (!open) resetForm(); }}>
        <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle data-testid="dialog-title">
              {editingId ? "유해요인조사 수정" : "새 유해요인조사 등록"}
            </DialogTitle>
          </DialogHeader>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
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
              <Label>위험수준 *</Label>
              <Select value={form.riskLevel} onValueChange={v => updateField("riskLevel", v)}>
                <SelectTrigger data-testid="select-risk-level">
                  <SelectValue placeholder="위험수준 선택" />
                </SelectTrigger>
                <SelectContent>
                  {RISK_LEVELS.map(l => (
                    <SelectItem key={l} value={l}>{l}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="sm:col-span-2 space-y-2">
              <Label>작업내용 *</Label>
              <Input
                value={form.task}
                onChange={e => updateField("task", e.target.value)}
                placeholder="작업내용을 입력하세요"
                data-testid="input-task"
              />
            </div>

            <div className="sm:col-span-2 space-y-2">
              <Label>유해요인 *</Label>
              <Input
                value={form.hazardFactor}
                onChange={e => updateField("hazardFactor", e.target.value)}
                placeholder="유해요인을 입력하세요"
                data-testid="input-hazard-factor"
              />
            </div>

            <div className="sm:col-span-2 space-y-2">
              <Label>현재 조치사항</Label>
              <Textarea
                value={form.currentMeasures}
                onChange={e => updateField("currentMeasures", e.target.value)}
                placeholder="현재 시행 중인 조치사항"
                data-testid="input-current-measures"
              />
            </div>

            <div className="sm:col-span-2 space-y-2">
              <Label>개선계획</Label>
              <Textarea
                value={form.improvementPlan}
                onChange={e => updateField("improvementPlan", e.target.value)}
                placeholder="개선계획을 입력하세요"
                data-testid="input-improvement-plan"
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

            <div className="space-y-2">
              <Label>상태</Label>
              <Select value={form.status} onValueChange={v => updateField("status", v)}>
                <SelectTrigger data-testid="select-status">
                  <SelectValue placeholder="상태 선택" />
                </SelectTrigger>
                <SelectContent>
                  {STATUS_OPTIONS.map(s => (
                    <SelectItem key={s} value={s}>{s}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>

          <DialogFooter className="gap-2">
            <Button variant="outline" onClick={resetForm} data-testid="button-cancel">
              취소
            </Button>
            <Button
              onClick={handleSubmit}
              disabled={createMutation.isPending || updateMutation.isPending}
              className="bg-purple-600 text-white"
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
