import { useQuery, useMutation } from "@tanstack/react-query";
import { useHeadquarters } from "@/contexts/HeadquartersContext";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription } from "@/components/ui/dialog";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Textarea } from "@/components/ui/textarea";
import { Checkbox } from "@/components/ui/checkbox";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import {
  Bone, Plus, Trash2, Pencil, Search, CheckSquare, X,
  ChevronDown, ChevronUp, History, Save, AlertTriangle, Layers
} from "lucide-react";
import { useState, useMemo, useEffect, useCallback } from "react";
import { useToast } from "@/hooks/use-toast";
import { format } from "date-fns";
import { motion, AnimatePresence } from "framer-motion";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { usePermissions } from "@/hooks/use-permissions";
import { useAuth } from "@/hooks/use-auth";
import type { MusculoskeletalAssessment } from "@shared/schema";

// ── 산업안전보건법 고시 근골격계부담작업 11호 ─────────────────────────────────
const BURDEN_WORKS = [
  { no: 1, short: "키보드·마우스 조작 4시간 이상",           desc: "하루에 4시간 이상 집중적으로 키보드 또는 마우스를 조작하는 작업" },
  { no: 2, short: "반복 동작 2시간 이상 (목·어깨·팔꿈치·손목·손)", desc: "하루에 총 2시간 이상 목, 어깨, 팔꿈치, 손목 또는 손을 사용하여 같은 동작을 반복하는 작업" },
  { no: 3, short: "팔꿈치·손이 어깨 위 2시간 이상",         desc: "하루에 총 2시간 이상 손이 머리 위에 있거나 팔꿈치가 어깨 위에 있는 자세에서 이루어지는 작업" },
  { no: 4, short: "목·허리 굽히기·비틀기 2시간 이상",       desc: "하루에 2시간 이상 목이나 허리를 구부리거나 트는 상태에서 이루어지는 작업" },
  { no: 5, short: "쪼그리기·무릎 굽히기 2시간 이상",        desc: "하루에 총 2시간 이상 쪼그리고 앉거나 무릎을 굽힌 자세에서 이루어지는 작업" },
  { no: 6, short: "손가락 집기·쥐기 2시간 이상 (1 kg↑)",   desc: "하루에 총 2시간 이상 1 kg 이상의 물건을 손가락으로 집거나 2 kg에 상당하는 힘으로 쥐는 작업" },
  { no: 7, short: "한 손으로 들기·쥐기 2시간 이상 (4.5 kg↑)", desc: "하루에 총 2시간 이상 4.5 kg 이상의 물건을 한 손으로 들거나 동일한 힘으로 쥐는 작업" },
  { no: 8, short: "25 kg 이상 들기 하루 10회 이상",         desc: "하루에 10회 이상 25 kg 이상의 물체를 드는 작업" },
  { no: 9, short: "10 kg 이상 들기 25회 이상 (특정 위치)",   desc: "하루에 25회 이상 10 kg 이상의 물체를 무릎 아래·어깨 위·팔 뻗은 상태에서 드는 작업" },
  { no: 10, short: "4.5 kg 이상 분당 2회↑ 2시간 이상",      desc: "하루에 총 2시간 이상, 분당 2회 이상 4.5 kg 이상의 물체를 드는 작업" },
  { no: 11, short: "손·무릎 충격 작업 2시간 이상 (시간당 10회↑)", desc: "하루에 총 2시간 이상 시간당 10회 이상 손 또는 무릎을 사용하여 반복적으로 충격을 가하는 작업" },
] as const;

function calcRiskFromChecklist(checked: number[]): string {
  if (checked.length >= 3) return "높음";
  if (checked.length >= 1) return "중간";
  return "낮음";
}

const RISK_LEVELS = ["높음", "중간", "낮음"];
const STATUS_OPTIONS = ["진행중", "완료", "보류"];
const DRAFT_KEY = "musculoskeletal_draft";

function getRiskBadgeClass(level: string) {
  switch (level) {
    case "높음": return "bg-red-600 text-white dark:bg-red-700";
    case "중간": return "bg-yellow-500 text-white dark:bg-yellow-600";
    case "낮음": return "bg-green-500 text-white dark:bg-green-600";
    default:     return "bg-gray-500 text-white dark:bg-gray-600";
  }
}
function getStatusBadgeClass(status: string) {
  switch (status) {
    case "완료": return "bg-green-500 text-white dark:bg-green-600";
    case "보류": return "bg-orange-500 text-white dark:bg-orange-600";
    default:     return "bg-blue-500 text-white dark:bg-blue-600";
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
  burdenWorkChecklist: number[];
}
const defaultForm = (): FormState => ({
  department: "",
  task: "",
  hazardFactor: "",
  riskLevel: "중간",
  currentMeasures: "",
  improvementPlan: "",
  assessmentDate: format(new Date(), "yyyy-MM-dd"),
  assessor: "",
  status: "진행중",
  burdenWorkChecklist: [],
});

interface BulkRow {
  department: string;
  task: string;
  hazardFactor: string;
  riskLevel: string;
  assessor: string;
  assessmentDate: string;
}
const defaultBulkRow = (): BulkRow => ({
  department: "",
  task: "",
  hazardFactor: "",
  riskLevel: "중간",
  assessor: "",
  assessmentDate: format(new Date(), "yyyy-MM-dd"),
});

function parseChecklist(raw: string | null | undefined): number[] {
  if (!raw) return [];
  try { return JSON.parse(raw); } catch { return []; }
}

export default function MusculoskeletalDisease() {
  const { headquarters, departments: DEPARTMENTS } = useHeadquarters();
  const { canEditMusculoskeletal } = usePermissions();
  const canEdit = canEditMusculoskeletal;
  const { user } = useAuth();
  const isOwner = (createdBy?: string | null) =>
    !createdBy || user?.role === "admin" || user?.username === createdBy;
  const { toast } = useToast();

  // ── 메인 상태 ────────────────────────────────────────────────────────
  const [showForm, setShowForm]       = useState(false);
  const [editingId, setEditingId]     = useState<number | null>(null);
  const [form, setForm]               = useState<FormState>(defaultForm());
  const [searchQuery, setSearchQuery] = useState("");
  const [selectionMode, setSelectionMode] = useState(false);
  const [selectedIds, setSelectedIds] = useState<Set<number>>(new Set());

  // ── 새 기능 상태 ─────────────────────────────────────────────────────
  const [checklistOpen, setChecklistOpen] = useState(true);
  const [hasDraft, setHasDraft]           = useState(false);
  const [showLoadPrev, setShowLoadPrev]   = useState(false);
  const [showBulk, setShowBulk]           = useState(false);
  const [bulkRows, setBulkRows]           = useState<BulkRow[]>([defaultBulkRow()]);
  const [riskManual, setRiskManual]       = useState(false);

  // ── 필터/정렬 ────────────────────────────────────────────────────────
  const [filterRisk,   setFilterRisk]   = useState("all");
  const [filterStatus, setFilterStatus] = useState("all");
  const [sortBy, setSortBy] = useState<"date" | "risk" | "dept">("date");

  // ── API ──────────────────────────────────────────────────────────────
  const { data: assessments, isLoading } = useQuery<MusculoskeletalAssessment[]>({
    queryKey: ["/api/musculoskeletal-assessments", headquarters],
    queryFn: () =>
      fetch(`/api/musculoskeletal-assessments?headquarters=${encodeURIComponent(headquarters)}`, { credentials: "include" })
        .then(r => r.json()),
  });

  const createMutation = useMutation({
    mutationFn: (data: FormState) =>
      apiRequest("POST", "/api/musculoskeletal-assessments", {
        ...data,
        headquarters,
        burdenWorkChecklist: JSON.stringify(data.burdenWorkChecklist),
      } as unknown as Record<string, unknown>),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/musculoskeletal-assessments"] });
      clearDraft();
      resetForm();
      toast({ title: "근골격계 유해요인조사가 등록되었습니다." });
    },
    onError: () => toast({ variant: "destructive", title: "등록 실패" }),
  });

  const updateMutation = useMutation({
    mutationFn: ({ id, data }: { id: number; data: FormState }) =>
      apiRequest("PUT", `/api/musculoskeletal-assessments/${id}`, {
        ...data,
        burdenWorkChecklist: JSON.stringify(data.burdenWorkChecklist),
      } as unknown as Record<string, unknown>),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/musculoskeletal-assessments"] });
      resetForm();
      toast({ title: "근골격계 유해요인조사가 수정되었습니다." });
    },
    onError: () => toast({ variant: "destructive", title: "수정 실패" }),
  });

  const deleteMutation = useMutation({
    mutationFn: (id: number) => apiRequest("DELETE", `/api/musculoskeletal-assessments/${id}`),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/musculoskeletal-assessments"] });
      toast({ title: "근골격계 유해요인조사가 삭제되었습니다." });
    },
    onError: () => toast({ variant: "destructive", title: "삭제 실패" }),
  });

  const bulkDeleteMutation = useMutation({
    mutationFn: (ids: number[]) =>
      apiRequest("POST", "/api/musculoskeletal-assessments/bulk-delete", { ids }),
    onSuccess: async (res) => {
      const data = await (res as any).json();
      queryClient.invalidateQueries({ queryKey: ["/api/musculoskeletal-assessments"] });
      setSelectedIds(new Set()); setSelectionMode(false);
      toast({ title: `${data.deleted}건 삭제 완료` });
    },
    onError: () => toast({ variant: "destructive", title: "삭제 실패" }),
  });

  // ── 임시저장 ─────────────────────────────────────────────────────────
  useEffect(() => {
    setHasDraft(!!localStorage.getItem(DRAFT_KEY));
  }, []);

  useEffect(() => {
    if (!editingId && showForm) {
      const hasContent =
        form.department || form.task || form.hazardFactor ||
        form.currentMeasures || form.assessor || form.burdenWorkChecklist.length > 0;
      if (hasContent) {
        localStorage.setItem(DRAFT_KEY, JSON.stringify(form));
        setHasDraft(true);
      }
    }
  }, [form, editingId, showForm]);

  const clearDraft = useCallback(() => {
    localStorage.removeItem(DRAFT_KEY);
    setHasDraft(false);
  }, []);

  const restoreDraft = useCallback(() => {
    const saved = localStorage.getItem(DRAFT_KEY);
    if (!saved) return;
    try { setForm(JSON.parse(saved)); } catch {}
  }, []);

  // ── 폼 helpers ────────────────────────────────────────────────────────
  const updateField = <K extends keyof FormState>(key: K, value: FormState[K]) => {
    setForm(prev => ({ ...prev, [key]: value }));
  };

  const toggleBurdenWork = (no: number) => {
    setForm(prev => {
      const checked = prev.burdenWorkChecklist.includes(no)
        ? prev.burdenWorkChecklist.filter(n => n !== no)
        : [...prev.burdenWorkChecklist, no].sort((a, b) => a - b);
      const newRisk = riskManual ? prev.riskLevel : calcRiskFromChecklist(checked);
      return { ...prev, burdenWorkChecklist: checked, riskLevel: newRisk };
    });
  };

  const resetForm = () => {
    setForm(defaultForm());
    setEditingId(null);
    setShowForm(false);
    setRiskManual(false);
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
      department:          item.department,
      task:                item.task,
      hazardFactor:        item.hazardFactor,
      riskLevel:           item.riskLevel,
      currentMeasures:     item.currentMeasures || "",
      improvementPlan:     item.improvementPlan || "",
      assessmentDate:      item.assessmentDate || format(new Date(), "yyyy-MM-dd"),
      assessor:            item.assessor || "",
      status:              item.status,
      burdenWorkChecklist: parseChecklist((item as any).burdenWorkChecklist),
    });
    setEditingId(item.id);
    setRiskManual(true);
    setShowForm(true);
  };

  const handleLoadPrevious = (item: MusculoskeletalAssessment) => {
    setForm({
      department:          item.department,
      task:                item.task,
      hazardFactor:        item.hazardFactor,
      riskLevel:           item.riskLevel,
      currentMeasures:     item.currentMeasures || "",
      improvementPlan:     item.improvementPlan || "",
      assessmentDate:      format(new Date(), "yyyy-MM-dd"),
      assessor:            item.assessor || "",
      status:              "진행중",
      burdenWorkChecklist: parseChecklist((item as any).burdenWorkChecklist),
    });
    setEditingId(null);
    setRiskManual(false);
    setShowLoadPrev(false);
  };

  const handleDelete = (id: number) => {
    if (confirm("이 유해요인조사를 삭제하시겠습니까?")) deleteMutation.mutate(id);
  };

  const toggleSelect = (id: number) =>
    setSelectedIds(prev => { const n = new Set(prev); n.has(id) ? n.delete(id) : n.add(id); return n; });

  // ── 자동완성 후보 ─────────────────────────────────────────────────────
  const taskSuggestions    = useMemo(() => [...new Set((assessments || []).map(a => a.task).filter(Boolean))], [assessments]);
  const assessorSuggestions = useMemo(() => [...new Set((assessments || []).map(a => a.assessor).filter(Boolean))], [assessments]);
  const hazardSuggestions  = useMemo(() => [...new Set((assessments || []).map(a => a.hazardFactor).filter(Boolean))], [assessments]);

  // ── 필터링·정렬 ───────────────────────────────────────────────────────
  const filteredAssessments = useMemo(() => {
    if (!assessments) return [];
    const riskOrder: Record<string, number> = { "높음": 0, "중간": 1, "낮음": 2 };
    let list = assessments.filter(a => {
      if (filterRisk !== "all" && a.riskLevel !== filterRisk) return false;
      if (filterStatus !== "all" && a.status !== filterStatus) return false;
      if (searchQuery) {
        const q = searchQuery.toLowerCase();
        return (
          a.department.toLowerCase().includes(q) ||
          a.task.toLowerCase().includes(q) ||
          a.hazardFactor.toLowerCase().includes(q) ||
          (a.assessor && a.assessor.toLowerCase().includes(q))
        );
      }
      return true;
    });
    if (sortBy === "date") list = [...list].sort((a, b) => (b.assessmentDate || "").localeCompare(a.assessmentDate || ""));
    else if (sortBy === "risk") list = [...list].sort((a, b) => (riskOrder[a.riskLevel] ?? 3) - (riskOrder[b.riskLevel] ?? 3));
    else if (sortBy === "dept") list = [...list].sort((a, b) => a.department.localeCompare(b.department));
    return list;
  }, [assessments, searchQuery, filterRisk, filterStatus, sortBy]);

  const riskStats = useMemo(() => {
    if (!assessments || assessments.length === 0) return null;
    const counts = { "높음": 0, "중간": 0, "낮음": 0 };
    for (const a of assessments) {
      const lvl = a.riskLevel as keyof typeof counts;
      if (lvl in counts) counts[lvl]++;
    }
    return counts;
  }, [assessments]);

  // ── 일괄 등록 ─────────────────────────────────────────────────────────
  const [bulkPending, setBulkPending] = useState(false);
  const handleBulkSubmit = async () => {
    const validRows = bulkRows.filter(r => r.department && r.task && r.hazardFactor);
    if (validRows.length === 0) {
      toast({ variant: "destructive", title: "최소 1건 이상 필수항목을 입력하세요" });
      return;
    }
    setBulkPending(true);
    try {
      await Promise.all(validRows.map(r =>
        apiRequest("POST", "/api/musculoskeletal-assessments", {
          ...r, headquarters,
          currentMeasures: "", improvementPlan: "", status: "진행중",
          burdenWorkChecklist: "[]",
        } as unknown as Record<string, unknown>)
      ));
      queryClient.invalidateQueries({ queryKey: ["/api/musculoskeletal-assessments"] });
      setShowBulk(false);
      setBulkRows([defaultBulkRow()]);
      toast({ title: `${validRows.length}건 일괄 등록되었습니다.` });
    } catch {
      toast({ variant: "destructive", title: "일괄 등록 실패" });
    } finally {
      setBulkPending(false);
    }
  };

  const validBulkCount = bulkRows.filter(r => r.department && r.task && r.hazardFactor).length;

  // ─────────────────────────────────────────────────────────────────────
  return (
    <div className="max-w-6xl mx-auto space-y-4 sm:space-y-6">

      {/* ─── 헤더 ──────────────────────────────────────────────────── */}
      <div className="flex items-center justify-between gap-2 flex-wrap">
        <div className="flex items-center gap-2 sm:gap-3">
          <div className="bg-purple-100 p-2 sm:p-2.5 rounded-lg text-purple-600 dark:bg-purple-900/30 dark:text-purple-400">
            <Bone className="w-5 h-5 sm:w-6 sm:h-6 md:w-8 md:h-8" />
          </div>
          <div>
            <h2 className="text-xl sm:text-2xl md:text-3xl font-display font-bold text-foreground" data-testid="text-page-title">
              근골격계질환 유해요인조사
            </h2>
            <p className="text-xs sm:text-sm text-muted-foreground">산업안전보건법 기준 부담작업 판정 및 유해요인 조사 관리</p>
          </div>
        </div>
        {canEdit && (
          <div className="flex flex-wrap gap-2">
            <Button
              variant={selectionMode ? "default" : "outline"} size="sm"
              className={`gap-1.5 ${selectionMode ? "bg-red-500 hover:bg-red-600 text-white" : ""}`}
              onClick={() => { setSelectionMode(v => !v); setSelectedIds(new Set()); }}
              data-testid="button-toggle-selection"
            >
              <CheckSquare className="w-4 h-4" />
              {selectionMode ? "취소" : "선택"}
            </Button>
            <Button
              variant="outline" size="sm" className="gap-1.5"
              onClick={() => setShowBulk(true)}
              data-testid="button-bulk-add"
            >
              <Layers className="w-4 h-4" />
              일괄 등록
            </Button>
            <Button
              onClick={() => { setForm(defaultForm()); setEditingId(null); setRiskManual(false); setShowForm(true); }}
              className="bg-purple-600 text-white gap-2"
              data-testid="button-add-assessment"
            >
              <Plus className="w-4 h-4" />
              새 조사 등록
              {hasDraft && (
                <span className="ml-1 w-2 h-2 rounded-full bg-yellow-300 inline-block" title="임시저장 있음" />
              )}
            </Button>
          </div>
        )}
      </div>

      {/* ─── 통계 배지 ─────────────────────────────────────────────── */}
      {riskStats && (
        <div className="flex flex-wrap gap-2 items-center">
          {(Object.entries(riskStats) as [string, number][]).map(([level, count]) => (
            <Badge
              key={level}
              className={`${getRiskBadgeClass(level)} no-default-hover-elevate no-default-active-elevate cursor-pointer`}
              onClick={() => setFilterRisk(filterRisk === level ? "all" : level)}
              data-testid={`stat-${level}`}
            >
              {level} {count}건{filterRisk === level ? " ✓" : ""}
            </Badge>
          ))}
          {assessments && (
            <Badge variant="outline" className="text-muted-foreground">
              전체 {assessments.length}건
            </Badge>
          )}
        </div>
      )}

      {/* ─── 검색·필터 ─────────────────────────────────────────────── */}
      <div className="flex flex-wrap items-center gap-2">
        <div className="relative flex-1 min-w-[180px] max-w-sm">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
          <Input
            value={searchQuery} onChange={e => setSearchQuery(e.target.value)}
            placeholder="부서, 작업, 유해요인, 평가자..."
            className="pl-9" data-testid="input-search"
          />
        </div>
        <Select value={filterRisk} onValueChange={setFilterRisk}>
          <SelectTrigger className="w-28" data-testid="select-filter-risk">
            <SelectValue placeholder="위험수준" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">전체 위험수준</SelectItem>
            {RISK_LEVELS.map(l => <SelectItem key={l} value={l}>{l}</SelectItem>)}
          </SelectContent>
        </Select>
        <Select value={filterStatus} onValueChange={setFilterStatus}>
          <SelectTrigger className="w-24" data-testid="select-filter-status">
            <SelectValue placeholder="상태" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">전체 상태</SelectItem>
            {STATUS_OPTIONS.map(s => <SelectItem key={s} value={s}>{s}</SelectItem>)}
          </SelectContent>
        </Select>
        <Select value={sortBy} onValueChange={v => setSortBy(v as "date" | "risk" | "dept")}>
          <SelectTrigger className="w-24" data-testid="select-sort">
            <SelectValue placeholder="정렬" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="date">날짜순</SelectItem>
            <SelectItem value="risk">위험도순</SelectItem>
            <SelectItem value="dept">부서순</SelectItem>
          </SelectContent>
        </Select>
        {(filterRisk !== "all" || filterStatus !== "all" || searchQuery) && (
          <Button variant="ghost" size="sm"
            onClick={() => { setFilterRisk("all"); setFilterStatus("all"); setSearchQuery(""); }}
          >
            <X className="w-3.5 h-3.5 mr-1" />초기화
          </Button>
        )}
      </div>

      {/* ─── 목록 테이블 ───────────────────────────────────────────── */}
      {isLoading ? (
        <div className="text-center py-8 text-muted-foreground">로딩 중...</div>
      ) : !filteredAssessments || filteredAssessments.length === 0 ? (
        <Card>
          <CardContent className="py-12 text-center text-muted-foreground" data-testid="text-empty">
            {(searchQuery || filterRisk !== "all" || filterStatus !== "all")
              ? "검색/필터 결과가 없습니다."
              : "등록된 유해요인조사가 없습니다."}
          </CardContent>
        </Card>
      ) : (
        <Card>
          <CardContent className="p-0 overflow-x-auto">
            <Table data-testid="table-assessments">
              <TableHeader>
                <TableRow>
                  {selectionMode && (
                    <TableHead className="w-10">
                      <Checkbox
                        checked={filteredAssessments.length > 0 && filteredAssessments.every(a => selectedIds.has(a.id))}
                        onCheckedChange={() => {
                          const allSel = filteredAssessments.every(a => selectedIds.has(a.id));
                          setSelectedIds(allSel ? new Set() : new Set(filteredAssessments.map(a => a.id)));
                        }}
                        data-testid="checkbox-select-all"
                      />
                    </TableHead>
                  )}
                  <TableHead className="w-10">No</TableHead>
                  <TableHead className="min-w-[90px]">부서</TableHead>
                  <TableHead className="min-w-[120px]">작업내용</TableHead>
                  <TableHead className="min-w-[110px]">유해요인</TableHead>
                  <TableHead className="min-w-[100px]">부담작업 해당호</TableHead>
                  <TableHead className="w-20">위험수준</TableHead>
                  <TableHead className="min-w-[120px]">현재 조치사항</TableHead>
                  <TableHead className="min-w-[120px]">개선계획</TableHead>
                  <TableHead className="w-20">평가자</TableHead>
                  <TableHead className="w-24">평가일</TableHead>
                  <TableHead className="w-16">상태</TableHead>
                  {canEdit && <TableHead className="w-20">관리</TableHead>}
                </TableRow>
              </TableHeader>
              <TableBody>
                <AnimatePresence>
                  {filteredAssessments.map((item, idx) => {
                    const checklist = parseChecklist((item as any).burdenWorkChecklist);
                    return (
                      <motion.tr
                        key={item.id}
                        initial={{ opacity: 0, y: 10 }}
                        animate={{ opacity: 1, y: 0 }}
                        exit={{ opacity: 0, y: -10 }}
                        className={`border-b border-border ${selectionMode ? "cursor-pointer" : ""} ${selectionMode && selectedIds.has(item.id) ? "bg-red-50 dark:bg-red-900/20" : ""}`}
                        onClick={() => selectionMode && toggleSelect(item.id)}
                        data-testid={`row-assessment-${item.id}`}
                      >
                        {selectionMode && (
                          <TableCell onClick={e => e.stopPropagation()}>
                            <Checkbox checked={selectedIds.has(item.id)} onCheckedChange={() => toggleSelect(item.id)} data-testid={`checkbox-assessment-${item.id}`} />
                          </TableCell>
                        )}
                        <TableCell className="text-sm text-muted-foreground">{idx + 1}</TableCell>
                        <TableCell className="text-sm">{item.department}</TableCell>
                        <TableCell className="text-sm font-medium">{item.task}</TableCell>
                        <TableCell className="text-sm">{item.hazardFactor}</TableCell>
                        <TableCell>
                          {checklist.length > 0 ? (
                            <span
                              className="text-xs font-medium text-purple-700 dark:text-purple-300"
                              title={checklist.map(n => `${n}호`).join(", ")}
                            >
                              {checklist.map(n => `${n}호`).join(", ")}
                            </span>
                          ) : <span className="text-xs text-muted-foreground">-</span>}
                        </TableCell>
                        <TableCell>
                          <Badge className={`${getRiskBadgeClass(item.riskLevel)} no-default-hover-elevate no-default-active-elevate text-xs`} data-testid={`badge-risk-${item.id}`}>
                            {item.riskLevel}
                          </Badge>
                        </TableCell>
                        <TableCell className="text-sm">{item.currentMeasures || "-"}</TableCell>
                        <TableCell className="text-sm">{item.improvementPlan || "-"}</TableCell>
                        <TableCell className="text-sm">{item.assessor || "-"}</TableCell>
                        <TableCell className="text-sm">{item.assessmentDate || "-"}</TableCell>
                        <TableCell>
                          <Badge className={`${getStatusBadgeClass(item.status)} no-default-hover-elevate no-default-active-elevate text-xs`} data-testid={`badge-status-${item.id}`}>
                            {item.status}
                          </Badge>
                        </TableCell>
                        {canEdit && (
                          <TableCell>
                            <div className="flex gap-1">
                              {isOwner(item.createdBy) && (
                                <>
                                  <Button variant="ghost" size="icon" onClick={() => handleEdit(item)} data-testid={`button-edit-${item.id}`}>
                                    <Pencil className="w-4 h-4" />
                                  </Button>
                                  <Button variant="ghost" size="icon" onClick={() => handleDelete(item.id)} data-testid={`button-delete-${item.id}`}>
                                    <Trash2 className="w-4 h-4 text-red-500" />
                                  </Button>
                                </>
                              )}
                            </div>
                          </TableCell>
                        )}
                      </motion.tr>
                    );
                  })}
                </AnimatePresence>
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      )}

      {/* ─── 새 조사 등록 / 수정 다이얼로그 ───────────────────────── */}
      <Dialog open={showForm} onOpenChange={open => { if (!open) resetForm(); }}>
        <DialogContent className="max-w-3xl max-h-[92vh] overflow-y-auto">
          <DialogHeader>
            <div className="flex flex-wrap items-center justify-between gap-2">
              <DialogTitle data-testid="dialog-title">
                {editingId ? "유해요인조사 수정" : "새 유해요인조사 등록"}
              </DialogTitle>
              {!editingId && (
                <div className="flex gap-2">
                  {hasDraft && (
                    <Button
                      variant="outline" size="sm"
                      className="gap-1.5 text-yellow-600 border-yellow-400 dark:border-yellow-600 hover:bg-yellow-50 dark:hover:bg-yellow-900/20"
                      onClick={restoreDraft} data-testid="button-restore-draft"
                    >
                      <Save className="w-3.5 h-3.5" />임시저장 불러오기
                    </Button>
                  )}
                  <Button
                    variant="outline" size="sm" className="gap-1.5"
                    onClick={() => setShowLoadPrev(true)} data-testid="button-load-prev"
                  >
                    <History className="w-3.5 h-3.5" />이전 조사 복사
                  </Button>
                </div>
              )}
            </div>
          </DialogHeader>

          {/* 부담작업 체크리스트 */}
          <Collapsible open={checklistOpen} onOpenChange={setChecklistOpen}>
            <CollapsibleTrigger asChild>
              <button
                className="w-full flex items-center justify-between px-3 py-2.5 rounded-lg bg-purple-50 dark:bg-purple-900/20 border border-purple-200 dark:border-purple-800 text-sm font-medium text-purple-800 dark:text-purple-200 hover:bg-purple-100 dark:hover:bg-purple-900/30 transition-colors"
                data-testid="button-toggle-checklist"
              >
                <span className="flex items-center gap-2">
                  <AlertTriangle className="w-4 h-4 shrink-0" />
                  법정 근골격계 부담작업 판정 체크리스트 (11호)
                  {form.burdenWorkChecklist.length > 0 && (
                    <Badge className="bg-purple-600 text-white text-xs py-0">
                      {form.burdenWorkChecklist.length}개 해당
                    </Badge>
                  )}
                </span>
                {checklistOpen ? <ChevronUp className="w-4 h-4 shrink-0" /> : <ChevronDown className="w-4 h-4 shrink-0" />}
              </button>
            </CollapsibleTrigger>
            <CollapsibleContent>
              <div className="mt-1.5 rounded-lg border border-purple-200 dark:border-purple-800 overflow-hidden">
                {BURDEN_WORKS.map((bw) => {
                  const checked = form.burdenWorkChecklist.includes(bw.no);
                  return (
                    <label
                      key={bw.no}
                      className={`flex items-start gap-3 px-3 py-2.5 cursor-pointer transition-colors border-b border-purple-100 dark:border-purple-900/60 last:border-0 ${checked ? "bg-purple-50 dark:bg-purple-900/30" : "hover:bg-gray-50 dark:hover:bg-gray-800/30"}`}
                      data-testid={`label-burden-${bw.no}`}
                    >
                      <Checkbox
                        checked={checked}
                        onCheckedChange={() => toggleBurdenWork(bw.no)}
                        className="mt-0.5 shrink-0"
                        data-testid={`checkbox-burden-${bw.no}`}
                      />
                      <div className="flex-1 min-w-0">
                        <div className="flex items-baseline gap-2">
                          <span className="text-xs font-bold text-purple-700 dark:text-purple-300 shrink-0">{bw.no}호</span>
                          <span className="text-xs font-medium text-foreground leading-relaxed">{bw.short}</span>
                        </div>
                        <p className="text-xs text-muted-foreground mt-0.5 leading-relaxed">{bw.desc}</p>
                      </div>
                    </label>
                  );
                })}
                {/* 판정 요약 */}
                <div className="px-3 py-2 bg-purple-50 dark:bg-purple-900/20 border-t border-purple-200 dark:border-purple-800 flex flex-wrap items-center gap-3">
                  <span className="text-xs text-purple-800 dark:text-purple-200">
                    해당 항목: <strong>{form.burdenWorkChecklist.length}개</strong>
                    {form.burdenWorkChecklist.length > 0 && !riskManual && (
                      <span className="ml-2">→ 자동 위험수준: <strong>{calcRiskFromChecklist(form.burdenWorkChecklist)}</strong></span>
                    )}
                  </span>
                  <span className="text-xs text-muted-foreground">(3개↑=높음 / 1~2개=중간 / 0개=낮음)</span>
                </div>
              </div>
            </CollapsibleContent>
          </Collapsible>

          {/* 기본 정보 */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label>부서 *</Label>
              <Select value={form.department} onValueChange={v => updateField("department", v)}>
                <SelectTrigger data-testid="select-department">
                  <SelectValue placeholder="부서 선택" />
                </SelectTrigger>
                <SelectContent>
                  {DEPARTMENTS.map(d => <SelectItem key={d} value={d}>{d}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-2">
              <Label className="flex items-center gap-2">
                위험수준 *
                {!riskManual && form.burdenWorkChecklist.length > 0 && (
                  <span className="text-xs font-normal text-purple-600 dark:text-purple-400">(체크리스트 자동 산출)</span>
                )}
              </Label>
              <div className="flex gap-2">
                <Select
                  value={form.riskLevel}
                  onValueChange={v => { updateField("riskLevel", v); setRiskManual(true); }}
                >
                  <SelectTrigger data-testid="select-risk-level" className="flex-1">
                    <SelectValue placeholder="위험수준 선택" />
                  </SelectTrigger>
                  <SelectContent>
                    {RISK_LEVELS.map(l => <SelectItem key={l} value={l}>{l}</SelectItem>)}
                  </SelectContent>
                </Select>
                {riskManual && form.burdenWorkChecklist.length > 0 && (
                  <Button
                    variant="outline" size="sm" className="shrink-0 text-xs"
                    onClick={() => { setRiskManual(false); updateField("riskLevel", calcRiskFromChecklist(form.burdenWorkChecklist)); }}
                  >자동</Button>
                )}
              </div>
            </div>

            <div className="sm:col-span-2 space-y-2">
              <Label>작업내용 *</Label>
              <Input
                list="task-suggestions-list"
                value={form.task}
                onChange={e => updateField("task", e.target.value)}
                placeholder="작업내용 입력 (자동완성 지원)"
                data-testid="input-task"
              />
              <datalist id="task-suggestions-list">
                {taskSuggestions.map(s => <option key={s} value={s} />)}
              </datalist>
            </div>

            <div className="sm:col-span-2 space-y-2">
              <Label>유해요인 *</Label>
              <Input
                list="hazard-suggestions-list"
                value={form.hazardFactor}
                onChange={e => updateField("hazardFactor", e.target.value)}
                placeholder="유해요인 입력 (자동완성 지원)"
                data-testid="input-hazard-factor"
              />
              <datalist id="hazard-suggestions-list">
                {hazardSuggestions.map(s => <option key={s} value={s} />)}
              </datalist>
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
                list="assessor-suggestions-list"
                value={form.assessor}
                onChange={e => updateField("assessor", e.target.value)}
                placeholder="평가자 이름 (자동완성 지원)"
                data-testid="input-assessor"
              />
              <datalist id="assessor-suggestions-list">
                {assessorSuggestions.map(s => <option key={s} value={s!} />)}
              </datalist>
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
                  {STATUS_OPTIONS.map(s => <SelectItem key={s} value={s}>{s}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
          </div>

          <DialogFooter className="gap-2 pt-2">
            {!editingId && (
              <Button
                variant="ghost" size="sm" className="mr-auto text-muted-foreground text-xs"
                onClick={() => { clearDraft(); toast({ title: "임시저장이 삭제되었습니다." }); }}
                disabled={!hasDraft}
                data-testid="button-clear-draft"
              >
                <Trash2 className="w-3.5 h-3.5 mr-1" />임시저장 삭제
              </Button>
            )}
            <Button variant="outline" onClick={resetForm} data-testid="button-cancel">취소</Button>
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

      {/* ─── 이전 조사 불러오기 다이얼로그 ────────────────────────── */}
      <Dialog open={showLoadPrev} onOpenChange={setShowLoadPrev}>
        <DialogContent className="max-w-2xl max-h-[80vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>이전 조사 복사해서 시작</DialogTitle>
            <DialogDescription>
              선택한 조사 내용을 새 조사의 기초 자료로 불러옵니다. (평가일은 오늘, 상태는 진행중으로 초기화됩니다)
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-2 mt-2">
            {(assessments || []).slice(0, 30).map(item => {
              const checklist = parseChecklist((item as any).burdenWorkChecklist);
              return (
                <button
                  key={item.id}
                  className="w-full text-left flex items-start gap-3 p-3 rounded-lg border border-border hover:border-purple-400 hover:bg-purple-50 dark:hover:bg-purple-900/20 transition-colors"
                  onClick={() => handleLoadPrevious(item)}
                  data-testid={`load-prev-${item.id}`}
                >
                  <Badge className={`${getRiskBadgeClass(item.riskLevel)} shrink-0 no-default-hover-elevate no-default-active-elevate text-xs`}>
                    {item.riskLevel}
                  </Badge>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium truncate">{item.department} — {item.task}</p>
                    <p className="text-xs text-muted-foreground mt-0.5">
                      {item.hazardFactor}
                      {item.assessor ? ` · ${item.assessor}` : ""}
                      {item.assessmentDate ? ` · ${item.assessmentDate}` : ""}
                      {checklist.length > 0 ? ` · 부담작업 ${checklist.map(n => `${n}호`).join(",")}` : ""}
                    </p>
                  </div>
                </button>
              );
            })}
            {(!assessments || assessments.length === 0) && (
              <p className="text-center text-muted-foreground py-8 text-sm">등록된 조사가 없습니다.</p>
            )}
          </div>
        </DialogContent>
      </Dialog>

      {/* ─── 일괄 등록 다이얼로그 ──────────────────────────────────── */}
      <Dialog open={showBulk} onOpenChange={setShowBulk}>
        <DialogContent className="max-w-5xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>일괄 등록</DialogTitle>
            <DialogDescription>
              여러 근로자/작업을 한 번에 등록합니다. 부서·작업내용·유해요인이 입력된 행만 등록됩니다.
            </DialogDescription>
          </DialogHeader>

          {/* 공통 자동완성 datalist (다이얼로그 안에서도 공유) */}
          <datalist id="bulk-task-suggestions">
            {taskSuggestions.map(s => <option key={s} value={s} />)}
          </datalist>
          <datalist id="bulk-hazard-suggestions">
            {hazardSuggestions.map(s => <option key={s} value={s} />)}
          </datalist>
          <datalist id="bulk-assessor-suggestions">
            {assessorSuggestions.map(s => <option key={s} value={s!} />)}
          </datalist>

          <div className="overflow-x-auto -mx-1">
            <table className="w-full text-sm border-collapse min-w-[700px]">
              <thead>
                <tr className="bg-muted text-left">
                  <th className="p-2 border border-border font-medium w-8 text-center">#</th>
                  <th className="p-2 border border-border font-medium min-w-[130px]">부서 *</th>
                  <th className="p-2 border border-border font-medium min-w-[160px]">작업내용 *</th>
                  <th className="p-2 border border-border font-medium min-w-[150px]">유해요인 *</th>
                  <th className="p-2 border border-border font-medium w-24">위험수준</th>
                  <th className="p-2 border border-border font-medium min-w-[110px]">평가자</th>
                  <th className="p-2 border border-border font-medium w-32">평가일</th>
                  <th className="p-2 border border-border w-8"></th>
                </tr>
              </thead>
              <tbody>
                {bulkRows.map((row, i) => (
                  <tr key={i} className={i % 2 === 0 ? "bg-background" : "bg-muted/20"}>
                    <td className="p-1 border border-border text-center text-xs text-muted-foreground">{i + 1}</td>
                    <td className="p-1 border border-border">
                      <select
                        className="w-full h-8 px-1.5 text-sm rounded border border-input bg-background focus:outline-none focus:ring-1 focus:ring-purple-500"
                        value={row.department}
                        onChange={e => setBulkRows(prev => { const n = [...prev]; n[i] = { ...n[i], department: e.target.value }; return n; })}
                      >
                        <option value="">선택</option>
                        {DEPARTMENTS.map(d => <option key={d} value={d}>{d}</option>)}
                      </select>
                    </td>
                    <td className="p-1 border border-border">
                      <input
                        className="w-full h-8 px-1.5 text-sm rounded border border-input bg-background focus:outline-none focus:ring-1 focus:ring-purple-500"
                        list="bulk-task-suggestions"
                        value={row.task}
                        onChange={e => setBulkRows(prev => { const n = [...prev]; n[i] = { ...n[i], task: e.target.value }; return n; })}
                        placeholder="작업내용"
                      />
                    </td>
                    <td className="p-1 border border-border">
                      <input
                        className="w-full h-8 px-1.5 text-sm rounded border border-input bg-background focus:outline-none focus:ring-1 focus:ring-purple-500"
                        list="bulk-hazard-suggestions"
                        value={row.hazardFactor}
                        onChange={e => setBulkRows(prev => { const n = [...prev]; n[i] = { ...n[i], hazardFactor: e.target.value }; return n; })}
                        placeholder="유해요인"
                      />
                    </td>
                    <td className="p-1 border border-border">
                      <select
                        className="w-full h-8 px-1.5 text-sm rounded border border-input bg-background focus:outline-none focus:ring-1 focus:ring-purple-500"
                        value={row.riskLevel}
                        onChange={e => setBulkRows(prev => { const n = [...prev]; n[i] = { ...n[i], riskLevel: e.target.value }; return n; })}
                      >
                        {RISK_LEVELS.map(l => <option key={l} value={l}>{l}</option>)}
                      </select>
                    </td>
                    <td className="p-1 border border-border">
                      <input
                        className="w-full h-8 px-1.5 text-sm rounded border border-input bg-background focus:outline-none focus:ring-1 focus:ring-purple-500"
                        list="bulk-assessor-suggestions"
                        value={row.assessor}
                        onChange={e => setBulkRows(prev => { const n = [...prev]; n[i] = { ...n[i], assessor: e.target.value }; return n; })}
                        placeholder="평가자"
                      />
                    </td>
                    <td className="p-1 border border-border">
                      <input
                        type="date"
                        className="w-full h-8 px-1.5 text-sm rounded border border-input bg-background focus:outline-none focus:ring-1 focus:ring-purple-500"
                        value={row.assessmentDate}
                        onChange={e => setBulkRows(prev => { const n = [...prev]; n[i] = { ...n[i], assessmentDate: e.target.value }; return n; })}
                      />
                    </td>
                    <td className="p-1 border border-border text-center">
                      <button
                        className="text-muted-foreground hover:text-red-500 transition-colors disabled:opacity-30"
                        onClick={() => setBulkRows(prev => prev.filter((_, j) => j !== i))}
                        disabled={bulkRows.length === 1}
                      >
                        <X className="w-4 h-4" />
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <div className="flex gap-2 mt-1">
            <Button variant="outline" size="sm" className="gap-1.5"
              onClick={() => setBulkRows(prev => [...prev, defaultBulkRow()])}
              data-testid="button-add-bulk-row"
            >
              <Plus className="w-3.5 h-3.5" />행 추가
            </Button>
            <Button variant="ghost" size="sm" className="gap-1.5 text-muted-foreground"
              onClick={() => setBulkRows(prev => [...prev, ...Array.from({ length: 5 }, defaultBulkRow)])}
            >
              +5행
            </Button>
            <span className="ml-auto text-xs text-muted-foreground self-center">
              {validBulkCount > 0 ? `${validBulkCount}건 등록 예정` : "부서·작업내용·유해요인 입력 필요"}
            </span>
          </div>

          <DialogFooter className="gap-2">
            <Button variant="outline" onClick={() => { setShowBulk(false); setBulkRows([defaultBulkRow()]); }}>취소</Button>
            <Button
              className="bg-purple-600 text-white"
              onClick={handleBulkSubmit}
              disabled={bulkPending || validBulkCount === 0}
              data-testid="button-bulk-submit"
            >
              {bulkPending ? "등록 중..." : `${validBulkCount}건 일괄 등록`}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ─── 플로팅 벌크 삭제 바 ───────────────────────────────────── */}
      {selectionMode && selectedIds.size > 0 && (
        <div className="fixed bottom-6 left-1/2 -translate-x-1/2 z-50 flex items-center gap-3 bg-background border border-border shadow-xl rounded-full px-5 py-3">
          <span className="text-sm font-semibold text-red-600">{selectedIds.size}건 선택됨</span>
          <div className="w-px h-5 bg-border" />
          <Button variant="ghost" size="sm" className="h-8" onClick={() => setSelectedIds(new Set())}>
            <X className="w-3.5 h-3.5 mr-1" />선택 해제
          </Button>
          <Button
            variant="destructive" size="sm" className="h-8"
            disabled={bulkDeleteMutation.isPending}
            onClick={() => {
              if (confirm(`선택한 ${selectedIds.size}건을 삭제하시겠습니까?`))
                bulkDeleteMutation.mutate(Array.from(selectedIds));
            }}
            data-testid="button-bulk-delete"
          >
            <Trash2 className="w-3.5 h-3.5 mr-1" />삭제
          </Button>
        </div>
      )}
    </div>
  );
}
