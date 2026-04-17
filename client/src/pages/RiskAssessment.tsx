import { useQuery, useMutation } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Textarea } from "@/components/ui/textarea";
import { Separator } from "@/components/ui/separator";
import {
  ShieldAlert, Plus, Trash2, Pencil, Camera, X, Info, ClipboardEdit,
  CheckCircle2, Clock, FileDown, Download, CircleCheck, AlertCircle, Users,
  ChevronRight, ChevronDown, MapPin, Save, Sparkles, ScanSearch, Loader2,
  Lightbulb, Zap, TriangleAlert, ChevronUp, CheckSquare,
  BarChart3, TrendingUp, Search, Filter, Shield,
} from "lucide-react";
import { Checkbox } from "@/components/ui/checkbox";
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Cell,
} from "recharts";
import { useState, useMemo } from "react";
import { useToast } from "@/hooks/use-toast";
import { format } from "date-fns";
import { motion, AnimatePresence } from "framer-motion";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { usePermissions } from "@/hooks/use-permissions";
import { useAuth } from "@/hooks/use-auth";
import type { RiskAssessment } from "@shared/schema";

const DEPARTMENTS = [
  "동대구운용팀", "서대구운용팀", "남대구운용팀", "포항운용팀",
  "안동운용팀", "구미운용팀", "문경운용팀", "운용지원팀",
  "운용계획팀", "사업지원팀", "현장경영팀", "공공망관제팀",
];

const DEPT_SHORT: Record<string, string> = {
  "동대구운용팀": "동대구", "서대구운용팀": "서대구", "남대구운용팀": "남대구",
  "포항운용팀": "포항", "안동운용팀": "안동", "구미운용팀": "구미",
  "문경운용팀": "문경", "운용지원팀": "운용지원", "운용계획팀": "운용계획",
  "사업지원팀": "사업지원", "현장경영팀": "현장경영", "공공망관제팀": "공공망",
};

const DEPT_DIVISION: Record<string, string> = {
  "동대구운용팀": "대구본부", "서대구운용팀": "대구본부", "남대구운용팀": "대구본부",
  "포항운용팀": "대구본부", "안동운용팀": "대구본부", "구미운용팀": "대구본부",
  "문경운용팀": "대구본부", "운용지원팀": "대구본부", "운용계획팀": "대구본부",
  "사업지원팀": "대구본부", "현장경영팀": "대구본부", "공공망관제팀": "대구본부",
};

const HAZARD_TYPES = ["추락", "전도", "충돌", "협착", "감전", "화재/폭발", "기타"];
const RESPONSIBLE_TASKS = ["운용팀", "제어망", "고객케어 및 응대", "일반사무", "통합수리"];
const TASK_PROCESS_MAP: Record<string, string[]> = {
  "운용팀": ["기지국/중계기 유지보수", "IP-Access 유지보수", "전원시설 유지보수", "위험국소"],
  "제어망": ["교환시스템 관리"],
  "고객케어 및 응대": ["고객민원처리 및 접수"],
  "일반사무": ["사무실 업무"],
  "통합수리": ["모듈수리 업무"],
};

const ASSESSMENT_OPTIONS = [
  { value: "상반기정기평가", label: "상반기 정기평가" },
  { value: "하반기정기평가", label: "하반기 정기평가" },
  { value: "수시평가", label: "수시평가" },
];

const PROBABILITY_LABELS: Record<number, string> = {
  1: "아주 낮음", 2: "낮음", 3: "보통", 4: "높음", 5: "아주 높음",
};
const CRITICALITY_LABELS: Record<number, string> = {
  1: "구급 상해", 2: "경상", 3: "심각", 4: "매우 심각",
};

function getRiskGrade(score: number) {
  if (score >= 8) return { grade: "A", label: "A등급", category: "중점관리" };
  if (score >= 3) return { grade: "B", label: "B등급", category: "일상관리" };
  return { grade: "C", label: "C등급", category: "허용가능" };
}

function getMatrixStyle(score: number) {
  if (score >= 8) return { bg: "bg-orange-100 dark:bg-orange-900/40", text: "text-orange-900 dark:text-orange-200", border: "border-orange-300 dark:border-orange-700" };
  if (score >= 3) return { bg: "bg-slate-100 dark:bg-slate-700/60", text: "text-slate-700 dark:text-slate-200", border: "border-slate-300 dark:border-slate-600" };
  return { bg: "bg-white dark:bg-slate-900/40", text: "text-slate-500 dark:text-slate-400", border: "border-slate-200 dark:border-slate-700" };
}

function getRiskBadgeClass(level: string) {
  if (level === "A등급" || level.includes("중점")) return "bg-orange-500 text-white";
  if (level === "B등급" || level.includes("일상")) return "bg-slate-500 text-white";
  return "bg-blue-400 text-white";
}

interface RiskItem {
  process: string;
  hazard: string;
  hazardType: string;
  currentIssue: string;
  relatedLaw: string;
  currentControls: string;
  probability: number;
  criticality: number;
  beforePhotoUrl: string;
}

const defaultItem = (): RiskItem => ({
  process: "", hazard: "", hazardType: "",
  currentIssue: "", relatedLaw: "", currentControls: "",
  probability: 1, criticality: 1, beforePhotoUrl: "",
});

interface FormHeader {
  department: string;
  assessor: string;
  assessmentDate: string;
  responsibleTask: string;
  departmentHead: string;
}

interface UserName {
  id: string; name: string; username: string; department: string;
}

export default function RiskAssessmentPage() {
  const { canEditRiskAssessment, canDownloadRiskAssessmentExcel } = usePermissions();
  const { user } = useAuth();
  const isDeptHead = user?.role === "deptHead" || user?.role === "admin";
  const { toast } = useToast();
  const [isDownloading, setIsDownloading] = useState(false);
  const [selectionMode, setSelectionMode] = useState(false);
  const [selectedIds, setSelectedIds] = useState<Set<number>>(new Set());
  const [activeTab, setActiveTab] = useState<"dashboard" | "list">("dashboard");
  const [activeType, setActiveType] = useState("상반기정기평가");
  const [filterDept, setFilterDept] = useState("전체");
  const [filterGrade, setFilterGrade] = useState<string | null>(null);
  const [search, setSearch] = useState("");
  const [selectedId, setSelectedId] = useState<number | null>(null);
  const [showForm, setShowForm] = useState(false);
  const [editingId, setEditingId] = useState<number | null>(null);
  const [saveAsDraft, setSaveAsDraft] = useState(false);

  const [header, setHeader] = useState<FormHeader>({
    department: "",
    assessor: user?.name || user?.username || "",
    assessmentDate: format(new Date(), "yyyy-MM-dd"),
    responsibleTask: "",
    departmentHead: "",
  });

  const [deptHeadPopoverOpen, setDeptHeadPopoverOpen] = useState(false);
  const [deptHeadSearch, setDeptHeadSearch] = useState("");
  const [recentDeptHeads, setRecentDeptHeads] = useState<string[]>(() => {
    try { return JSON.parse(localStorage.getItem("recentDeptHeads") || "[]"); } catch { return []; }
  });

  const selectDeptHead = (name: string) => {
    setHeader(h => ({ ...h, departmentHead: name }));
    setDeptHeadPopoverOpen(false);
    setDeptHeadSearch("");
    setRecentDeptHeads(prev => {
      const updated = [name, ...prev.filter(n => n !== name)].slice(0, 5);
      try { localStorage.setItem("recentDeptHeads", JSON.stringify(updated)); } catch {}
      return updated;
    });
  };

  const { data: userNames } = useQuery<UserName[]>({
    queryKey: ["/api/users/names"],
    enabled: showForm,
  });

  const [items, setItems] = useState<RiskItem[]>([defaultItem()]);
  const [expandedItemIdx, setExpandedItemIdx] = useState<number>(0);
  const [uploadingPhoto, setUploadingPhoto] = useState<string | null>(null);

  // AI 기능 상태
  const [aiAnalyzing, setAiAnalyzing] = useState<number | null>(null); // 분석 중인 항목 idx
  const [aiSuggesting, setAiSuggesting] = useState<number | null>(null); // 대책 추천 중인 항목 idx
  const [aiPhotoResult, setAiPhotoResult] = useState<Record<number, {
    hazard: string; hazardType: string; details: string[]; urgency: string; summary: string;
  }>>({});
  const [aiMeasuresResult, setAiMeasuresResult] = useState<Record<number, {
    measures: string[]; relatedLaw: string; priority: string; summary: string;
  }>>({});
  const [selectedMeasures, setSelectedMeasures] = useState<Record<number, boolean[]>>({});

  const [improvingItem, setImprovingItem] = useState<RiskAssessment | null>(null);
  const [improvementForm, setImprovementForm] = useState({
    improvementMeasures: "",
    plannedDate: "",
    completionDate: "",
    afterFrequency: 1,
    afterSeverity: 1,
    afterPhotoUrl: "",
  });
  const [uploadingImprovementPhoto, setUploadingImprovementPhoto] = useState(false);

  const { data: assessments, isLoading } = useQuery<RiskAssessment[]>({
    queryKey: ["/api/risk-assessments", activeType],
    queryFn: () =>
      fetch(`/api/risk-assessments?type=${encodeURIComponent(activeType)}`, { credentials: "include" })
        .then(r => { if (!r.ok) throw new Error(r.statusText); return r.json(); }),
  });

  const batchMutation = useMutation({
    mutationFn: (payload: object[]) =>
      apiRequest("POST", "/api/risk-assessments/batch", { items: payload }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/risk-assessments"] });
      resetForm();
      toast({ title: saveAsDraft ? "임시저장되었습니다." : "위험성평가가 등록되었습니다." });
    },
    onError: () => toast({ variant: "destructive", title: "등록 실패" }),
  });

  const updateMutation = useMutation({
    mutationFn: ({ id, data }: { id: number; data: Record<string, unknown> }) =>
      apiRequest("PUT", `/api/risk-assessments/${id}`, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/risk-assessments"] });
      resetForm();
      toast({ title: saveAsDraft ? "임시저장되었습니다." : "위험성평가가 수정되었습니다." });
    },
    onError: () => toast({ variant: "destructive", title: "수정 실패" }),
  });

  const deleteMutation = useMutation({
    mutationFn: (id: number) => apiRequest("DELETE", `/api/risk-assessments/${id}`),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/risk-assessments"] });
      setSelectedId(null);
      toast({ title: "위험성평가가 삭제되었습니다." });
    },
    onError: () => toast({ variant: "destructive", title: "삭제 실패" }),
  });

  const bulkDeleteMutation = useMutation({
    mutationFn: (ids: number[]) => apiRequest("DELETE", "/api/risk-assessments/bulk-delete", { ids }),
    onSuccess: async (res) => {
      const data = await (res as any).json();
      queryClient.invalidateQueries({ queryKey: ["/api/risk-assessments"] });
      setSelectedIds(new Set()); setSelectionMode(false);
      toast({ title: `${data.deleted ?? selectedIds.size}건 삭제 완료` });
    },
    onError: () => toast({ variant: "destructive", title: "삭제 실패" }),
  });

  const toggleSelect = (id: number) => setSelectedIds(prev => { const n = new Set(prev); n.has(id) ? n.delete(id) : n.add(id); return n; });

  const improvementMutation = useMutation({
    mutationFn: ({ id, data }: { id: number; data: typeof improvementForm }) =>
      apiRequest("PUT", `/api/risk-assessments/${id}/improvement`, data),
    onSuccess: () => { queryClient.invalidateQueries({ queryKey: ["/api/risk-assessments"] }); },
    onError: () => toast({ variant: "destructive", title: "개선 등록 실패" }),
  });

  const approveMutation = useMutation({
    mutationFn: ({ id, approvedBy }: { id: number; approvedBy: string }) =>
      apiRequest("PUT", `/api/risk-assessments/${id}/approve`, { approvedBy }),
    onSuccess: () => { queryClient.invalidateQueries({ queryKey: ["/api/risk-assessments"] }); },
    onError: () => toast({ variant: "destructive", title: "승인 처리 실패" }),
  });

  const resetForm = () => {
    setHeader({
      department: "", assessor: user?.name || user?.username || "",
      assessmentDate: format(new Date(), "yyyy-MM-dd"), responsibleTask: "",
      departmentHead: "",
    });
    setItems([defaultItem()]);
    setExpandedItemIdx(0);
    setEditingId(null);
    setShowForm(false);
    setSaveAsDraft(false);
  };

  const buildPayloadItem = (item: RiskItem, isDraft: boolean) => {
    const score = item.probability * item.criticality;
    const tabLabel = ASSESSMENT_OPTIONS.find(t => t.value === activeType)?.label || activeType;
    const autoTitle = `${header.department} ${tabLabel} (${header.assessmentDate})`;
    return {
      title: autoTitle,
      ...header,
      assessmentType: activeType,
      responsibleTask: header.responsibleTask || null,
      departmentHead: header.departmentHead || null,
      process: item.process,
      hazard: item.hazard,
      hazardType: item.hazardType,
      currentIssue: item.currentIssue || null,
      relatedLaw: item.relatedLaw || null,
      currentControls: item.currentControls,
      frequency: item.probability,
      severity: item.criticality,
      riskScore: score,
      riskLevel: getRiskGrade(score).label,
      beforePhotoUrl: item.beforePhotoUrl,
      status: isDraft ? "임시저장" : "승인요청",
      approvalStatus: isDraft ? "임시저장" : "승인대기",
    };
  };

  const handleSubmit = (isDraft: boolean) => {
    setSaveAsDraft(isDraft);
    if (!header.department) {
      toast({ variant: "destructive", title: "부서는 필수입니다." });
      return;
    }
    if (!isDraft) {
      for (const item of items) {
        if (!item.hazard) {
          toast({ variant: "destructive", title: "모든 항목의 유해위험요인을 입력해주세요." });
          return;
        }
      }
    }
    if (editingId !== null) {
      updateMutation.mutate({ id: editingId, data: buildPayloadItem(items[0], isDraft) });
    } else {
      const payload = items.map(item => buildPayloadItem(item, isDraft));
      batchMutation.mutate(payload);
    }
  };

  const handleEdit = (item: RiskAssessment) => {
    const ra = item as any;
    setHeader({
      department: item.department,
      assessor: item.assessor || user?.name || user?.username || "",
      assessmentDate: item.assessmentDate,
      responsibleTask: ra.responsibleTask || "",
      departmentHead: ra.departmentHead || "",
    });
    setItems([{
      process: item.process || "",
      hazard: item.hazard,
      hazardType: item.hazardType || "",
      currentIssue: ra.currentIssue || "",
      relatedLaw: ra.relatedLaw || "",
      currentControls: item.currentControls || "",
      probability: item.frequency,
      criticality: item.severity,
      beforePhotoUrl: ra.beforePhotoUrl || "",
    }]);
    setExpandedItemIdx(0);
    setEditingId(item.id);
    setShowForm(true);
  };

  const handleDelete = (id: number) => {
    if (confirm("이 평가를 삭제하시겠습니까?")) deleteMutation.mutate(id);
  };

  const addItem = () => {
    if (items.length >= 10) {
      toast({ variant: "destructive", title: "최대 10개까지 등록할 수 있습니다." });
      return;
    }
    setItems(prev => { const next = [...prev, defaultItem()]; setExpandedItemIdx(next.length - 1); return next; });
  };

  const removeItem = (idx: number) => {
    setItems(prev => prev.filter((_, i) => i !== idx));
    setExpandedItemIdx(prev => Math.max(0, prev >= idx ? prev - 1 : prev));
  };

  const updateItem = <K extends keyof RiskItem>(idx: number, key: K, value: RiskItem[K]) => {
    setItems(prev => prev.map((item, i) => i === idx ? { ...item, [key]: value } : item));
  };

  const uploadPhoto = async (idx: number, file: File) => {
    setUploadingPhoto(`${idx}`);
    try {
      const fd = new FormData();
      fd.append("photo", file);
      const res = await fetch("/api/risk-assessments/upload-photo", { method: "POST", body: fd, credentials: "include" });
      if (!res.ok) throw new Error();
      const data = await res.json();
      updateItem(idx, "beforePhotoUrl", data.photoUrl);
      toast({ title: "사진이 업로드되었습니다." });
    } catch {
      toast({ variant: "destructive", title: "사진 업로드에 실패했습니다." });
    }
    setUploadingPhoto(null);
  };

  // AI 사진 분석 함수 (사진 저장 + AI 분석 동시 수행)
  const analyzePhotoWithAI = async (idx: number, file: File) => {
    setAiAnalyzing(idx);
    try {
      // 1) 사진 저장
      const uploadFd = new FormData();
      uploadFd.append("photo", file);
      const uploadRes = await fetch("/api/risk-assessments/upload-photo", { method: "POST", body: uploadFd, credentials: "include" });
      if (uploadRes.ok) {
        const uploadData = await uploadRes.json();
        updateItem(idx, "beforePhotoUrl", uploadData.photoUrl);
      }

      // 2) AI 분석
      const fd = new FormData();
      fd.append("photo", file);
      const res = await fetch("/api/risk-assessments/ai/analyze-photo", { method: "POST", body: fd, credentials: "include" });
      if (!res.ok) { const d = await res.json(); throw new Error(d.message); }
      const data = await res.json();
      setAiPhotoResult(prev => ({ ...prev, [idx]: data }));

      // 3) 자동 채우기: 위험요인, 위험유형
      if (data.hazard) updateItem(idx, "hazard", data.hazard);
      if (data.hazardType && HAZARD_TYPES.includes(data.hazardType)) updateItem(idx, "hazardType", data.hazardType);

      // 4) 위험성 결정 AI 추천 (가능성·중대성)
      if (data.probability && data.probability >= 1 && data.probability <= 5) updateItem(idx, "probability", data.probability);
      if (data.criticality && data.criticality >= 1 && data.criticality <= 4) updateItem(idx, "criticality", data.criticality);

      toast({ title: "✨ AI 사진 분석 완료", description: "위험요인·위험유형·위험성 등급이 자동으로 입력되었습니다" });
    } catch (e: any) {
      toast({ variant: "destructive", title: "AI 분석 실패", description: e.message });
    }
    setAiAnalyzing(null);
  };

  // AI 현재 안전조치 자동 입력 함수
  const suggestMeasuresWithAI = async (idx: number) => {
    const item = items[idx];
    if (!item.hazardType && !item.hazard) {
      toast({ variant: "destructive", title: "위험유형 또는 위험요인을 먼저 입력해주세요" }); return;
    }
    setAiSuggesting(idx);
    try {
      const res = await fetch("/api/risk-assessments/ai/suggest-measures", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ hazardType: item.hazardType, hazard: item.hazard, process: item.process, currentControls: item.currentControls }),
      });
      if (!res.ok) { const d = await res.json(); throw new Error(d.message); }
      const data = await res.json();
      // 현재 안전조치에 바로 자동 입력
      const measures: string[] = data.measures || [];
      updateItem(idx, "currentControls", measures.join("\n"));
      if (data.relatedLaw) updateItem(idx, "relatedLaw", data.relatedLaw);
      toast({ title: "✅ AI가 현재 안전조치를 자동으로 입력했습니다", description: `${measures.length}개 대책이 입력되었습니다` });
    } catch (e: any) {
      toast({ variant: "destructive", title: "AI 추천 실패", description: e.message });
    }
    setAiSuggesting(null);
  };

  // 선택된 대책 적용 (레거시 호환용 — 현재 미사용)
  const applySelectedMeasures = (idx: number) => {
    const result = aiMeasuresResult[idx];
    const sel = selectedMeasures[idx];
    if (!result || !sel) return;
    const chosen = result.measures.filter((_, i) => sel[i]);
    if (chosen.length === 0) { toast({ variant: "destructive", title: "대책을 하나 이상 선택해주세요" }); return; }
    const existing = items[idx].currentControls;
    const combined = existing ? `${existing}\n${chosen.join("\n")}` : chosen.join("\n");
    updateItem(idx, "currentControls", combined);
    if (result.relatedLaw) updateItem(idx, "relatedLaw", result.relatedLaw);
    setAiMeasuresResult(prev => { const n = { ...prev }; delete n[idx]; return n; });
    toast({ title: "✅ 대책이 적용되었습니다" });
  };

  const openImprovementDialog = (item: RiskAssessment) => {
    const ra = item as any;
    setImprovementForm({
      improvementMeasures: ra.improvementMeasures || "",
      plannedDate: ra.plannedDate || "",
      completionDate: ra.completionDate || "",
      afterFrequency: ra.afterFrequency || 1,
      afterSeverity: ra.afterSeverity || 1,
      afterPhotoUrl: ra.afterPhotoUrl || "",
    });
    setImprovingItem(item);
  };

  const uploadImprovementPhoto = async (file: File) => {
    setUploadingImprovementPhoto(true);
    try {
      const fd = new FormData();
      fd.append("photo", file);
      const res = await fetch("/api/risk-assessments/upload-photo", { method: "POST", body: fd, credentials: "include" });
      if (!res.ok) throw new Error();
      const data = await res.json();
      setImprovementForm(f => ({ ...f, afterPhotoUrl: data.photoUrl }));
      toast({ title: "사진이 업로드되었습니다." });
    } catch {
      toast({ variant: "destructive", title: "사진 업로드에 실패했습니다." });
    }
    setUploadingImprovementPhoto(false);
  };

  const handleImprovementSubmit = async () => {
    if (!improvingItem) return;
    if (!improvementForm.improvementMeasures) {
      toast({ variant: "destructive", title: "개선대책을 입력해주세요." });
      return;
    }
    if (!improvementForm.plannedDate) {
      toast({ variant: "destructive", title: "개선예정일을 입력해주세요." });
      return;
    }
    try {
      await improvementMutation.mutateAsync({ id: improvingItem.id, data: improvementForm });
      if (isDeptHead) {
        await approveMutation.mutateAsync({ id: improvingItem.id, approvedBy: user?.name || user?.username || "부서장" });
        toast({ title: "개선 내용이 저장되고 부서장 승인이 완료되었습니다." });
      } else {
        toast({ title: "개선 내용이 등록되었습니다." });
      }
      setImprovingItem(null);
    } catch {}
  };

  const handleDownloadExcel = async (dept: string) => {
    if (isDownloading) return;
    setIsDownloading(true);
    try {
      const params = new URLSearchParams({ department: dept, type: activeType });
      const res = await fetch(`/api/risk-assessments/excel?${params}`, { credentials: "include" });
      if (!res.ok) {
        const errText = await res.text().catch(() => "");
        throw new Error(errText || "서버 오류");
      }
      const blob = await res.blob();
      const today = new Date().toISOString().slice(0, 10).replace(/-/g, "");
      const deptLabel = dept === "전체" ? "전체부서" : dept;
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `위험성평가_${deptLabel}_${today}.xlsx`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      setTimeout(() => URL.revokeObjectURL(url), 1000);
      toast({ title: "다운로드 완료", description: `${deptLabel} 위험성평가 엑셀이 다운로드되었습니다.` });
    } catch (e: any) {
      toast({ title: "다운로드 실패", description: e?.message || "엑셀 파일 생성에 실패했습니다.", variant: "destructive" });
    } finally {
      setIsDownloading(false);
    }
  };

  const filteredByDept = useMemo(() => {
    if (!assessments) return [];
    if (filterDept === "전체") return assessments;
    return assessments.filter(a => a.department === filterDept);
  }, [assessments, filterDept]);

  const filteredAssessments = useMemo(() => {
    let result = filteredByDept;
    if (filterGrade) {
      result = result.filter(a => {
        const lvl = a.riskLevel || "";
        if (filterGrade === "A") return lvl === "A등급" || (!lvl && a.riskScore >= 8);
        if (filterGrade === "B") return lvl === "B등급" || (!lvl && a.riskScore >= 3 && a.riskScore < 8);
        if (filterGrade === "C") return lvl === "C등급" || (!lvl && a.riskScore < 3);
        return true;
      });
    }
    if (search) {
      const q = search.toLowerCase();
      result = result.filter(a => [a.hazard, a.department, a.process, a.hazardType, (a as any).responsibleTask].some(v => v?.toLowerCase().includes(q)));
    }
    return result;
  }, [filteredByDept, filterGrade, search]);

  const riskStats = useMemo(() => {
    if (!filteredByDept.length) return null;
    const counts = { "A등급": 0, "B등급": 0, "C등급": 0 };
    for (const a of filteredByDept) {
      const lvl = a.riskLevel as keyof typeof counts;
      if (lvl in counts) counts[lvl]++;
      else if (a.riskScore >= 8) counts["A등급"]++;
      else if (a.riskScore >= 3) counts["B등급"]++;
      else counts["C등급"]++;
    }
    return counts;
  }, [filteredByDept]);

  const typeStats = useMemo(() => {
    if (!assessments) return [];
    const map: Record<string, number> = {};
    assessments.forEach(a => { if (a.hazardType) map[a.hazardType] = (map[a.hazardType] || 0) + 1; });
    return Object.entries(map).map(([name, value]) => ({ name, value })).sort((a, b) => b.value - a.value);
  }, [assessments]);

  const deptStats = useMemo(() => {
    if (!assessments) return [];
    const map: Record<string, number> = {};
    assessments.forEach(a => { if (a.department) map[a.department] = (map[a.department] || 0) + 1; });
    return Object.entries(map).map(([name, value]) => ({ name: name.replace("운용팀","").replace("팀",""), value })).sort((a, b) => b.value - a.value).slice(0, 8);
  }, [assessments]);

  const GRADE_COLORS = ["#f97316", "#64748b", "#60a5fa"];

  const allSelected = filteredAssessments.length > 0 && filteredAssessments.every(a => selectedIds.has(a.id));
  const toggleAll = () => {
    if (allSelected) setSelectedIds(new Set());
    else setSelectedIds(new Set(filteredAssessments.map(a => a.id)));
  };

  const selectedItem = assessments?.find(a => a.id === selectedId) ?? null;
  const isOwner = (item: RiskAssessment) => !item.createdBy || user?.role === "admin" || user?.username === item.createdBy;

  const getApprovalBadge = (status: string | null | undefined) => {
    const base = "inline-flex items-center gap-0.5 px-1.5 py-0.5 rounded-full text-[10px] font-medium shrink-0";
    if (status === "임시저장") return <span className={`${base} bg-gray-100 text-gray-600 dark:bg-gray-800 dark:text-gray-300`}><Save className="w-2.5 h-2.5" />임시저장</span>;
    if (status === "승인완료") return <span className={`${base} bg-green-100 text-green-700 dark:bg-green-900/40 dark:text-green-300`}><CircleCheck className="w-2.5 h-2.5" />승인완료</span>;
    if (status === "승인대기") return <span className={`${base} bg-amber-100 text-amber-700 dark:bg-amber-900/40 dark:text-amber-300`}><AlertCircle className="w-2.5 h-2.5" />승인대기</span>;
    return <span className={`${base} bg-gray-100 text-gray-500 dark:bg-gray-800 dark:text-gray-400`}>자동종결</span>;
  };

  return (
    <div className="space-y-4 sm:space-y-6 p-3 sm:p-4">
      {/* 헤더 */}
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3">
        <div>
          <h1 className="text-xl sm:text-2xl font-bold flex items-center gap-2">
            <ShieldAlert className="w-6 h-6 text-orange-500" />
            위험성평가
          </h1>
          <p className="text-sm text-muted-foreground mt-0.5">KRAS 위험성평가 관리</p>
        </div>
        <div className="flex items-center gap-2 flex-wrap">
          {canDownloadRiskAssessmentExcel && (
            <Button variant="outline" size="sm" className="gap-1.5" onClick={() => handleDownloadExcel("전체")} disabled={isDownloading} data-testid="button-download-all">
              {isDownloading ? <div className="animate-spin rounded-full h-3.5 w-3.5 border-b-2 border-current" /> : <Download className="w-4 h-4" />}엑셀
            </Button>
          )}
          {canEditRiskAssessment && (
            <Button
              size="sm"
              className="gap-1.5 bg-orange-500 hover:bg-orange-600"
              onClick={() => {
                setHeader({ department: "", assessor: user?.name || user?.username || "", assessmentDate: format(new Date(), "yyyy-MM-dd"), responsibleTask: "", departmentHead: "" });
                setItems([defaultItem()]); setEditingId(null); setShowForm(true);
              }}
              data-testid="button-add-assessment"
            >
              <Plus className="w-4 h-4" />새 평가 등록
            </Button>
          )}
        </div>
      </div>

      {/* 탭 */}
      <div className="flex items-center gap-1 border-b">
        {(["dashboard", "list"] as const).map(tab => (
          <button
            key={tab}
            onClick={() => { setActiveTab(tab); setSelectionMode(false); setSelectedIds(new Set()); setSelectedId(null); }}
            className={`px-4 py-2 text-sm font-medium transition-colors border-b-2 -mb-px ${activeTab === tab ? "border-orange-500 text-orange-600" : "border-transparent text-muted-foreground hover:text-foreground"}`}
          >
            {tab === "dashboard" ? "📊 대시보드" : "📋 목록 관리"}
          </button>
        ))}
        {activeTab === "list" && canEditRiskAssessment && (
          <div className="ml-auto pb-1">
            <Button
              variant={selectionMode ? "default" : "outline"}
              size="sm"
              className={`gap-1.5 h-8 ${selectionMode ? "bg-red-500 hover:bg-red-600 text-white" : ""}`}
              onClick={() => { setSelectionMode(v => !v); setSelectedIds(new Set()); }}
              data-testid="button-toggle-selection"
            >
              <CheckSquare className="w-3.5 h-3.5" />
              {selectionMode ? `취소${selectedIds.size > 0 ? ` (${selectedIds.size})` : ""}` : "선택"}
            </Button>
          </div>
        )}
      </div>

      {/* ===== 대시보드 탭 ===== */}
      {activeTab === "dashboard" && (
        <div className="space-y-4">
          {/* 평가 구분 선택 */}
          <div className="flex items-center gap-2">
            <Select value={activeType} onValueChange={v => { setActiveType(v); setFilterGrade(null); }}>
              <SelectTrigger className="h-9 text-sm w-[180px] font-medium border-orange-200 bg-orange-50 dark:bg-orange-900/20 dark:border-orange-800 text-orange-700 dark:text-orange-300" data-testid="select-assessment-type">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {ASSESSMENT_OPTIONS.map(opt => <SelectItem key={opt.value} value={opt.value}>{opt.label}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>

          {/* 요약 카드 4종 */}
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            {[
              { label: "전체", value: filteredByDept.length, icon: Shield, color: "text-slate-600", bg: "bg-slate-100" },
              { label: "A등급 (중점관리)", value: riskStats?.["A등급"] ?? 0, icon: AlertCircle, color: "text-orange-600", bg: "bg-orange-100" },
              { label: "B등급 (일상관리)", value: riskStats?.["B등급"] ?? 0, icon: Clock, color: "text-slate-600", bg: "bg-slate-100" },
              { label: "C등급 (허용가능)", value: riskStats?.["C등급"] ?? 0, icon: CheckCircle2, color: "text-blue-600", bg: "bg-blue-100" },
            ].map(({ label, value, icon: Icon, color, bg }) => (
              <Card key={label}>
                <CardContent className="p-3 sm:p-4 flex items-center gap-3">
                  <div className={`w-10 h-10 rounded-lg flex items-center justify-center shrink-0 ${bg}`}>
                    <Icon className={`w-5 h-5 ${color}`} />
                  </div>
                  <div>
                    <p className="text-[11px] text-muted-foreground">{label}</p>
                    <p className={`text-xl font-bold ${color}`}>{value}<span className="text-xs font-normal text-muted-foreground ml-1">건</span></p>
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>

          {/* 차트 2종 */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <Card>
              <CardHeader className="pb-2 pt-4 px-4">
                <CardTitle className="text-sm flex items-center gap-2"><BarChart3 className="w-4 h-4 text-orange-500" />위험유형별 분포</CardTitle>
              </CardHeader>
              <CardContent className="px-3 pb-4">
                {typeStats.length === 0 ? (
                  <div className="h-32 flex items-center justify-center text-muted-foreground text-sm">데이터 없음</div>
                ) : (
                  <div style={{ height: Math.max(120, typeStats.length * 40) + "px" }}>
                    <ResponsiveContainer width="100%" height="100%">
                      <BarChart layout="vertical" data={typeStats} margin={{ top: 4, right: 40, left: 4, bottom: 4 }}>
                        <CartesianGrid strokeDasharray="3 3" horizontal={false} stroke="#e2e8f0" opacity={0.5} />
                        <XAxis type="number" allowDecimals={false} tick={{ fontSize: 11 }} axisLine={false} tickLine={false} />
                        <YAxis type="category" dataKey="name" tick={{ fontSize: 11, fontWeight: 600 }} axisLine={false} tickLine={false} width={80} />
                        <Tooltip formatter={(v) => [`${v}건`]} />
                        <Bar dataKey="value" radius={[0, 6, 6, 0]} maxBarSize={26} label={{ position: "right", fontSize: 12, fontWeight: 700 }}>
                          {typeStats.map((_, i) => <Cell key={i} fill={["#f97316","#fb923c","#fdba74","#fde68a","#64748b","#94a3b8","#60a5fa"][i % 7]} />)}
                        </Bar>
                      </BarChart>
                    </ResponsiveContainer>
                  </div>
                )}
              </CardContent>
            </Card>

            <Card>
              <CardHeader className="pb-2 pt-4 px-4">
                <CardTitle className="text-sm flex items-center gap-2"><TrendingUp className="w-4 h-4 text-indigo-500" />부서별 등록건수</CardTitle>
              </CardHeader>
              <CardContent className="px-3 pb-4">
                {deptStats.length === 0 ? (
                  <div className="h-32 flex items-center justify-center text-muted-foreground text-sm">데이터 없음</div>
                ) : (
                  <div style={{ height: Math.max(120, deptStats.length * 40) + "px" }}>
                    <ResponsiveContainer width="100%" height="100%">
                      <BarChart layout="vertical" data={deptStats} margin={{ top: 4, right: 40, left: 4, bottom: 4 }}>
                        <CartesianGrid strokeDasharray="3 3" horizontal={false} stroke="#e2e8f0" opacity={0.5} />
                        <XAxis type="number" allowDecimals={false} tick={{ fontSize: 11 }} axisLine={false} tickLine={false} />
                        <YAxis type="category" dataKey="name" tick={{ fontSize: 11, fontWeight: 600 }} axisLine={false} tickLine={false} width={60} />
                        <Tooltip formatter={(v) => [`${v}건`]} />
                        <Bar dataKey="value" fill="#8b5cf6" radius={[0, 6, 6, 0]} maxBarSize={26} label={{ position: "right", fontSize: 12, fontWeight: 700 }} />
                      </BarChart>
                    </ResponsiveContainer>
                  </div>
                )}
              </CardContent>
            </Card>
          </div>

          {/* A등급 중점관리 목록 */}
          <Card>
            <CardHeader className="pb-2 pt-4 px-4">
              <CardTitle className="text-sm flex items-center gap-2"><AlertCircle className="w-4 h-4 text-orange-500" />A등급 중점관리 (미개선)</CardTitle>
            </CardHeader>
            <CardContent className="px-3 pb-4 space-y-2">
              {(filteredByDept.filter(a => {
                const lvl = a.riskLevel || "";
                return (lvl === "A등급" || (!lvl && a.riskScore >= 8)) && (a as any).improvementStatus !== "완료";
              }).slice(0, 5)).length === 0 ? (
                <div className="py-6 text-center text-muted-foreground text-sm">A등급 미개선 항목이 없습니다</div>
              ) : filteredByDept.filter(a => {
                const lvl = a.riskLevel || "";
                return (lvl === "A등급" || (!lvl && a.riskScore >= 8)) && (a as any).improvementStatus !== "완료";
              }).slice(0, 5).map(a => (
                <div key={a.id} onClick={() => { setActiveTab("list"); setSelectedId(a.id); }} className="flex items-center gap-3 p-2.5 rounded-lg hover:bg-muted/40 cursor-pointer transition-colors border border-transparent hover:border-border">
                  <div className="w-9 h-9 rounded-lg bg-orange-100 flex items-center justify-center shrink-0">
                    <AlertCircle className="w-4 h-4 text-orange-600" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="text-sm font-semibold truncate">{a.hazard}</span>
                      <span className="text-[10px] font-bold px-1.5 py-0.5 rounded-full bg-orange-500 text-white">A등급 {a.riskScore}점</span>
                    </div>
                    <p className="text-xs text-muted-foreground truncate">{a.department} · {a.assessmentDate}</p>
                  </div>
                </div>
              ))}
            </CardContent>
          </Card>

          {/* 위험성 계산표 */}
          <Card className="shadow-sm">
            <CardHeader className="pb-2 pt-4 px-4">
              <CardTitle className="text-sm">위험성 계산표 (가능성 × 중대성)</CardTitle>
            </CardHeader>
            <CardContent className="p-3">
              <div className="overflow-x-auto">
                <table className="w-full border-collapse text-[10px]" style={{ minWidth: 380 }} data-testid="risk-matrix">
                  <thead>
                    <tr>
                      <th className="border border-slate-300 dark:border-slate-600 bg-slate-100 dark:bg-slate-800 p-1 text-center align-middle min-w-[60px]">
                        <div className="text-[9px] text-muted-foreground leading-tight">중대성</div>
                        <div className="text-[9px] font-normal text-muted-foreground leading-tight">가능성</div>
                      </th>
                      {[1, 2, 3, 4].map(s => (
                        <th key={s} className="border border-slate-300 dark:border-slate-600 bg-slate-50 dark:bg-slate-800/60 p-1 text-center">
                          <div className="text-[10px] font-bold leading-tight">{CRITICALITY_LABELS[s]}</div>
                          <div className="text-[9px] text-muted-foreground font-normal leading-tight">({s})</div>
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {[5, 4, 3, 2, 1].map(f => (
                      <tr key={f}>
                        <td className="border border-slate-300 dark:border-slate-600 bg-slate-50 dark:bg-slate-800/60 p-1 text-center">
                          <div className="text-[10px] font-bold leading-tight">{PROBABILITY_LABELS[f]}</div>
                          <div className="text-[9px] text-muted-foreground leading-tight">({f})</div>
                        </td>
                        {[1, 2, 3, 4].map(s => {
                          const score = f * s;
                          const { grade, category } = getRiskGrade(score);
                          const style = getMatrixStyle(score);
                          return (
                            <td key={s} className={`border ${style.border} ${style.bg} ${style.text} p-1 text-center`}>
                              <div className="text-[9px] font-semibold leading-tight">{category}</div>
                              <div className="text-[11px] font-bold">({score})</div>
                              <span className={`text-[8px] font-bold px-1 py-px rounded-full inline-block ${grade === "A" ? "bg-orange-500 text-white" : grade === "B" ? "bg-slate-500 text-white" : "bg-blue-400 text-white"}`}>{grade}등급</span>
                            </td>
                          );
                        })}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              <div className="mt-2 grid grid-cols-1 sm:grid-cols-3 gap-1.5">
                <div className="flex items-start gap-1.5 p-1.5 rounded-md border border-orange-200 bg-orange-50 dark:bg-orange-950/30 dark:border-orange-800">
                  <span className="shrink-0 mt-0.5 bg-orange-500 text-white text-[9px] font-bold px-1 py-0.5 rounded-full">A등급</span>
                  <div><p className="text-[10px] font-semibold text-orange-800 dark:text-orange-300">중점관리 위험도 (8~20)</p><p className="text-[9px] text-orange-700 dark:text-orange-400">중대재해 연계 가능성 높음</p></div>
                </div>
                <div className="flex items-start gap-1.5 p-1.5 rounded-md border border-slate-200 bg-slate-50 dark:bg-slate-800/50 dark:border-slate-600">
                  <span className="shrink-0 mt-0.5 bg-slate-500 text-white text-[9px] font-bold px-1 py-0.5 rounded-full">B등급</span>
                  <div><p className="text-[10px] font-semibold text-slate-700 dark:text-slate-300">일상관리 위험도 (3~7)</p><p className="text-[9px] text-slate-600 dark:text-slate-400">안전 대책으로 예방 가능</p></div>
                </div>
                <div className="flex items-start gap-1.5 p-1.5 rounded-md border border-blue-100 bg-blue-50/50 dark:bg-blue-950/20 dark:border-blue-900">
                  <span className="shrink-0 mt-0.5 bg-blue-400 text-white text-[9px] font-bold px-1 py-0.5 rounded-full">C등급</span>
                  <div><p className="text-[10px] font-semibold text-blue-800 dark:text-blue-300">허용가능 위험도 (1~2)</p><p className="text-[9px] text-blue-700 dark:text-blue-400">일상관리로 예방 가능</p></div>
                </div>
              </div>
            </CardContent>
          </Card>
        </div>
      )}

      {/* ===== 목록 관리 탭 ===== */}
      {activeTab === "list" && (
        <div className="space-y-3">
          {/* 필터 바 */}
          <div className="flex flex-col sm:flex-row gap-2">
            <div className="relative flex-1">
              <Input placeholder="위험요인, 부서, 공정 검색..." value={search} onChange={e => setSearch(e.target.value)} className="pr-8" data-testid="input-search" />
              <Search className="absolute right-2.5 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
            </div>
            <Select value={activeType} onValueChange={v => { setActiveType(v); setFilterGrade(null); setSelectedId(null); }}>
              <SelectTrigger className="w-full sm:w-44 h-9 text-sm border-orange-200 bg-orange-50 dark:bg-orange-900/20 text-orange-700 dark:text-orange-300" data-testid="select-assessment-type-list">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {ASSESSMENT_OPTIONS.map(opt => <SelectItem key={opt.value} value={opt.value}>{opt.label}</SelectItem>)}
              </SelectContent>
            </Select>
            <Select value={filterDept} onValueChange={v => { setFilterDept(v); setFilterGrade(null); setSelectedId(null); }}>
              <SelectTrigger className="w-full sm:w-36" data-testid="select-filter-dept">
                <Filter className="w-3.5 h-3.5 mr-1" /><SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="전체">전체 부서</SelectItem>
                {DEPARTMENTS.map(dept => <SelectItem key={dept} value={dept}>{dept}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>

          {/* 등급 필터 배지 + 전체선택 */}
          <div className="flex items-center gap-2 flex-wrap">
            {riskStats && (Object.entries(riskStats) as [string, number][]).map(([level, count]) => {
              const gradeKey = level[0];
              const isActive = filterGrade === gradeKey;
              return (
                <button key={level} type="button" onClick={() => setFilterGrade(isActive ? null : gradeKey)}
                  className={`inline-flex items-center gap-1 rounded-full text-xs font-semibold px-2.5 py-0.5 transition-all border-2 ${isActive ? `${getRiskBadgeClass(level)} border-white ring-2 ring-offset-1 ring-current scale-105 shadow-md` : `${getRiskBadgeClass(level)} border-transparent opacity-70 hover:opacity-100 hover:scale-105`}`}
                  data-testid={`stat-${level}`}>{level} {count}건</button>
              );
            })}
            <span className="text-xs text-muted-foreground font-medium px-1.5 py-0.5 bg-muted rounded-full border">총 {filteredByDept.length}건</span>
            {filterGrade && <button type="button" onClick={() => setFilterGrade(null)} className="text-[10px] text-muted-foreground hover:text-foreground underline">필터 해제</button>}
          </div>

          {/* 전체 선택 행 */}
          {selectionMode && filteredAssessments.length > 0 && (
            <div className="flex items-center gap-3 px-3 py-2 bg-orange-50 dark:bg-orange-900/20 rounded-lg border border-orange-200 dark:border-orange-800">
              <Checkbox checked={allSelected} onCheckedChange={toggleAll} data-testid="checkbox-select-all" />
              <span className="text-sm text-orange-700 dark:text-orange-300 font-medium">
                전체 선택 ({selectedIds.size}/{filteredAssessments.length})
              </span>
            </div>
          )}

          {/* 카드 목록 */}
          {isLoading ? (
            <div className="space-y-3">{[1,2,3].map(i => <div key={i} className="h-20 bg-muted/20 animate-pulse rounded-lg" />)}</div>
          ) : filteredAssessments.length === 0 ? (
            <div className="py-16 text-center text-muted-foreground">
              <ShieldAlert className="w-12 h-12 mx-auto mb-3 opacity-30" />
              <p className="text-sm">{filterGrade ? `${filterGrade}등급 항목이 없습니다.` : "등록된 평가가 없습니다."}</p>
            </div>
          ) : (
            <AnimatePresence>
              {filteredAssessments.map((item, idx) => {
                const grade = getRiskGrade(item.riskScore);
                const ra = item as any;
                const isSelected = selectedId === item.id;
                const division = DEPT_DIVISION[item.department] || "대구본부";
                const shortName = DEPT_SHORT[item.department] || item.department;
                const isTypeSuji = item.assessmentType === "수시평가";

                return (
                  <motion.div
                    key={item.id}
                    initial={{ opacity: 0, y: 8 }}
                    animate={{ opacity: 1, y: 0 }}
                    exit={{ opacity: 0 }}
                    transition={{ delay: idx * 0.02 }}
                    data-testid={`card-assessment-${item.id}`}
                  >
                    <div
                      onClick={() => selectionMode ? toggleSelect(item.id) : setSelectedId(isSelected ? null : item.id)}
                      className={`border rounded-lg p-3 sm:p-4 cursor-pointer transition-colors ${
                        selectionMode && selectedIds.has(item.id)
                          ? "bg-red-50 border-red-300 dark:bg-red-900/20 dark:border-red-700"
                          : isSelected
                          ? "border-orange-400 bg-orange-50/30 dark:bg-orange-900/10"
                          : "hover:bg-orange-50/40 dark:hover:bg-orange-900/10"
                      }`}
                    >
                      <div className="flex items-start gap-3">
                        {selectionMode ? (
                          <Checkbox
                            checked={selectedIds.has(item.id)}
                            onCheckedChange={() => toggleSelect(item.id)}
                            onClick={e => e.stopPropagation()}
                            className="mt-0.5 shrink-0"
                            data-testid={`checkbox-assessment-${item.id}`}
                          />
                        ) : (
                          <div className="shrink-0 w-10 h-10 rounded-lg bg-orange-100 dark:bg-orange-900/30 flex items-center justify-center text-orange-600 dark:text-orange-400">
                            <ShieldAlert className="w-5 h-5" />
                          </div>
                        )}
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2 flex-wrap mb-1">
                            <span className="font-semibold text-sm truncate">{item.hazard}</span>
                            <span className={`inline-flex items-center gap-1 px-1.5 py-0.5 rounded-full text-[10px] font-bold shrink-0 ${getRiskBadgeClass(grade.label)}`}>{grade.label} {item.riskScore}점</span>
                            <span className={`inline-flex items-center px-1.5 py-0.5 rounded text-[9px] font-bold shrink-0 ${isTypeSuji ? "bg-purple-100 text-purple-700 dark:bg-purple-900/40 dark:text-purple-300" : "bg-blue-100 text-blue-700 dark:bg-blue-900/40 dark:text-blue-300"}`}>{isTypeSuji ? "수시" : "정기"}</span>
                            {getApprovalBadge(ra.approvalStatus)}
                          </div>
                          <div className="flex items-center gap-3 text-xs text-muted-foreground flex-wrap">
                            <span className="flex items-center gap-1"><MapPin className="w-3 h-3" />{shortName}</span>
                            <span className="flex items-center gap-1"><Clock className="w-3 h-3" />{item.assessmentDate}</span>
                            {item.hazardType && <span>{item.hazardType}</span>}
                          </div>
                        </div>
                        {!selectionMode && <ChevronDown className={`w-4 h-4 text-muted-foreground shrink-0 transition-transform ${isSelected ? "rotate-180" : ""}`} />}
                      </div>
                    </div>

                    {/* 인라인 상세 패널 */}
                    <AnimatePresence>
                      {isSelected && (
                        <motion.div initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: "auto" }} exit={{ opacity: 0, height: 0 }} transition={{ duration: 0.2 }}>
                          <div className="border border-t-0 rounded-b-lg border-orange-200 dark:border-orange-800 bg-orange-50/20 dark:bg-orange-900/10 px-4 pb-4 pt-3 space-y-3">
                            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 text-xs">
                              <div><span className="text-muted-foreground block mb-0.5">부서</span><span className="font-medium">{item.department}</span></div>
                              <div><span className="text-muted-foreground block mb-0.5">평가 구분</span><span className="font-medium">{ASSESSMENT_OPTIONS.find(o => o.value === item.assessmentType)?.label || item.assessmentType}</span></div>
                              <div><span className="text-muted-foreground block mb-0.5">담당업무</span><span className="font-medium">{ra.responsibleTask || "-"}</span></div>
                              <div><span className="text-muted-foreground block mb-0.5">공정명</span><span className="font-medium">{item.process || "-"}</span></div>
                            </div>
                            <Separator />
                            <div className="space-y-2 text-xs">
                              {ra.currentIssue && <div><span className="text-muted-foreground font-semibold">현황 및 문제점</span><p className="mt-0.5 text-foreground/80 leading-relaxed">{ra.currentIssue}</p></div>}
                              <div><span className="text-muted-foreground font-semibold">유해위험요인</span><p className="mt-0.5 text-foreground font-medium">{item.hazard}</p></div>
                              {ra.relatedLaw && <div><span className="text-muted-foreground font-semibold">관련법규</span><p className="mt-0.5 text-foreground/80">{ra.relatedLaw}</p></div>}
                              {item.currentControls && <div><span className="text-muted-foreground font-semibold">현재 안전조치</span><p className="mt-0.5 text-foreground/80 leading-relaxed">{item.currentControls}</p></div>}
                            </div>
                            <div className="flex items-center gap-3 p-2 bg-muted/40 rounded-lg text-xs">
                              <span className="text-muted-foreground">가능성</span><span className="font-bold">{item.frequency} ({PROBABILITY_LABELS[item.frequency]})</span>
                              <span className="text-muted-foreground ml-2">중대성</span><span className="font-bold">{item.severity} ({CRITICALITY_LABELS[item.severity]})</span>
                              <span className="text-muted-foreground ml-2">위험도</span>
                              <span className={`font-bold px-2 py-0.5 rounded-full text-xs ${getRiskBadgeClass(grade.label)}`}>{item.riskScore}점 {grade.label}</span>
                            </div>
                            {(ra.beforePhotoUrl || ra.afterPhotoUrl) && (
                              <div className="flex gap-4 flex-wrap">
                                {ra.beforePhotoUrl && <div><p className="text-xs text-muted-foreground font-semibold mb-1">개선 전 사진</p><img src={ra.beforePhotoUrl} alt="개선 전" className="h-24 w-36 object-cover rounded-md border" /></div>}
                                {ra.afterPhotoUrl && <div><p className="text-xs text-muted-foreground font-semibold mb-1">개선 후 사진</p><img src={ra.afterPhotoUrl} alt="개선 후" className="h-24 w-36 object-cover rounded-md border" /></div>}
                              </div>
                            )}
                            {grade.grade === "A" && ra.improvementMeasures && (
                              <div className="p-2 bg-green-50 dark:bg-green-900/20 rounded-lg border border-green-200 dark:border-green-800 text-xs space-y-1">
                                <p className="font-semibold text-green-700 dark:text-green-400">개선 내용</p>
                                <p>{ra.improvementMeasures}</p>
                                <div className="flex gap-3 text-muted-foreground">
                                  {ra.plannedDate && <span>예정일: {ra.plannedDate}</span>}
                                  {ra.completionDate && <span>완료일: {ra.completionDate}</span>}
                                </div>
                              </div>
                            )}
                            <div className="flex gap-2 pt-1 flex-wrap">
                              {isDeptHead && grade.grade === "A" && (
                                <Button variant="outline" size="sm" className="h-8 px-3 text-xs gap-1 border-orange-300 text-orange-700 hover:bg-orange-50" onClick={() => openImprovementDialog(item)} data-testid={`button-improvement-${item.id}`}>
                                  <ClipboardEdit className="w-3.5 h-3.5" />개선 등록
                                </Button>
                              )}
                              {canEditRiskAssessment && isOwner(item) && (
                                <>
                                  <Button variant="outline" size="sm" className="h-8 px-3 text-xs gap-1" onClick={() => handleEdit(item)} data-testid={`button-edit-${item.id}`}>
                                    <Pencil className="w-3.5 h-3.5" />수정
                                  </Button>
                                  <Button variant="outline" size="sm" className="h-8 px-3 text-xs gap-1 border-red-200 text-red-600 hover:bg-red-50" onClick={() => handleDelete(item.id)} data-testid={`button-delete-${item.id}`}>
                                    <Trash2 className="w-3.5 h-3.5" />삭제
                                  </Button>
                                </>
                              )}
                            </div>
                          </div>
                        </motion.div>
                      )}
                    </AnimatePresence>
                  </motion.div>
                );
              })}
            </AnimatePresence>
          )}
        </div>
      )}

      {/* 플로팅 벌크 삭제 바 */}
      {selectionMode && selectedIds.size > 0 && (
        <div className="fixed bottom-6 left-1/2 -translate-x-1/2 z-50 flex items-center gap-3 bg-background border border-border shadow-xl rounded-full px-5 py-3">
          <span className="text-sm font-semibold text-orange-600">{selectedIds.size}건 선택됨</span>
          <div className="w-px h-5 bg-border" />
          <Button variant="ghost" size="sm" className="h-8 text-muted-foreground" onClick={() => setSelectedIds(new Set())}>
            <X className="w-3.5 h-3.5 mr-1" />선택 해제
          </Button>
          <Button
            variant="destructive" size="sm" className="h-8"
            onClick={() => { if (confirm(`선택한 ${selectedIds.size}건을 삭제하시겠습니까?`)) bulkDeleteMutation.mutate(Array.from(selectedIds)); }}
            disabled={bulkDeleteMutation.isPending}
            data-testid="button-bulk-delete"
          >
            <Trash2 className="w-3.5 h-3.5 mr-1" />삭제
          </Button>
        </div>
      )}

      {/* 등록/수정 다이얼로그 */}
      <Dialog open={showForm} onOpenChange={(open) => { if (!open) resetForm(); }}>
        <DialogContent className="max-w-2xl w-[95vw] max-h-[92vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle data-testid="dialog-title">
              {editingId ? "위험성평가 수정" : "새 위험성평가 등록"}
            </DialogTitle>
          </DialogHeader>

          {/* AI 기능 안내 배너 */}
          <div className="flex items-center gap-3 px-3 py-2.5 rounded-xl bg-gradient-to-r from-violet-500/10 via-indigo-500/10 to-blue-500/10 border border-violet-200/60 dark:border-violet-700/40">
            <div className="shrink-0 w-8 h-8 rounded-lg bg-gradient-to-br from-violet-500 to-indigo-500 flex items-center justify-center shadow-sm">
              <Sparkles className="w-4 h-4 text-white" />
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-xs font-bold text-violet-800 dark:text-violet-300">AI 스마트 어시스턴트 사용 가능</p>
              <p className="text-[10px] text-muted-foreground">① 사진 찍고 AI 분석 → ② 위험요인 자동 채워짐 → ③ AI 감소대책 추천 · 확인 버튼만 누르면 완료</p>
            </div>
          </div>

          <div className="space-y-4">
            {/* 기준정보 섹션 */}
            <div className="rounded-lg border bg-orange-50/50 dark:bg-orange-900/10 border-orange-200 dark:border-orange-800 overflow-hidden">
              <div className="bg-orange-100 dark:bg-orange-900/30 px-3 py-2 border-b border-orange-200 dark:border-orange-800">
                <p className="text-sm font-bold text-orange-800 dark:text-orange-300 flex items-center gap-2">
                  <Info className="w-4 h-4" />기준정보
                </p>
              </div>
              <div className="p-3 space-y-3">
                {/* 구분 + 등록자 */}
                <div className="grid grid-cols-2 gap-3">
                  <div className="space-y-1.5">
                    <Label className="text-xs font-semibold">구분 *</Label>
                    <Select value={activeType} onValueChange={setActiveType}>
                      <SelectTrigger className="h-8 text-xs" data-testid="select-assessment-type-form"><SelectValue /></SelectTrigger>
                      <SelectContent>
                        {ASSESSMENT_OPTIONS.map(o => <SelectItem key={o.value} value={o.value} className="text-xs">{o.label}</SelectItem>)}
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="space-y-1.5">
                    <Label className="text-xs font-semibold">등록자</Label>
                    <Input value={header.assessor} onChange={e => setHeader(h => ({ ...h, assessor: e.target.value }))} className="h-8 text-xs" placeholder="등록자" data-testid="input-assessor" />
                  </div>
                </div>

                {/* 부서 + 담당업무 + 공정명 + 평가일 */}
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                  <div className="space-y-1.5">
                    <Label className="text-xs font-semibold">부서(팀파트) *</Label>
                    <Select value={header.department} onValueChange={v => setHeader(h => ({ ...h, department: v }))}>
                      <SelectTrigger className="h-8 text-xs" data-testid="select-department"><SelectValue placeholder="부서 선택" /></SelectTrigger>
                      <SelectContent>
                        {DEPARTMENTS.map(d => <SelectItem key={d} value={d} className="text-xs">{d}</SelectItem>)}
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="space-y-1.5">
                    <Label className="text-xs font-semibold">담당업무</Label>
                    <Select
                      value={header.responsibleTask}
                      onValueChange={v => {
                        const procs = TASK_PROCESS_MAP[v] || [];
                        setHeader(h => ({ ...h, responsibleTask: v }));
                        if (procs.length === 1) setItems(prev => prev.map((it, i) => i === 0 ? { ...it, process: procs[0] } : it));
                      }}
                    >
                      <SelectTrigger className="h-8 text-xs" data-testid="select-responsible-task"><SelectValue placeholder="담당업무 선택" /></SelectTrigger>
                      <SelectContent>
                        {RESPONSIBLE_TASKS.map(t => <SelectItem key={t} value={t} className="text-xs">{t}</SelectItem>)}
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="space-y-1.5">
                    <Label className="text-xs font-semibold">평가일</Label>
                    <Input type="date" value={header.assessmentDate} onChange={e => setHeader(h => ({ ...h, assessmentDate: e.target.value }))} className="h-8 text-xs" data-testid="input-assessment-date" />
                  </div>
                  <div className="space-y-1.5">
                    <Label className="text-xs font-semibold">부서장</Label>
                    <Popover open={deptHeadPopoverOpen} onOpenChange={open => { setDeptHeadPopoverOpen(open); if (!open) setDeptHeadSearch(""); }}>
                      <PopoverTrigger asChild>
                        <Button variant="outline" size="sm" className={`w-full gap-1.5 h-8 text-xs justify-start ${header.departmentHead ? "border-blue-400 text-blue-700 bg-blue-50 hover:bg-blue-100 dark:bg-blue-900/20 dark:border-blue-700 dark:text-blue-300" : "border-dashed"}`} data-testid="button-dept-head-search">
                          <Users className="w-3.5 h-3.5 shrink-0" />
                          <span className="truncate">{header.departmentHead || "부서장 선택"}</span>
                        </Button>
                      </PopoverTrigger>
                      <PopoverContent className="w-64 p-0" align="start">
                        <div className="p-2 border-b">
                          <Input placeholder="이름 검색..." value={deptHeadSearch} onChange={e => setDeptHeadSearch(e.target.value)} className="h-8 text-xs" autoFocus data-testid="input-dept-head-search" />
                        </div>
                        <div className="max-h-52 overflow-y-auto">
                          {header.departmentHead && !deptHeadSearch && (
                            <div className="p-1.5 border-b">
                              <button type="button" className="w-full text-left px-2 py-1.5 rounded text-xs text-red-500 hover:bg-red-50 flex items-center gap-1.5" onClick={() => { setHeader(h => ({ ...h, departmentHead: "" })); setDeptHeadPopoverOpen(false); }}>
                                <X className="w-3 h-3" />선택 해제 ({header.departmentHead})
                              </button>
                            </div>
                          )}
                          {deptHeadSearch && (() => {
                            const filtered = (userNames || []).filter(u => u.name.includes(deptHeadSearch) || u.department?.includes(deptHeadSearch));
                            if (!filtered.length) return <p className="text-xs text-muted-foreground px-3 py-4 text-center">검색 결과 없음</p>;
                            return (
                              <div className="p-1.5 space-y-0.5">
                                {filtered.map(u => (
                                  <button key={u.id} type="button" className={`w-full text-left px-2 py-1.5 rounded text-xs hover:bg-muted flex items-center justify-between gap-2 ${header.departmentHead === u.name ? "bg-blue-50 text-blue-700 font-semibold" : ""}`} onClick={() => selectDeptHead(u.name)}>
                                    <span className="font-medium">{u.name}</span>
                                    {u.department && <span className="text-muted-foreground text-[10px] shrink-0">{u.department}</span>}
                                  </button>
                                ))}
                              </div>
                            );
                          })()}
                          {!deptHeadSearch && recentDeptHeads.length > 0 && (
                            <div className="border-t p-1.5 space-y-0.5">
                              <p className="text-[10px] text-muted-foreground px-2 py-0.5 font-semibold flex items-center gap-1"><Clock className="w-2.5 h-2.5" />최근 선택</p>
                              {recentDeptHeads.map(name => (
                                <button key={name} type="button" className={`w-full text-left px-2 py-1.5 rounded text-xs hover:bg-muted flex items-center gap-1.5 ${header.departmentHead === name ? "bg-blue-50 text-blue-700 font-semibold" : "text-muted-foreground"}`} onClick={() => selectDeptHead(name)}>
                                  <Clock className="w-2.5 h-2.5 shrink-0" />{name}
                                </button>
                              ))}
                            </div>
                          )}
                        </div>
                      </PopoverContent>
                    </Popover>
                  </div>
                </div>


              </div>
            </div>

            {/* 위험요인 항목들 */}
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <Label className="text-sm font-semibold">위험요인 항목 <span className="text-muted-foreground font-normal">({items.length}/10)</span></Label>
                {!editingId && (
                  <Button variant="outline" size="sm" onClick={addItem} className="gap-1 h-8 text-xs" disabled={items.length >= 10} data-testid="button-add-item">
                    <Plus className="w-3 h-3" />항목 추가
                  </Button>
                )}
              </div>

              {items.map((item, idx) => {
                const score = item.probability * item.criticality;
                const { grade, label } = getRiskGrade(score);
                const style = getMatrixStyle(score);
                const isExpanded = expandedItemIdx === idx;

                return (
                  <Card key={idx} className={`border transition-all duration-200 ${isExpanded ? "border-primary/30 shadow-sm" : "border-border/60"}`}>
                    <div
                      role="button" tabIndex={0}
                      className="w-full p-3 flex items-center justify-between cursor-pointer select-none"
                      onClick={() => setExpandedItemIdx(isExpanded ? -1 : idx)}
                      onKeyDown={e => e.key === "Enter" && setExpandedItemIdx(isExpanded ? -1 : idx)}
                      data-testid={`button-toggle-item-${idx}`}
                    >
                      <div className="flex items-center gap-2 min-w-0 flex-1">
                        <span className="text-sm font-semibold text-primary shrink-0">항목 {idx + 1}</span>
                        {item.hazard && !isExpanded && <span className="text-xs text-muted-foreground truncate max-w-[120px] sm:max-w-[200px]">{item.hazard}</span>}
                      </div>
                      <div className="flex items-center gap-2 shrink-0">
                        <div className={`flex items-center gap-1.5 px-2 py-0.5 rounded-md text-xs font-semibold border ${style.border} ${style.bg} ${style.text}`}>
                          <span>{score}점</span>
                          <span className={`px-1.5 py-0.5 rounded-full text-[10px] font-bold ${grade === "A" ? "bg-orange-500 text-white" : grade === "B" ? "bg-slate-500 text-white" : "bg-blue-400 text-white"}`}>{label}</span>
                        </div>
                        {items.length > 1 && (
                          <div role="button" tabIndex={0} className="p-0.5 rounded hover:bg-red-50 text-red-400 hover:text-red-600 cursor-pointer"
                            onClick={e => { e.stopPropagation(); removeItem(idx); }}
                            onKeyDown={e => { if (e.key === "Enter") { e.stopPropagation(); removeItem(idx); } }}
                            data-testid={`button-remove-item-${idx}`}
                          >
                            <X className="w-3.5 h-3.5" />
                          </div>
                        )}
                        <span className={`text-muted-foreground transition-transform duration-200 ${isExpanded ? "rotate-180" : ""}`}>
                          <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><polyline points="6 9 12 15 18 9" /></svg>
                        </span>
                      </div>
                    </div>

                    {isExpanded && (
                      <CardContent className="p-3 pt-0 space-y-3 border-t border-border/40">
                        {/* 공정명 + 위험유형 */}
                        <div className="grid grid-cols-2 gap-3">
                          <div className="space-y-1.5">
                            <Label className="text-xs font-semibold">공정명</Label>
                            {header.responsibleTask === "운용팀" ? (
                              <Select value={item.process} onValueChange={v => updateItem(idx, "process", v)}>
                                <SelectTrigger className="text-xs" data-testid={`select-process-${idx}`}><SelectValue placeholder="공정명 선택" /></SelectTrigger>
                                <SelectContent>
                                  {TASK_PROCESS_MAP["운용팀"].map(p => <SelectItem key={p} value={p}>{p}</SelectItem>)}
                                </SelectContent>
                              </Select>
                            ) : (
                              <Input value={item.process} onChange={e => updateItem(idx, "process", e.target.value)} placeholder="공정 또는 작업명"
                                readOnly={!!header.responsibleTask && header.responsibleTask !== "운용팀"}
                                className={`text-xs ${header.responsibleTask && header.responsibleTask !== "운용팀" ? "bg-muted/50 text-muted-foreground" : ""}`}
                                data-testid={`input-process-${idx}`}
                              />
                            )}
                          </div>
                          <div className="space-y-1.5">
                            <Label className="text-xs font-semibold">위험유형</Label>
                            <Select value={item.hazardType} onValueChange={v => updateItem(idx, "hazardType", v)}>
                              <SelectTrigger className="text-xs" data-testid={`select-hazard-type-${idx}`}><SelectValue placeholder="선택" /></SelectTrigger>
                              <SelectContent>
                                {HAZARD_TYPES.map(t => <SelectItem key={t} value={t}>{t}</SelectItem>)}
                              </SelectContent>
                            </Select>
                          </div>
                        </div>

                        {/* ① STEP 1 — 현장 사진 + AI 위험 분석 */}
                        <div className="rounded-xl border-2 border-violet-200 dark:border-violet-700/50 bg-violet-50/50 dark:bg-violet-950/20 p-3 space-y-2.5">
                          <div className="flex items-center gap-2">
                            <span className="shrink-0 w-5 h-5 rounded-full bg-violet-500 text-white text-[10px] font-bold flex items-center justify-center">1</span>
                            <span className="text-xs font-bold text-violet-800 dark:text-violet-300">현장 사진 촬영 · AI 위험 자동 분석</span>
                          </div>
                          <div className="flex items-center gap-2 flex-wrap">
                            {item.beforePhotoUrl ? (
                              <div className="relative inline-block">
                                <img src={item.beforePhotoUrl} alt="현장 사진" className="h-20 w-32 object-cover rounded-md border" />
                                <button type="button" className="absolute -top-1.5 -right-1.5 bg-red-500 text-white rounded-full w-5 h-5 flex items-center justify-center shadow" onClick={() => updateItem(idx, "beforePhotoUrl", "")}>
                                  <X className="w-3 h-3" />
                                </button>
                              </div>
                            ) : (
                              <label className={`inline-flex items-center gap-1.5 h-8 px-3 rounded-md border border-input bg-white dark:bg-slate-900 text-xs font-medium cursor-pointer hover:bg-accent hover:text-accent-foreground transition-colors ${uploadingPhoto === `${idx}` ? "opacity-50 cursor-not-allowed pointer-events-none" : ""}`} data-testid={`button-before-photo-${idx}`}>
                                <input type="file" accept="image/*,image/heic,image/heif" className="sr-only"
                                  onChange={e => { const f = e.target.files?.[0]; if (f) uploadPhoto(idx, f); e.currentTarget.value = ""; }}
                                  disabled={uploadingPhoto === `${idx}`}
                                />
                                <Camera className="w-3.5 h-3.5" />
                                {uploadingPhoto === `${idx}` ? "업로드 중..." : "사진만 저장"}
                              </label>
                            )}
                            <label className={`inline-flex items-center gap-1.5 h-8 px-3 rounded-md text-xs font-semibold cursor-pointer transition-all shadow-sm ${aiAnalyzing === idx ? "bg-violet-200 text-violet-700 opacity-60 pointer-events-none" : "bg-gradient-to-r from-violet-500 to-indigo-500 text-white hover:from-violet-600 hover:to-indigo-600"}`} data-testid={`button-ai-photo-${idx}`}>
                              <input type="file" accept="image/*,image/heic,image/heif" className="sr-only"
                                onChange={e => { const f = e.target.files?.[0]; if (f) analyzePhotoWithAI(idx, f); e.currentTarget.value = ""; }}
                                disabled={aiAnalyzing === idx}
                              />
                              {aiAnalyzing === idx ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <ScanSearch className="w-3.5 h-3.5" />}
                              {aiAnalyzing === idx ? "AI 분석 중..." : "📸 사진 찍고 AI 분석"}
                            </label>
                          </div>
                          <p className="text-[10px] text-violet-600 dark:text-violet-400">사진을 올리면 AI가 위험요인·유형을 자동으로 파악해 아래 항목을 채워줍니다</p>
                        </div>

                        {/* ② STEP 2 — 유해위험요인 (AI 결과 자동 채워짐) */}
                        <div className="rounded-xl border-2 border-orange-200 dark:border-orange-700/50 bg-orange-50/40 dark:bg-orange-950/20 p-3 space-y-2">
                          <div className="flex items-center gap-2">
                            <span className="shrink-0 w-5 h-5 rounded-full bg-orange-500 text-white text-[10px] font-bold flex items-center justify-center">2</span>
                            <span className="text-xs font-bold text-orange-800 dark:text-orange-300">유해위험요인 확인 · 수정</span>
                            {aiPhotoResult[idx] && <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-violet-100 text-violet-700 font-semibold">✨ AI 자동 입력됨</span>}
                          </div>
                          <Input value={item.hazard} onChange={e => updateItem(idx, "hazard", e.target.value)} placeholder="유해위험요인을 입력하세요" className="text-xs bg-white dark:bg-slate-900" data-testid={`input-hazard-${idx}`} />
                          {aiPhotoResult[idx] && (
                            <motion.div initial={{ opacity: 0, y: -6 }} animate={{ opacity: 1, y: 0 }} className="rounded-lg border border-violet-200 bg-gradient-to-br from-violet-50 to-purple-50 dark:from-violet-950/30 dark:to-purple-950/30 p-2.5 space-y-1.5">
                              <div className="flex items-center justify-between">
                                <div className="flex items-center gap-1.5 text-violet-700 dark:text-violet-400">
                                  <Sparkles className="w-3 h-3" />
                                  <span className="text-[11px] font-bold">AI 분석 상세</span>
                                </div>
                                <div className="flex items-center gap-1.5">
                                  <span className={`text-[10px] font-bold px-1.5 py-0.5 rounded-full ${aiPhotoResult[idx].urgency === "높음" ? "bg-red-100 text-red-700" : aiPhotoResult[idx].urgency === "보통" ? "bg-amber-100 text-amber-700" : "bg-green-100 text-green-700"}`}>위험도 {aiPhotoResult[idx].urgency}</span>
                                  <button type="button" onClick={() => setAiPhotoResult(p => { const n = {...p}; delete n[idx]; return n; })} className="text-muted-foreground hover:text-foreground"><X className="w-3 h-3" /></button>
                                </div>
                              </div>
                              <p className="text-xs text-violet-800 dark:text-violet-300 leading-relaxed">{aiPhotoResult[idx].summary}</p>
                              {aiPhotoResult[idx].details?.length > 0 && (
                                <ul className="space-y-1">
                                  {aiPhotoResult[idx].details.map((d, i) => (
                                    <li key={i} className="flex items-start gap-1.5 text-xs text-foreground/80">
                                      <TriangleAlert className="w-3 h-3 text-amber-500 mt-0.5 shrink-0" />{d}
                                    </li>
                                  ))}
                                </ul>
                              )}
                            </motion.div>
                          )}
                        </div>

                        {/* 관련법규 */}
                        <div className="space-y-1.5">
                          <Label className="text-xs font-semibold">관련법규</Label>
                          <Textarea value={item.relatedLaw} onChange={e => updateItem(idx, "relatedLaw", e.target.value)} placeholder="관련 법규를 입력하세요 (선택)" rows={2} className="text-xs" data-testid={`input-related-law-${idx}`} />
                        </div>

                        {/* ③ STEP 3 — 현재 안전조치 + AI 자동 입력 */}
                        <div className="rounded-xl border-2 border-indigo-200 dark:border-indigo-700/50 bg-indigo-50/40 dark:bg-indigo-950/20 p-3 space-y-2.5">
                          <div className="flex items-center justify-between">
                            <div className="flex items-center gap-2">
                              <span className="shrink-0 w-5 h-5 rounded-full bg-indigo-500 text-white text-[10px] font-bold flex items-center justify-center">3</span>
                              <span className="text-xs font-bold text-indigo-800 dark:text-indigo-300">현재 안전조치</span>
                            </div>
                            <button
                              type="button"
                              onClick={() => suggestMeasuresWithAI(idx)}
                              disabled={aiSuggesting === idx}
                              className="inline-flex items-center gap-1 text-[11px] font-semibold px-2.5 py-1 rounded-md bg-gradient-to-r from-indigo-500 to-blue-500 text-white hover:from-indigo-600 hover:to-blue-600 transition-all disabled:opacity-60 shadow-sm"
                              data-testid={`button-ai-suggest-${idx}`}
                            >
                              {aiSuggesting === idx ? <Loader2 className="w-3 h-3 animate-spin" /> : <Sparkles className="w-3 h-3" />}
                              {aiSuggesting === idx ? "AI 입력 중..." : "✨ AI 자동 입력"}
                            </button>
                          </div>
                          <Textarea value={item.currentControls} onChange={e => updateItem(idx, "currentControls", e.target.value)} placeholder="직접 입력하거나 ✨ AI 자동 입력 버튼을 눌러 자동 생성" rows={4} className="text-xs bg-white dark:bg-slate-900" data-testid={`input-current-controls-${idx}`} />
                          <p className="text-[10px] text-indigo-600 dark:text-indigo-400">AI 자동 입력 버튼을 누르면 위험요인 기반 안전조치가 바로 채워집니다 (수정 가능)</p>
                        </div>

                        {/* 위험성 결정 */}
                        <div className="p-2.5 bg-muted/40 rounded-lg border space-y-2">
                          <div className="flex items-center justify-between flex-wrap gap-1">
                            <Label className="text-xs font-bold">위험성 결정 (가능성 × 중대성)</Label>
                            {aiPhotoResult[idx]?.probability && (
                              <span className="text-[10px] px-2 py-0.5 rounded-full bg-violet-100 text-violet-700 dark:bg-violet-900/40 dark:text-violet-300 font-semibold">
                                ✨ AI 추천: 가능성 {aiPhotoResult[idx].probability} × 중대성 {aiPhotoResult[idx].criticality} (수정 가능)
                              </span>
                            )}
                          </div>
                          <div className="grid grid-cols-2 gap-3">
                            <div className="space-y-1.5">
                              <Label className="text-xs text-muted-foreground">가능성 (1~5)</Label>
                              <Select value={String(item.probability)} onValueChange={v => updateItem(idx, "probability", Number(v))}>
                                <SelectTrigger className="text-xs" data-testid={`select-probability-${idx}`}><SelectValue /></SelectTrigger>
                                <SelectContent>
                                  {[1, 2, 3, 4, 5].map(n => <SelectItem key={n} value={String(n)} className="text-xs">{n} - {PROBABILITY_LABELS[n]}</SelectItem>)}
                                </SelectContent>
                              </Select>
                            </div>
                            <div className="space-y-1.5">
                              <Label className="text-xs text-muted-foreground">중대성 (1~4)</Label>
                              <Select value={String(item.criticality)} onValueChange={v => updateItem(idx, "criticality", Number(v))}>
                                <SelectTrigger className="text-xs" data-testid={`select-criticality-${idx}`}><SelectValue /></SelectTrigger>
                                <SelectContent>
                                  {[1, 2, 3, 4].map(n => <SelectItem key={n} value={String(n)} className="text-xs">{n} - {CRITICALITY_LABELS[n]}</SelectItem>)}
                                </SelectContent>
                              </Select>
                            </div>
                          </div>
                          <div className={`flex items-center gap-2 px-3 py-2 rounded-md border text-sm font-semibold ${style.border} ${style.bg} ${style.text}`}>
                            <span>위험도: {score}점</span>
                            <span className={`px-2 py-0.5 rounded-full text-xs font-bold ${grade === "A" ? "bg-orange-500 text-white" : grade === "B" ? "bg-slate-500 text-white" : "bg-blue-400 text-white"}`}>{label}</span>
                          </div>
                        </div>
                      </CardContent>
                    )}
                  </Card>
                );
              })}
            </div>
          </div>

          <DialogFooter className="gap-2 pt-2 flex-col sm:flex-row">
            <Button variant="outline" onClick={resetForm} data-testid="button-cancel">취소</Button>
            <div className="flex gap-2">
              <Button
                variant="outline"
                onClick={() => handleSubmit(true)}
                disabled={batchMutation.isPending || updateMutation.isPending}
                className="gap-2 border-slate-300 text-slate-700 hover:bg-slate-50"
                data-testid="button-save-draft"
              >
                <Save className="w-4 h-4" />
                {(batchMutation.isPending || updateMutation.isPending) && saveAsDraft ? "저장 중..." : "임시저장"}
              </Button>
              <Button
                onClick={() => handleSubmit(false)}
                disabled={batchMutation.isPending || updateMutation.isPending}
                className="bg-orange-500 hover:bg-orange-600 text-white gap-2"
                data-testid="button-submit"
              >
                <CheckCircle2 className="w-4 h-4" />
                {(batchMutation.isPending || updateMutation.isPending) && !saveAsDraft ? "처리 중..." : editingId ? "수정 완료" : "승인요청"}
              </Button>
            </div>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* 개선 등록 다이얼로그 (A등급 전용) */}
      <Dialog open={!!improvingItem} onOpenChange={(open) => { if (!open) setImprovingItem(null); }}>
        <DialogContent className="max-w-lg w-[95vw] max-h-[92vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <ClipboardEdit className="w-5 h-5 text-orange-500" />개선 등록
            </DialogTitle>
          </DialogHeader>

          {improvingItem && (
            <div className="space-y-4">
              <div className="p-3 bg-orange-50 dark:bg-orange-900/20 rounded-lg border border-orange-200 dark:border-orange-800 space-y-1.5">
                <p className="text-xs font-semibold text-orange-700 dark:text-orange-400 mb-1">현재 위험성 정보 (A등급 중점관리)</p>
                <div className="grid grid-cols-2 gap-x-4 gap-y-1 text-xs">
                  <div><span className="text-muted-foreground">부서:</span> <span className="font-medium">{improvingItem.department}</span></div>
                  <div className="col-span-2"><span className="text-muted-foreground">유해위험요인:</span> <span className="font-medium">{improvingItem.hazard}</span></div>
                  <div><span className="text-muted-foreground">가능성:</span> <span className="font-bold text-orange-700">{improvingItem.frequency}</span> ({PROBABILITY_LABELS[improvingItem.frequency]})</div>
                  <div><span className="text-muted-foreground">중대성:</span> <span className="font-bold text-orange-700">{improvingItem.severity}</span> ({CRITICALITY_LABELS[improvingItem.severity]})</div>
                  <div className="col-span-2"><span className="text-muted-foreground">위험도:</span> <span className="font-bold text-orange-600 text-base">{improvingItem.riskScore}점</span> (A등급·중점관리)</div>
                </div>
              </div>

              <div className="space-y-1.5">
                <Label className="text-sm font-semibold">개선대책 *</Label>
                <Textarea value={improvementForm.improvementMeasures} onChange={e => setImprovementForm(f => ({ ...f, improvementMeasures: e.target.value }))} placeholder="개선대책을 구체적으로 입력하세요" rows={3} data-testid="input-improvement-measures" />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1.5">
                  <Label className="text-sm font-semibold">개선예정일 *</Label>
                  <Input type="date" value={improvementForm.plannedDate} onChange={e => setImprovementForm(f => ({ ...f, plannedDate: e.target.value }))} data-testid="input-planned-date" />
                </div>
                <div className="space-y-1.5">
                  <Label className="text-sm font-semibold">개선완료일</Label>
                  <Input type="date" value={improvementForm.completionDate} onChange={e => setImprovementForm(f => ({ ...f, completionDate: e.target.value }))} data-testid="input-completion-date" />
                  <p className="text-[10px] text-muted-foreground">완료 시 입력 (선택)</p>
                </div>
              </div>

              <div className="p-3 bg-muted/40 rounded-lg border space-y-3">
                <p className="text-sm font-semibold">개선 후 위험성 재평가</p>
                <div className="grid grid-cols-2 gap-3">
                  <div className="space-y-1.5">
                    <Label className="text-xs">개선후 가능성 (1~5)</Label>
                    <Select value={String(improvementForm.afterFrequency)} onValueChange={v => setImprovementForm(f => ({ ...f, afterFrequency: Number(v) }))}>
                      <SelectTrigger data-testid="select-after-frequency"><SelectValue /></SelectTrigger>
                      <SelectContent>{[1, 2, 3, 4, 5].map(n => <SelectItem key={n} value={String(n)}>{n} - {PROBABILITY_LABELS[n]}</SelectItem>)}</SelectContent>
                    </Select>
                  </div>
                  <div className="space-y-1.5">
                    <Label className="text-xs">개선후 중대성 (1~4)</Label>
                    <Select value={String(improvementForm.afterSeverity)} onValueChange={v => setImprovementForm(f => ({ ...f, afterSeverity: Number(v) }))}>
                      <SelectTrigger data-testid="select-after-severity"><SelectValue /></SelectTrigger>
                      <SelectContent>{[1, 2, 3, 4].map(n => <SelectItem key={n} value={String(n)}>{n} - {CRITICALITY_LABELS[n]}</SelectItem>)}</SelectContent>
                    </Select>
                  </div>
                </div>
                {(() => {
                  const afterScore = improvementForm.afterFrequency * improvementForm.afterSeverity;
                  const afterGrade = getRiskGrade(afterScore);
                  const afterStyle = getMatrixStyle(afterScore);
                  return (
                    <div className={`flex items-center gap-2 px-3 py-2 rounded-md border text-sm font-semibold ${afterStyle.border} ${afterStyle.bg} ${afterStyle.text}`}>
                      <span>개선후 위험도: {afterScore}점</span>
                      <span className={`px-1.5 py-0.5 rounded-full text-[11px] font-bold ${afterGrade.grade === "A" ? "bg-orange-500 text-white" : afterGrade.grade === "B" ? "bg-slate-500 text-white" : "bg-blue-400 text-white"}`}>
                        {afterGrade.label} ({afterGrade.category})
                      </span>
                    </div>
                  );
                })()}
              </div>

              <div className="space-y-1.5">
                <Label className="text-sm font-semibold">개선 후 사진</Label>
                {improvementForm.afterPhotoUrl ? (
                  <div className="relative inline-block">
                    <img src={improvementForm.afterPhotoUrl} alt="개선 후" className="h-28 w-44 object-cover rounded-md border" />
                    <button type="button" className="absolute -top-1.5 -right-1.5 bg-red-500 text-white rounded-full w-5 h-5 flex items-center justify-center shadow" onClick={() => setImprovementForm(f => ({ ...f, afterPhotoUrl: "" }))}>
                      <X className="w-3 h-3" />
                    </button>
                  </div>
                ) : (
                  <label className={`inline-flex items-center gap-1.5 h-9 px-3 rounded-md border border-input bg-background text-sm font-medium cursor-pointer hover:bg-accent hover:text-accent-foreground transition-colors ${uploadingImprovementPhoto ? "opacity-50 cursor-not-allowed pointer-events-none" : ""}`} data-testid="button-improvement-photo">
                    <input type="file" accept="image/*,image/heic,image/heif" className="sr-only"
                      onChange={e => { const f = e.target.files?.[0]; if (f) uploadImprovementPhoto(f); e.currentTarget.value = ""; }}
                      disabled={uploadingImprovementPhoto}
                    />
                    <Camera className="w-4 h-4" />
                    {uploadingImprovementPhoto ? "업로드 중..." : "개선 후 사진 추가"}
                  </label>
                )}
              </div>
            </div>
          )}

          <DialogFooter className="gap-2 pt-2">
            <Button variant="outline" onClick={() => setImprovingItem(null)} data-testid="button-improvement-cancel">취소</Button>
            <Button
              onClick={handleImprovementSubmit}
              disabled={improvementMutation.isPending || approveMutation.isPending}
              className="bg-orange-500 hover:bg-orange-600 text-white gap-2"
              data-testid="button-improvement-submit"
            >
              <CheckCircle2 className="w-4 h-4" />
              {(improvementMutation.isPending || approveMutation.isPending) ? "저장 중..." : "개선 내용 저장"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* 플로팅 벌크 액션 바 */}
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
            onClick={() => { if (confirm(`선택한 ${selectedIds.size}건을 삭제하시겠습니까?`)) bulkDeleteMutation.mutate(Array.from(selectedIds)); }}
            data-testid="button-bulk-delete"
          >
            <Trash2 className="w-3.5 h-3.5 mr-1" />삭제
          </Button>
        </div>
      )}
    </div>
  );
}
