import { useQuery, useMutation } from "@tanstack/react-query";
import { useHeadquarters } from "@/contexts/HeadquartersContext";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import {
  ClipboardList, Plus, Trash2, ImagePlus, X, Calendar, MapPin, User,
  ChevronDown, ChevronUp, Check, AlertCircle, Pencil, CheckSquare, Mail, Loader2, FileText, BarChart3
} from "lucide-react";
import { Checkbox } from "@/components/ui/checkbox";
import { useState, useRef, useMemo } from "react";
import { useToast } from "@/hooks/use-toast";
import { format } from "date-fns";
import { motion, AnimatePresence } from "framer-motion";
import { apiRequest, queryClient } from "@/lib/queryClient";
import type { SafetyInspection, Team } from "@shared/schema";
import { usePermissions } from "@/hooks/use-permissions";
import { useAuth } from "@/hooks/use-auth";
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer, LabelList } from "recharts";

type ChecklistStatus = '양호' | '미흡' | '미점검';

interface ChecklistItem {
  item: string;
  status: ChecklistStatus;
}

const DEFAULT_CHECKLIST: ChecklistItem[] = [
  { item: "검전기 사용", status: "미점검" },
  { item: "안전모 착용", status: "미점검" },
  { item: "안전화 착용", status: "미점검" },
  { item: "안전대 착용방법", status: "미점검" },
  { item: "이동식사다리 작업지침 준수", status: "미점검" },
  { item: "고임목 사용", status: "미점검" },
  { item: "2인1조 준수", status: "미점검" },
  { item: "작업(절연)장갑 착용", status: "미점검" },
  { item: "라바콘설치", status: "미점검" },
  { item: "유해위험요인 확인", status: "미점검" },
  { item: "관계수급인 고위험 작업 입회", status: "미점검" },
  { item: "입회 임무 준수", status: "미점검" },
  { item: "고위험 작업절차 준수", status: "미점검" },
];

const MAX_IMAGES = 10;


const OTHER_INSPECTION_TYPES = ["KT 점검", "본사 점검", "현장경영팀 점검"] as const;
type OtherInspectionType = typeof OTHER_INSPECTION_TYPES[number];

const SUBTYPE_COLORS: Record<OtherInspectionType, string> = {
  "KT 점검":     "bg-blue-100 text-blue-700 dark:bg-blue-900/40 dark:text-blue-300 border-blue-200 dark:border-blue-800",
  "본사 점검":   "bg-purple-100 text-purple-700 dark:bg-purple-900/40 dark:text-purple-300 border-purple-200 dark:border-purple-800",
  "현장경영팀 점검": "bg-orange-100 text-orange-700 dark:bg-orange-900/40 dark:text-orange-300 border-orange-200 dark:border-orange-800",
};

export default function OtherSafetyInspections() {
  const { departments } = useHeadquarters();
  const EXTRA_DEPARTMENTS = departments.slice(0, 3);
  const { canEditInspections, canUploadInspectionPhotos } = usePermissions();
  const { user } = useAuth();
  const { toast } = useToast();

  const { data: allInspections, isLoading } = useQuery<SafetyInspection[]>({
    queryKey: ["/api/safety-inspections"],
  });

  const inspections = allInspections?.filter(i =>
    (OTHER_INSPECTION_TYPES as readonly string[]).includes(i.inspectionType ?? "")
  ) ?? [];

  const { data: teams } = useQuery<Team[]>({
    queryKey: ["/api/teams"],
  });

  const [editingId, setEditingId] = useState<number | null>(null);
  const [selectionMode, setSelectionMode] = useState(false);
  const [selectedIds, setSelectedIds] = useState<Set<number>>(new Set());
  const [isSendingEmail, setIsSendingEmail] = useState(false);
  const [isSendingBulkEmail, setIsSendingBulkEmail] = useState(false);

  const [subType, setSubType] = useState<OtherInspectionType>("현장경영팀 점검");
  const [department, setDepartment] = useState("");
  const [workContent, setWorkContent] = useState("");
  const [location, setLocation] = useState("");
  const [inspector, setInspector] = useState("");
  const [workerName, setWorkerName] = useState("");
  const [inspectionDate, setInspectionDate] = useState(format(new Date(), "yyyy-MM-dd"));
  const [checklist, setChecklist] = useState<ChecklistItem[]>(DEFAULT_CHECKLIST);
  const [notes, setNotes] = useState("");
  const [images, setImages] = useState<string[]>([]);
  const [isUploading, setIsUploading] = useState(false);
  const [showForm, setShowForm] = useState(false);
  const [expandedId, setExpandedId] = useState<number | null>(null);
  const [isPdfParsing, setIsPdfParsing] = useState(false);
  const [dashboardPeriod, setDashboardPeriod] = useState<"month" | "year">("month");
  const [selectedMonth, setSelectedMonth] = useState<number>(new Date().getMonth() + 1);
  const [showDashboard, setShowDashboard] = useState(true);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const pdfFileInputRef = useRef<HTMLInputElement>(null);

  const inspectionStats = useMemo(() => {
    if (!inspections || inspections.length === 0 || !teams) return null;
    const now = new Date();
    const currentYear = format(now, "yyyy");
    const monthStr = String(selectedMonth).padStart(2, "0");
    const targetMonth = `${currentYear}-${monthStr}`;

    const filtered = inspections.filter(insp => {
      if (dashboardPeriod === "month") return insp.inspectionDate.startsWith(targetMonth);
      return insp.inspectionDate.startsWith(currentYear);
    });

    const allDepts = teams.map(t => t.name);

    const byType = {
      "KT 점검": filtered.filter(i => i.inspectionType === "KT 점검").length,
      "본사 점검": filtered.filter(i => i.inspectionType === "본사 점검").length,
      "현장경영팀 점검": filtered.filter(i => i.inspectionType === "현장경영팀 점검").length,
    };

    const chartData = allDepts.map(dept => {
      const di = filtered.filter(i => i.title.startsWith(dept));
      const shortName = dept.replace("운용팀", "").replace("팀", "");
      return {
        name: shortName,
        "KT": di.filter(i => i.inspectionType === "KT 점검").length,
        "본사": di.filter(i => i.inspectionType === "본사 점검").length,
        "현장경영팀": di.filter(i => i.inspectionType === "현장경영팀 점검").length,
      };
    });

    return {
      total: filtered.length,
      byType,
      chartData,
      periodLabel: dashboardPeriod === "month" ? `${selectedMonth}월` : `${now.getFullYear()}년`,
    };
  }, [inspections, teams, dashboardPeriod, selectedMonth]);

  const resetForm = () => {
    setSubType("현장경영팀 점검");
    setDepartment("");
    setWorkContent("");
    setLocation("");
    setInspector(user?.name || user?.username || "");
    setWorkerName("");
    setInspectionDate(format(new Date(), "yyyy-MM-dd"));
    setChecklist(DEFAULT_CHECKLIST);
    setNotes("");
    setImages([]);
    setShowForm(false);
    setEditingId(null);
  };

  const toggleSelect = (id: number) => setSelectedIds(prev => {
    const n = new Set(prev);
    n.has(id) ? n.delete(id) : n.add(id);
    return n;
  });

  const handleBulkEmail = async () => {
    const ids = Array.from(selectedIds);
    const selected = inspections.filter(i => ids.includes(i.id));
    const eligible = selected.filter(i => i.inspectionType === "현장경영팀 점검");
    if (eligible.length === 0) {
      toast({ variant: "destructive", title: "현장경영팀 점검 항목이 없습니다", description: "메일 발송은 현장경영팀 점검만 가능합니다." });
      return;
    }
    if (eligible.length < selected.length) {
      const skip = selected.length - eligible.length;
      toast({ title: `${skip}건 제외됨`, description: "현장경영팀 점검만 발송됩니다." });
    }
    setIsSendingBulkEmail(true);
    try {
      const res = await fetch("/api/other-inspections/send-email-bulk", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ ids: eligible.map(i => i.id) }),
      });
      const data = await res.json();
      if (res.ok) {
        toast({ title: `이메일 발송 완료 (${eligible.length}건)`, description: "fbwogk26@gmail.com · jaeha.ryu@ktmos.co.kr 로 발송되었습니다." });
        setSelectedIds(new Set());
        setSelectionMode(false);
      } else {
        toast({ variant: "destructive", title: "발송 실패", description: data.message });
      }
    } catch {
      toast({ variant: "destructive", title: "발송 실패", description: "네트워크 오류가 발생했습니다." });
    } finally {
      setIsSendingBulkEmail(false);
    }
  };

  const sendEmailAfterCreate = async (payload: {
    inspectionDate: string;
    department: string;
    inspector: string;
    workerName: string;
    location: string;
    workContent: string;
    checklist: ChecklistItem[];
    notes: string;
    images: string[];
    subType: string;
  }) => {
    setIsSendingEmail(true);
    try {
      const res = await fetch("/api/other-inspections/send-email", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify(payload),
      });
      const data = await res.json();
      if (res.ok) {
        toast({
          title: "이메일 초안 발송 완료",
          description: "fbwogk26@gmail.com으로 안전점검 결과 이메일이 발송되었습니다. Gmail에서 jaeha.ryu@ktmos.com으로 전달하세요.",
        });
      } else {
        toast({
          variant: "destructive",
          title: "이메일 발송 실패",
          description: data.message || "이메일 발송 중 오류가 발생했습니다.",
        });
      }
    } catch {
      toast({
        variant: "destructive",
        title: "이메일 발송 실패",
        description: "네트워크 오류가 발생했습니다.",
      });
    } finally {
      setIsSendingEmail(false);
    }
  };

  const pendingSendEmail = useRef(false);

  const createMutation = useMutation({
    mutationFn: async (data: {
      inspectionType: string;
      title: string;
      location?: string;
      inspector?: string;
      workerName?: string;
      inspectionDate: string;
      checklist: ChecklistItem[];
      notes?: string;
      images: string[];
    }) => apiRequest("POST", "/api/safety-inspections", data),
    onSuccess: async (_, variables) => {
      queryClient.invalidateQueries({ queryKey: ["/api/safety-inspections"] });
      const shouldEmail = pendingSendEmail.current;
      pendingSendEmail.current = false;
      resetForm();
      if (shouldEmail && variables.inspectionType === "현장경영팀 점검") {
        toast({ title: "점검 등록 완료 — 이메일 발송 중..." });
        await sendEmailAfterCreate({
          inspectionDate: variables.inspectionDate,
          department,
          inspector: variables.inspector || "",
          workerName: variables.workerName || "",
          location: variables.location || "",
          workContent,
          checklist: variables.checklist,
          notes: variables.notes || "",
          images: variables.images,
          subType: variables.inspectionType,
        });
      } else {
        toast({ title: "점검 등록 완료" });
      }
    },
    onError: () => toast({ variant: "destructive", title: "점검 등록 실패" }),
  });

  const updateMutation = useMutation({
    mutationFn: ({ id, data }: { id: number; data: any }) =>
      apiRequest("PUT", `/api/safety-inspections/${id}`, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/safety-inspections"] });
      resetForm();
      toast({ title: "점검 수정 완료" });
    },
    onError: () => toast({ variant: "destructive", title: "수정 실패" }),
  });

  const deleteMutation = useMutation({
    mutationFn: (id: number) => apiRequest("DELETE", `/api/safety-inspections/${id}`),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/safety-inspections"] });
      toast({ title: "점검 내역 삭제됨" });
    },
    onError: () => toast({ variant: "destructive", title: "삭제 실패" }),
  });

  const bulkDeleteMutation = useMutation({
    mutationFn: (ids: number[]) => apiRequest("DELETE", "/api/safety-inspections/bulk-delete", { ids }),
    onSuccess: async (res) => {
      const data = await (res as any).json();
      queryClient.invalidateQueries({ queryKey: ["/api/safety-inspections"] });
      setSelectedIds(new Set());
      setSelectionMode(false);
      toast({ title: `${data.deleted ?? selectedIds.size}건 삭제 완료` });
    },
    onError: () => toast({ variant: "destructive", title: "삭제 실패" }),
  });

  const handleImageUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (!files || files.length === 0) return;
    const remaining = MAX_IMAGES - images.length;
    if (remaining <= 0) {
      toast({ variant: "destructive", title: `최대 ${MAX_IMAGES}장까지 등록 가능합니다.` });
      return;
    }
    const toUpload = Array.from(files).slice(0, remaining);
    setIsUploading(true);
    try {
      for (const file of toUpload) {
        const urlRes = await fetch("/api/uploads/request-url", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ name: file.name, size: file.size, contentType: file.type }),
        });
        const { uploadURL, objectPath } = await urlRes.json();
        await fetch(uploadURL, { method: "PUT", body: file, headers: { "Content-Type": file.type } });
        setImages(prev => [...prev, objectPath]);
      }
      toast({ title: "이미지 업로드 완료" });
    } catch {
      toast({ variant: "destructive", title: "업로드 실패" });
    } finally {
      setIsUploading(false);
      if (fileInputRef.current) fileInputRef.current.value = "";
    }
  };

  const handlePdfImport = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    if (pdfFileInputRef.current) pdfFileInputRef.current.value = "";
    setIsPdfParsing(true);
    try {
      const formData = new FormData();
      formData.append("pdf", file);
      const res = await fetch("/api/parse-inspection-pdf", { method: "POST", body: formData, credentials: "include" });
      let body: any;
      try { body = await res.json(); } catch { throw new Error("서버 응답을 읽을 수 없습니다"); }
      if (!res.ok) throw new Error(body?.message || `서버 오류 (${res.status})`);
      if (body.inspectionDate) setInspectionDate(body.inspectionDate);
      if (body.team) setDepartment(body.team);
      if (body.location) setLocation(body.location);
      if (body.workContent) setWorkContent(body.workContent);
      const newImages: string[] = Array.isArray(body.imageUrls) ? body.imageUrls : [];
      if (newImages.length > 0) {
        setImages(prev => [...prev, ...newImages].slice(0, MAX_IMAGES));
        toast({ title: `PDF 불러오기 완료 — 사진 ${newImages.length}장 추출됨` });
      } else {
        toast({ title: "PDF 불러오기 완료 — 텍스트 필드 자동 입력됨" });
      }
    } catch (err: any) {
      toast({ variant: "destructive", title: "PDF 불러오기 실패", description: err?.message });
    } finally {
      setIsPdfParsing(false);
    }
  };

  const handleChecklistChange = (index: number, status: ChecklistStatus) => {
    setChecklist(prev => prev.map((item, i) => {
      if (i !== index) return item;
      if (item.status === status) return { ...item, status: '미점검' as ChecklistStatus };
      return { ...item, status };
    }));
  };

  const buildPayload = () => {
    const title = workContent ? `${department} - ${workContent}` : department;
    return {
      inspectionType: subType,
      title,
      location: location || undefined,
      inspector: inspector || undefined,
      workerName: workerName || undefined,
      inspectionDate,
      checklist,
      notes: notes || undefined,
      images,
    };
  };

  const handleSubmitOnly = () => {
    if (!department) { toast({ variant: "destructive", title: "부서명을 선택하세요" }); return; }
    pendingSendEmail.current = false;
    if (editingId !== null) updateMutation.mutate({ id: editingId, data: buildPayload() });
    else createMutation.mutate(buildPayload());
  };

  const handleSubmitAndEmail = () => {
    if (!department) { toast({ variant: "destructive", title: "부서명을 선택하세요" }); return; }
    pendingSendEmail.current = true;
    createMutation.mutate(buildPayload());
  };

  const handleEdit = (inspection: any) => {
    const knownSubType = OTHER_INSPECTION_TYPES.find(t => t === inspection.inspectionType);
    setSubType(knownSubType ?? "현장경영팀 점검");
    const parts = inspection.title?.split(" - ") || [];
    setDepartment(inspection.department || parts[0] || "");
    setWorkContent(inspection.workContent || parts.slice(1).join(" - ") || "");
    setLocation(inspection.location || "");
    setInspector(inspection.inspector || "");
    setWorkerName(inspection.workerName || "");
    setInspectionDate(inspection.inspectionDate || format(new Date(), "yyyy-MM-dd"));
    setChecklist(normalizeChecklist(inspection.checklist));
    setNotes(inspection.notes || "");
    setImages(inspection.images || []);
    setEditingId(inspection.id);
    setShowForm(true);
    setTimeout(() => window.scrollTo({ top: 0, behavior: "smooth" }), 100);
  };

  const handleDelete = (id: number) => {
    if (confirm("이 점검 내역을 삭제하시겠습니까?")) deleteMutation.mutate(id);
  };

  const normalizeChecklist = (raw: unknown): ChecklistItem[] => {
    if (!Array.isArray(raw)) return [];
    return raw.map((item: any) => {
      if ('status' in item && typeof item.status === 'string') return item as ChecklistItem;
      if ('checked' in item) return { item: item.item || '', status: item.checked ? '양호' : '미점검' as ChecklistStatus };
      return { item: item.item || '', status: '미점검' as ChecklistStatus };
    });
  };

  const getStatusColor = (status: ChecklistStatus) => {
    if (status === '양호') return 'bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400';
    if (status === '미흡') return 'bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400';
    return 'bg-gray-100 text-gray-500 dark:bg-gray-800 dark:text-gray-400';
  };

  const goodCount = checklist.filter(c => c.status === '양호').length;
  const poorCount = checklist.filter(c => c.status === '미흡').length;
  const totalCount = checklist.length;

  return (
    <div className="max-w-4xl mx-auto space-y-4 sm:space-y-6">
      {/* 헤더 */}
      <div className="flex items-center justify-between gap-2 sm:gap-3">
        <div className="flex items-center gap-2 sm:gap-3">
          <div className="bg-orange-100 p-2 sm:p-2.5 rounded-lg sm:rounded-xl text-orange-600 dark:bg-orange-900/30 dark:text-orange-400">
            <ClipboardList className="w-5 h-5 sm:w-6 sm:h-6 md:w-8 md:h-8" />
          </div>
          <div>
            <h2 className="text-xl sm:text-2xl md:text-3xl font-display font-bold text-foreground">
              기타 안전점검
            </h2>
            <p className="text-xs sm:text-sm text-muted-foreground">점검 등록 후 Gmail 이메일 초안 자동 발송</p>
          </div>
        </div>
        <div className="flex gap-2">
          {canEditInspections && (
            <Button
              onClick={() => {
                if (!showForm) setInspector(user?.name || user?.username || "");
                setShowForm(!showForm);
              }}
              className="bg-orange-600 hover:bg-orange-700 text-white gap-2"
              data-testid="button-toggle-form"
            >
              <Plus className="w-4 h-4" />
              새 점검 등록
            </Button>
          )}
        </div>
      </div>

      {/* 점검 현황 차트 */}
      {inspectionStats && (
        <Card>
          <CardHeader
            className="bg-gradient-to-r from-orange-50 to-amber-50 dark:from-orange-900/20 dark:to-amber-900/20 border-b p-3 sm:p-4 cursor-pointer"
            onClick={() => setShowDashboard(!showDashboard)}
            data-testid="button-toggle-dashboard"
          >
            <CardTitle className="text-sm sm:text-base flex items-center justify-between gap-2">
              <div className="flex items-center gap-2">
                <BarChart3 className="w-4 h-4 text-orange-600" />
                기타 안전점검 현황
              </div>
              <div className="flex items-center gap-2">
                <Badge variant="secondary" className="text-xs">{inspectionStats.periodLabel} 현황</Badge>
                {showDashboard ? <ChevronUp className="w-4 h-4 text-muted-foreground" /> : <ChevronDown className="w-4 h-4 text-muted-foreground" />}
              </div>
            </CardTitle>
          </CardHeader>
          <AnimatePresence>
            {showDashboard && (
              <motion.div
                initial={{ height: 0, opacity: 0 }}
                animate={{ height: "auto", opacity: 1 }}
                exit={{ height: 0, opacity: 0 }}
                transition={{ duration: 0.2 }}
                className="overflow-hidden"
              >
                <CardContent className="p-3 sm:p-4 space-y-4">
                  {/* 기간 토글 */}
                  <div className="flex items-center gap-1 flex-wrap">
                    <Button
                      variant={dashboardPeriod === "month" ? "default" : "outline"}
                      size="sm"
                      onClick={(e) => { e.stopPropagation(); setDashboardPeriod("month"); }}
                      data-testid="button-period-month"
                    >월별</Button>
                    <Button
                      variant={dashboardPeriod === "year" ? "default" : "outline"}
                      size="sm"
                      onClick={(e) => { e.stopPropagation(); setDashboardPeriod("year"); }}
                      data-testid="button-period-year"
                    >연간</Button>
                    {dashboardPeriod === "month" && (
                      <Select value={String(selectedMonth)} onValueChange={(v) => setSelectedMonth(Number(v))}>
                        <SelectTrigger className="w-[80px] h-8" data-testid="select-dashboard-month" onClick={(e) => e.stopPropagation()}>
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          {Array.from({ length: 12 }, (_, i) => i + 1).map(m => (
                            <SelectItem key={m} value={String(m)}>{m}월</SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    )}
                  </div>

                  {/* 요약 카드 3개 */}
                  <div className="grid grid-cols-3 gap-3">
                    <div className="rounded-xl p-3 bg-gradient-to-br from-orange-50 to-amber-50 dark:from-orange-950/40 dark:to-amber-950/20 border border-orange-100 dark:border-orange-900/30">
                      <p className="text-[11px] font-semibold text-orange-600 dark:text-orange-400 mb-1">📋 총 점검</p>
                      <p className="text-2xl font-black text-orange-700 dark:text-orange-300">
                        {inspectionStats.total}<span className="text-xs font-normal ml-0.5">건</span>
                      </p>
                    </div>
                    <div className="rounded-xl p-3 bg-gradient-to-br from-blue-50 to-sky-50 dark:from-blue-950/40 dark:to-sky-950/20 border border-blue-100 dark:border-blue-900/30">
                      <p className="text-[11px] font-semibold text-blue-600 dark:text-blue-400 mb-1">🔵 KT 점검</p>
                      <p className="text-2xl font-black text-blue-700 dark:text-blue-300">
                        {inspectionStats.byType["KT 점검"]}<span className="text-xs font-normal ml-0.5">건</span>
                      </p>
                    </div>
                    <div className="rounded-xl p-3 bg-gradient-to-br from-purple-50 to-violet-50 dark:from-purple-950/40 dark:to-violet-950/20 border border-purple-100 dark:border-purple-900/30">
                      <p className="text-[11px] font-semibold text-purple-600 dark:text-purple-400 mb-1">🟣 본사 점검</p>
                      <p className="text-2xl font-black text-purple-700 dark:text-purple-300">
                        {inspectionStats.byType["본사 점검"]}<span className="text-xs font-normal ml-0.5">건</span>
                      </p>
                    </div>
                  </div>

                  {/* 바 차트 */}
                  {inspectionStats.total > 0 ? (
                    <div className="w-full overflow-x-auto">
                      <div style={{ minWidth: Math.max(500, (inspectionStats.chartData.length * 52) + 60), height: 260 }}>
                        <ResponsiveContainer width="100%" height="100%">
                          <BarChart
                            data={inspectionStats.chartData}
                            margin={{ top: 20, right: 10, left: -10, bottom: 5 }}
                            barCategoryGap="30%"
                            barGap={2}
                          >
                            <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="hsl(var(--border))" opacity={0.5} />
                            <XAxis
                              dataKey="name"
                              tick={{ fontSize: 11, fontWeight: 500, fill: "hsl(var(--muted-foreground))" }}
                              axisLine={false}
                              tickLine={false}
                              interval={0}
                            />
                            <YAxis
                              tick={{ fontSize: 11, fill: "hsl(var(--muted-foreground))" }}
                              axisLine={false}
                              tickLine={false}
                              allowDecimals={false}
                              width={28}
                            />
                            <Tooltip
                              contentStyle={{
                                borderRadius: "8px",
                                border: "1px solid hsl(var(--border))",
                                background: "hsl(var(--popover))",
                                color: "hsl(var(--popover-foreground))",
                                fontSize: 12,
                                boxShadow: "0 4px 12px rgba(0,0,0,0.1)",
                              }}
                              cursor={{ fill: "hsl(var(--muted))", opacity: 0.4 }}
                            />
                            <Legend wrapperStyle={{ fontSize: 12, paddingTop: 8 }} iconType="circle" iconSize={8} />
                            <Bar dataKey="KT" stackId="a" fill="#3b82f6" radius={[0, 0, 0, 0]}>
                              <LabelList dataKey="KT" position="inside" style={{ fontSize: 10, fontWeight: 700, fill: "#fff" }} formatter={(v: number) => v > 0 ? v : ""} />
                            </Bar>
                            <Bar dataKey="본사" stackId="a" fill="#8b5cf6" radius={[0, 0, 0, 0]}>
                              <LabelList dataKey="본사" position="inside" style={{ fontSize: 10, fontWeight: 700, fill: "#fff" }} formatter={(v: number) => v > 0 ? v : ""} />
                            </Bar>
                            <Bar dataKey="현장경영팀" stackId="a" fill="#f97316" radius={[4, 4, 0, 0]}>
                              <LabelList dataKey="현장경영팀" position="inside" style={{ fontSize: 10, fontWeight: 700, fill: "#fff" }} formatter={(v: number) => v > 0 ? v : ""} />
                            </Bar>
                          </BarChart>
                        </ResponsiveContainer>
                      </div>
                    </div>
                  ) : (
                    <p className="text-sm text-muted-foreground text-center py-4">해당 기간 점검 내역이 없습니다.</p>
                  )}
                </CardContent>
              </motion.div>
            )}
          </AnimatePresence>
        </Card>
      )}

      {/* 안내 카드 — 관리자만 표시 */}
      {user?.role === "admin" && (
        <Card className="border-orange-200 dark:border-orange-900/30 bg-orange-50/50 dark:bg-orange-950/10">
          <CardContent className="p-4 flex items-start gap-3">
            <Mail className="w-5 h-5 text-orange-500 mt-0.5 shrink-0" />
            <div className="text-sm text-orange-800 dark:text-orange-300">
              <p className="font-semibold">이메일 자동 발송 안내</p>
              <p className="text-xs mt-1 text-orange-700 dark:text-orange-400">
                <strong>현장경영팀 점검</strong> 등록 시에만 안전점검 결과 이메일이 <strong>fbwogk26@gmail.com</strong>으로 자동 발송됩니다.
                Gmail에서 해당 이메일을 <strong>jaeha.ryu@ktmos.com</strong>으로 전달하세요.
                <br /><span className="text-muted-foreground">※ KT 점검 · 본사 점검은 이메일 발송 없이 등록만 됩니다.</span>
              </p>
            </div>
          </CardContent>
        </Card>
      )}

      {/* 이메일 발송 중 오버레이 */}
      {isSendingEmail && (
        <Card className="border-blue-200 dark:border-blue-900/30">
          <CardContent className="p-4 flex items-center gap-3">
            <Loader2 className="w-5 h-5 text-blue-500 animate-spin" />
            <p className="text-sm text-blue-700 dark:text-blue-300">이메일 초안을 발송하는 중...</p>
          </CardContent>
        </Card>
      )}

      {/* 등록 폼 */}
      <AnimatePresence>
        {showForm && (
          <motion.div
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: "auto" }}
            exit={{ opacity: 0, height: 0 }}
          >
            <Card className="glass-card overflow-hidden border-orange-200 dark:border-orange-900/30">
              <CardHeader className="pb-4">
                <div className="flex items-center justify-between gap-3">
                  <CardTitle className="text-lg">{editingId !== null ? "점검 수정" : "점검 등록"}</CardTitle>
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    className="gap-2 border-blue-300 text-blue-700 hover:bg-blue-50 dark:border-blue-700 dark:text-blue-400 dark:hover:bg-blue-950"
                    onClick={() => pdfFileInputRef.current?.click()}
                    disabled={isPdfParsing}
                    data-testid="button-import-pdf"
                  >
                    {isPdfParsing ? (
                      <><Loader2 className="w-4 h-4 animate-spin" />PDF 분석중...</>
                    ) : (
                      <><FileText className="w-4 h-4" />PDF 불러오기</>
                    )}
                  </Button>
                  <input ref={pdfFileInputRef} type="file" accept=".pdf" className="hidden" onChange={handlePdfImport} />
                </div>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label>점검 유형</Label>
                    <Select value={subType} onValueChange={v => setSubType(v as OtherInspectionType)}>
                      <SelectTrigger data-testid="select-sub-type">
                        <SelectValue placeholder="점검 유형 선택" />
                      </SelectTrigger>
                      <SelectContent>
                        {OTHER_INSPECTION_TYPES.map(t => (
                          <SelectItem key={t} value={t}>{t}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="space-y-2">
                    <Label>점검일</Label>
                    <div className="relative">
                      <Calendar className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                      <Input
                        type="date"
                        value={inspectionDate}
                        onChange={e => setInspectionDate(e.target.value)}
                        className="pl-10"
                        data-testid="input-inspection-date"
                      />
                    </div>
                  </div>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label>부서명</Label>
                    <Select value={department} onValueChange={setDepartment}>
                      <SelectTrigger data-testid="select-department">
                        <SelectValue placeholder="부서 선택" />
                      </SelectTrigger>
                      <SelectContent>
                        {teams?.map(team => (
                          <SelectItem key={team.id} value={team.name}>{team.name}</SelectItem>
                        ))}
                        {EXTRA_DEPARTMENTS.map(dept => (
                          <SelectItem key={dept} value={dept}>{dept}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="space-y-2">
                    <Label>작업내용</Label>
                    <Input
                      placeholder="작업 내용 입력"
                      value={workContent}
                      onChange={e => setWorkContent(e.target.value)}
                      data-testid="input-work-content"
                    />
                  </div>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label>점검국소</Label>
                    <div className="relative">
                      <MapPin className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                      <Input
                        placeholder="점검 국소 입력"
                        value={location}
                        onChange={e => setLocation(e.target.value)}
                        className="pl-10"
                        data-testid="input-location"
                      />
                    </div>
                  </div>
                  <div className="space-y-2">
                    <Label>점검자</Label>
                    <div className="relative">
                      <User className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                      <Input
                        placeholder="점검자 이름"
                        value={inspector}
                        onChange={e => setInspector(e.target.value)}
                        className="pl-10"
                        data-testid="input-inspector"
                      />
                    </div>
                  </div>
                </div>

                <div className="space-y-2">
                  <Label>작업자</Label>
                  <Input
                    placeholder="작업자 이름 입력"
                    value={workerName}
                    onChange={e => setWorkerName(e.target.value)}
                    data-testid="input-worker-name"
                  />
                </div>

                <div className="space-y-2">
                  <div className="flex items-center justify-between">
                    <Label>체크리스트</Label>
                    <div className="flex gap-2 text-xs">
                      <span className="text-green-600 dark:text-green-400">양호: {goodCount}</span>
                      <span className="text-red-600 dark:text-red-400">미흡: {poorCount}</span>
                      <span className="text-muted-foreground">미점검: {totalCount - goodCount - poorCount}</span>
                    </div>
                  </div>
                  <div className="bg-muted/50 rounded-lg p-4 space-y-3">
                    {checklist.map((item, index) => (
                      <div key={index} className="flex items-center justify-between gap-3 py-2 border-b border-border/50 last:border-0">
                        <span className="flex-1 text-sm">{item.item}</span>
                        <div className="flex gap-1">
                          <Button
                            type="button"
                            variant="ghost"
                            size="sm"
                            className={`h-8 px-3 ${item.status === '양호' ? 'bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400' : ''}`}
                            onClick={() => handleChecklistChange(index, '양호')}
                            data-testid={`btn-good-${index}`}
                          >
                            <Check className="w-3 h-3 mr-1" />양호
                          </Button>
                          <Button
                            type="button"
                            variant="ghost"
                            size="sm"
                            className={`h-8 px-3 ${item.status === '미흡' ? 'bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400' : ''}`}
                            onClick={() => handleChecklistChange(index, '미흡')}
                            data-testid={`btn-poor-${index}`}
                          >
                            <AlertCircle className="w-3 h-3 mr-1" />미흡
                          </Button>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>

                <div className="space-y-2">
                  <Label>비고</Label>
                  <Textarea
                    placeholder="추가 메모 사항..."
                    value={notes}
                    onChange={e => setNotes(e.target.value)}
                    data-testid="input-notes"
                  />
                </div>

                <div className="space-y-2">
                  <Label>사진 첨부 ({images.length}/{MAX_IMAGES})</Label>
                  {canUploadInspectionPhotos && (
                    <input
                      type="file"
                      accept="image/*"
                      multiple
                      ref={fileInputRef}
                      onChange={handleImageUpload}
                      className="hidden"
                    />
                  )}
                  <div className="flex flex-wrap gap-2">
                    {images.map((img, index) => (
                      <div key={index} className="relative">
                        <img src={img} alt={`첨부 ${index + 1}`} className="h-20 w-20 object-cover rounded-lg border" />
                        <Button
                          variant="destructive"
                          size="icon"
                          className="absolute -top-2 -right-2 h-5 w-5"
                          onClick={() => setImages(prev => prev.filter((_, i) => i !== index))}
                          data-testid={`button-remove-image-${index}`}
                        >
                          <X className="w-3 h-3" />
                        </Button>
                      </div>
                    ))}
                    {images.length < MAX_IMAGES && canUploadInspectionPhotos && (
                      <Button
                        variant="outline"
                        onClick={() => fileInputRef.current?.click()}
                        disabled={isUploading}
                        className="h-20 w-20 flex flex-col gap-1"
                        data-testid="button-add-image"
                      >
                        <ImagePlus className="w-5 h-5" />
                        <span className="text-xs">{isUploading ? "업로드..." : "추가"}</span>
                      </Button>
                    )}
                  </div>
                </div>

                <div className="flex justify-end gap-2 flex-wrap">
                  <Button variant="outline" onClick={resetForm} data-testid="button-cancel">
                    취소
                  </Button>
                  {editingId !== null ? (
                    /* 수정 모드 — 단일 버튼 */
                    <Button
                      onClick={handleSubmitOnly}
                      disabled={updateMutation.isPending || !department}
                      className="bg-orange-600 hover:bg-orange-700 text-white gap-2"
                      data-testid="button-submit-inspection"
                    >
                      {updateMutation.isPending
                        ? <><Loader2 className="w-4 h-4 animate-spin" />처리 중...</>
                        : "수정 완료"}
                    </Button>
                  ) : subType === "현장경영팀 점검" ? (
                    /* 신규 등록 — 두 버튼 */
                    <>
                      <Button
                        onClick={handleSubmitOnly}
                        disabled={createMutation.isPending || isSendingEmail || !department}
                        variant="outline"
                        className="gap-2 border-orange-400 text-orange-700 hover:bg-orange-50"
                        data-testid="button-submit-only"
                      >
                        {createMutation.isPending && !pendingSendEmail.current
                          ? <><Loader2 className="w-4 h-4 animate-spin" />등록 중...</>
                          : "등록만"}
                      </Button>
                      <Button
                        onClick={handleSubmitAndEmail}
                        disabled={createMutation.isPending || isSendingEmail || !department}
                        className="bg-orange-600 hover:bg-orange-700 text-white gap-2"
                        data-testid="button-submit-and-email"
                      >
                        {(createMutation.isPending && pendingSendEmail.current) || isSendingEmail
                          ? <><Loader2 className="w-4 h-4 animate-spin" />발송 중...</>
                          : <><Mail className="w-4 h-4" />등록 + 메일 발송</>}
                      </Button>
                    </>
                  ) : (
                    /* 기타 점검 유형 — 단일 버튼 */
                    <Button
                      onClick={handleSubmitOnly}
                      disabled={createMutation.isPending || !department}
                      className="bg-orange-600 hover:bg-orange-700 text-white gap-2"
                      data-testid="button-submit-inspection"
                    >
                      {createMutation.isPending
                        ? <><Loader2 className="w-4 h-4 animate-spin" />처리 중...</>
                        : "등록"}
                    </Button>
                  )}
                </div>
              </CardContent>
            </Card>
          </motion.div>
        )}
      </AnimatePresence>

      {/* 목록 */}
      <div className="space-y-1">
        <div className="flex items-center justify-between mb-2">
          <div className="flex items-center gap-2">
            <Calendar className="w-4 h-4 text-muted-foreground" />
            <span className="text-sm font-medium text-muted-foreground">점검 목록</span>
            <span className="text-xs text-muted-foreground">{inspections.length}건</span>
          </div>
          <div className="flex items-center gap-2">
            {canEditInspections && (
              <Button
                variant={selectionMode ? "default" : "outline"}
                size="sm"
                className={`gap-1 h-7 text-xs px-2.5 ${selectionMode ? "bg-red-500 hover:bg-red-600 text-white" : ""}`}
                onClick={() => { setSelectionMode(v => !v); setSelectedIds(new Set()); }}
                data-testid="button-toggle-selection"
              >
                <CheckSquare className="w-3.5 h-3.5" />
                {selectionMode ? "취소" : "선택"}
              </Button>
            )}
          </div>
        </div>

        {isLoading ? (
          <div className="text-center py-8 text-muted-foreground">로딩 중...</div>
        ) : inspections.length === 0 ? (
          <div className="text-center py-12 text-muted-foreground">
            등록된 기타 안전점검 내역이 없습니다.
          </div>
        ) : (
          <Card>
            <CardContent className="p-0 divide-y">
              {inspections.map((inspection) => {
                const checklistItems = normalizeChecklist(inspection.checklist);
                const goodItems = checklistItems.filter(c => c.status === '양호').length;
                const poorItems = checklistItems.filter(c => c.status === '미흡').length;
                const isExpanded = expandedId === inspection.id;
                const isOwner = !inspection.createdBy || user?.role === "admin" || user?.username === inspection.createdBy;

                return (
                  <div key={inspection.id} data-testid={`card-inspection-${inspection.id}`} className={selectionMode && selectedIds.has(inspection.id) ? "bg-red-50 dark:bg-red-900/20" : ""}>
                    <div
                      className="flex items-center gap-2 sm:gap-3 px-3 sm:px-4 py-2.5 cursor-pointer hover:bg-muted/30 transition-colors group"
                      onClick={() => selectionMode ? toggleSelect(inspection.id) : setExpandedId(isExpanded ? null : inspection.id)}
                    >
                      {selectionMode && (
                        <Checkbox
                          checked={selectedIds.has(inspection.id)}
                          onCheckedChange={() => toggleSelect(inspection.id)}
                          onClick={e => e.stopPropagation()}
                          data-testid={`checkbox-inspection-${inspection.id}`}
                        />
                      )}
                      {(() => {
                        const st = inspection.inspectionType as OtherInspectionType;
                        const colorCls = SUBTYPE_COLORS[st] ?? SUBTYPE_COLORS["현장경영팀 점검"];
                        return (
                          <span className={`text-[10px] px-1.5 py-0.5 rounded shrink-0 font-bold border ${colorCls}`}>
                            {inspection.inspectionType}
                          </span>
                        );
                      })()}
                      <span className="text-xs text-muted-foreground shrink-0 w-[72px]">{inspection.inspectionDate}</span>
                      <span className="text-sm font-medium truncate flex-1 min-w-0">{inspection.title}</span>
                      {inspection.inspector && (
                        <span className="text-xs font-medium text-foreground/70 shrink-0 flex items-center gap-0.5">
                          <User className="w-3 h-3 text-muted-foreground" />
                          {inspection.inspector}
                        </span>
                      )}
                      <div className="flex items-center gap-1.5 shrink-0 text-[10px]">
                        <span className="text-green-600 dark:text-green-400">{goodItems}</span>
                        <span className="text-muted-foreground">/</span>
                        <span className="text-red-600 dark:text-red-400">{poorItems}</span>
                      </div>
                      {inspection.images && inspection.images.length > 0 && (
                        <span className="text-[10px] text-muted-foreground shrink-0">{inspection.images.length}장</span>
                      )}
                      <div className="flex items-center gap-0.5 shrink-0">
                        {isExpanded ? <ChevronUp className="w-3.5 h-3.5 text-muted-foreground" /> : <ChevronDown className="w-3.5 h-3.5 text-muted-foreground" />}
                        {canEditInspections && isOwner && (
                          <>
                            <Button
                              variant="ghost"
                              size="icon"
                              className="h-7 w-7 opacity-100 sm:opacity-0 sm:group-hover:opacity-100"
                              onClick={e => { e.stopPropagation(); handleEdit(inspection); }}
                              data-testid={`button-edit-${inspection.id}`}
                            >
                              <Pencil className="w-3.5 h-3.5 text-blue-500" />
                            </Button>
                            <Button
                              variant="ghost"
                              size="icon"
                              className="h-7 w-7 opacity-100 sm:opacity-0 sm:group-hover:opacity-100"
                              onClick={e => { e.stopPropagation(); handleDelete(inspection.id); }}
                              data-testid={`button-delete-${inspection.id}`}
                            >
                              <Trash2 className="w-3.5 h-3.5 text-destructive" />
                            </Button>
                          </>
                        )}
                      </div>
                    </div>

                    <AnimatePresence>
                      {isExpanded && (
                        <motion.div
                          initial={{ opacity: 0, height: 0 }}
                          animate={{ opacity: 1, height: "auto" }}
                          exit={{ opacity: 0, height: 0 }}
                          className="border-t bg-muted/10"
                        >
                          <div className="p-4 space-y-3">
                            <div className="flex flex-wrap gap-x-4 gap-y-1 text-xs text-muted-foreground">
                              {inspection.inspector && <span>점검자: {inspection.inspector}</span>}
                              {inspection.workerName && <span>작업자: {inspection.workerName}</span>}
                              {inspection.location && <span>점검국소: {inspection.location}</span>}
                            </div>
                            {checklistItems.length > 0 && (
                              <div className="space-y-2">
                                <Label className="text-sm">체크리스트</Label>
                                <div className="bg-muted/50 rounded-lg p-3 space-y-2">
                                  {checklistItems.map((item, idx) => (
                                    <div key={idx} className="flex items-center justify-between gap-2">
                                      <span className="text-sm">{item.item}</span>
                                      <span className={`text-xs px-2 py-0.5 rounded-full ${getStatusColor(item.status)}`}>
                                        {item.status}
                                      </span>
                                    </div>
                                  ))}
                                </div>
                              </div>
                            )}
                            {inspection.notes && (
                              <div className="space-y-1">
                                <Label className="text-sm">비고</Label>
                                <p className="text-sm text-muted-foreground bg-muted/50 rounded-lg p-3">{inspection.notes}</p>
                              </div>
                            )}
                            {inspection.images && inspection.images.length > 0 && (
                              <div className="space-y-1">
                                <Label className="text-sm">첨부 사진 ({inspection.images.length}장)</Label>
                                <div className="flex flex-wrap gap-2">
                                  {inspection.images.map((img, idx) => (
                                    <img
                                      key={idx}
                                      src={img}
                                      alt={`점검 사진 ${idx + 1}`}
                                      className="h-24 w-24 object-cover rounded-lg border cursor-pointer hover:opacity-80"
                                      onClick={e => { e.stopPropagation(); window.open(img, "_blank"); }}
                                    />
                                  ))}
                                </div>
                              </div>
                            )}
                          </div>
                        </motion.div>
                      )}
                    </AnimatePresence>
                  </div>
                );
              })}
            </CardContent>
          </Card>
        )}
      </div>

      {/* 플로팅 벌크 액션 */}
      {selectionMode && selectedIds.size > 0 && (
        <div className="fixed bottom-6 left-1/2 -translate-x-1/2 z-50 flex items-center gap-3 bg-background border border-border shadow-xl rounded-full px-5 py-3">
          <span className="text-sm font-semibold">{selectedIds.size}건 선택됨</span>
          <div className="w-px h-5 bg-border" />
          <Button variant="ghost" size="sm" className="h-8" onClick={() => setSelectedIds(new Set())}>
            <X className="w-3.5 h-3.5 mr-1" />해제
          </Button>
          <Button
            size="sm"
            className="h-8 bg-orange-500 hover:bg-orange-600 text-white gap-1"
            disabled={isSendingBulkEmail}
            onClick={handleBulkEmail}
            data-testid="button-bulk-email"
          >
            {isSendingBulkEmail
              ? <><Loader2 className="w-3.5 h-3.5 animate-spin" />발송 중...</>
              : <><Mail className="w-3.5 h-3.5" />메일 발송</>
            }
          </Button>
          <Button
            variant="destructive"
            size="sm"
            className="h-8"
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
