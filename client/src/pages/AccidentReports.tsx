import { useState, useRef, useCallback, useEffect } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { apiRequest } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { usePermissions } from "@/hooks/use-permissions";
import { useAuth } from "@/hooks/use-auth";
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
import { AlertTriangle, BarChart3, Plus, Pencil, Trash2, Download, Upload, X, Camera, PenTool, FileText, Loader2 } from "lucide-react";
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip,
  ResponsiveContainer, Cell, PieChart, Pie, Legend,
} from "recharts";

const ACCIDENT_TYPES = ["추락", "전도", "충돌", "협착", "감전", "화재/폭발", "교통사고", "기타"];
const CAUSES = ["불안전한 행동", "불안전한 상태", "관리적 요인", "환경적 요인", "기타"];
const SEVERITIES = ["경미", "보통", "중대", "사망"];
const DEPARTMENTS = ["동대구운용팀", "서대구운용팀", "남대구운용팀", "포항운용팀", "안동운용팀", "구미운용팀", "문경운용팀", "운용지원팀", "운용계획팀", "사업지원팀", "현장경영팀", "공공망관제팀"];

const SEVERITY_COLORS: Record<string, string> = {
  "경미": "bg-green-100 text-green-700 border-green-200 dark:bg-green-900/30 dark:text-green-400",
  "보통": "bg-yellow-100 text-yellow-700 border-yellow-200 dark:bg-yellow-900/30 dark:text-yellow-400",
  "중대": "bg-orange-100 text-orange-700 border-orange-200 dark:bg-orange-900/30 dark:text-orange-400",
  "사망": "bg-red-100 text-red-700 border-red-200 dark:bg-red-900/30 dark:text-red-400",
};

const CHART_COLORS = ["#6366f1", "#ec4899", "#f59e0b", "#10b981", "#8b5cf6", "#06b6d4", "#f97316", "#14b8a6"];


interface ProgressItem {
  no: number;
  time: string;
  content: string;
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
  reporterName: "",
  reporterPosition: "",
  companion: "",
  vehicleInfo: "",
  accidentOverview: "",
  causeDetail: "",
  preventionPlan: "",
  signature: "",
  images: [] as string[],
  imageCaptions: [] as string[],
  progressDetails: "[]",
  faultRate: undefined as number | undefined,
};

function SignaturePad({ onSave, onCancel, initialData }: { onSave: (data: string) => void; onCancel: () => void; initialData?: string }) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [isDrawing, setIsDrawing] = useState(false);
  const [hasContent, setHasContent] = useState(false);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const rect = canvas.getBoundingClientRect();
    canvas.width = rect.width;
    canvas.height = rect.height;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    ctx.fillStyle = "#ffffff";
    ctx.fillRect(0, 0, canvas.width, canvas.height);

    if (initialData) {
      const img = new Image();
      img.onload = () => {
        ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
        setHasContent(true);
      };
      img.src = initialData;
    }
  }, [initialData]);

  const getPos = useCallback((e: React.MouseEvent | React.TouchEvent) => {
    const canvas = canvasRef.current;
    if (!canvas) return { x: 0, y: 0 };
    const rect = canvas.getBoundingClientRect();
    if ("touches" in e) {
      return { x: e.touches[0].clientX - rect.left, y: e.touches[0].clientY - rect.top };
    }
    return { x: e.clientX - rect.left, y: e.clientY - rect.top };
  }, []);

  const startDraw = useCallback((e: React.MouseEvent | React.TouchEvent) => {
    e.preventDefault();
    setIsDrawing(true);
    setHasContent(true);
    const ctx = canvasRef.current?.getContext("2d");
    if (!ctx) return;
    const { x, y } = getPos(e);
    ctx.beginPath();
    ctx.moveTo(x, y);
  }, [getPos]);

  const draw = useCallback((e: React.MouseEvent | React.TouchEvent) => {
    if (!isDrawing) return;
    e.preventDefault();
    const ctx = canvasRef.current?.getContext("2d");
    if (!ctx) return;
    const { x, y } = getPos(e);
    ctx.lineWidth = 2;
    ctx.lineCap = "round";
    ctx.strokeStyle = "#000";
    ctx.lineTo(x, y);
    ctx.stroke();
  }, [isDrawing, getPos]);

  const endDraw = useCallback(() => setIsDrawing(false), []);

  const clearCanvas = useCallback(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    ctx.fillStyle = "#ffffff";
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    setHasContent(false);
  }, []);

  const handleSave = () => {
    if (!hasContent || !canvasRef.current) return;
    const data = canvasRef.current.toDataURL("image/png");
    onSave(data);
  };

  return (
    <div className="space-y-2">
      <div className="border-2 border-dashed border-primary/30 rounded-lg overflow-hidden bg-white">
        <canvas
          ref={canvasRef}
          className="w-full touch-none cursor-crosshair"
          style={{ height: "120px" }}
          onMouseDown={startDraw}
          onMouseMove={draw}
          onMouseUp={endDraw}
          onMouseLeave={endDraw}
          onTouchStart={startDraw}
          onTouchMove={draw}
          onTouchEnd={endDraw}
          data-testid="canvas-signature"
        />
      </div>
      <div className="flex gap-2 justify-end">
        <Button variant="outline" size="sm" onClick={clearCanvas}>지우기</Button>
        <Button variant="outline" size="sm" onClick={onCancel}>취소</Button>
        <Button size="sm" disabled={!hasContent} onClick={handleSave} className="gap-1">
          <PenTool className="w-3.5 h-3.5" />
          서명 완료
        </Button>
      </div>
    </div>
  );
}

export default function AccidentReports() {
  const queryClient = useQueryClient();
  const { toast } = useToast();
  const { canEditAccidents, canDownloadAccidentReport, canUploadAccidentPhotos } = usePermissions();
  const { user } = useAuth();
  const isOwner = (createdBy?: string | null) => !createdBy || user?.role === "admin" || user?.username === createdBy;

  const [dialogOpen, setDialogOpen] = useState(false);
  const [editingId, setEditingId] = useState<number | null>(null);
  const [form, setForm] = useState({ ...emptyForm });
  const [progressItems, setProgressItems] = useState<ProgressItem[]>([{ no: 1, time: "", content: "" }]);
  const [showSignaturePad, setShowSignaturePad] = useState(false);
  const [uploadingPhotos, setUploadingPhotos] = useState(false);
  const [isPdfParsing, setIsPdfParsing] = useState(false);
  const photoInputRef = useRef<HTMLInputElement>(null);
  const accidentPdfRef = useRef<HTMLInputElement>(null);

  const handleAccidentPdfImport = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    e.target.value = "";
    setIsPdfParsing(true);
    try {
      const fd = new FormData();
      fd.append("pdf", file);
      const res = await fetch("/api/accidents/parse-pdf", { method: "POST", body: fd, credentials: "include" });
      if (!res.ok) throw new Error(await res.text());
      const parsed = await res.json();
      setForm(prev => ({
        ...prev,
        title: parsed.title || prev.title,
        department: parsed.department || prev.department,
        reporterName: parsed.reporterName || prev.reporterName,
        vehicleInfo: parsed.vehicleInfo || prev.vehicleInfo,
        companion: parsed.companion || prev.companion,
        occurredAt: parsed.occurredAt || prev.occurredAt,
        location: parsed.location || prev.location,
        accidentOverview: parsed.accidentOverview || prev.accidentOverview,
        causeDetail: parsed.causeDetail || prev.causeDetail,
        preventionPlan: parsed.preventionPlan || prev.preventionPlan,
        accidentType: parsed.accidentType || prev.accidentType,
        images: parsed.imageUrls?.length ? [...prev.images, ...parsed.imageUrls] : prev.images,
      }));
      if (parsed.accidentOverview) {
        const segments = parsed.accidentOverview
          .split(/\n[•·]?\s*/)
          .map((s: string) => s.replace(/^[•·]\s*/, "").trim())
          .filter((s: string) => s.length > 2);
        const items = segments.length > 0
          ? segments.map((seg: string, idx: number) => {
              const timeMatch = seg.match(/(\d{1,2}:\d{2})/);
              const time = timeMatch
                ? timeMatch[1]
                : idx === 0 && parsed.occurredAt
                  ? parsed.occurredAt.replace("T", " ")
                  : "";
              return { no: idx + 1, time, content: seg };
            })
          : [{ no: 1, time: parsed.occurredAt ? parsed.occurredAt.replace("T", " ") : "", content: parsed.accidentOverview }];
        setProgressItems(items);
      }
      toast({ title: "PDF에서 정보를 불러왔습니다. 내용을 확인하고 수정하세요." });
    } catch (err: any) {
      toast({ variant: "destructive", title: "PDF 불러오기 실패", description: err?.message || "" });
    } finally {
      setIsPdfParsing(false);
    }
  };

  const { data: reports = [], isLoading } = useQuery<AccidentReport[]>({
    queryKey: ["/api/accidents"],
  });

  const getServerError = (error: unknown, fallback: string): string => {
    if (!(error instanceof Error)) return fallback;
    const match = error.message.match(/^\d+: (.+)$/);
    if (!match) return fallback;
    try { return JSON.parse(match[1]).message || fallback; } catch { return match[1] || fallback; }
  };

  const createMutation = useMutation({
    mutationFn: (data: any) => apiRequest("POST", "/api/accidents", data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/accidents"] });
      queryClient.invalidateQueries({ queryKey: ["/api/accidents/stats"] });
      queryClient.invalidateQueries({ queryKey: ["/api/teams"] });
      toast({ title: "사고보고가 등록되었습니다." });
      closeDialog();
    },
    onError: (error) => toast({ variant: "destructive", title: "등록에 실패했습니다.", description: getServerError(error, "") }),
  });

  const updateMutation = useMutation({
    mutationFn: ({ id, data }: { id: number; data: any }) => apiRequest("PUT", `/api/accidents/${id}`, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/accidents"] });
      queryClient.invalidateQueries({ queryKey: ["/api/accidents/stats"] });
      queryClient.invalidateQueries({ queryKey: ["/api/teams"] });
      toast({ title: "사고보고가 수정되었습니다." });
      closeDialog();
    },
    onError: (error) => toast({ variant: "destructive", title: "수정에 실패했습니다.", description: getServerError(error, "") }),
  });

  const deleteMutation = useMutation({
    mutationFn: (id: number) => apiRequest("DELETE", `/api/accidents/${id}`),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/accidents"] });
      queryClient.invalidateQueries({ queryKey: ["/api/accidents/stats"] });
      queryClient.invalidateQueries({ queryKey: ["/api/teams"] });
      toast({ title: "사고보고가 삭제되었습니다." });
    },
    onError: (error) => toast({ variant: "destructive", title: "삭제에 실패했습니다.", description: getServerError(error, "") }),
  });

  const closeDialog = () => {
    setDialogOpen(false);
    setEditingId(null);
    setForm({ ...emptyForm });
    setProgressItems([{ no: 1, time: "", content: "" }]);
    setShowSignaturePad(false);
  };

  const openCreate = () => {
    setEditingId(null);
    setForm({ ...emptyForm });
    setProgressItems([{ no: 1, time: "", content: "" }]);
    setShowSignaturePad(false);
    setDialogOpen(true);
  };

  const openEdit = (report: AccidentReport) => {
    setEditingId(report.id);
    let items: ProgressItem[] = [{ no: 1, time: "", content: "" }];
    if (report.progressDetails) {
      try {
        const parsed = JSON.parse(report.progressDetails);
        if (Array.isArray(parsed) && parsed.length > 0) items = parsed;
      } catch {}
    }
    setProgressItems(items);
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
      reporterName: report.reporterName || "",
      reporterPosition: report.reporterPosition || "",
      companion: report.companion || "",
      vehicleInfo: report.vehicleInfo || "",
      accidentOverview: report.accidentOverview || "",
      causeDetail: report.causeDetail || "",
      preventionPlan: report.preventionPlan || "",
      signature: report.signature || "",
      images: report.images || [],
      imageCaptions: (report as any).imageCaptions ? JSON.parse((report as any).imageCaptions) : (report.images || []).map((_: any, i: number) => `사진 ${i + 1}`),
      progressDetails: report.progressDetails || "[]",
      faultRate: (report as any).faultRate ?? undefined,
    });
    setShowSignaturePad(false);
    setDialogOpen(true);
  };

  const handleSubmit = () => {
    if (!form.title || !form.occurredAt || !form.accidentType || !form.cause || !form.severity || !form.department) {
      toast({ variant: "destructive", title: "필수 항목을 모두 입력해주세요." });
      return;
    }
    const submitData = {
      ...form,
      description: form.accidentOverview || form.description || "",
      status: "접수",
      progressDetails: JSON.stringify(progressItems.filter(p => p.time || p.content)),
      imageCaptions: JSON.stringify(form.imageCaptions),
    };
    if (editingId) {
      updateMutation.mutate({ id: editingId, data: submitData });
    } else {
      createMutation.mutate(submitData);
    }
  };

  const handleDelete = (id: number) => {
    if (confirm("이 사고보고를 삭제하시겠습니까?")) {
      deleteMutation.mutate(id);
    }
  };

  const setField = (key: string, value: any) => setForm(prev => ({ ...prev, [key]: value }));

  const handlePhotoUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (!files || files.length === 0) return;
    setUploadingPhotos(true);
    try {
      const formData = new FormData();
      Array.from(files).forEach(f => formData.append("photos", f));
      const res = await fetch("/api/accidents/upload-photos", {
        method: "POST",
        body: formData,
        credentials: "include",
      });
      if (!res.ok) throw new Error("Upload failed");
      const data = await res.json();
      setForm(prev => ({
        ...prev,
        images: [...prev.images, ...data.imageUrls],
        imageCaptions: [...prev.imageCaptions, ...data.imageUrls.map((_: string, i: number) => `사진 ${prev.images.length + i + 1}`)],
      }));
      toast({ title: `${data.imageUrls.length}개 사진이 업로드되었습니다.` });
    } catch {
      toast({ variant: "destructive", title: "사진 업로드에 실패했습니다." });
    }
    setUploadingPhotos(false);
    if (photoInputRef.current) photoInputRef.current.value = "";
  };

  const removePhoto = (index: number) => {
    setForm(prev => ({
      ...prev,
      images: prev.images.filter((_, i) => i !== index),
      imageCaptions: prev.imageCaptions.filter((_, i) => i !== index),
    }));
  };

  const updateCaption = (index: number, caption: string) => {
    setForm(prev => ({
      ...prev,
      imageCaptions: prev.imageCaptions.map((c, i) => i === index ? caption : c),
    }));
  };

  const addProgressRow = () => {
    setProgressItems(prev => [...prev, { no: prev.length + 1, time: "", content: "" }]);
  };

  const removeProgressRow = (index: number) => {
    setProgressItems(prev => {
      const updated = prev.filter((_, i) => i !== index);
      return updated.map((item, i) => ({ ...item, no: i + 1 }));
    });
  };

  const updateProgressItem = (index: number, field: keyof ProgressItem, value: string | number) => {
    setProgressItems(prev => prev.map((item, i) => i === index ? { ...item, [field]: value } : item));
  };

  const handleDownloadDocx = async (reportId: number) => {
    try {
      const res = await fetch(`/api/accidents/${reportId}/download-docx`, { credentials: "include" });
      if (!res.ok) throw new Error("Download failed");
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `사고경위서_${reportId}.docx`;
      a.click();
      URL.revokeObjectURL(url);
      toast({ title: "사고경위서가 다운로드되었습니다." });
    } catch {
      toast({ variant: "destructive", title: "사고경위서 다운로드에 실패했습니다." });
    }
  };

  const toChartData = (record: Record<string, number> | undefined) =>
    record ? Object.entries(record).map(([name, value]) => ({ name, value })) : [];

  const CURRENT_YEAR = "2026";
  const COMPARE_YEARS = ["2024", "2025", "2026"];
  const YEAR_COLORS: Record<string, string> = { "2024": "#6366f1", "2025": "#f59e0b", "2026": "#10b981" };
  const MONTH_LABELS: Record<string, string> = {
    "01": "1월", "02": "2월", "03": "3월", "04": "4월", "05": "5월", "06": "6월",
    "07": "7월", "08": "8월", "09": "9월", "10": "10월", "11": "11월", "12": "12월",
  };
  const MONTHS_ORDER = ["01","02","03","04","05","06","07","08","09","10","11","12"];

  const reports2026 = reports.filter(r => r.occurredAt?.startsWith(CURRENT_YEAR));
  const byType2026 = reports2026.reduce((acc, r) => { acc[r.accidentType] = (acc[r.accidentType] || 0) + 1; return acc; }, {} as Record<string, number>);
  const byCause2026 = reports2026.reduce((acc, r) => { acc[r.cause] = (acc[r.cause] || 0) + 1; return acc; }, {} as Record<string, number>);
  const byDept2026 = reports2026.reduce((acc, r) => { acc[r.department] = (acc[r.department] || 0) + 1; return acc; }, {} as Record<string, number>);
  const bySeverity2026 = reports2026.reduce((acc, r) => { acc[r.severity] = (acc[r.severity] || 0) + 1; return acc; }, {} as Record<string, number>);
  const currentYearTotal = reports2026.length;
  const currentYearSeverity = bySeverity2026;

  const byYearCount = reports.reduce((acc, r) => {
    const yr = r.occurredAt?.substring(0, 4) || "unknown";
    acc[yr] = (acc[yr] || 0) + 1;
    return acc;
  }, {} as Record<string, number>);
  const yearCompareData = COMPARE_YEARS.map(yr => ({ name: yr + "년", value: byYearCount[yr] ?? 0, year: yr }));

  const byYearMonth = reports.reduce((acc, r) => {
    const yr = r.occurredAt?.substring(0, 4) || "unknown";
    const mon = r.occurredAt?.substring(5, 7) || "00";
    if (!acc[mon]) acc[mon] = {};
    acc[mon][yr] = (acc[mon][yr] || 0) + 1;
    return acc;
  }, {} as Record<string, Record<string, number>>);
  const yearMonthlyData = MONTHS_ORDER.map(mon => {
    const entry: Record<string, string | number> = { name: MONTH_LABELS[mon] };
    for (const yr of COMPARE_YEARS) entry[yr + "년"] = byYearMonth[mon]?.[yr] ?? 0;
    return entry;
  });

  const sortedReports = [...reports].sort((a, b) => {
    const da = a.occurredAt ? new Date(a.occurredAt).getTime() : 0;
    const db2 = b.occurredAt ? new Date(b.occurredAt).getTime() : 0;
    return db2 - da;
  });

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
              {canEditAccidents && (
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
                            <TableHead>심각도</TableHead>
                            <TableHead>부서</TableHead>
                            <TableHead className="w-[140px]" />
                          </TableRow>
                        </TableHeader>
                        <TableBody>
                          {sortedReports.map((report) => (
                            <TableRow key={report.id} data-testid={`row-accident-${report.id}`}>
                              <TableCell className="font-medium" data-testid={`text-title-${report.id}`}>{report.title}</TableCell>
                              <TableCell data-testid={`text-date-${report.id}`}>
                                {report.occurredAt ? format(new Date(report.occurredAt), "yyyy-MM-dd") : "-"}
                              </TableCell>
                              <TableCell data-testid={`text-type-${report.id}`}>{report.accidentType}</TableCell>
                              <TableCell>
                                <Badge variant="outline" className={SEVERITY_COLORS[report.severity] || ""} data-testid={`badge-severity-${report.id}`}>
                                  {report.severity}
                                </Badge>
                              </TableCell>
                              <TableCell data-testid={`text-dept-${report.id}`}>{report.department}</TableCell>
                              <TableCell>
                                <div className="flex items-center gap-1">
                                  {canDownloadAccidentReport && (
                                    <Button variant="ghost" size="icon" onClick={() => handleDownloadDocx(report.id)} title="경위서 다운로드" data-testid={`button-download-${report.id}`}>
                                      <Download className="w-4 h-4 text-blue-500" />
                                    </Button>
                                  )}
                                  {canEditAccidents && isOwner(report.createdBy) && (
                                    <>
                                      <Button variant="ghost" size="icon" onClick={() => openEdit(report)} data-testid={`button-edit-${report.id}`}>
                                        <Pencil className="w-4 h-4" />
                                      </Button>
                                      <Button variant="ghost" size="icon" onClick={() => handleDelete(report.id)} data-testid={`button-delete-${report.id}`}>
                                        <Trash2 className="w-4 h-4 text-red-500" />
                                      </Button>
                                    </>
                                  )}
                                </div>
                              </TableCell>
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
              className="space-y-5"
            >
              {/* ── Section 1: KPI 종합 현황 ────────────────────────────────── */}
              <div>
                <div className="flex items-center gap-2 mb-3">
                  <div className="w-1 h-5 rounded-full bg-red-500" />
                  <span className="text-sm font-bold text-foreground">{CURRENT_YEAR}년 종합 현황</span>
                </div>
                <div className="grid grid-cols-2 md:grid-cols-6 gap-3">
                  {/* 전체 사고 — 2열 차지 */}
                  <Card data-testid="card-stat-total" className="col-span-2 border-0 shadow-sm bg-gradient-to-br from-red-500 to-rose-600">
                    <CardContent className="p-5 flex items-center gap-5">
                      <div className="w-14 h-14 rounded-2xl bg-white/20 flex items-center justify-center shrink-0">
                        <AlertTriangle className="w-7 h-7 text-white" />
                      </div>
                      <div>
                        <p className="text-white/80 text-xs font-semibold">전체 사고</p>
                        <p className="text-5xl font-black text-white leading-tight">{currentYearTotal}</p>
                        <p className="text-white/60 text-xs mt-0.5">건 발생</p>
                      </div>
                      <div className="ml-auto text-right hidden sm:block">
                        <p className="text-white/60 text-[11px]">교통사고</p>
                        <p className="text-2xl font-black text-white">{reports2026.filter(r => r.accidentType === "교통사고").length}</p>
                        <p className="text-white/60 text-[11px] mt-2">산업재해</p>
                        <p className="text-2xl font-black text-white">{reports2026.filter(r => r.accidentType !== "교통사고").length}</p>
                      </div>
                    </CardContent>
                  </Card>

                  {/* 심각도 4개 — 각 1열 */}
                  {[
                    { label: "경미", value: currentYearSeverity["경미"] ?? 0, from: "from-sky-50", to: "to-sky-100/60", text: "text-sky-600", num: "text-sky-700", darkFrom: "dark:from-sky-950/40", darkTo: "dark:to-sky-900/20", darkText: "dark:text-sky-400", darkNum: "dark:text-sky-300", dot: "bg-sky-400" },
                    { label: "보통", value: currentYearSeverity["보통"] ?? 0, from: "from-yellow-50", to: "to-yellow-100/60", text: "text-yellow-600", num: "text-yellow-700", darkFrom: "dark:from-yellow-950/40", darkTo: "dark:to-yellow-900/20", darkText: "dark:text-yellow-400", darkNum: "dark:text-yellow-300", dot: "bg-yellow-400" },
                    { label: "중대", value: currentYearSeverity["중대"] ?? 0, from: "from-orange-50", to: "to-orange-100/60", text: "text-orange-600", num: "text-orange-700", darkFrom: "dark:from-orange-950/40", darkTo: "dark:to-orange-900/20", darkText: "dark:text-orange-400", darkNum: "dark:text-orange-300", dot: "bg-orange-400" },
                    { label: "사망", value: currentYearSeverity["사망"] ?? 0, from: "from-rose-50", to: "to-rose-100/60", text: "text-rose-600", num: "text-rose-800", darkFrom: "dark:from-rose-950/40", darkTo: "dark:to-rose-900/20", darkText: "dark:text-rose-400", darkNum: "dark:text-rose-300", dot: "bg-rose-500" },
                  ].map(({ label, value, from, to, text, num, darkFrom, darkTo, darkText, darkNum, dot }) => (
                    <Card key={label} data-testid={`card-stat-${label}`} className={`border-0 shadow-sm bg-gradient-to-br ${from} ${to} ${darkFrom} ${darkTo}`}>
                      <CardContent className="p-4">
                        <div className="flex items-center gap-1.5 mb-2">
                          <span className={`w-2 h-2 rounded-full ${dot}`} />
                          <p className={`text-xs font-semibold ${text} ${darkText}`}>{label}</p>
                        </div>
                        <p className={`text-3xl font-black ${num} ${darkNum}`}>{value}</p>
                        <p className={`text-xs mt-0.5 ${text} ${darkText} opacity-70`}>건</p>
                      </CardContent>
                    </Card>
                  ))}
                </div>
              </div>

              {/* ── Section 2: 연도별 비교 ──────────────────────────────────── */}
              <div>
                <div className="flex items-center gap-2 mb-3">
                  <div className="w-1 h-5 rounded-full bg-indigo-500" />
                  <span className="text-sm font-bold text-foreground">최근 3년 비교</span>
                </div>
                <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
                  {/* 좌: 연도별 mini 카드 + 세로 바 차트 */}
                  <div className="flex flex-col gap-3">
                    {COMPARE_YEARS.map(yr => (
                      <Card key={yr} className="border-0 shadow-sm" style={{ borderLeft: `3px solid ${YEAR_COLORS[yr]}` }}>
                        <CardContent className="p-3 flex items-center justify-between">
                          <div>
                            <p className="text-xs text-muted-foreground font-medium">{yr}년</p>
                            <p className="text-xl font-black" style={{ color: YEAR_COLORS[yr] }}>{byYearCount[yr] ?? 0}<span className="text-xs font-normal text-muted-foreground ml-1">건</span></p>
                          </div>
                          <div className="w-12 h-8">
                            <ResponsiveContainer width="100%" height="100%">
                              <BarChart data={[{ v: byYearCount[yr] ?? 0 }]} margin={{ top: 2, right: 0, left: 0, bottom: 0 }}>
                                <Bar dataKey="v" radius={[3, 3, 0, 0]} maxBarSize={28}>
                                  <Cell fill={YEAR_COLORS[yr]} />
                                </Bar>
                              </BarChart>
                            </ResponsiveContainer>
                          </div>
                        </CardContent>
                      </Card>
                    ))}
                    <Card className="border-0 shadow-sm flex-1">
                      <CardContent className="px-2 py-3 h-full" style={{ minHeight: 80 }}>
                        <ResponsiveContainer width="100%" height="100%">
                          <BarChart data={yearCompareData} margin={{ top: 24, right: 4, left: 0, bottom: 4 }}>
                            <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#e2e8f0" opacity={0.4} />
                            <XAxis dataKey="name" tick={{ fontSize: 10, fontWeight: 700, fill: '#475569' }} axisLine={false} tickLine={false} />
                            <YAxis allowDecimals={false} tick={{ fontSize: 10, fill: '#94a3b8' }} axisLine={false} tickLine={false} width={22} />
                            <Tooltip content={({ active, payload }) => active && payload?.length ? (
                              <div style={{ background: '#fff', border: '1px solid #f1f5f9', borderRadius: 8, padding: '6px 12px', fontSize: 12 }}>
                                <p style={{ fontWeight: 700 }}>{payload[0].payload.name}</p>
                                <p style={{ color: payload[0].payload.year ? YEAR_COLORS[payload[0].payload.year] : '#64748b', fontWeight: 800 }}>{payload[0].value}건</p>
                              </div>
                            ) : null} />
                            <Bar dataKey="value" radius={[6, 6, 0, 0]} maxBarSize={40} animationDuration={900} label={{ position: 'top', fontSize: 12, fontWeight: 800, fill: '#1e293b' }}>
                              {yearCompareData.map(entry => (
                                <Cell key={entry.name} fill={YEAR_COLORS[entry.year] || CHART_COLORS[0]} />
                              ))}
                            </Bar>
                          </BarChart>
                        </ResponsiveContainer>
                      </CardContent>
                    </Card>
                  </div>

                  {/* 우: 월별 트렌드 차트 (3열 차지) */}
                  <Card className="md:col-span-3 border-0 shadow-sm">
                    <CardHeader className="pb-1 pt-4 px-5">
                      <div className="flex items-center justify-between">
                        <CardTitle className="text-sm font-semibold text-foreground">월별 사고 발생 추이</CardTitle>
                        <div className="flex items-center gap-3">
                          {COMPARE_YEARS.map(yr => (
                            <span key={yr} className="flex items-center gap-1 text-[11px]">
                              <span className="w-2.5 h-2.5 rounded-sm inline-block" style={{ background: YEAR_COLORS[yr] }} />
                              <span style={{ color: YEAR_COLORS[yr] }} className="font-semibold">{yr}</span>
                            </span>
                          ))}
                        </div>
                      </div>
                    </CardHeader>
                    <CardContent className="px-3 pb-4">
                      <div className="h-[260px]">
                        <ResponsiveContainer width="100%" height="100%">
                          <BarChart data={yearMonthlyData} margin={{ top: 10, right: 8, left: 0, bottom: 4 }} barGap={2} barCategoryGap="28%">
                            <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#e2e8f0" opacity={0.4} />
                            <XAxis dataKey="name" tick={{ fontSize: 11, fontWeight: 600, fill: '#475569' }} axisLine={false} tickLine={false} />
                            <YAxis allowDecimals={false} tick={{ fontSize: 11, fill: '#94a3b8' }} axisLine={false} tickLine={false} width={28} />
                            <Tooltip content={({ active, payload, label }) => active && payload?.length ? (
                              <div style={{ background: '#fff', border: '1px solid #f1f5f9', borderRadius: 10, padding: '10px 14px', boxShadow: '0 8px 24px rgba(0,0,0,0.12)', fontSize: 12 }}>
                                <p style={{ fontWeight: 700, marginBottom: 6, fontSize: 13 }}>{label}</p>
                                {payload.map(p => (
                                  <p key={String(p.dataKey)} style={{ color: p.color, fontWeight: 600, marginBottom: 2 }}>
                                    {p.name}: <span style={{ fontWeight: 800 }}>{p.value}</span>건
                                  </p>
                                ))}
                              </div>
                            ) : null} />
                            {COMPARE_YEARS.map(yr => (
                              <Bar key={yr} dataKey={yr + "년"} fill={YEAR_COLORS[yr]} radius={[4, 4, 0, 0]} maxBarSize={14} animationDuration={900} />
                            ))}
                          </BarChart>
                        </ResponsiveContainer>
                      </div>
                    </CardContent>
                  </Card>
                </div>
              </div>

              {/* ── Section 3: 상세 분석 ────────────────────────────────────── */}
              <div>
                <div className="flex items-center gap-2 mb-3">
                  <div className="w-1 h-5 rounded-full bg-emerald-500" />
                  <span className="text-sm font-bold text-foreground">{CURRENT_YEAR}년 상세 분석</span>
                </div>

                {/* 상단 3열: 사고유형 · 원인별 · 심각도 도넛 */}
                <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-4">
                  {/* 사고유형별 */}
                  <Card className="border-0 shadow-sm">
                    <CardHeader className="pb-1 pt-4 px-5">
                      <CardTitle className="text-sm font-semibold text-foreground">사고유형별</CardTitle>
                    </CardHeader>
                    <CardContent className="px-3 pb-4">
                      <div className="h-[200px]">
                        <ResponsiveContainer width="100%" height="100%">
                          <BarChart data={toChartData(byType2026)} margin={{ top: 24, right: 8, left: 0, bottom: 4 }}>
                            <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#e2e8f0" opacity={0.4} />
                            <XAxis dataKey="name" tick={{ fontSize: 10, fontWeight: 700, fill: '#475569' }} interval={0} axisLine={false} tickLine={false} />
                            <YAxis allowDecimals={false} tick={{ fontSize: 10, fill: '#94a3b8' }} axisLine={false} tickLine={false} width={24} />
                            <Tooltip content={({ active, payload }) => active && payload?.length ? (
                              <div style={{ background: '#fff', border: '1px solid #f1f5f9', borderRadius: 8, padding: '6px 12px', fontSize: 12 }}>
                                <p style={{ fontWeight: 700 }}>{payload[0].payload.name}</p>
                                <p style={{ color: CHART_COLORS[0], fontWeight: 700 }}>{payload[0].value}건</p>
                              </div>
                            ) : null} />
                            <Bar dataKey="value" fill={CHART_COLORS[0]} radius={[5, 5, 0, 0]} maxBarSize={36} animationDuration={900}
                              label={{ position: 'top', fontSize: 12, fontWeight: 800, fill: '#1e293b' }} />
                          </BarChart>
                        </ResponsiveContainer>
                      </div>
                    </CardContent>
                  </Card>

                  {/* 원인별 */}
                  <Card className="border-0 shadow-sm">
                    <CardHeader className="pb-1 pt-4 px-5">
                      <CardTitle className="text-sm font-semibold text-foreground">원인별</CardTitle>
                    </CardHeader>
                    <CardContent className="px-3 pb-4">
                      <div className="h-[200px]">
                        <ResponsiveContainer width="100%" height="100%">
                          <BarChart data={toChartData(byCause2026)} margin={{ top: 24, right: 8, left: 0, bottom: 4 }}>
                            <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#e2e8f0" opacity={0.4} />
                            <XAxis dataKey="name" tick={{ fontSize: 10, fontWeight: 700, fill: '#475569' }} interval={0} axisLine={false} tickLine={false} />
                            <YAxis allowDecimals={false} tick={{ fontSize: 10, fill: '#94a3b8' }} axisLine={false} tickLine={false} width={24} />
                            <Tooltip content={({ active, payload }) => active && payload?.length ? (
                              <div style={{ background: '#fff', border: '1px solid #f1f5f9', borderRadius: 8, padding: '6px 12px', fontSize: 12 }}>
                                <p style={{ fontWeight: 700 }}>{payload[0].payload.name}</p>
                                <p style={{ color: CHART_COLORS[1], fontWeight: 700 }}>{payload[0].value}건</p>
                              </div>
                            ) : null} />
                            <Bar dataKey="value" fill={CHART_COLORS[1]} radius={[5, 5, 0, 0]} maxBarSize={36} animationDuration={900}
                              label={{ position: 'top', fontSize: 12, fontWeight: 800, fill: '#1e293b' }} />
                          </BarChart>
                        </ResponsiveContainer>
                      </div>
                    </CardContent>
                  </Card>

                  {/* 심각도별 도넛 차트 */}
                  <Card className="border-0 shadow-sm">
                    <CardHeader className="pb-1 pt-4 px-5">
                      <CardTitle className="text-sm font-semibold text-foreground">심각도 분포</CardTitle>
                    </CardHeader>
                    <CardContent className="px-3 pb-4">
                      <div className="h-[200px]">
                        {toChartData(bySeverity2026).length > 0 ? (
                          <ResponsiveContainer width="100%" height="100%">
                            <PieChart>
                              <Pie
                                data={toChartData(bySeverity2026)}
                                cx="50%" cy="50%"
                                innerRadius={50} outerRadius={78}
                                paddingAngle={3}
                                dataKey="value"
                                animationDuration={900}
                                label={({ name, value }) => `${value}`}
                                labelLine={false}
                              >
                                {toChartData(bySeverity2026).map((_, idx) => {
                                  const SEVERITY_CHART_COLORS: Record<string, string> = { "경미": "#38bdf8", "보통": "#fbbf24", "중대": "#fb923c", "사망": "#f43f5e" };
                                  const sname = toChartData(bySeverity2026)[idx]?.name;
                                  return <Cell key={idx} fill={SEVERITY_CHART_COLORS[sname] || CHART_COLORS[idx % CHART_COLORS.length]} />;
                                })}
                              </Pie>
                              <Tooltip content={({ active, payload }) => active && payload?.length ? (
                                <div style={{ background: '#fff', border: '1px solid #f1f5f9', borderRadius: 8, padding: '6px 12px', fontSize: 12 }}>
                                  <p style={{ fontWeight: 700, color: payload[0].payload.fill }}>{payload[0].name}: {payload[0].value}건</p>
                                </div>
                              ) : null} />
                              <Legend iconType="circle" iconSize={8} wrapperStyle={{ fontSize: 11, paddingTop: 4 }} />
                            </PieChart>
                          </ResponsiveContainer>
                        ) : (
                          <div className="h-full flex items-center justify-center text-muted-foreground text-sm">데이터 없음</div>
                        )}
                      </div>
                    </CardContent>
                  </Card>
                </div>

                {/* 하단 전폭: 부서별 수평 바 차트 */}
                <Card className="border-0 shadow-sm">
                  <CardHeader className="pb-1 pt-4 px-5">
                    <CardTitle className="text-sm font-semibold text-foreground">부서별 발생건수</CardTitle>
                  </CardHeader>
                  <CardContent className="px-3 pb-4">
                    {toChartData(byDept2026).length === 0 ? (
                      <div className="h-16 flex items-center justify-center text-muted-foreground text-sm">데이터 없음</div>
                    ) : (
                      <div style={{ height: Math.max(60, toChartData(byDept2026).length * 42) + "px" }}>
                        <ResponsiveContainer width="100%" height="100%">
                          <BarChart
                            layout="vertical"
                            data={toChartData(byDept2026).map(d => ({ ...d, shortName: d.name.replace(/운용팀$/, '팀').replace(/관제팀$/, '관제').replace(/지원팀$/, '지원') }))}
                            margin={{ top: 4, right: 48, left: 4, bottom: 4 }}
                          >
                            <CartesianGrid strokeDasharray="3 3" horizontal={false} stroke="#e2e8f0" opacity={0.4} />
                            <XAxis type="number" allowDecimals={false} tick={{ fontSize: 11, fill: '#94a3b8' }} axisLine={false} tickLine={false} />
                            <YAxis type="category" dataKey="shortName" tick={{ fontSize: 11, fontWeight: 600, fill: '#475569' }} axisLine={false} tickLine={false} width={68} />
                            <Tooltip content={({ active, payload }) => active && payload?.length ? (
                              <div style={{ background: '#fff', border: '1px solid #f1f5f9', borderRadius: 8, padding: '6px 12px', fontSize: 12 }}>
                                <p style={{ fontWeight: 700 }}>{payload[0].payload.name}</p>
                                <p style={{ color: CHART_COLORS[4], fontWeight: 700 }}>{payload[0].value}건</p>
                              </div>
                            ) : null} />
                            <Bar dataKey="value" fill={CHART_COLORS[4]} radius={[0, 6, 6, 0]} maxBarSize={28} animationDuration={900}
                              label={{ position: 'right', fontSize: 12, fontWeight: 800, fill: '#1e293b' }} />
                          </BarChart>
                        </ResponsiveContainer>
                      </div>
                    )}
                  </CardContent>
                </Card>
              </div>

            </motion.div>
          </AnimatePresence>
        </TabsContent>
      </Tabs>

      <Dialog open={dialogOpen} onOpenChange={(open) => { if (!open) closeDialog(); }}>
        <DialogContent className="max-w-3xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <div className="flex items-center justify-between gap-3">
              <DialogTitle>{editingId ? "사고보고 수정" : "사고보고 등록 (경위서 양식)"}</DialogTitle>
              <Button
                type="button"
                variant="outline"
                size="sm"
                className="gap-2 border-blue-300 text-blue-700 hover:bg-blue-50 dark:border-blue-700 dark:text-blue-400 dark:hover:bg-blue-950 shrink-0"
                onClick={() => accidentPdfRef.current?.click()}
                disabled={isPdfParsing}
                data-testid="button-import-accident-pdf"
              >
                {isPdfParsing ? (
                  <><Loader2 className="w-4 h-4 animate-spin" />PDF 분석중...</>
                ) : (
                  <><FileText className="w-4 h-4" />PDF 불러오기</>
                )}
              </Button>
              <input ref={accidentPdfRef} type="file" accept=".pdf" className="hidden" onChange={handleAccidentPdfImport} />
            </div>
          </DialogHeader>
          <div className="grid gap-4 py-4">
            <div className="space-y-2">
              <Label>제목 *</Label>
              <Input value={form.title} onChange={(e) => setField("title", e.target.value)} placeholder="사고 제목" data-testid="input-title" />
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label>발생일시 *</Label>
                <Input type="datetime-local" value={form.occurredAt} onChange={(e) => setField("occurredAt", e.target.value)} data-testid="input-occurred-at" />
              </div>
              <div className="space-y-2">
                <Label>사고장소</Label>
                <Input value={form.location} onChange={(e) => setField("location", e.target.value)} placeholder="사고 발생 장소" data-testid="input-location" />
              </div>
            </div>

            <Card className="border-primary/20">
              <CardHeader className="pb-2 pt-3">
                <CardTitle className="text-sm font-semibold text-primary">사고자 인적사항</CardTitle>
              </CardHeader>
              <CardContent className="grid grid-cols-1 md:grid-cols-2 gap-3">
                <div className="space-y-1">
                  <Label className="text-xs">성명</Label>
                  <Input value={form.reporterName} onChange={(e) => setField("reporterName", e.target.value)} placeholder="사고자 성명" data-testid="input-reporter-name" />
                </div>
                <div className="space-y-1">
                  <Label className="text-xs">직위</Label>
                  <Input value={form.reporterPosition} onChange={(e) => setField("reporterPosition", e.target.value)} placeholder="직위" data-testid="input-reporter-position" />
                </div>
                <div className="space-y-1">
                  <Label className="text-xs">소속부서 *</Label>
                  <Select value={form.department} onValueChange={(v) => setField("department", v)}>
                    <SelectTrigger data-testid="select-department"><SelectValue placeholder="선택" /></SelectTrigger>
                    <SelectContent>
                      {DEPARTMENTS.map((d) => <SelectItem key={d} value={d}>{d}</SelectItem>)}
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-1">
                  <Label className="text-xs">동행자</Label>
                  <Input value={form.companion} onChange={(e) => setField("companion", e.target.value)} placeholder="동행자" data-testid="input-companion" />
                </div>
                <div className="space-y-1 md:col-span-2">
                  <Label className="text-xs">차종/차량번호</Label>
                  <Input value={form.vehicleInfo} onChange={(e) => setField("vehicleInfo", e.target.value)} placeholder="차종 및 차량번호" data-testid="input-vehicle-info" />
                </div>
              </CardContent>
            </Card>

            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
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
                <Label>사고원인 분류 *</Label>
                <Select value={form.cause} onValueChange={(v) => setField("cause", v)}>
                  <SelectTrigger data-testid="select-cause"><SelectValue placeholder="선택" /></SelectTrigger>
                  <SelectContent>
                    {CAUSES.map((c) => <SelectItem key={c} value={c}>{c}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label>심각도 *</Label>
                <Select value={form.severity} onValueChange={(v) => setField("severity", v)}>
                  <SelectTrigger data-testid="select-severity"><SelectValue placeholder="선택" /></SelectTrigger>
                  <SelectContent>
                    {SEVERITIES.map((s) => <SelectItem key={s} value={s}>{s}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
            </div>
            {form.accidentType === "교통사고" && (
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                <div className="space-y-2">
                  <Label>과실율 (%) <span className="text-xs text-muted-foreground">교통사고 시 입력 (50~100)</span></Label>
                  <Input
                    type="number"
                    min={0}
                    max={100}
                    value={form.faultRate ?? ""}
                    onChange={(e) => setField("faultRate", e.target.value === "" ? undefined : Number(e.target.value))}
                    placeholder="예: 100"
                    data-testid="input-fault-rate"
                  />
                </div>
              </div>
            )}

            <Card className="border-primary/20">
              <CardHeader className="pb-2 pt-3 flex flex-row items-center justify-between">
                <CardTitle className="text-sm font-semibold text-primary">경과 및 조치 사항</CardTitle>
                <Button variant="outline" size="sm" onClick={addProgressRow} data-testid="button-add-progress">
                  <Plus className="w-3.5 h-3.5 mr-1" />
                  추가
                </Button>
              </CardHeader>
              <CardContent>
                <div className="space-y-2">
                  <div className="grid grid-cols-[40px_1fr_2fr_32px] gap-2 text-xs font-medium text-muted-foreground px-1">
                    <span>NO</span>
                    <span>시간</span>
                    <span>내용</span>
                    <span></span>
                  </div>
                  {progressItems.map((item, idx) => (
                    <div key={idx} className="grid grid-cols-[40px_1fr_2fr_32px] gap-2 items-center">
                      <span className="text-sm text-center font-medium">{item.no}</span>
                      <Input
                        value={item.time}
                        onChange={(e) => updateProgressItem(idx, "time", e.target.value)}
                        placeholder="HH:MM"
                        className="text-sm"
                        data-testid={`input-progress-time-${idx}`}
                      />
                      <Input
                        value={item.content}
                        onChange={(e) => updateProgressItem(idx, "content", e.target.value)}
                        placeholder="경과/조치 내용"
                        className="text-sm"
                        data-testid={`input-progress-content-${idx}`}
                      />
                      {progressItems.length > 1 && (
                        <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => removeProgressRow(idx)}>
                          <X className="w-3.5 h-3.5 text-red-500" />
                        </Button>
                      )}
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>

            <div className="space-y-2">
              <Label>사고 개요 *</Label>
              <Textarea value={form.accidentOverview} onChange={(e) => setField("accidentOverview", e.target.value)} placeholder="사고 개요를 상세하게 입력하세요 (인적피해, 물적피해 포함)" rows={4} data-testid="input-overview" />
            </div>

            <div className="space-y-2">
              <Label>사고원인 (상세)</Label>
              <Textarea value={form.causeDetail} onChange={(e) => setField("causeDetail", e.target.value)} placeholder="사고 원인을 상세하게 기재하세요" rows={2} data-testid="input-cause-detail" />
            </div>

            <Card className="border-primary/20">
              <CardHeader className="pb-2 pt-3">
                <CardTitle className="text-sm font-semibold text-primary">사진 첨부</CardTitle>
              </CardHeader>
              <CardContent>
                <input
                  ref={photoInputRef}
                  type="file"
                  accept="image/*"
                  multiple
                  className="hidden"
                  onChange={handlePhotoUpload}
                />
                <p className="text-xs text-muted-foreground mb-3">사진은 경위서에 2열 표로 배치됩니다. 각 사진에 설명을 입력해주세요.</p>
                <div className="grid grid-cols-2 gap-3 mb-3">
                  {form.images.map((url, idx) => (
                    <div key={idx} className="relative border rounded-lg overflow-hidden group">
                      <div className="aspect-[4/3] bg-muted">
                        <img src={url} alt={form.imageCaptions[idx] || `사진 ${idx + 1}`} className="w-full h-full object-cover" />
                      </div>
                      <button
                        type="button"
                        className="absolute top-1 right-1 bg-red-500 text-white rounded-full w-5 h-5 flex items-center justify-center text-xs opacity-0 group-hover:opacity-100 transition-opacity"
                        onClick={() => removePhoto(idx)}
                      >
                        <X className="w-3 h-3" />
                      </button>
                      <Input
                        value={form.imageCaptions[idx] || ""}
                        onChange={(e) => updateCaption(idx, e.target.value)}
                        placeholder={`사진 ${idx + 1} 설명`}
                        className="text-xs h-8 rounded-none border-0 border-t"
                        data-testid={`input-photo-caption-${idx}`}
                      />
                    </div>
                  ))}
                </div>
                {canUploadAccidentPhotos && (
                  <Button variant="outline" size="sm" onClick={() => photoInputRef.current?.click()} disabled={uploadingPhotos} className="gap-1.5" data-testid="button-upload-photos">
                    <Camera className="w-4 h-4" />
                    {uploadingPhotos ? "업로드 중..." : "사진 추가"}
                  </Button>
                )}
              </CardContent>
            </Card>

            <Card className="border-primary/20">
              <CardHeader className="pb-2 pt-3">
                <CardTitle className="text-sm font-semibold text-primary">작성자 서명</CardTitle>
              </CardHeader>
              <CardContent>
                {form.signature ? (
                  <div className="space-y-2">
                    <div className="border rounded-lg p-2 bg-white inline-block">
                      <img src={form.signature} alt="서명" className="h-16" />
                    </div>
                    <div className="flex gap-2">
                      <Button variant="outline" size="sm" onClick={() => { setField("signature", ""); setShowSignaturePad(true); }}>
                        다시 서명
                      </Button>
                    </div>
                  </div>
                ) : showSignaturePad ? (
                  <SignaturePad
                    onSave={(data) => { setField("signature", data); setShowSignaturePad(false); }}
                    onCancel={() => setShowSignaturePad(false)}
                  />
                ) : (
                  <Button variant="outline" size="sm" onClick={() => setShowSignaturePad(true)} className="gap-1.5" data-testid="button-open-signature">
                    <PenTool className="w-4 h-4" />
                    서명하기
                  </Button>
                )}
              </CardContent>
            </Card>
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
