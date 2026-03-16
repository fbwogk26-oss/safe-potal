import { useQuery, useMutation } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Textarea } from "@/components/ui/textarea";
import { ShieldAlert, Plus, Trash2, Pencil, Camera, X, Info, ClipboardEdit, CheckCircle2, Clock, FileDown, Download, UserCheck, CircleCheck, AlertCircle, Users } from "lucide-react";
import { useState, useMemo, useRef } from "react";
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
const shortDept = (dept: string) => DEPT_SHORT[dept] ?? dept;
const DeptCell = ({ dept }: { dept: string }) => {
  const name = shortDept(dept);
  if (name.length === 4) {
    return <span className="text-xs font-semibold text-foreground leading-tight text-center">{name.slice(0, 2)}<br />{name.slice(2)}</span>;
  }
  return <span className="text-xs font-semibold text-foreground leading-tight">{name}</span>;
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

const getAutoProcess = (task: string): string => {
  const processes = TASK_PROCESS_MAP[task];
  if (!processes || processes.length === 0) return "";
  if (processes.length === 1) return processes[0];
  return ""; // 운용팀처럼 여러 개인 경우 수동 선택
};
const ASSESSMENT_TABS = [
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

function getRiskGrade(score: number): { grade: string; label: string; category: string } {
  if (score >= 8) return { grade: "A", label: "A등급", category: "중점관리" };
  if (score >= 3) return { grade: "B", label: "B등급", category: "일상관리" };
  return { grade: "C", label: "C등급", category: "허용가능" };
}

function getRiskLevel(score: number): string {
  return getRiskGrade(score).label;
}

function getMatrixStyle(score: number): { bg: string; text: string; border: string } {
  if (score >= 8) return { bg: "bg-orange-100 dark:bg-orange-900/40", text: "text-orange-900 dark:text-orange-200", border: "border-orange-300 dark:border-orange-700" };
  if (score >= 3) return { bg: "bg-slate-100 dark:bg-slate-700/60", text: "text-slate-700 dark:text-slate-200", border: "border-slate-300 dark:border-slate-600" };
  return { bg: "bg-white dark:bg-slate-900/40", text: "text-slate-500 dark:text-slate-400", border: "border-slate-200 dark:border-slate-700" };
}

function getRiskBadgeVariant(level: string) {
  if (level === "A등급" || level.includes("중점")) return { className: "bg-orange-500 text-white dark:bg-orange-600" };
  if (level === "B등급" || level.includes("일상")) return { className: "bg-slate-500 text-white dark:bg-slate-600" };
  return { className: "bg-blue-400 text-white dark:bg-blue-600" };
}

interface RiskItem {
  process: string;
  hazard: string;
  hazardType: string;
  currentControls: string;
  probability: number;
  criticality: number;
  beforePhotoUrl: string;
}

const defaultItem = (): RiskItem => ({
  process: "", hazard: "", hazardType: "", currentControls: "",
  probability: 1, criticality: 1,
  beforePhotoUrl: "",
});

interface FormHeader {
  department: string;
  assessor: string;
  assessmentDate: string;
  responsibleTask: string;
  departmentHead: string;
}

interface UserName {
  id: string;
  name: string;
  username: string;
  department: string;
}

export default function RiskAssessmentPage() {
  const { canEditRiskAssessment, canDownloadRiskAssessmentExcel } = usePermissions();
  const { user } = useAuth();
  const { toast } = useToast();
  const [isDownloading, setIsDownloading] = useState(false);

  const handleDownloadExcel = async (dept: string) => {
    if (isDownloading) return;
    setIsDownloading(true);
    try {
      const params = new URLSearchParams({ department: dept });
      const res = await fetch(`/api/risk-assessments/excel?${params}`, { credentials: "include" });
      if (!res.ok) throw new Error("다운로드 실패");
      const blob = await res.blob();
      const today = new Date().toISOString().slice(0, 10).replace(/-/g, "");
      const deptLabel = dept === "전체" ? "전체부서" : dept;
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `위험성평가_${deptLabel}_${today}.xlsx`;
      a.click();
      URL.revokeObjectURL(url);
    } catch {
      toast({ title: "다운로드 실패", description: "엑셀 파일 생성에 실패했습니다.", variant: "destructive" });
    } finally {
      setIsDownloading(false);
    }
  };
  const [activeTab, setActiveTab] = useState("상반기정기평가");
  const [filterDept, setFilterDept] = useState("전체");
  const [filterGrade, setFilterGrade] = useState<string | null>(null);
  const [showForm, setShowForm] = useState(false);
  const [editingId, setEditingId] = useState<number | null>(null);
  const [header, setHeader] = useState<FormHeader>({
    department: "",
    assessor: user?.name || user?.username || "",
    assessmentDate: format(new Date(), "yyyy-MM-dd"),
    responsibleTask: "",
    departmentHead: "",
  });
  const [approvingItem, setApprovingItem] = useState<RiskAssessment | null>(null);
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
  const beforePhotoRefs = useRef<(HTMLInputElement | null)[]>([]);

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
  const improvementPhotoRef = useRef<HTMLInputElement | null>(null);

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
    mutationFn: (id: number) => apiRequest("DELETE", `/api/risk-assessments/${id}`),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/risk-assessments"] });
      toast({ title: "위험성평가가 삭제되었습니다." });
    },
    onError: () => toast({ variant: "destructive", title: "삭제 실패" }),
  });

  const improvementMutation = useMutation({
    mutationFn: ({ id, data }: { id: number; data: typeof improvementForm }) =>
      apiRequest("PUT", `/api/risk-assessments/${id}/improvement`, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/risk-assessments"] });
      setImprovingItem(null);
      toast({ title: "개선 내용이 등록되었습니다." });
    },
    onError: () => toast({ variant: "destructive", title: "개선 등록 실패" }),
  });

  const approveMutation = useMutation({
    mutationFn: ({ id, approvedBy }: { id: number; approvedBy: string }) =>
      apiRequest("PUT", `/api/risk-assessments/${id}/approve`, { approvedBy }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/risk-assessments"] });
      setApprovingItem(null);
      toast({ title: "부서장 승인이 완료되었습니다." });
    },
    onError: () => toast({ variant: "destructive", title: "승인 처리 실패" }),
  });

  const resetForm = () => {
    setHeader({ department: "", assessor: user?.name || user?.username || "", assessmentDate: format(new Date(), "yyyy-MM-dd"), responsibleTask: "", departmentHead: "" });
    setItems([defaultItem()]);
    setExpandedItemIdx(0);
    setEditingId(null);
    setShowForm(false);
  };

  const handleSubmit = () => {
    if (!header.department) {
      toast({ variant: "destructive", title: "부서는 필수입니다." });
      return;
    }
    for (const item of items) {
      if (!item.hazard) {
        toast({ variant: "destructive", title: "모든 항목의 유해위험요인을 입력해주세요." });
        return;
      }
    }
    const tabLabel = ASSESSMENT_TABS.find(t => t.value === activeTab)?.label || activeTab;
    const autoTitle = `${header.department} ${tabLabel} (${header.assessmentDate})`;
    if (editingId !== null) {
      const item = items[0];
      const score = item.probability * item.criticality;
      updateMutation.mutate({
        id: editingId,
        data: {
          title: autoTitle, ...header, assessmentType: activeTab,
          responsibleTask: header.responsibleTask || null,
          departmentHead: header.departmentHead || null,
          process: item.process, hazard: item.hazard, hazardType: item.hazardType,
          currentControls: item.currentControls, frequency: item.probability,
          severity: item.criticality, riskScore: score, riskLevel: getRiskLevel(score),
          beforePhotoUrl: item.beforePhotoUrl,
        },
      });
    } else {
      const payload = items.map(item => {
        const score = item.probability * item.criticality;
        return {
          title: autoTitle, ...header, assessmentType: activeTab,
          responsibleTask: header.responsibleTask || null,
          departmentHead: header.departmentHead || null,
          process: item.process, hazard: item.hazard, hazardType: item.hazardType,
          currentControls: item.currentControls, frequency: item.probability,
          severity: item.criticality, riskScore: score, riskLevel: getRiskLevel(score),
          beforePhotoUrl: item.beforePhotoUrl,
        };
      });
      batchMutation.mutate(payload);
    }
  };

  const handleEdit = (item: RiskAssessment) => {
    setHeader({ department: item.department, assessor: item.assessor || user?.name || user?.username || "", assessmentDate: item.assessmentDate, responsibleTask: (item as any).responsibleTask || "", departmentHead: (item as any).departmentHead || "" });
    setItems([{
      process: item.process || "", hazard: item.hazard, hazardType: item.hazardType || "",
      currentControls: item.currentControls || "", probability: item.frequency,
      criticality: item.severity,
      beforePhotoUrl: (item as any).beforePhotoUrl || "",
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
    setItems(prev => {
      const next = [...prev, defaultItem()];
      setExpandedItemIdx(next.length - 1);
      return next;
    });
  };
  const removeItem = (idx: number) => {
    setItems(prev => prev.filter((_, i) => i !== idx));
    setExpandedItemIdx(prev => Math.max(0, prev >= idx ? prev - 1 : prev));
  };
  const updateItem = <K extends keyof RiskItem>(idx: number, key: K, value: RiskItem[K]) => {
    setItems(prev => prev.map((item, i) => i === idx ? { ...item, [key]: value } : item));
  };

  const uploadPhoto = async (idx: number, type: "before", file: File) => {
    const photoKey = "beforePhotoUrl";
    setUploadingPhoto(`${idx}-${type}`);
    try {
      const fd = new FormData();
      fd.append("photo", file);
      const res = await fetch("/api/risk-assessments/upload-photo", { method: "POST", body: fd, credentials: "include" });
      if (!res.ok) throw new Error();
      const data = await res.json();
      updateItem(idx, photoKey as keyof RiskItem, data.photoUrl);
      toast({ title: "사진이 업로드되었습니다." });
    } catch {
      toast({ variant: "destructive", title: "사진 업로드에 실패했습니다." });
    }
    setUploadingPhoto(null);
  };

  const openImprovementDialog = (item: RiskAssessment) => {
    setImprovementForm({
      improvementMeasures: (item as any).improvementMeasures || "",
      plannedDate: (item as any).plannedDate || "",
      completionDate: (item as any).completionDate || "",
      afterFrequency: (item as any).afterFrequency || 1,
      afterSeverity: (item as any).afterSeverity || 1,
      afterPhotoUrl: (item as any).afterPhotoUrl || "",
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

  const handleImprovementSubmit = () => {
    if (!improvingItem) return;
    if (!improvementForm.improvementMeasures) {
      toast({ variant: "destructive", title: "개선대책을 입력해주세요." });
      return;
    }
    if (!improvementForm.plannedDate) {
      toast({ variant: "destructive", title: "개선예정일을 입력해주세요." });
      return;
    }
    improvementMutation.mutate({ id: improvingItem.id, data: improvementForm });
  };

  const getImprovementStatusBadge = (item: RiskAssessment) => {
    const status = (item as any).improvementStatus;
    if (status === "완료") return <Badge className="bg-green-500 text-white text-[10px] no-default-hover-elevate no-default-active-elevate gap-1"><CheckCircle2 className="w-2.5 h-2.5" />완료</Badge>;
    if (status === "진행중") return <Badge className="bg-blue-500 text-white text-[10px] no-default-hover-elevate no-default-active-elevate gap-1"><Clock className="w-2.5 h-2.5" />진행중</Badge>;
    return <Badge variant="outline" className="text-[10px] text-orange-600 border-orange-300 no-default-hover-elevate no-default-active-elevate">미완료</Badge>;
  };

  const filteredByDept = useMemo(() => {
    if (!assessments) return [];
    if (filterDept === "전체") return assessments;
    return assessments.filter(a => a.department === filterDept);
  }, [assessments, filterDept]);

  const filteredAssessments = useMemo(() => {
    if (!filterGrade) return filteredByDept;
    return filteredByDept.filter(a => {
      const lvl = a.riskLevel || "";
      if (filterGrade === "A") return lvl === "A등급" || (!lvl && a.riskScore >= 8);
      if (filterGrade === "B") return lvl === "B등급" || (!lvl && a.riskScore >= 3 && a.riskScore < 8);
      if (filterGrade === "C") return lvl === "C등급" || (!lvl && a.riskScore < 3);
      return true;
    });
  }, [filteredByDept, filterGrade]);

  const riskStats = useMemo(() => {
    if (!filteredByDept || filteredByDept.length === 0) return null;
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

  return (
    <div className="max-w-6xl mx-auto space-y-4">
      <div className="flex items-center justify-between gap-2 flex-wrap">
        <div className="flex items-center gap-2.5">
          <div className="bg-orange-100 p-2 rounded-lg text-orange-600 dark:bg-orange-900/30 dark:text-orange-400">
            <ShieldAlert className="w-6 h-6 sm:w-7 sm:h-7" />
          </div>
          <div>
            <h2 className="text-xl sm:text-2xl font-display font-bold text-foreground">위험성평가</h2>
            <p className="text-xs text-muted-foreground">KRAS 위험성평가 관리</p>
          </div>
        </div>
        <div className="flex items-center gap-2 flex-wrap">
          {canEditRiskAssessment && (
            <Button
              onClick={() => {
                setHeader({ department: "", assessor: user?.name || user?.username || "", assessmentDate: format(new Date(), "yyyy-MM-dd"), responsibleTask: "", departmentHead: "" });
                setItems([defaultItem()]);
                setEditingId(null);
                setShowForm(true);
              }}
              className="bg-orange-500 hover:bg-orange-600 text-white gap-2 h-9"
              data-testid="button-add-assessment"
            >
              <Plus className="w-4 h-4" />
              새 평가 등록
            </Button>
          )}
        </div>
      </div>

      {/* 위험성 계산표 */}
      <Card className="shadow-sm">
        <CardHeader className="p-2 sm:p-3 pb-0">
          <div className="flex items-center gap-2">
            <CardTitle className="text-xs sm:text-sm font-bold">위험성 계산표 (가능성 × 중대성)</CardTitle>
          </div>
        </CardHeader>
        <CardContent className="p-2 sm:p-3 overflow-x-auto">
          <table className="w-full border-collapse text-[10px]" style={{ minWidth: 380 }} data-testid="risk-matrix">
            <thead>
              <tr>
                <th className="border border-slate-300 dark:border-slate-600 bg-slate-100 dark:bg-slate-800 p-1 text-center align-middle min-w-[60px]">
                  <div className="text-[9px] text-muted-foreground leading-tight">중대성</div>
                  <div className="text-[9px] font-normal text-muted-foreground leading-tight">가능성</div>
                </th>
                {[1, 2, 3, 4].map(s => (
                  <th key={s} className="border border-slate-300 dark:border-slate-600 bg-slate-50 dark:bg-slate-800/60 p-1 text-center">
                    <div className="text-[10px] font-bold text-foreground leading-tight">{CRITICALITY_LABELS[s]}</div>
                    <div className="text-[9px] text-muted-foreground font-normal leading-tight">({s})</div>
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {[5, 4, 3, 2, 1].map(f => (
                <tr key={f}>
                  <td className="border border-slate-300 dark:border-slate-600 bg-slate-50 dark:bg-slate-800/60 p-1 text-center">
                    <div className="text-[10px] font-bold text-foreground leading-tight">{PROBABILITY_LABELS[f]}</div>
                    <div className="text-[9px] text-muted-foreground leading-tight">({f})</div>
                  </td>
                  {[1, 2, 3, 4].map(s => {
                    const score = f * s;
                    const { grade, category } = getRiskGrade(score);
                    const style = getMatrixStyle(score);
                    return (
                      <td key={s} className={`border ${style.border} ${style.bg} ${style.text} p-1 text-center`}>
                        <div className="text-[9px] font-semibold leading-tight">{category}</div>
                        <div className="text-[9px] font-normal opacity-70 leading-tight">위험도</div>
                        <div className="text-[11px] font-bold">({score})</div>
                        <span className={`text-[8px] font-bold px-1 py-px rounded-full inline-block ${
                          grade === "A" ? "bg-orange-500 text-white" :
                          grade === "B" ? "bg-slate-500 text-white" :
                          "bg-blue-400 text-white"
                        }`}>{grade}등급</span>
                      </td>
                    );
                  })}
                </tr>
              ))}
            </tbody>
          </table>

          {/* 위험등급 결정표 */}
          <div className="mt-2 space-y-1.5">
            <p className="text-[10px] font-semibold text-muted-foreground flex items-center gap-1">
              <Info className="w-3 h-3" />
              위험등급 결정표
            </p>
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-1.5">
              <div className="flex items-start gap-1.5 p-1.5 rounded-md border border-orange-200 bg-orange-50 dark:bg-orange-950/30 dark:border-orange-800">
                <span className="shrink-0 mt-0.5 bg-orange-500 text-white text-[9px] font-bold px-1 py-0.5 rounded-full">A등급</span>
                <div>
                  <p className="text-[10px] font-semibold text-orange-800 dark:text-orange-300">중점관리 위험도 (8~20)</p>
                  <p className="text-[9px] text-orange-700 dark:text-orange-400 leading-relaxed">중대재해 연계 가능성 높음 (전체 20% 이내)</p>
                </div>
              </div>
              <div className="flex items-start gap-1.5 p-1.5 rounded-md border border-slate-200 bg-slate-50 dark:bg-slate-800/50 dark:border-slate-600">
                <span className="shrink-0 mt-0.5 bg-slate-500 text-white text-[9px] font-bold px-1 py-0.5 rounded-full">B등급</span>
                <div>
                  <p className="text-[10px] font-semibold text-slate-700 dark:text-slate-300">일상관리 위험도 (3~7)</p>
                  <p className="text-[9px] text-slate-600 dark:text-slate-400 leading-relaxed">안전 대책으로 예방 가능 (전체 50% 이내)</p>
                </div>
              </div>
              <div className="flex items-start gap-1.5 p-1.5 rounded-md border border-blue-100 bg-blue-50/50 dark:bg-blue-950/20 dark:border-blue-900">
                <span className="shrink-0 mt-0.5 bg-blue-400 text-white text-[9px] font-bold px-1 py-0.5 rounded-full">C등급</span>
                <div>
                  <p className="text-[10px] font-semibold text-blue-800 dark:text-blue-300">허용가능 위험도 (1~2)</p>
                  <p className="text-[9px] text-blue-700 dark:text-blue-400 leading-relaxed">일상관리로 예방 가능 (전체 30% 이내)</p>
                </div>
              </div>
            </div>
          </div>
        </CardContent>
      </Card>

      <Tabs value={activeTab} onValueChange={setActiveTab}>
        <TabsList className="w-full" data-testid="tabs-assessment-type">
          {ASSESSMENT_TABS.map(tab => (
            <TabsTrigger key={tab.value} value={tab.value} className="flex-1 text-xs sm:text-sm" data-testid={`tab-${tab.value}`}>
              {tab.label}
            </TabsTrigger>
          ))}
        </TabsList>

        {ASSESSMENT_TABS.map(tab => (
          <TabsContent key={tab.value} value={tab.value} className="space-y-3 mt-3">
            {/* 조회 필터 + 통계 + 엑셀 다운로드 */}
            <div className="flex flex-col gap-2">
              {/* 첫 줄: 부서 선택 + 등급 배지 + 총계 + 엑셀 */}
              <div className="flex items-center justify-between gap-2 flex-wrap">
                <div className="flex items-center gap-2">
                  <Select value={filterDept} onValueChange={v => { setFilterDept(v); setFilterGrade(null); }}>
                    <SelectTrigger className="h-8 text-xs w-[130px]" data-testid="select-filter-dept">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="전체">전체 부서</SelectItem>
                      {DEPARTMENTS.map(dept => (
                        <SelectItem key={dept} value={dept}>{dept}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  {/* 등급 클릭 필터 배지 */}
                  {riskStats && (
                    <div className="flex items-center gap-1.5 flex-wrap">
                      {(Object.entries(riskStats) as [string, number][]).map(([level, count]) => {
                        const gradeKey = level[0];
                        const isActive = filterGrade === gradeKey;
                        const base = getRiskBadgeVariant(level).className;
                        return (
                          <button
                            key={level}
                            type="button"
                            onClick={() => setFilterGrade(isActive ? null : gradeKey)}
                            className={`inline-flex items-center gap-1 rounded-full text-xs font-semibold px-2.5 py-0.5 transition-all cursor-pointer select-none border-2 ${isActive ? `${base} border-white ring-2 ring-offset-1 ring-current scale-105 shadow-md` : `${base} border-transparent opacity-80 hover:opacity-100 hover:scale-105`}`}
                            data-testid={`stat-${level}`}
                            title={`${level} 필터 ${isActive ? "해제" : "적용"}`}
                          >
                            {level} {count}건
                          </button>
                        );
                      })}
                      <span className="text-xs text-muted-foreground font-medium px-1.5 py-0.5 bg-muted rounded-full border">
                        총 {filteredByDept.length}건
                      </span>
                      {filterGrade && (
                        <button
                          type="button"
                          onClick={() => setFilterGrade(null)}
                          className="text-[10px] text-muted-foreground hover:text-foreground underline"
                        >필터 해제</button>
                      )}
                    </div>
                  )}
                </div>
                <div className="flex items-center gap-1.5">
                  {canDownloadRiskAssessmentExcel && (
                    <>
                      <Button
                        variant="outline"
                        size="sm"
                        className="gap-1 text-green-700 border-green-300 hover:bg-green-50 h-8 text-xs px-3"
                        onClick={() => handleDownloadExcel("전체")}
                        disabled={isDownloading}
                        data-testid="button-download-all"
                      >
                        {isDownloading ? <div className="animate-spin rounded-full h-3 w-3 border-b-2 border-green-700" /> : <Download className="w-3.5 h-3.5" />}
                        전체 엑셀
                      </Button>
                      {filterDept !== "전체" && (
                        <Button
                          variant="outline"
                          size="sm"
                          className="gap-1 text-blue-700 border-blue-300 hover:bg-blue-50 h-8 text-xs px-3"
                          onClick={() => handleDownloadExcel(filterDept)}
                          disabled={isDownloading}
                          data-testid="button-download-dept"
                        >
                          {isDownloading ? <div className="animate-spin rounded-full h-3 w-3 border-b-2 border-blue-700" /> : <FileDown className="w-3.5 h-3.5" />}
                          {filterDept} 엑셀
                        </Button>
                      )}
                    </>
                  )}
                </div>
              </div>
              {/* 필터 활성 표시 */}
              {filterGrade && (
                <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
                  <span className="w-1.5 h-1.5 rounded-full bg-orange-400 inline-block" />
                  <span>{filterGrade}등급 필터 적용 중 — {filteredAssessments.length}건 표시</span>
                </div>
              )}
            </div>

            {isLoading ? (
              <div className="flex items-center justify-center py-12 text-muted-foreground">
                <div className="animate-spin rounded-full h-6 w-6 border-b-2 border-primary mr-2" />
                로딩 중...
              </div>
            ) : filteredAssessments.length === 0 ? (
              <Card className="border-dashed">
                <CardContent className="py-12 text-center text-muted-foreground text-sm">
                  {filterGrade ? `${filterGrade}등급 항목이 없습니다.` : filterDept === "전체" ? "등록된 평가가 없습니다." : `${filterDept} 평가가 없습니다.`}
                </CardContent>
              </Card>
            ) : (
              <Card className="overflow-hidden shadow-sm border">
                <CardContent className="p-0 overflow-x-auto">
                  <Table data-testid="table-assessments">
                    <TableHeader>
                      <TableRow className="bg-slate-50 dark:bg-slate-800/80 hover:bg-slate-50 dark:hover:bg-slate-800/80 border-b-2 border-border">
                        <TableHead className="w-8 text-center text-xs font-bold text-foreground py-2.5 px-2">No</TableHead>
                        <TableHead className="w-[58px] text-xs font-bold text-foreground py-2.5 px-2">부서</TableHead>
                        <TableHead className="min-w-[80px] text-xs font-bold text-foreground py-2.5 px-2">공정명</TableHead>
                        <TableHead className="min-w-[130px] text-xs font-bold text-foreground py-2.5 px-2">유해위험요인</TableHead>
                        <TableHead className="w-[58px] text-xs font-bold text-foreground py-2.5 px-2">위험유형</TableHead>
                        <TableHead className="w-[52px] text-center text-xs font-bold text-foreground py-2.5 px-1">가능성</TableHead>
                        <TableHead className="w-[52px] text-center text-xs font-bold text-foreground py-2.5 px-1">중대성</TableHead>
                        <TableHead className="w-[44px] text-center text-xs font-bold text-foreground py-2.5 px-1">점수</TableHead>
                        <TableHead className="w-[72px] text-xs font-bold text-foreground py-2.5 px-2">등급</TableHead>
                        <TableHead className="w-[58px] text-xs font-bold text-foreground py-2.5 px-2">평가자</TableHead>
                        <TableHead className="w-[76px] text-xs font-bold text-foreground py-2.5 px-2">평가일</TableHead>
                        <TableHead className="w-[82px] text-xs font-bold text-foreground py-2.5 px-2">개선현황</TableHead>
                        <TableHead className="w-[82px] text-xs font-bold text-foreground py-2.5 px-2">승인상태</TableHead>
                        {canEditRiskAssessment && <TableHead className="w-[100px] text-xs font-bold text-foreground py-2.5 px-2">관리</TableHead>}
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      <AnimatePresence>
                        {filteredAssessments.map((item, idx) => {
                          const grade = getRiskGrade(item.riskScore);
                          return (
                            <motion.tr
                              key={item.id}
                              initial={{ opacity: 0, y: 8 }}
                              animate={{ opacity: 1, y: 0 }}
                              exit={{ opacity: 0 }}
                              className={`border-b border-border/50 hover:bg-muted/40 transition-colors ${idx % 2 === 1 ? "bg-muted/10" : ""}`}
                              data-testid={`row-assessment-${item.id}`}
                            >
                              <TableCell className="text-xs text-muted-foreground py-2.5 px-2 text-center font-semibold">{idx + 1}</TableCell>
                              <TableCell className="py-2.5 px-2">
                                <DeptCell dept={item.department} />
                              </TableCell>
                              <TableCell className="py-2.5 px-2">
                                <span className="text-xs text-foreground/80 line-clamp-2 leading-snug">{item.process || <span className="text-muted-foreground">-</span>}</span>
                              </TableCell>
                              <TableCell className="py-2.5 px-2 max-w-[130px]">
                                <span className="text-xs font-medium line-clamp-2 leading-snug text-foreground">{item.hazard}</span>
                              </TableCell>
                              <TableCell className="py-2.5 px-2">
                                {item.hazardType ? (
                                  <span className="inline-block px-1 py-0.5 rounded bg-slate-100 dark:bg-slate-700 text-slate-600 dark:text-slate-300 text-[11px] font-medium">{item.hazardType}</span>
                                ) : <span className="text-muted-foreground text-xs">-</span>}
                              </TableCell>
                              <TableCell className="py-2.5 px-1 text-center">
                                <div className="flex flex-col items-center">
                                  <span className="text-sm font-bold text-foreground tabular-nums">{item.frequency}</span>
                                  <span className="text-[9px] text-muted-foreground leading-tight">{PROBABILITY_LABELS[item.frequency]}</span>
                                </div>
                              </TableCell>
                              <TableCell className="py-2.5 px-1 text-center">
                                <div className="flex flex-col items-center">
                                  <span className="text-sm font-bold text-foreground tabular-nums">{item.severity}</span>
                                  <span className="text-[9px] text-muted-foreground leading-tight">{CRITICALITY_LABELS[item.severity]}</span>
                                </div>
                              </TableCell>
                              <TableCell className="py-2.5 px-1 text-center">
                                <span className="text-sm font-extrabold tabular-nums text-foreground">{item.riskScore}</span>
                              </TableCell>
                              <TableCell className="py-2.5 px-2">
                                <div className="flex flex-col gap-0.5">
                                  <Badge className={`${getRiskBadgeVariant(grade.label).className} no-default-hover-elevate no-default-active-elevate text-[11px] px-1.5 py-0 rounded-full w-fit font-bold`} data-testid={`badge-risk-${item.id}`}>
                                    {grade.label}
                                  </Badge>
                                  <span className="text-[9px] text-muted-foreground leading-tight">{grade.category}</span>
                                </div>
                              </TableCell>
                              <TableCell className="text-xs py-2.5 px-2 font-medium text-foreground/80 leading-tight">{item.assessor || "-"}</TableCell>
                              <TableCell className="text-[11px] text-muted-foreground py-2.5 px-2 whitespace-nowrap">{item.assessmentDate}</TableCell>
                              <TableCell className="py-2.5 px-2">
                                <div className="flex flex-col gap-0.5">
                                  {grade.grade === "A" ? getImprovementStatusBadge(item) : (
                                    <span className="text-xs text-muted-foreground">-</span>
                                  )}
                                  {grade.grade === "A" && (item as any).afterRiskScore && (
                                    <span className="text-[9px] text-muted-foreground leading-tight">개선후 {(item as any).afterRiskScore}점·{(item as any).afterRiskLevel}</span>
                                  )}
                                </div>
                              </TableCell>
                              <TableCell className="py-2.5 px-2">
                                {(() => {
                                  const status = (item as any).approvalStatus;
                                  if (status === "승인완료") return (
                                    <div className="flex flex-col gap-0.5">
                                      <span className="inline-flex items-center gap-0.5 px-1.5 py-0.5 rounded-full bg-green-100 text-green-700 text-[10px] font-medium whitespace-nowrap">
                                        <CircleCheck className="w-2.5 h-2.5 shrink-0" />승인완료
                                      </span>
                                      {(item as any).approvedBy && <span className="text-[9px] text-muted-foreground leading-tight">{(item as any).approvedBy}</span>}
                                    </div>
                                  );
                                  if (status === "승인대기") return (
                                    <span className="inline-flex items-center gap-0.5 px-1.5 py-0.5 rounded-full bg-amber-100 text-amber-700 text-[10px] font-medium whitespace-nowrap">
                                      <AlertCircle className="w-2.5 h-2.5 shrink-0" />승인대기
                                    </span>
                                  );
                                  return (
                                    <span className="inline-flex items-center gap-0.5 px-1.5 py-0.5 rounded-full bg-gray-100 text-gray-500 text-[10px] font-medium whitespace-nowrap">
                                      자동종결
                                    </span>
                                  );
                                })()}
                              </TableCell>
                              {canEditRiskAssessment && (
                                <TableCell className="py-3">
                                  <div className="flex flex-col gap-1">
                                    {(item as any).approvalStatus === "승인대기" && (
                                      <Button
                                        variant="outline"
                                        size="sm"
                                        className="h-7 px-2 text-[11px] gap-1 border-blue-300 text-blue-700 hover:bg-blue-50 w-full"
                                        onClick={() => setApprovingItem(item)}
                                        data-testid={`button-approve-${item.id}`}
                                      >
                                        <UserCheck className="w-3 h-3" />
                                        부서장승인
                                      </Button>
                                    )}
                                    {grade.grade === "A" && (
                                      <Button
                                        variant="outline"
                                        size="sm"
                                        className="h-7 px-2 text-[11px] gap-1 border-orange-300 text-orange-700 hover:bg-orange-50 w-full"
                                        onClick={() => openImprovementDialog(item)}
                                        data-testid={`button-improvement-${item.id}`}
                                      >
                                        <ClipboardEdit className="w-3 h-3" />
                                        개선
                                      </Button>
                                    )}
                                    <div className="flex gap-1">
                                      <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => handleEdit(item)} data-testid={`button-edit-${item.id}`}>
                                        <Pencil className="w-3.5 h-3.5 text-muted-foreground" />
                                      </Button>
                                      <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => handleDelete(item.id)} data-testid={`button-delete-${item.id}`}>
                                        <Trash2 className="w-3.5 h-3.5 text-red-400" />
                                      </Button>
                                    </div>
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
          </TabsContent>
        ))}
      </Tabs>

      <Dialog open={showForm} onOpenChange={(open) => { if (!open) resetForm(); }}>
        <DialogContent className="max-w-2xl w-[95vw] max-h-[92vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle data-testid="dialog-title">
              {editingId ? "위험성평가 수정" : "새 위험성평가 등록"}
            </DialogTitle>
          </DialogHeader>

          <div className="space-y-4">
            {/* 공통 헤더 정보 */}
            <div className="p-3 bg-muted/40 rounded-lg border space-y-3">
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                <div className="space-y-1.5">
                  <Label className="text-xs font-semibold text-foreground">부서 *</Label>
                  <Select value={header.department} onValueChange={v => setHeader(h => ({ ...h, department: v }))}>
                    <SelectTrigger data-testid="select-department"><SelectValue placeholder="부서 선택" /></SelectTrigger>
                    <SelectContent>
                      {DEPARTMENTS.map(d => <SelectItem key={d} value={d}>{d}</SelectItem>)}
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-1.5">
                  <Label className="text-xs font-semibold text-foreground">담당업무</Label>
                  <Select
                    value={header.responsibleTask}
                    onValueChange={v => {
                      const auto = getAutoProcess(v);
                      setHeader(h => ({ ...h, responsibleTask: v }));
                      if (auto) setItems(prev => prev.map((it, i) => i === 0 ? { ...it, process: auto } : it));
                    }}
                  >
                    <SelectTrigger data-testid="select-responsible-task"><SelectValue placeholder="담당업무 선택" /></SelectTrigger>
                    <SelectContent>
                      {RESPONSIBLE_TASKS.map(t => <SelectItem key={t} value={t}>{t}</SelectItem>)}
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-1.5">
                  <Label className="text-xs font-semibold text-foreground">평가자</Label>
                  <Input value={header.assessor} onChange={e => setHeader(h => ({ ...h, assessor: e.target.value }))} placeholder="평가자 이름" data-testid="input-assessor" />
                </div>
                <div className="space-y-1.5">
                  <Label className="text-xs font-semibold text-foreground">평가일</Label>
                  <Input type="date" value={header.assessmentDate} onChange={e => setHeader(h => ({ ...h, assessmentDate: e.target.value }))} data-testid="input-assessment-date" />
                </div>
              </div>
              {/* 부서장 선택 */}
              <div className="flex items-center gap-3 pt-1 border-t border-border/50">
                <Label className="text-xs font-semibold text-foreground whitespace-nowrap">부서장</Label>
                <Popover open={deptHeadPopoverOpen} onOpenChange={open => { setDeptHeadPopoverOpen(open); if (!open) setDeptHeadSearch(""); }}>
                  <PopoverTrigger asChild>
                    <Button variant="outline" size="sm" className={`gap-2 h-8 text-xs ${header.departmentHead ? "border-blue-400 text-blue-700 bg-blue-50 hover:bg-blue-100" : "border-dashed"}`} data-testid="button-dept-head-search">
                      <Users className="w-3.5 h-3.5" />
                      {header.departmentHead || "부서장 선택"}
                    </Button>
                  </PopoverTrigger>
                  <PopoverContent className="w-64 p-0" align="start">
                    {/* 검색 입력 */}
                    <div className="p-2 border-b">
                      <Input
                        placeholder="이름 검색..."
                        value={deptHeadSearch}
                        onChange={e => setDeptHeadSearch(e.target.value)}
                        className="h-8 text-xs"
                        autoFocus
                        data-testid="input-dept-head-search"
                      />
                    </div>
                    <div className="max-h-56 overflow-y-auto">
                      {/* 선택 해제 버튼 */}
                      {header.departmentHead && !deptHeadSearch && (
                        <div className="p-1.5 border-b">
                          <button
                            type="button"
                            className="w-full text-left px-2 py-1.5 rounded text-xs text-red-500 hover:bg-red-50 flex items-center gap-1.5"
                            onClick={() => { setHeader(h => ({ ...h, departmentHead: "" })); setDeptHeadPopoverOpen(false); }}
                          >
                            <X className="w-3 h-3" />선택 해제 ({header.departmentHead})
                          </button>
                        </div>
                      )}
                      {/* 검색 결과: 검색어 입력 시에만 표시 */}
                      {deptHeadSearch && (() => {
                        const filtered = (userNames || []).filter(u =>
                          u.name.includes(deptHeadSearch) || u.department?.includes(deptHeadSearch)
                        );
                        if (filtered.length === 0) {
                          return <p className="text-xs text-muted-foreground px-3 py-4 text-center">검색 결과 없음</p>;
                        }
                        return (
                          <div className="p-1.5 space-y-0.5">
                            {filtered.map(u => (
                              <button
                                key={u.id}
                                type="button"
                                className={`w-full text-left px-2 py-1.5 rounded text-xs hover:bg-muted transition-colors flex items-center justify-between gap-2 ${header.departmentHead === u.name ? "bg-blue-50 text-blue-700 font-semibold" : ""}`}
                                onClick={() => selectDeptHead(u.name)}
                              >
                                <span className="font-medium">{u.name}</span>
                                {u.department && <span className="text-muted-foreground text-[10px] shrink-0">{u.department}</span>}
                              </button>
                            ))}
                          </div>
                        );
                      })()}
                      {/* 최근 선택 내역 (검색 중이 아닐 때만) */}
                      {!deptHeadSearch && recentDeptHeads.length > 0 && (
                        <div className="border-t p-1.5 space-y-0.5">
                          <p className="text-[10px] text-muted-foreground px-2 py-0.5 font-semibold uppercase tracking-wide flex items-center gap-1">
                            <Clock className="w-2.5 h-2.5" />최근 선택
                          </p>
                          {recentDeptHeads.map(name => (
                            <button
                              key={name}
                              type="button"
                              className={`w-full text-left px-2 py-1.5 rounded text-xs hover:bg-muted transition-colors flex items-center gap-1.5 ${header.departmentHead === name ? "bg-blue-50 text-blue-700 font-semibold" : "text-muted-foreground"}`}
                              onClick={() => selectDeptHead(name)}
                            >
                              <Clock className="w-2.5 h-2.5 shrink-0" />
                              {name}
                            </button>
                          ))}
                        </div>
                      )}
                    </div>
                  </PopoverContent>
                </Popover>
                {header.departmentHead && (
                  <span className="text-xs text-blue-600 font-medium flex items-center gap-1">
                    <UserCheck className="w-3.5 h-3.5" />{header.departmentHead}
                  </span>
                )}
              </div>
            </div>

            {/* 위험요인 항목들 */}
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <Label className="text-sm font-semibold">위험요인 항목 <span className="text-muted-foreground font-normal">({items.length}/10)</span></Label>
                {!editingId && (
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={addItem}
                    className="gap-1 h-8 text-xs"
                    disabled={items.length >= 10}
                    data-testid="button-add-item"
                  >
                    <Plus className="w-3 h-3" />
                    항목 추가
                  </Button>
                )}
              </div>

              {items.map((item, idx) => {
                const score = item.probability * item.criticality;
                const { grade, label, category } = getRiskGrade(score);
                const style = getMatrixStyle(score);
                const isExpanded = expandedItemIdx === idx;
                return (
                  <Card key={idx} className={`border transition-all duration-200 ${isExpanded ? "border-primary/30 shadow-sm" : "border-border/60"}`}>
                    {/* 항목 헤더 (항상 표시) - 클릭하면 접고 펼침 */}
                    <div
                      role="button"
                      tabIndex={0}
                      className="w-full p-3 flex items-center justify-between cursor-pointer select-none"
                      onClick={() => setExpandedItemIdx(isExpanded ? -1 : idx)}
                      onKeyDown={e => e.key === "Enter" && setExpandedItemIdx(isExpanded ? -1 : idx)}
                      data-testid={`button-toggle-item-${idx}`}
                    >
                      <div className="flex items-center gap-2 min-w-0 flex-1">
                        <span className="text-sm font-semibold text-primary shrink-0">항목 {idx + 1}</span>
                        {item.hazard && !isExpanded && (
                          <span className="text-xs text-muted-foreground truncate max-w-[120px] sm:max-w-[200px]">{item.hazard}</span>
                        )}
                      </div>
                      <div className="flex items-center gap-2 shrink-0">
                        <div className={`flex items-center gap-1.5 px-2 py-0.5 rounded-md text-xs font-semibold border ${style.border} ${style.bg} ${style.text}`}>
                          <span>{score}점</span>
                          <span className={`px-1.5 py-0.5 rounded-full text-[10px] font-bold ${grade === "A" ? "bg-orange-500 text-white" : grade === "B" ? "bg-slate-500 text-white" : "bg-blue-400 text-white"}`}>
                            {label}
                          </span>
                        </div>
                        {items.length > 1 && (
                          <div
                            role="button"
                            tabIndex={0}
                            className="p-0.5 rounded hover:bg-red-50 text-red-400 hover:text-red-600 cursor-pointer"
                            onClick={e => { e.stopPropagation(); removeItem(idx); }}
                            onKeyDown={e => { if (e.key === "Enter") { e.stopPropagation(); removeItem(idx); } }}
                            data-testid={`button-remove-item-${idx}`}
                          >
                            <X className="w-3.5 h-3.5" />
                          </div>
                        )}
                        <span className={`text-muted-foreground transition-transform duration-200 ${isExpanded ? "rotate-180" : ""}`}>
                          <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><polyline points="6 9 12 15 18 9"/></svg>
                        </span>
                      </div>
                    </div>

                    {/* 항목 내용 (펼쳐진 경우에만 표시) */}
                    {isExpanded && (
                      <CardContent className="p-3 pt-0 grid grid-cols-1 sm:grid-cols-2 gap-3 border-t border-border/40">
                        <div className="space-y-1.5">
                          <Label className="text-xs">공정명</Label>
                          {header.responsibleTask === "운용팀" ? (
                            <Select value={item.process} onValueChange={v => updateItem(idx, "process", v)}>
                              <SelectTrigger data-testid={`select-process-${idx}`}><SelectValue placeholder="공정명 선택" /></SelectTrigger>
                              <SelectContent>
                                {TASK_PROCESS_MAP["운용팀"].map(p => <SelectItem key={p} value={p}>{p}</SelectItem>)}
                              </SelectContent>
                            </Select>
                          ) : (
                            <Input
                              value={item.process}
                              onChange={e => updateItem(idx, "process", e.target.value)}
                              placeholder="공정 또는 작업명"
                              readOnly={!!header.responsibleTask && header.responsibleTask !== "운용팀"}
                              className={header.responsibleTask && header.responsibleTask !== "운용팀" ? "bg-muted/50 text-muted-foreground" : ""}
                              data-testid={`input-process-${idx}`}
                            />
                          )}
                        </div>
                        <div className="space-y-1.5">
                          <Label className="text-xs">위험유형</Label>
                          <Select value={item.hazardType} onValueChange={v => updateItem(idx, "hazardType", v)}>
                            <SelectTrigger data-testid={`select-hazard-type-${idx}`}><SelectValue placeholder="선택" /></SelectTrigger>
                            <SelectContent>
                              {HAZARD_TYPES.map(t => <SelectItem key={t} value={t}>{t}</SelectItem>)}
                            </SelectContent>
                          </Select>
                        </div>
                        <div className="sm:col-span-2 space-y-1.5">
                          <Label className="text-xs">유해위험요인 *</Label>
                          <Input value={item.hazard} onChange={e => updateItem(idx, "hazard", e.target.value)} placeholder="유해위험요인을 입력하세요" data-testid={`input-hazard-${idx}`} />
                        </div>
                        <div className="sm:col-span-2 space-y-1.5">
                          <Label className="text-xs">현재 안전조치</Label>
                          <Textarea value={item.currentControls} onChange={e => updateItem(idx, "currentControls", e.target.value)} placeholder="현재 시행 중인 안전조치" rows={2} data-testid={`input-current-controls-${idx}`} />
                        </div>
                        <div className="space-y-1.5">
                          <Label className="text-xs">가능성 (1~5)</Label>
                          <Select value={String(item.probability)} onValueChange={v => updateItem(idx, "probability", Number(v))}>
                            <SelectTrigger data-testid={`select-probability-${idx}`}><SelectValue /></SelectTrigger>
                            <SelectContent>
                              {[1, 2, 3, 4, 5].map(n => (
                                <SelectItem key={n} value={String(n)}>{n} - {PROBABILITY_LABELS[n]}</SelectItem>
                              ))}
                            </SelectContent>
                          </Select>
                        </div>
                        <div className="space-y-1.5">
                          <Label className="text-xs">중대성 (1~4)</Label>
                          <Select value={String(item.criticality)} onValueChange={v => updateItem(idx, "criticality", Number(v))}>
                            <SelectTrigger data-testid={`select-criticality-${idx}`}><SelectValue /></SelectTrigger>
                            <SelectContent>
                              {[1, 2, 3, 4].map(n => (
                                <SelectItem key={n} value={String(n)}>{n} - {CRITICALITY_LABELS[n]}</SelectItem>
                              ))}
                            </SelectContent>
                          </Select>
                        </div>
                        {/* 개선 전 사진 */}
                        <div className="space-y-1.5">
                          <Label className="text-xs font-semibold text-foreground">개선 전 사진</Label>
                          <input ref={el => { beforePhotoRefs.current[idx] = el; }} type="file" accept="image/*" className="hidden" onChange={e => { const f = e.target.files?.[0]; if (f) uploadPhoto(idx, "before", f); e.target.value = ""; }} />
                          {item.beforePhotoUrl ? (
                            <div className="relative inline-block">
                              <img src={item.beforePhotoUrl} alt="개선 전" className="h-20 w-32 object-cover rounded-md border" />
                              <button type="button" className="absolute -top-1.5 -right-1.5 bg-red-500 text-white rounded-full w-5 h-5 flex items-center justify-center shadow" onClick={() => updateItem(idx, "beforePhotoUrl", "")}>
                                <X className="w-3 h-3" />
                              </button>
                            </div>
                          ) : (
                            <Button variant="outline" size="sm" className="gap-1.5 h-8 text-xs" disabled={uploadingPhoto === `${idx}-before`} onClick={() => beforePhotoRefs.current[idx]?.click()} data-testid={`button-before-photo-${idx}`}>
                              <Camera className="w-3.5 h-3.5" />
                              {uploadingPhoto === `${idx}-before` ? "업로드 중..." : "사진 추가"}
                            </Button>
                          )}
                        </div>
                      </CardContent>
                    )}
                  </Card>
                );
              })}
            </div>
          </div>

          <DialogFooter className="gap-2 pt-2">
            <Button variant="outline" onClick={resetForm} data-testid="button-cancel">취소</Button>
            <Button
              onClick={handleSubmit}
              disabled={batchMutation.isPending || updateMutation.isPending}
              className="bg-orange-500 hover:bg-orange-600 text-white"
              data-testid="button-submit"
            >
              {batchMutation.isPending || updateMutation.isPending ? "처리 중..." : editingId ? "수정" : "등록"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* 개선 등록 다이얼로그 (A등급 전용) */}
      <Dialog open={!!improvingItem} onOpenChange={(open) => { if (!open) setImprovingItem(null); }}>
        <DialogContent className="max-w-lg w-[95vw] max-h-[92vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <ClipboardEdit className="w-5 h-5 text-orange-500" />
              개선 등록
            </DialogTitle>
          </DialogHeader>

          {improvingItem && (
            <div className="space-y-4">
              {/* 현재 위험성 정보 (읽기 전용) */}
              <div className="p-3 bg-orange-50 dark:bg-orange-900/20 rounded-lg border border-orange-200 dark:border-orange-800 space-y-1.5">
                <p className="text-xs font-semibold text-orange-700 dark:text-orange-400 mb-1">현재 위험성 정보 (A등급 중점관리)</p>
                <div className="grid grid-cols-2 gap-x-4 gap-y-1 text-xs">
                  <div><span className="text-muted-foreground">평가명:</span> <span className="font-medium">{improvingItem.title}</span></div>
                  <div><span className="text-muted-foreground">부서:</span> <span className="font-medium">{improvingItem.department}</span></div>
                  <div className="col-span-2"><span className="text-muted-foreground">유해위험요인:</span> <span className="font-medium">{improvingItem.hazard}</span></div>
                  <div><span className="text-muted-foreground">가능성:</span> <span className="font-bold text-orange-700">{improvingItem.frequency}</span> ({PROBABILITY_LABELS[improvingItem.frequency]})</div>
                  <div><span className="text-muted-foreground">중대성:</span> <span className="font-bold text-orange-700">{improvingItem.severity}</span> ({CRITICALITY_LABELS[improvingItem.severity]})</div>
                  <div className="col-span-2"><span className="text-muted-foreground">위험도:</span> <span className="font-bold text-orange-600 text-base">{improvingItem.riskScore}점</span> (A등급·중점관리)</div>
                </div>
              </div>

              {/* 개선대책 */}
              <div className="space-y-1.5">
                <Label className="text-sm font-semibold">개선대책 *</Label>
                <Textarea
                  value={improvementForm.improvementMeasures}
                  onChange={e => setImprovementForm(f => ({ ...f, improvementMeasures: e.target.value }))}
                  placeholder="개선대책을 구체적으로 입력하세요"
                  rows={3}
                  data-testid="input-improvement-measures"
                />
              </div>

              {/* 날짜 */}
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1.5">
                  <Label className="text-sm font-semibold">개선예정일 *</Label>
                  <Input
                    type="date"
                    value={improvementForm.plannedDate}
                    onChange={e => setImprovementForm(f => ({ ...f, plannedDate: e.target.value }))}
                    data-testid="input-planned-date"
                  />
                </div>
                <div className="space-y-1.5">
                  <Label className="text-sm font-semibold">개선완료일</Label>
                  <Input
                    type="date"
                    value={improvementForm.completionDate}
                    onChange={e => setImprovementForm(f => ({ ...f, completionDate: e.target.value }))}
                    data-testid="input-completion-date"
                  />
                  <p className="text-[10px] text-muted-foreground">완료 시 입력 (선택)</p>
                </div>
              </div>

              {/* 개선 후 위험성 평가 */}
              <div className="p-3 bg-muted/40 rounded-lg border space-y-3">
                <p className="text-sm font-semibold">개선 후 위험성 재평가</p>
                <div className="grid grid-cols-2 gap-3">
                  <div className="space-y-1.5">
                    <Label className="text-xs">개선후 가능성 (1~5)</Label>
                    <Select
                      value={String(improvementForm.afterFrequency)}
                      onValueChange={v => setImprovementForm(f => ({ ...f, afterFrequency: Number(v) }))}
                    >
                      <SelectTrigger data-testid="select-after-frequency"><SelectValue /></SelectTrigger>
                      <SelectContent>
                        {[1, 2, 3, 4, 5].map(n => (
                          <SelectItem key={n} value={String(n)}>{n} - {PROBABILITY_LABELS[n]}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="space-y-1.5">
                    <Label className="text-xs">개선후 중대성 (1~4)</Label>
                    <Select
                      value={String(improvementForm.afterSeverity)}
                      onValueChange={v => setImprovementForm(f => ({ ...f, afterSeverity: Number(v) }))}
                    >
                      <SelectTrigger data-testid="select-after-severity"><SelectValue /></SelectTrigger>
                      <SelectContent>
                        {[1, 2, 3, 4].map(n => (
                          <SelectItem key={n} value={String(n)}>{n} - {CRITICALITY_LABELS[n]}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                </div>
                {/* 개선후 위험도 계산 미리보기 */}
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

              {/* 개선 후 사진 */}
              <div className="space-y-1.5">
                <Label className="text-sm font-semibold">개선 후 사진</Label>
                <input
                  ref={improvementPhotoRef}
                  type="file"
                  accept="image/*"
                  className="hidden"
                  onChange={e => { const f = e.target.files?.[0]; if (f) uploadImprovementPhoto(f); e.target.value = ""; }}
                />
                {improvementForm.afterPhotoUrl ? (
                  <div className="relative inline-block">
                    <img src={improvementForm.afterPhotoUrl} alt="개선 후" className="h-28 w-44 object-cover rounded-md border" />
                    <button
                      type="button"
                      className="absolute -top-1.5 -right-1.5 bg-red-500 text-white rounded-full w-5 h-5 flex items-center justify-center shadow"
                      onClick={() => setImprovementForm(f => ({ ...f, afterPhotoUrl: "" }))}
                    >
                      <X className="w-3 h-3" />
                    </button>
                  </div>
                ) : (
                  <Button
                    variant="outline"
                    size="sm"
                    className="gap-1.5 h-9 text-sm"
                    disabled={uploadingImprovementPhoto}
                    onClick={() => improvementPhotoRef.current?.click()}
                    data-testid="button-improvement-photo"
                  >
                    <Camera className="w-4 h-4" />
                    {uploadingImprovementPhoto ? "업로드 중..." : "개선 후 사진 추가"}
                  </Button>
                )}
              </div>
            </div>
          )}

          <DialogFooter className="gap-2 pt-2">
            <Button variant="outline" onClick={() => setImprovingItem(null)} data-testid="button-improvement-cancel">취소</Button>
            <Button
              onClick={handleImprovementSubmit}
              disabled={improvementMutation.isPending}
              className="bg-orange-500 hover:bg-orange-600 text-white gap-2"
              data-testid="button-improvement-submit"
            >
              <CheckCircle2 className="w-4 h-4" />
              {improvementMutation.isPending ? "저장 중..." : "개선 내용 저장"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* 부서장 승인 다이얼로그 */}
      <Dialog open={!!approvingItem} onOpenChange={(open) => { if (!open) setApprovingItem(null); }}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <UserCheck className="w-5 h-5 text-blue-600" />
              부서장 승인
            </DialogTitle>
          </DialogHeader>
          {approvingItem && (
            <div className="space-y-4 py-2">
              <div className="p-3 rounded-lg bg-blue-50 border border-blue-100 space-y-1">
                <p className="text-xs text-muted-foreground">부서</p>
                <p className="text-sm font-medium">{approvingItem.department}</p>
                <p className="text-xs text-muted-foreground mt-1">유해위험요인</p>
                <p className="text-sm">{approvingItem.hazard}</p>
                <p className="text-xs text-muted-foreground mt-1">위험점수</p>
                <p className="text-sm font-bold text-red-600">{approvingItem.riskScore}점 ({approvingItem.riskLevel})</p>
              </div>
              <div className="text-sm text-muted-foreground">
                A등급 위험성평가 항목에 대해 부서장 승인을 처리합니다. 승인 후 상태가 <strong className="text-green-700">승인완료</strong>로 변경됩니다.
              </div>
            </div>
          )}
          <DialogFooter className="gap-2">
            <Button variant="outline" onClick={() => setApprovingItem(null)}>취소</Button>
            <Button
              onClick={() => {
                if (approvingItem) {
                  approveMutation.mutate({
                    id: approvingItem.id,
                    approvedBy: user?.name || user?.username || "부서장",
                  });
                }
              }}
              disabled={approveMutation.isPending}
              className="bg-blue-600 hover:bg-blue-700 text-white gap-2"
              data-testid="button-approve-confirm"
            >
              <CircleCheck className="w-4 h-4" />
              {approveMutation.isPending ? "처리 중..." : "승인 확인"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
