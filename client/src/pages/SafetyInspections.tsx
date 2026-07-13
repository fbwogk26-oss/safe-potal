import { useQuery, useMutation } from "@tanstack/react-query";
import { useHeadquarters } from "@/contexts/HeadquartersContext";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { ClipboardCheck, ClipboardList, Plus, Trash2, ImagePlus, X, Calendar, MapPin, User, ChevronDown, ChevronUp, Download, Check, AlertCircle, BarChart3, Settings, FileText, Loader2, Pencil, CheckSquare, Upload, Eye, Mail } from "lucide-react";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Checkbox } from "@/components/ui/checkbox";
import { useState, useRef, useMemo } from "react";
import { useToast } from "@/hooks/use-toast";
import { format } from "date-fns";
import { motion, AnimatePresence } from "framer-motion";
import { apiRequest, queryClient } from "@/lib/queryClient";
import type { SafetyInspection, Team } from "@shared/schema";
import ExcelJS from "exceljs";
import { usePermissions } from "@/hooks/use-permissions";
import { useAuth } from "@/hooks/use-auth";
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer, LabelList } from "recharts";

// 작업내용 끝 (점검유형) 접미사에서 점검유형 자동 감지
// 예: "BMS 보드 불량(안전점검)" → { type: "안전점검", content: "BMS 보드 불량" }
const WORK_CONTENT_TYPE_MAP: Record<string, string> = {
  '안전점검': '안전점검',
  '동행점검': '동행점검',
  '현장경영팀점검': '현장경영팀 점검',
  '현장경영팀 점검': '현장경영팀 점검',
  '본사점검': '본사 점검',
  '본사 점검': '본사 점검',
  'kt점검': 'KT 점검',
  'kt 점검': 'KT 점검',
};
function detectTypeFromContent(val: string): { type: string; content: string } | null {
  const m = val.match(/\(([^)]+)\)\s*$/);
  if (!m) return null;
  const key = m[1].trim().replace(/\s/g, '').toLowerCase();
  const found = Object.entries(WORK_CONTENT_TYPE_MAP).find(([k]) => k.replace(/\s/g, '').toLowerCase() === key);
  if (!found) return null;
  return { type: found[1], content: val.slice(0, val.lastIndexOf('(')).trim() };
}

type ChecklistStatus = '양호' | '미흡' | '미점검';

interface ChecklistItem {
  item: string;
  status: ChecklistStatus;
}

interface BulkRow {
  fileName: string;
  inspectionDate: string;
  team: string;
  location: string;
  workDateTime: string;
  workNo: string;
  workContent: string;
  workType: string;
  inspectionMethod: string;
  inspectionResult: string;
  defectCount: number;
  imageUrls: string[];
  inspector: string;
  workerName: string;
  overallComment: string;
  inspectionType: string;
  selected: boolean;
  error?: string;
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


export default function SafetyInspections() {
  const { headquarters, departments } = useHeadquarters();
  const EXTRA_DEPARTMENTS = departments.slice(0, 3);
  const { canEditInspections, canDownloadInspectionExcel, canUploadInspectionPhotos } = usePermissions();
  const { user } = useAuth();
  const OTHER_INSPECTION_TYPES = ["KT 점검", "본사 점검", "현장경영팀 점검"] as const;
  type OtherSubType = typeof OTHER_INSPECTION_TYPES[number];
  const SUBTYPE_COLORS: Record<OtherSubType, string> = {
    "KT 점검": "bg-blue-100 text-blue-700 dark:bg-blue-900/40 dark:text-blue-300 border-blue-200 dark:border-blue-800",
    "본사 점검": "bg-purple-100 text-purple-700 dark:bg-purple-900/40 dark:text-purple-300 border-purple-200 dark:border-purple-800",
    "현장경영팀 점검": "bg-orange-100 text-orange-700 dark:bg-orange-900/40 dark:text-orange-300 border-orange-200 dark:border-orange-800",
  };

  const { data: rawInspections, isLoading } = useQuery<SafetyInspection[]>({
    queryKey: ["/api/safety-inspections", headquarters],
    queryFn: () => fetch(`/api/safety-inspections?headquarters=${encodeURIComponent(headquarters)}`, { credentials: "include" }).then(r => r.json()),
  });

  // 자체 안전점검만 표시 (기타 안전점검 타입 제외)
  const inspections = rawInspections?.filter(
    i => !(OTHER_INSPECTION_TYPES as readonly string[]).includes(i.inspectionType ?? "")
  );
  // 기타 안전점검 (KT/본사/현장경영팀)
  const otherInspections = rawInspections?.filter(
    i => (OTHER_INSPECTION_TYPES as readonly string[]).includes(i.inspectionType ?? "")
  ) ?? [];
  
  const { data: teams } = useQuery<Team[]>({
    queryKey: ["/api/teams", headquarters],
    queryFn: () => fetch(`/api/teams?headquarters=${encodeURIComponent(headquarters)}`, { credentials: "include" }).then(r => r.json()),
  });

  const { data: inspectionTargets } = useQuery<{
    safetyBujang: number; safetyTeamjang: number;
    accompanyBujang: number; accompanyTeamjang: number;
    safetyTarget: number; accompanyTarget: number;
    totalTarget: number;
  }>({
    queryKey: ["/api/settings/inspection-targets"],
  });

  const { data: userRole } = useQuery<{ role: string }>({
    queryKey: ["/api/auth/user-role"],
  });

  const isAdmin = userRole?.role === "admin";

  const saveTargetsMutation = useMutation({
    mutationFn: (data: { safetyBujang: number; safetyTeamjang: number; accompanyBujang: number; accompanyTeamjang: number }) =>
      apiRequest("POST", "/api/settings/inspection-targets", data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/settings/inspection-targets"] });
      setShowTargetDialog(false);
      toast({ title: "목표건수가 저장되었습니다." });
    },
    onError: () => toast({ variant: "destructive", title: "저장 실패" }),
  });
  
  const [editingId, setEditingId] = useState<number | null>(null);
  const [selectionMode, setSelectionMode] = useState(false);
  const [selectedIds, setSelectedIds] = useState<Set<number>>(new Set());

  const bulkDeleteMutation = useMutation({
    mutationFn: (ids: number[]) => apiRequest("POST", "/api/safety-inspections/bulk-delete", { ids }),
    onSuccess: async (res) => {
      const data = await (res as any).json();
      queryClient.invalidateQueries({ queryKey: ["/api/safety-inspections"] });
      setSelectedIds(new Set()); setSelectionMode(false);
      toast({ title: `${data.deleted ?? selectedIds.size}건 삭제 완료` });
    },
    onError: () => toast({ variant: "destructive", title: "삭제 실패" }),
  });

  const toggleSelect = (id: number) => setSelectedIds(prev => { const n = new Set(prev); n.has(id) ? n.delete(id) : n.add(id); return n; });

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
    }) => {
      return apiRequest("POST", "/api/safety-inspections", data);
    },
    onSuccess: async (_, variables) => {
      queryClient.invalidateQueries({ queryKey: ["/api/safety-inspections"] });
      const shouldEmail = pendingSendEmail.current;
      pendingSendEmail.current = false;
      const capturedDept = department;
      const capturedWorkContent = workContent;
      resetForm();
      if (shouldEmail && variables.inspectionType === "현장경영팀 점검") {
        toast({ title: "점검 등록 완료 — 이메일 발송 중..." });
        await sendEmailAfterCreate({
          inspectionDate: variables.inspectionDate,
          department: capturedDept,
          inspector: variables.inspector || "",
          workerName: variables.workerName || "",
          location: variables.location || "",
          workContent: capturedWorkContent,
          checklist: variables.checklist,
          notes: variables.notes || "",
          images: variables.images,
          subType: variables.inspectionType,
        });
      } else {
        toast({ title: "점검 등록 완료" });
      }
    },
  });

  const updateMutation = useMutation({
    mutationFn: async ({ id, data }: { id: number; data: any }) => {
      return apiRequest("PUT", `/api/safety-inspections/${id}`, data);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/safety-inspections"] });
      resetForm();
      toast({ title: "점검 수정 완료" });
    },
  });
  
  const deleteMutation = useMutation({
    mutationFn: async (id: number) => {
      return apiRequest("DELETE", `/api/safety-inspections/${id}`);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/safety-inspections"] });
      toast({ title: "점검 내역 삭제됨" });
    },
  });

  const { toast } = useToast();

  const [inspectionType, setInspectionType] = useState<string>("안전점검");
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
  const [showTargetDialog, setShowTargetDialog] = useState(false);
  const [editTotalTarget, setEditTotalTarget] = useState("");
  const fileInputRef = useRef<HTMLInputElement>(null);
  const pdfFileInputRef = useRef<HTMLInputElement>(null);
  const [isPdfParsing, setIsPdfParsing] = useState(false);

  // 일괄 가져오기 상태
  const [showBulkImport, setShowBulkImport] = useState(false);
  const [bulkRows, setBulkRows] = useState<BulkRow[]>([]);
  const [bulkExcelData, setBulkExcelData] = useState<Record<string, any>[]>([]);
  const [isBulkParsing, setIsBulkParsing] = useState(false);
  const [isBulkCreating, setIsBulkCreating] = useState(false);
  const [bulkPdfFiles, setBulkPdfFiles] = useState<File[]>([]);
  const [bulkExcelFile, setBulkExcelFile] = useState<File | null>(null);
  const bulkPdfInputRef = useRef<HTMLInputElement>(null);
  const bulkExcelInputRef = useRef<HTMLInputElement>(null);
  const [dashboardPeriod, setDashboardPeriod] = useState<"month" | "year">("month");
  const [selectedMonth, setSelectedMonth] = useState<number>(new Date().getMonth() + 1);

  const handleBulkFileSelect = (e: React.ChangeEvent<HTMLInputElement>, type: 'pdf' | 'excel') => {
    const files = Array.from(e.target.files || []);
    if (files.length === 0) return;
    if (type === 'pdf') setBulkPdfFiles(files);
    else setBulkExcelFile(files[0] || null);
    e.target.value = '';
  };

  const BATCH_SIZE = 10; // 한 번에 업로드할 PDF 개수 (서버 부하/크기 제한 방지)

  const handleBulkParse = async () => {
    if (bulkPdfFiles.length === 0) {
      toast({ variant: 'destructive', title: 'PDF 파일을 선택하세요' });
      return;
    }
    setIsBulkParsing(true);
    setBulkRows([]);
    try {
      const allResults: any[] = [];
      let combinedExcelData: Record<string, any>[] = [];
      let combinedExcelHeaders: string[] = [];

      // PDF를 BATCH_SIZE개씩 나눠 순차 요청 (대용량 파일도 안정적으로 처리)
      const batches: File[][] = [];
      for (let i = 0; i < bulkPdfFiles.length; i += BATCH_SIZE) {
        batches.push(bulkPdfFiles.slice(i, i + BATCH_SIZE));
      }

      for (let batchIdx = 0; batchIdx < batches.length; batchIdx++) {
        const batch = batches[batchIdx];
        if (batches.length > 1) {
          toast({ title: `처리 중... (${batchIdx + 1}/${batches.length} 배치)`, description: `${batch.length}개 PDF 분석 중` });
        }
        const formData = new FormData();
        batch.forEach(f => formData.append('pdfs', f));
        // 엑셀은 모든 배치에 포함 (각 배치마다 엑셀 매칭 필요)
        if (bulkExcelFile) formData.append('excel', bulkExcelFile);

        const res = await fetch('/api/safety-inspections/bulk-parse', {
          method: 'POST',
          body: formData,
          credentials: 'include',
        });
        if (!res.ok) {
          const ct = res.headers.get('content-type') || '';
          if (ct.includes('application/json')) {
            const err = await res.json();
            throw new Error(err.message || `서버 오류 (${res.status})`);
          } else {
            throw new Error(`서버 오류 (${res.status}) — 파일이 너무 크거나 서버가 응답하지 않습니다.`);
          }
        }
        const data = await res.json();
        allResults.push(...(data.results || []));
        if (batchIdx === 0) {
          combinedExcelData = data.excelData || [];
          combinedExcelHeaders = data.excelHeaders || [];
        }
      }

      setBulkExcelData(combinedExcelData);
      setBulkRows(
        allResults
          .map((r: any) => ({ ...r, workerName: r.workerName || r.team || '', inspectionType: '안전점검', selected: !r.error }))
          .sort((a: any, b: any) => (a.inspectionDate || '').localeCompare(b.inspectionDate || ''))
      );
      toast({ title: `${allResults.length}개 PDF 파싱 완료`, description: '이미지 포함 데이터를 확인 후 등록하세요.' });
    } catch (err: any) {
      toast({ variant: 'destructive', title: 'PDF 파싱 실패', description: err.message });
    } finally {
      setIsBulkParsing(false);
    }
  };

  const handleBulkCreate = async () => {
    const selected = bulkRows.filter(r => r.selected && !r.error);
    if (selected.length === 0) {
      toast({ variant: 'destructive', title: '등록할 항목을 선택하세요' });
      return;
    }
    setIsBulkCreating(true);
    try {
      const payload = selected.map(r => ({
        inspectionType: r.inspectionType || '안전점검',
        title: r.team + (r.workContent ? ' - ' + r.workContent : r.workNo ? ' - ' + r.workNo : ''),
        location: r.location || undefined,
        inspector: r.inspector || user?.name || user?.username || undefined,
        workerName: r.workerName || r.team || undefined,
        inspectionDate: r.inspectionDate,
        checklist: DEFAULT_CHECKLIST,
        notes: r.overallComment || undefined,
        images: r.imageUrls,
      }));
      const res = await fetch('/api/safety-inspections/bulk-create', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
        credentials: 'include',
      });
      if (!res.ok) throw new Error((await res.json()).message);
      const data = await res.json();
      queryClient.invalidateQueries({ queryKey: ['/api/safety-inspections'] });
      toast({ title: `${data.created}건 일괄 등록 완료` });
      setShowBulkImport(false);
      setBulkRows([]);
      setBulkExcelData([]);
    } catch (err: any) {
      toast({ variant: 'destructive', title: '일괄 등록 실패', description: err.message });
    } finally {
      setIsBulkCreating(false);
    }
  };

  const resetForm = () => {
    setInspectionType("안전점검");
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

  const handleSubmitOnly = () => {
    pendingSendEmail.current = false;
    handleSubmit();
  };

  const handleSubmitAndEmail = () => {
    pendingSendEmail.current = true;
    handleSubmit();
  };

  const handleImageUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (!files || files.length === 0) return;
    
    const remainingSlots = MAX_IMAGES - images.length;
    if (remainingSlots <= 0) {
      toast({ variant: "destructive", title: `최대 ${MAX_IMAGES}장까지 등록 가능합니다.` });
      return;
    }
    
    const filesToUpload = Array.from(files).slice(0, remainingSlots);
    const isFirstPhoto = images.length === 0;
    
    setIsUploading(true);
    
    try {
      for (let i = 0; i < filesToUpload.length; i++) {
        const file = filesToUpload[i];

        // 첫 번째 사진: 자체 안전점검만 AI 분석 (기타는 presigned URL 직접 업로드)
        if (i === 0 && isFirstPhoto && activeTab === "자체") {
          const fd = new FormData();
          fd.append("photo", file);
          const analyzeRes = await fetch('/api/safety-inspections/analyze-photo', {
            method: 'POST',
            body: fd,
            credentials: 'include',
          });
          if (!analyzeRes.ok) throw new Error("업로드 실패");
          const data = await analyzeRes.json();
          setImages(prev => [...prev, data.imageUrl]);
          // 빈 필드만 자동 채움
          if (data.workContent && !workContent) setWorkContent(data.workContent);
          if (data.location && !location) setLocation(data.location);
          if (data.notes && !notes) setNotes(data.notes);
          if (data.workContent || data.location || data.notes) {
            toast({ title: "사진 분석 완료", description: "AI가 작업내용/장소/특이사항을 자동 입력했습니다." });
          } else {
            toast({ title: "이미지 업로드 완료" });
          }
        } else {
          // 추가 사진: 기존 presigned URL 방식으로 직접 업로드
          const urlRes = await fetch('/api/uploads/request-url', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            credentials: 'include',
            body: JSON.stringify({ name: file.name, size: file.size, contentType: file.type }),
          });
          const { uploadURL, objectPath } = await urlRes.json();
          await fetch(uploadURL, { method: 'PUT', body: file, headers: { 'Content-Type': file.type } });
          setImages(prev => [...prev, objectPath]);
        }
      }
      if (filesToUpload.length > 1) toast({ title: "이미지 업로드 완료" });
    } catch (err) {
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

      const res = await fetch("/api/parse-inspection-pdf", {
        method: "POST",
        body: formData,
        credentials: "include",
      });

      let body: any;
      try {
        body = await res.json();
      } catch {
        throw new Error("서버 응답을 읽을 수 없습니다");
      }

      if (!res.ok) {
        throw new Error(body?.message || `서버 오류 (${res.status})`);
      }

      // 텍스트 필드 자동 입력
      if (body.inspectionDate) setInspectionDate(body.inspectionDate);
      if (body.team) setDepartment(body.team);
      if (body.location) setLocation(body.location);
      if (body.workContent) setWorkContent(body.workContent);

      // 이미지 자동 입력
      const newImages: string[] = Array.isArray(body.imageUrls) ? body.imageUrls : [];
      if (newImages.length > 0) {
        setImages(prev => [...prev, ...newImages].slice(0, MAX_IMAGES));
        toast({ title: `PDF 불러오기 완료 — 사진 ${newImages.length}장 추출됨` });
      } else {
        toast({ title: "PDF 불러오기 완료 — 텍스트 필드 자동 입력됨" });
      }
    } catch (err: any) {
      console.error("PDF 불러오기 오류:", err);
      toast({
        variant: "destructive",
        title: "PDF 불러오기 실패",
        description: err?.message || "알 수 없는 오류가 발생했습니다",
      });
    } finally {
      setIsPdfParsing(false);
    }
  };

  const handleChecklistChange = (index: number, status: ChecklistStatus) => {
    setChecklist(prev => prev.map((item, i) => {
      if (i !== index) return item;
      // Toggle: if same status clicked again, reset to 미점검
      if (item.status === status) {
        return { ...item, status: '미점검' as ChecklistStatus };
      }
      return { ...item, status };
    }));
  };

  const handleSubmit = () => {
    if (!department) {
      toast({ variant: "destructive", title: "부서명을 선택하세요" });
      return;
    }
    
    const title = workContent ? `${department} - ${workContent}` : department;
    const payload = {
      inspectionType,
      title,
      location: location || undefined,
      inspector: inspector || undefined,
      workerName: workerName || undefined,
      inspectionDate,
      checklist,
      notes: notes || undefined,
      images,
    };

    if (editingId !== null) {
      updateMutation.mutate({ id: editingId, data: payload });
    } else {
      createMutation.mutate(payload);
    }
  };

  const handleEdit = (inspection: any) => {
    const isOtherType = (OTHER_INSPECTION_TYPES as readonly string[]).includes(inspection.inspectionType ?? "");
    setActiveTab(isOtherType ? "기타" : "자체");
    const titleParts = inspection.title?.split(" - ") || [];
    const dept = titleParts[0] || "";
    const work = titleParts.slice(1).join(" - ") || "";
    setInspectionType(inspection.inspectionType || (isOtherType ? "현장경영팀 점검" : "안전점검"));
    setDepartment(inspection.department || dept);
    setWorkContent(inspection.workContent || work);
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
    if (confirm("이 점검 내역을 삭제하시겠습니까?")) {
      deleteMutation.mutate(id);
    }
  };

  const getStatusColor = (status: ChecklistStatus) => {
    switch (status) {
      case '양호': return 'bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400';
      case '미흡': return 'bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400';
      default: return 'bg-gray-100 text-gray-500 dark:bg-gray-800 dark:text-gray-400';
    }
  };

  const normalizeChecklist = (rawChecklist: unknown): ChecklistItem[] => {
    if (!Array.isArray(rawChecklist)) return [];
    return rawChecklist.map((item: any) => {
      if ('status' in item && typeof item.status === 'string') {
        return item as ChecklistItem;
      }
      if ('checked' in item) {
        return {
          item: item.item || '',
          status: item.checked ? '양호' : '미점검' as ChecklistStatus
        };
      }
      return { item: item.item || '', status: '미점검' as ChecklistStatus };
    });
  };

  const handleExcelDownload = async () => {
    if (!inspections || inspections.length === 0) {
      toast({ variant: "destructive", title: "다운로드할 점검 내역이 없습니다." });
      return;
    }

    toast({ title: "엑셀 파일 생성 중..." });

    const workbook = new ExcelJS.Workbook();
    const worksheet = workbook.addWorksheet('안전점검 내역');

    // Column definitions with better widths
    worksheet.columns = [
      { header: 'No', key: 'no', width: 6 },
      { header: '점검유형', key: 'type', width: 14 },
      { header: '부서명', key: 'department', width: 18 },
      { header: '작업내용', key: 'workContent', width: 30 },
      { header: '점검국소', key: 'location', width: 22 },
      { header: '점검자', key: 'inspector', width: 12 },
      { header: '작업자', key: 'workerName', width: 12 },
      { header: '점검일', key: 'date', width: 14 },
      { header: '비고', key: 'notes', width: 25 },
    ];

    // Add checklist item headers
    DEFAULT_CHECKLIST.forEach((item, idx) => {
      worksheet.getColumn(10 + idx).width = 12;
      worksheet.getColumn(10 + idx).key = `check_${idx}`;
    });

    // Add 10 image columns (사진1 ~ 사진10)
    const MAX_IMAGES = 10;
    const firstImageCol = 10 + DEFAULT_CHECKLIST.length;
    const imageColWidth = 16; // ~2.99cm (Excel width units)
    
    for (let i = 0; i < MAX_IMAGES; i++) {
      worksheet.getColumn(firstImageCol + i).width = imageColWidth;
      worksheet.getColumn(firstImageCol + i).key = `image_${i}`;
    }
    const totalCols = firstImageCol + MAX_IMAGES - 1;

    // Style header row
    const headerRow = worksheet.getRow(1);
    DEFAULT_CHECKLIST.forEach((item, idx) => {
      headerRow.getCell(10 + idx).value = item.item;
    });
    
    // Add image column headers (사진1 ~ 사진10)
    for (let i = 0; i < MAX_IMAGES; i++) {
      headerRow.getCell(firstImageCol + i).value = `사진${i + 1}`;
    }
    
    headerRow.font = { bold: true, size: 10 };
    headerRow.fill = {
      type: 'pattern',
      pattern: 'solid',
      fgColor: { argb: 'FF4472C4' }
    };
    headerRow.font = { bold: true, color: { argb: 'FFFFFFFF' }, size: 10 };
    headerRow.alignment = { horizontal: 'center', vertical: 'middle', wrapText: true };
    headerRow.height = 35;

    // Add borders to header
    for (let i = 1; i <= totalCols; i++) {
      headerRow.getCell(i).border = {
        top: { style: 'thin' },
        left: { style: 'thin' },
        bottom: { style: 'thin' },
        right: { style: 'thin' }
      };
    }

    let rowNum = 1;
    for (const inspection of inspections) {
      const checklistItems = normalizeChecklist(inspection.checklist);
      const titleParts = (inspection.title || '').split(' - ');
      const deptName = titleParts[0] || '-';
      const workDesc = titleParts.slice(1).join(' - ') || '-';
      
      const rowData: Record<string, unknown> = {
        no: rowNum,
        type: inspection.inspectionType,
        department: deptName,
        workContent: workDesc,
        location: inspection.location || '-',
        inspector: inspection.inspector || '-',
        workerName: inspection.workerName || '-',
        date: inspection.inspectionDate,
        notes: inspection.notes || '-',
      };

      // Add checklist statuses
      checklistItems.forEach((item, idx) => {
        rowData[`check_${idx}`] = item.status;
      });

      const row = worksheet.addRow(rowData);
      row.height = 22;
      row.alignment = { vertical: 'middle', wrapText: true };

      // Style checklist cells based on status
      checklistItems.forEach((item, idx) => {
        const cell = row.getCell(10 + idx);
        cell.alignment = { horizontal: 'center', vertical: 'middle' };
        
        if (item.status === '양호') {
          cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFC6EFCE' } };
          cell.font = { color: { argb: 'FF006100' } };
        } else if (item.status === '미흡') {
          cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFFFC7CE' } };
          cell.font = { color: { argb: 'FF9C0006' } };
        } else {
          cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFFFEB9C' } };
          cell.font = { color: { argb: 'FF9C6500' } };
        }
      });

      // Add borders to data cells
      for (let i = 1; i <= totalCols; i++) {
        row.getCell(i).border = {
          top: { style: 'thin' },
          left: { style: 'thin' },
          bottom: { style: 'thin' },
          right: { style: 'thin' }
        };
      }

      // Alternate row colors for better readability
      if (rowNum % 2 === 0) {
        for (let i = 1; i <= 8; i++) {
          const cell = row.getCell(i);
          if (!cell.fill || (cell.fill as ExcelJS.FillPattern).fgColor?.argb === undefined) {
            cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFF2F2F2' } };
          }
        }
      }

      // Add images - one per column (사진1 ~ 사진10)
      const images = inspection.images || [];
      if (images.length > 0) {
        const numImages = Math.min(images.length, MAX_IMAGES);
        row.height = 69; // ~2.43cm
        
        for (let i = 0; i < numImages; i++) {
          try {
            // Convert relative path to absolute URL
            const imageUrl = images[i].startsWith('/') 
              ? window.location.origin + images[i] 
              : images[i];
            const response = await fetch(imageUrl);
            const blob = await response.blob();
            const base64 = await new Promise<string>((resolve) => {
              const reader = new FileReader();
              reader.onloadend = () => resolve(reader.result as string);
              reader.readAsDataURL(blob);
            });

            const imageId = workbook.addImage({
              base64: base64.split(',')[1],
              extension: 'jpeg',
            });

            // Place image in its own column (사진1, 사진2, etc.)
            // Size: width 2.99cm (~113px), height 2.43cm (~92px)
            worksheet.addImage(imageId, {
              tl: { col: firstImageCol - 1 + i, row: rowNum + 0.05 },
              ext: { width: 113, height: 92 },
            });
          } catch (err) {
            console.error('이미지 로드 실패:', err);
          }
        }
      }

      rowNum++;
    }

    // Freeze header row
    worksheet.views = [{ state: 'frozen', ySplit: 1 }];

    const buffer = await workbook.xlsx.writeBuffer();
    const blob = new Blob([buffer], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `안전점검내역_${format(new Date(), 'yyyyMMdd')}.xlsx`;
    a.click();
    URL.revokeObjectURL(url);
    toast({ title: "엑셀 다운로드 완료" });
  };

  const goodCount = checklist.filter(c => c.status === '양호').length;
  const poorCount = checklist.filter(c => c.status === '미흡').length;
  const totalCount = checklist.length;

  const inspectionStats = useMemo(() => {
    if (!rawInspections || rawInspections.length === 0 || !teams) return null;
    const now = new Date();
    const currentYear = format(now, "yyyy");
    const monthStr = String(selectedMonth).padStart(2, "0");
    const targetMonth = `${currentYear}-${monthStr}`;

    const filtered = rawInspections.filter(insp => {
      if (dashboardPeriod === "month") return insp.inspectionDate.startsWith(targetMonth);
      return insp.inspectionDate.startsWith(currentYear);
    });

    const allDepts = teams.map(t => t.name);
    const safetyBujang = inspectionTargets?.safetyBujang || 0;
    const safetyTeamjang = inspectionTargets?.safetyTeamjang || 0;
    const accompanyBujang = inspectionTargets?.accompanyBujang || 0;
    const accompanyTeamjang = inspectionTargets?.accompanyTeamjang || 0;
    const multiplier = dashboardPeriod === "year" ? 12 : 1;
    const safetyTotal = (safetyBujang + safetyTeamjang) * multiplier;
    const accompanyTotal = (accompanyBujang + accompanyTeamjang) * multiplier;

    const deptMap = new Map<string, { 안전점검: number; 동행점검: number; 현장경영팀: number; 본사: number; KT: number }>();
    for (const dept of allDepts) {
      deptMap.set(dept, { 안전점검: 0, 동행점검: 0, 현장경영팀: 0, 본사: 0, KT: 0 });
    }
    let totalSafety = 0, totalAccompany = 0, totalHQ = 0, totalHQ2 = 0, totalKT = 0;
    for (const insp of filtered) {
      const matchedDept = allDepts.find(d => insp.title.startsWith(d) || (insp.department || "").startsWith(d));
      const entry = matchedDept ? deptMap.get(matchedDept) : null;
      if (insp.inspectionType === "동행점검") { totalAccompany++; if (entry) entry.동행점검++; }
      else if (insp.inspectionType === "현장경영팀 점검") { totalHQ++; if (entry) entry.현장경영팀++; }
      else if (insp.inspectionType === "본사 점검") { totalHQ2++; if (entry) entry.본사++; }
      else if (insp.inspectionType === "KT 점검") { totalKT++; if (entry) entry.KT++; }
      else { totalSafety++; if (entry) entry.안전점검++; }
    }

    const numDepts = allDepts.length || 1;
    const safetyPerDept = safetyTotal / numDepts;
    const accompanyPerDept = accompanyTotal / numDepts;
    const combinedPerDept = safetyPerDept + accompanyPerDept;

    const chartData = allDepts.map(dept => {
      const s = deptMap.get(dept)!;
      const shortName = dept.replace("운용팀", "").replace("팀", "");
      const total = s.안전점검 + s.동행점검 + s.현장경영팀 + s.본사 + s.KT;
      const pct = combinedPerDept > 0 ? Math.round(total / combinedPerDept * 100) : null;
      return { name: shortName, 안전점검: s.안전점검, 동행점검: s.동행점검, 현장경영팀: s.현장경영팀, 본사: s.본사, KT: s.KT, 진행율: pct };
    });

    const multiplierVal = dashboardPeriod === "year" ? 12 : 1;
    const totalTarget = (inspectionTargets?.totalTarget || 0) * multiplierVal;
    return {
      total: filtered.length,
      totalSafety, totalAccompany, totalHQ, totalHQ2, totalKT,
      safetyBujang, safetyTeamjang, accompanyBujang, accompanyTeamjang,
      safetyTotal, accompanyTotal, safetyPerDept, accompanyPerDept, combinedPerDept,
      totalTarget,
      chartData,
      periodLabel: dashboardPeriod === "month" ? `${selectedMonth}월` : `${now.getFullYear()}년`,
    };
  }, [rawInspections, teams, inspectionTargets, dashboardPeriod, selectedMonth]);

  const filteredInspections = useMemo(() => {
    if (!rawInspections) return [];
    const currentYear = format(new Date(), "yyyy");
    let result: typeof rawInspections;
    if (dashboardPeriod === "year") {
      result = rawInspections.filter(i => i.inspectionDate.startsWith(currentYear));
    } else {
      const monthStr = String(selectedMonth).padStart(2, "0");
      const prefix = `${currentYear}-${monthStr}`;
      result = rawInspections.filter(i => i.inspectionDate.startsWith(prefix));
    }
    return [...result].sort((a, b) => b.inspectionDate.localeCompare(a.inspectionDate));
  }, [rawInspections, selectedMonth, dashboardPeriod]);

  const [showInspDashboard, setShowInspDashboard] = useState(true);

  const [activeTab, setActiveTab] = useState<"자체">("자체");
  const [isSendingEmail, setIsSendingEmail] = useState(false);
  const [isSendingBulkEmail, setIsSendingBulkEmail] = useState(false);
  const pendingSendEmail = useRef(false);

  const sendEmailAfterCreate = async (payload: {
    inspectionDate: string; department: string; inspector: string; workerName: string;
    location: string; workContent: string; checklist: ChecklistItem[]; notes: string;
    images: string[]; subType: string;
  }) => {
    setIsSendingEmail(true);
    try {
      const res = await fetch("/api/other-inspections/send-email", {
        method: "POST", headers: { "Content-Type": "application/json" }, credentials: "include",
        body: JSON.stringify(payload),
      });
      const data = await res.json();
      if (res.ok) {
        toast({ title: "이메일 초안 발송 완료", description: "fbwogk26@gmail.com으로 발송됐습니다. Gmail에서 jaeha.ryu@ktmos.com으로 전달하세요." });
      } else {
        toast({ variant: "destructive", title: "이메일 발송 실패", description: data.message });
      }
    } catch {
      toast({ variant: "destructive", title: "이메일 발송 실패", description: "네트워크 오류가 발생했습니다." });
    } finally {
      setIsSendingEmail(false);
    }
  };

  const handleBulkEmail = async () => {
    const ids = Array.from(selectedIds);
    const selected = (rawInspections || []).filter(i => ids.includes(i.id));
    const eligible = selected.filter(i => i.inspectionType === "현장경영팀 점검");
    if (eligible.length === 0) {
      toast({ variant: "destructive", title: "현장경영팀 점검 항목이 없습니다", description: "메일 발송은 현장경영팀 점검만 가능합니다." });
      return;
    }
    if (eligible.length < selected.length) toast({ title: `${selected.length - eligible.length}건 제외됨`, description: "현장경영팀 점검만 발송됩니다." });
    setIsSendingBulkEmail(true);
    try {
      const res = await fetch("/api/other-inspections/send-email-bulk", {
        method: "POST", headers: { "Content-Type": "application/json" }, credentials: "include",
        body: JSON.stringify({ ids: eligible.map(i => i.id) }),
      });
      const data = await res.json();
      if (res.ok) {
        toast({ title: `이메일 발송 완료 (${eligible.length}건)`, description: "fbwogk26@gmail.com · jaeha.ryu@ktmos.co.kr 로 발송되었습니다." });
        setSelectedIds(new Set()); setSelectionMode(false);
      } else {
        toast({ variant: "destructive", title: "발송 실패", description: data.message });
      }
    } catch {
      toast({ variant: "destructive", title: "발송 실패", description: "네트워크 오류가 발생했습니다." });
    } finally {
      setIsSendingBulkEmail(false);
    }
  };

  return (
    <div className="max-w-4xl mx-auto space-y-4 sm:space-y-6 md:space-y-8">
      <div className="flex items-center justify-between gap-2 sm:gap-3">
        <div className="flex items-center gap-2 sm:gap-3">
          <div className={`p-2 sm:p-2.5 rounded-lg sm:rounded-xl ${activeTab === "자체" ? "bg-green-100 text-green-600 dark:bg-green-900/30 dark:text-green-400" : "bg-orange-100 text-orange-600 dark:bg-orange-900/30 dark:text-orange-400"}`}>
            {activeTab === "자체" ? <ClipboardCheck className="w-5 h-5 sm:w-6 sm:h-6 md:w-8 md:h-8" /> : <ClipboardList className="w-5 h-5 sm:w-6 sm:h-6 md:w-8 md:h-8" />}
          </div>
          <div>
            <h2 className="text-xl sm:text-2xl md:text-3xl font-display font-bold text-foreground">
              안전점검
            </h2>
            <p className="text-xs sm:text-sm text-muted-foreground">{activeTab === "자체" ? "자체·동행 점검 내역 관리" : "KT/본사/현장경영팀 점검 · 이메일 발송"}</p>
          </div>
        </div>
        <div className="flex gap-2">
          {activeTab === "자체" ? (
            <>
              {canDownloadInspectionExcel && (
                <Button variant="outline" onClick={handleExcelDownload} disabled={!inspections || inspections.length === 0} className="gap-2" data-testid="button-excel-download">
                  <Download className="w-4 h-4" />
                  엑셀 다운로드
                </Button>
              )}
              {canEditInspections && (
                <Button variant="outline" onClick={() => { setShowBulkImport(true); setSelectionMode(false); setSelectedIds(new Set()); }} className="gap-2 border-blue-300 text-blue-700 hover:bg-blue-50 dark:border-blue-700 dark:text-blue-400 dark:hover:bg-blue-950" data-testid="button-bulk-import">
                  <Upload className="w-4 h-4" />
                  일괄 가져오기
                </Button>
              )}
              {canEditInspections && (
                <Button onClick={() => { if (!showForm) setInspector(user?.name || user?.username || ""); setShowForm(!showForm); }} className="bg-green-600 hover:bg-green-700 text-white gap-2" data-testid="button-toggle-form">
                  <Plus className="w-4 h-4" />
                  새 점검 등록
                </Button>
              )}
            </>
          ) : (
            <>
              {canEditInspections && selectionMode && selectedIds.size > 0 && (
                <Button onClick={handleBulkEmail} disabled={isSendingBulkEmail} className="bg-blue-600 hover:bg-blue-700 text-white gap-2" data-testid="button-bulk-email">
                  {isSendingBulkEmail ? <><Loader2 className="w-4 h-4 animate-spin" />발송 중...</> : <><Mail className="w-4 h-4" />선택 메일 발송 ({selectedIds.size})</>}
                </Button>
              )}
              {canEditInspections && (
                <Button variant={selectionMode ? "default" : "outline"} size="sm" className={`gap-1 h-9 text-xs px-2.5 ${selectionMode ? "bg-red-500 hover:bg-red-600 text-white" : ""}`}
                  onClick={() => { setSelectionMode(v => !v); setSelectedIds(new Set()); }} data-testid="button-toggle-other-selection">
                  <CheckSquare className="w-3.5 h-3.5" />
                  {selectionMode ? "취소" : "선택"}
                </Button>
              )}
              {canEditInspections && (
                <Button onClick={() => { if (!showForm) { setInspector(user?.name || user?.username || ""); setInspectionType("현장경영팀 점검"); } setShowForm(!showForm); }} className="bg-orange-600 hover:bg-orange-700 text-white gap-2" data-testid="button-toggle-form">
                  <Plus className="w-4 h-4" />
                  새 점검 등록
                </Button>
              )}
            </>
          )}
        </div>
      </div>

      {/* ── 탭 버튼 ── */}
      <div className="flex border-b border-border -mt-2">
        <button
          onClick={() => { setActiveTab("자체"); if (activeTab !== "자체") { resetForm(); setSelectionMode(false); setSelectedIds(new Set()); } }}
          className={`px-4 py-2 text-sm font-semibold border-b-2 transition-colors ${activeTab === "자체" ? "border-green-500 text-green-600 dark:text-green-400" : "border-transparent text-muted-foreground hover:text-foreground"}`}
          data-testid="tab-self-inspection"
        >
          자체 안전점검
        </button>
      </div>

      {inspectionStats && (
        <Card>
          <CardHeader
            className="bg-gradient-to-r from-slate-50 to-blue-50 dark:from-slate-900/40 dark:to-blue-900/20 border-b p-3 sm:p-4 cursor-pointer"
            onClick={() => setShowInspDashboard(!showInspDashboard)}
            data-testid="button-toggle-dashboard"
          >
            <CardTitle className="text-sm sm:text-base flex items-center justify-between gap-2">
              <div className="flex items-center gap-2">
                <BarChart3 className="w-4 h-4 text-blue-600" />
                점검 진행 현황
                <Badge variant="secondary" className="text-xs font-normal">{inspectionStats.periodLabel}</Badge>
              </div>
              <div className="flex items-center gap-1">
                {isAdmin && (
                  <Button
                    variant="ghost"
                    size="icon"
                    onClick={(e) => {
                      e.stopPropagation();
                      setEditTotalTarget(String(inspectionTargets?.totalTarget || ""));
                      setShowTargetDialog(true);
                    }}
                    data-testid="button-target-settings"
                  >
                    <Settings className="w-3.5 h-3.5" />
                  </Button>
                )}
                {showInspDashboard ? <ChevronUp className="w-4 h-4 text-muted-foreground" /> : <ChevronDown className="w-4 h-4 text-muted-foreground" />}
              </div>
            </CardTitle>
          </CardHeader>
          <AnimatePresence>
            {showInspDashboard && (
              <motion.div
                initial={{ height: 0, opacity: 0 }}
                animate={{ height: "auto", opacity: 1 }}
                exit={{ height: 0, opacity: 0 }}
                transition={{ duration: 0.2 }}
                className="overflow-hidden"
              >
                <CardContent className="p-3 sm:p-4 space-y-4">
                  {/* 기간 선택 */}
                  <div className="flex items-center gap-1 flex-wrap">
                    <Button variant={dashboardPeriod === "month" ? "default" : "outline"} size="sm" className="h-7 text-xs px-2.5"
                      onClick={(e) => { e.stopPropagation(); setDashboardPeriod("month"); }} data-testid="button-period-month">월별</Button>
                    <Button variant={dashboardPeriod === "year" ? "default" : "outline"} size="sm" className="h-7 text-xs px-2.5"
                      onClick={(e) => { e.stopPropagation(); setDashboardPeriod("year"); }} data-testid="button-period-year">연간</Button>
                    {dashboardPeriod === "month" && (
                      <Select value={String(selectedMonth)} onValueChange={(v) => setSelectedMonth(Number(v))}>
                        <SelectTrigger className="w-[72px] h-7 text-xs" data-testid="select-dashboard-month" onClick={(e) => e.stopPropagation()}>
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

                  {/* 6칸 카드 그리드 */}
                  <div className="grid grid-cols-3 gap-2 sm:gap-3">
                    {/* 총 점검 */}
                    <div className="rounded-xl p-3 bg-gradient-to-br from-slate-50 to-gray-100 dark:from-slate-900/60 dark:to-gray-800/40 border border-slate-200 dark:border-slate-700/50">
                      <p className="text-[11px] font-semibold text-slate-500 dark:text-slate-400 mb-1">📋 총점검</p>
                      <p className="text-2xl font-black text-slate-700 dark:text-slate-200" data-testid="text-total-card">
                        {inspectionStats.total}
                        {inspectionStats.totalTarget > 0 && <span className="text-xs font-semibold text-muted-foreground ml-0.5">/{inspectionStats.totalTarget}</span>}
                        <span className="text-xs font-normal ml-0.5">건</span>
                      </p>
                      {inspectionStats.totalTarget > 0 && (
                        <div className="mt-1.5">
                          <div className="h-1.5 w-full bg-slate-200 dark:bg-slate-700 rounded-full overflow-hidden">
                            <div className="h-full bg-slate-500 rounded-full transition-all" style={{ width: `${Math.min(100, Math.round(inspectionStats.total / inspectionStats.totalTarget * 100))}%` }} />
                          </div>
                          <p className="text-[10px] text-slate-500 dark:text-slate-400 mt-0.5 font-semibold">{Math.round(inspectionStats.total / inspectionStats.totalTarget * 100)}% 달성</p>
                        </div>
                      )}
                    </div>

                    {/* 안전점검 */}
                    <div className="rounded-xl p-3 bg-gradient-to-br from-blue-50 to-sky-50 dark:from-blue-950/40 dark:to-sky-950/20 border border-blue-100 dark:border-blue-900/30">
                      <p className="text-[11px] font-semibold text-blue-600 dark:text-blue-400 mb-1">🛡 안전점검</p>
                      <p className="text-2xl font-black text-blue-700 dark:text-blue-300" data-testid="text-safety-count">
                        {inspectionStats.totalSafety}<span className="text-xs font-normal ml-0.5">건</span>
                      </p>
                    </div>

                    {/* 동행점검 */}
                    <div className="rounded-xl p-3 bg-gradient-to-br from-emerald-50 to-teal-50 dark:from-emerald-950/40 dark:to-teal-950/20 border border-emerald-100 dark:border-emerald-900/30">
                      <p className="text-[11px] font-semibold text-emerald-600 dark:text-emerald-400 mb-1">🤝 동행점검</p>
                      <p className="text-2xl font-black text-emerald-700 dark:text-emerald-300" data-testid="text-accompany-count">
                        {inspectionStats.totalAccompany}<span className="text-xs font-normal ml-0.5">건</span>
                      </p>
                    </div>

                    {/* 현장경영팀 점검 */}
                    <div className="rounded-xl p-3 bg-gradient-to-br from-orange-50 to-amber-50 dark:from-orange-950/40 dark:to-amber-950/20 border border-orange-100 dark:border-orange-900/30">
                      <p className="text-[11px] font-semibold text-orange-600 dark:text-orange-400 mb-1">🏗 현장경영팀</p>
                      <p className="text-2xl font-black text-orange-700 dark:text-orange-300">
                        {inspectionStats.totalHQ}<span className="text-xs font-normal ml-0.5">건</span>
                      </p>
                    </div>

                    {/* 본사 점검 */}
                    <div className="rounded-xl p-3 bg-gradient-to-br from-purple-50 to-violet-50 dark:from-purple-950/40 dark:to-violet-950/20 border border-purple-100 dark:border-purple-900/30">
                      <p className="text-[11px] font-semibold text-purple-600 dark:text-purple-400 mb-1">🏢 본사점검</p>
                      <p className="text-2xl font-black text-purple-700 dark:text-purple-300">
                        {inspectionStats.totalHQ2}<span className="text-xs font-normal ml-0.5">건</span>
                      </p>
                    </div>

                    {/* KT 점검 */}
                    <div className="rounded-xl p-3 bg-gradient-to-br from-sky-50 to-cyan-50 dark:from-sky-950/40 dark:to-cyan-950/20 border border-sky-100 dark:border-sky-900/30">
                      <p className="text-[11px] font-semibold text-sky-600 dark:text-sky-400 mb-1">📡 KT점검</p>
                      <p className="text-2xl font-black text-sky-700 dark:text-sky-300">
                        {inspectionStats.totalKT}<span className="text-xs font-normal ml-0.5">건</span>
                      </p>
                    </div>
                  </div>

                  {/* 운용팀별 통합 막대 차트 */}
                  <div className="w-full overflow-x-auto">
                    <div style={{ minWidth: Math.max(500, (inspectionStats.chartData.length * 64) + 60), height: 280 }}>
                      <ResponsiveContainer width="100%" height="100%">
                        <BarChart data={inspectionStats.chartData} margin={{ top: 20, right: 10, left: -10, bottom: 5 }} barCategoryGap="28%" barGap={1}>
                          <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="hsl(var(--border))" opacity={0.5} />
                          <XAxis dataKey="name" tick={{ fontSize: 11, fontWeight: 500, fill: "hsl(var(--muted-foreground))" }} axisLine={false} tickLine={false} interval={0} />
                          <YAxis tick={{ fontSize: 11, fill: "hsl(var(--muted-foreground))" }} axisLine={false} tickLine={false} allowDecimals={false} width={28} />
                          <Tooltip contentStyle={{ borderRadius: "8px", border: "1px solid hsl(var(--border))", background: "hsl(var(--popover))", color: "hsl(var(--popover-foreground))", fontSize: 12, boxShadow: "0 4px 12px rgba(0,0,0,0.1)" }} cursor={{ fill: "hsl(var(--muted))", opacity: 0.4 }} />
                          <Legend wrapperStyle={{ fontSize: 11, paddingTop: 8 }} iconType="circle" iconSize={7} />
                          <Bar dataKey="안전점검" stackId="a" fill="#3b82f6" radius={[0,0,0,0]}>
                            <LabelList dataKey="안전점검" position="inside" style={{ fontSize: 9, fontWeight: 700, fill: "#fff" }} formatter={(v: number) => v > 0 ? v : ""} />
                          </Bar>
                          <Bar dataKey="동행점검" stackId="a" fill="#10b981" radius={[0,0,0,0]}>
                            <LabelList dataKey="동행점검" position="inside" style={{ fontSize: 9, fontWeight: 700, fill: "#fff" }} formatter={(v: number) => v > 0 ? v : ""} />
                          </Bar>
                          <Bar dataKey="현장경영팀" stackId="a" fill="#f97316" radius={[0,0,0,0]}>
                            <LabelList dataKey="현장경영팀" position="inside" style={{ fontSize: 9, fontWeight: 700, fill: "#fff" }} formatter={(v: number) => v > 0 ? v : ""} />
                          </Bar>
                          <Bar dataKey="본사" stackId="a" fill="#8b5cf6" radius={[0,0,0,0]}>
                            <LabelList dataKey="본사" position="inside" style={{ fontSize: 9, fontWeight: 700, fill: "#fff" }} formatter={(v: number) => v > 0 ? v : ""} />
                          </Bar>
                          <Bar dataKey="KT" stackId="a" fill="#0ea5e9" radius={[4,4,0,0]}>
                            <LabelList dataKey="KT" position="inside" style={{ fontSize: 9, fontWeight: 700, fill: "#fff" }} formatter={(v: number) => v > 0 ? v : ""} />
                          </Bar>
                        </BarChart>
                      </ResponsiveContainer>
                    </div>
                  </div>
                </CardContent>
              </motion.div>
            )}
          </AnimatePresence>
        </Card>
      )}

      <AnimatePresence>
        {showForm && (
          <motion.div
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: "auto" }}
            exit={{ opacity: 0, height: 0 }}
          >
            <Card className="glass-card overflow-hidden border-green-200 dark:border-green-900/30">
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
                  <input
                    ref={pdfFileInputRef}
                    type="file"
                    accept=".pdf"
                    className="hidden"
                    onChange={handlePdfImport}
                  />
                </div>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label>점검 유형</Label>
                    <Select value={inspectionType} onValueChange={setInspectionType}>
                      <SelectTrigger data-testid="select-inspection-type">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="안전점검">안전점검</SelectItem>
                        <SelectItem value="동행점검">동행점검</SelectItem>
                        <SelectItem value="현장경영팀 점검">현장경영팀 점검</SelectItem>
                        <SelectItem value="본사 점검">본사 점검</SelectItem>
                        <SelectItem value="KT 점검">KT 점검</SelectItem>
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
                        {teams?.map((team) => (
                          <SelectItem key={team.id} value={team.name}>
                            {team.name}
                          </SelectItem>
                        ))}
                        {EXTRA_DEPARTMENTS.map((dept) => (
                          <SelectItem key={dept} value={dept}>
                            {dept}
                          </SelectItem>
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
                        data-testid="input-inspection-location"
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
                            <Check className="w-3 h-3 mr-1" />
                            양호
                          </Button>
                          <Button
                            type="button"
                            variant="ghost"
                            size="sm"
                            className={`h-8 px-3 ${item.status === '미흡' ? 'bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400' : ''}`}
                            onClick={() => handleChecklistChange(index, '미흡')}
                            data-testid={`btn-poor-${index}`}
                          >
                            <AlertCircle className="w-3 h-3 mr-1" />
                            미흡
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
                      data-testid="input-images"
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

                <div className="flex justify-end gap-2">
                  <Button variant="outline" onClick={resetForm} data-testid="button-cancel">
                    취소
                  </Button>
                  {!editingId && inspectionType === "현장경영팀 점검" ? (
                    <>
                      <Button
                        onClick={handleSubmitOnly}
                        disabled={createMutation.isPending || updateMutation.isPending || !department}
                        variant="outline"
                        className="border-orange-300 text-orange-700 hover:bg-orange-50 dark:border-orange-700 dark:text-orange-400 dark:hover:bg-orange-950"
                        data-testid="button-submit-only"
                      >
                        {(createMutation.isPending || updateMutation.isPending) && !pendingSendEmail.current ? "처리 중..." : "등록만"}
                      </Button>
                      <Button
                        onClick={handleSubmitAndEmail}
                        disabled={createMutation.isPending || updateMutation.isPending || !department || isSendingEmail}
                        className="bg-orange-600 hover:bg-orange-700 text-white gap-2"
                        data-testid="button-submit-and-email"
                      >
                        {isSendingEmail ? <><Loader2 className="w-4 h-4 animate-spin" />발송 중...</> : (createMutation.isPending || updateMutation.isPending) ? "처리 중..." : <><Mail className="w-4 h-4" />등록+메일 발송</>}
                      </Button>
                    </>
                  ) : (
                    <Button
                      onClick={handleSubmit}
                      disabled={createMutation.isPending || updateMutation.isPending || !department}
                      className="bg-green-600 hover:bg-green-700 text-white"
                      data-testid="button-submit-inspection"
                    >
                      {(createMutation.isPending || updateMutation.isPending) ? "처리 중..." : editingId !== null ? "수정 완료" : "점검 등록"}
                    </Button>
                  )}
                </div>
              </CardContent>
            </Card>
          </motion.div>
        )}
      </AnimatePresence>

      {/* 통합 점검 목록 — 탭과 무관하게 항상 표시, 날짜순 정렬 */}
      <div className="space-y-1">
        <div className="flex items-center justify-between mb-2">
          <div className="flex items-center gap-2 flex-wrap">
            <Calendar className="w-4 h-4 text-muted-foreground" />
            <span className="text-sm font-medium text-muted-foreground">점검 목록</span>
            <Badge variant="secondary" className="text-xs">
              {dashboardPeriod === "year" ? `${new Date().getFullYear()}년 전체` : `${selectedMonth}월`}
            </Badge>
            <span className="text-xs text-muted-foreground">{filteredInspections.length}건</span>
          </div>
          <div className="flex items-center gap-2">
            <span className="text-[11px] text-muted-foreground hidden sm:block">위 그래프 월 필터와 연동</span>
            {canEditInspections && selectionMode && (
              <Button
                variant="outline"
                size="sm"
                className="gap-1 h-7 text-xs px-2.5"
                onClick={() => {
                  const allIds = filteredInspections.map(i => i.id);
                  const allSelected = allIds.every(id => selectedIds.has(id));
                  setSelectedIds(allSelected ? new Set() : new Set(allIds));
                }}
                data-testid="button-select-all-inspections"
              >
                <Checkbox
                  checked={filteredInspections.length > 0 && filteredInspections.every(i => selectedIds.has(i.id))}
                  className="w-3.5 h-3.5 pointer-events-none"
                />
                {filteredInspections.every(i => selectedIds.has(i.id)) && filteredInspections.length > 0 ? "전체 해제" : "전체 선택"}
              </Button>
            )}
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
        ) : filteredInspections.length === 0 ? (
          <div className="text-center py-12 text-muted-foreground">
            {dashboardPeriod === "year" ? "올해" : `${selectedMonth}월`} 등록된 점검 내역이 없습니다.
          </div>
        ) : (
          <Card>
            <CardContent className="p-0 divide-y">
              {filteredInspections.map((inspection) => {
                const checklistItems = normalizeChecklist(inspection.checklist);
                const goodItems = checklistItems.filter(c => c.status === '양호').length;
                const poorItems = checklistItems.filter(c => c.status === '미흡').length;
                const isExpanded = expandedId === inspection.id;
                const isOther = OTHER_INSPECTION_TYPES.includes(inspection.inspectionType as any);

                const typeBadge = (() => {
                  switch (inspection.inspectionType) {
                    case "안전점검": return <span className="text-[10px] px-1.5 py-0.5 rounded shrink-0 font-bold border bg-blue-100 dark:bg-blue-900/40 text-blue-700 dark:text-blue-300 border-blue-200 dark:border-blue-800">안전</span>;
                    case "동행점검": return <span className="text-[10px] px-1.5 py-0.5 rounded shrink-0 font-bold border bg-emerald-100 dark:bg-emerald-900/40 text-emerald-700 dark:text-emerald-300 border-emerald-200 dark:border-emerald-800">동행</span>;
                    case "현장경영팀 점검": return <span className="text-[10px] px-1.5 py-0.5 rounded shrink-0 font-bold border bg-orange-100 dark:bg-orange-900/40 text-orange-700 dark:text-orange-300 border-orange-200 dark:border-orange-800">현장경영팀</span>;
                    case "본사 점검": return <span className="text-[10px] px-1.5 py-0.5 rounded shrink-0 font-bold border bg-purple-100 dark:bg-purple-900/40 text-purple-700 dark:text-purple-300 border-purple-200 dark:border-purple-800">본사</span>;
                    case "KT 점검": return <span className="text-[10px] px-1.5 py-0.5 rounded shrink-0 font-bold border bg-sky-100 dark:bg-sky-900/40 text-sky-700 dark:text-sky-300 border-sky-200 dark:border-sky-800">KT</span>;
                    default: return <span className="text-[10px] px-1.5 py-0.5 rounded shrink-0 font-bold border bg-gray-100 dark:bg-gray-800 text-gray-700 dark:text-gray-300 border-gray-200">{inspection.inspectionType}</span>;
                  }
                })();

                return (
                  <div key={inspection.id} data-testid={`card-inspection-${inspection.id}`}
                    className={selectionMode && selectedIds.has(inspection.id) ? "bg-red-50 dark:bg-red-900/20" : ""}>
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
                      {typeBadge}
                      <span className="text-xs text-muted-foreground shrink-0 w-[72px]">{inspection.inspectionDate}</span>
                      <span className="text-sm font-medium truncate flex-1 min-w-0">{inspection.title}</span>
                      {inspection.inspector && (
                        <span className="text-xs font-medium text-foreground/70 shrink-0 flex items-center gap-0.5">
                          <User className="w-3 h-3 text-muted-foreground" />
                          {inspection.inspector}
                        </span>
                      )}
                      <span className="text-xs text-muted-foreground truncate max-w-[70px] hidden sm:block">{inspection.department}</span>
                      {!isOther && (
                        <div className="flex items-center gap-1.5 shrink-0 text-[10px]">
                          <span className="text-green-600 dark:text-green-400">{goodItems}</span>
                          <span className="text-muted-foreground">/</span>
                          <span className="text-red-600 dark:text-red-400">{poorItems}</span>
                        </div>
                      )}
                      {inspection.images && inspection.images.length > 0 && (
                        <span className="text-[10px] text-muted-foreground shrink-0">{inspection.images.length}장</span>
                      )}
                      <div className="flex items-center gap-0.5 shrink-0">
                        {isExpanded ? <ChevronUp className="w-3.5 h-3.5 text-muted-foreground" /> : <ChevronDown className="w-3.5 h-3.5 text-muted-foreground" />}
                        {canEditInspections && (!inspection.createdBy || user?.role === "admin" || user?.username === inspection.createdBy) && (
                          <>
                            <Button variant="ghost" size="icon" className="h-7 w-7 opacity-100 sm:opacity-0 sm:group-hover:opacity-100"
                              onClick={(e) => { e.stopPropagation(); handleEdit(inspection); }}
                              data-testid={`button-edit-${inspection.id}`}>
                              <Pencil className="w-3.5 h-3.5 text-blue-500" />
                            </Button>
                            <Button variant="ghost" size="icon" className="h-7 w-7 opacity-100 sm:opacity-0 sm:group-hover:opacity-100"
                              onClick={(e) => { e.stopPropagation(); handleDelete(inspection.id); }}
                              data-testid={`button-delete-${inspection.id}`}>
                              <Trash2 className="w-3.5 h-3.5 text-destructive" />
                            </Button>
                          </>
                        )}
                      </div>
                    </div>
                    <AnimatePresence>
                      {isExpanded && (
                        <motion.div initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: "auto" }} exit={{ opacity: 0, height: 0 }} className="border-t bg-muted/10">
                          <div className="p-4 space-y-3">
                            <div className="flex flex-wrap gap-x-4 gap-y-1 text-xs text-muted-foreground">
                              {inspection.inspector && <span>점검자: {inspection.inspector}</span>}
                              {inspection.workerName && <span>작업자: {inspection.workerName}</span>}
                              {inspection.workContent && <span>작업내용: {inspection.workContent}</span>}
                              {inspection.location && <span>위치: {inspection.location}</span>}
                            </div>
                            {checklistItems.length > 0 && (
                              <div className="space-y-2">
                                <Label className="text-sm">체크리스트</Label>
                                <div className="bg-muted/50 rounded-lg p-3 space-y-2">
                                  {checklistItems.map((item, idx) => (
                                    <div key={idx} className="flex items-center justify-between gap-2">
                                      <span className="text-sm">{item.item}</span>
                                      <span className={`text-xs px-2 py-0.5 rounded-full ${getStatusColor(item.status)}`}>{item.status}</span>
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
                                    <img key={idx} src={img} alt={`점검 사진 ${idx + 1}`}
                                      className="h-24 w-24 object-cover rounded-lg border cursor-pointer hover:opacity-80"
                                      onClick={() => setLightboxImages({ urls: inspection.images!, index: idx })} />
                                  ))}
                                </div>
                              </div>
                            )}
                            {inspection.inspectionType === "현장경영팀 점검" && canEditInspections && (
                              <div className="flex justify-end">
                                <Button size="sm" className="bg-orange-600 hover:bg-orange-700 text-white gap-2"
                                  onClick={() => sendEmailAfterCreate({
                                    inspectionDate: inspection.inspectionDate, department: inspection.department || inspection.title,
                                    inspector: inspection.inspector || "", workerName: inspection.workerName || "",
                                    location: inspection.location || "", workContent: inspection.workContent || "",
                                    checklist: checklistItems, notes: inspection.notes || "",
                                    images: inspection.images || [], subType: inspection.inspectionType,
                                  })} disabled={isSendingEmail}>
                                  {isSendingEmail ? <><Loader2 className="w-4 h-4 animate-spin" />발송 중...</> : <><Mail className="w-4 h-4" />메일 발송</>}
                                </Button>
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

      <Dialog open={showTargetDialog} onOpenChange={setShowTargetDialog}>
        <DialogContent className="sm:max-w-sm">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Settings className="w-5 h-5 text-green-600" />
              월 목표건수 설정
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-4 pt-2">
            <p className="text-xs text-muted-foreground bg-muted/50 rounded-lg px-3 py-2">
              월 목표를 입력하면 연간 보기 시 <strong>×12</strong>로 자동 계산됩니다.
            </p>
            <div className="space-y-2">
              <Label className="font-semibold">총 점검 목표 건수 (월)</Label>
              <Input
                type="number"
                min={0}
                value={editTotalTarget}
                onChange={e => setEditTotalTarget(e.target.value)}
                placeholder="0"
                data-testid="input-total-target"
              />
              {Number(editTotalTarget) > 0 && (
                <p className="text-[11px] text-muted-foreground">
                  연간 환산: <strong>{(Number(editTotalTarget) || 0) * 12}건</strong>
                </p>
              )}
            </div>
            <div className="flex justify-end gap-2 pt-2">
              <Button variant="outline" onClick={() => setShowTargetDialog(false)}>
                취소
              </Button>
              <Button
                onClick={() => {
                  saveTargetsMutation.mutate({ totalTarget: Number(editTotalTarget) || 0 } as any);
                }}
                disabled={saveTargetsMutation.isPending}
                className="bg-green-600 text-white gap-2"
                data-testid="button-save-targets"
              >
                <Check className="w-4 h-4" />
                저장
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      {/* 일괄 가져오기 모달 */}
      <Dialog open={showBulkImport} onOpenChange={open => { setShowBulkImport(open); if (!open) { setBulkRows([]); setBulkExcelData([]); setBulkPdfFiles([]); setBulkExcelFile(null); } }}>
        <DialogContent className="max-w-5xl w-full">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Upload className="w-5 h-5 text-blue-600" />
              PDF 일괄 가져오기
            </DialogTitle>
          </DialogHeader>

          {/* 파일 선택 영역 */}
          {bulkRows.length === 0 && (
            <div className="space-y-3">
              {/* PDF 선택 */}
              <div
                className={`border-2 border-dashed rounded-xl p-5 text-center cursor-pointer transition-colors ${bulkPdfFiles.length > 0 ? 'border-blue-500 bg-blue-50 dark:bg-blue-950/20' : 'border-blue-300 dark:border-blue-700 hover:bg-blue-50 dark:hover:bg-blue-950/20'}`}
                onClick={() => bulkPdfInputRef.current?.click()}
              >
                <div className="flex items-center justify-center gap-3">
                  <FileText className={`w-7 h-7 ${bulkPdfFiles.length > 0 ? 'text-blue-600' : 'text-blue-400'}`} />
                  <div className="text-left">
                    <p className="font-medium text-sm text-blue-700 dark:text-blue-400">
                      PDF 파일 선택 (여러 개 가능) <span className="text-red-500">*</span>
                    </p>
                    {bulkPdfFiles.length > 0 ? (
                      <p className="text-xs text-blue-600 dark:text-blue-300">{bulkPdfFiles.length}개 선택됨: {bulkPdfFiles.slice(0, 2).map(f => f.name).join(', ')}{bulkPdfFiles.length > 2 ? ` 외 ${bulkPdfFiles.length - 2}개` : ''}</p>
                    ) : (
                      <p className="text-xs text-muted-foreground">현장점검 결과보고 PDF — 클릭하여 선택</p>
                    )}
                  </div>
                  {bulkPdfFiles.length > 0 && (
                    <Badge className="ml-auto bg-blue-600 text-white">{bulkPdfFiles.length}개</Badge>
                  )}
                </div>
              </div>
              <input ref={bulkPdfInputRef} type="file" accept=".pdf" multiple className="hidden" onChange={e => handleBulkFileSelect(e, 'pdf')} data-testid="input-bulk-pdf" />

              {/* 엑셀 선택 */}
              <div
                className={`border-2 border-dashed rounded-xl p-5 text-center cursor-pointer transition-colors ${bulkExcelFile ? 'border-green-500 bg-green-50 dark:bg-green-950/20' : 'border-gray-300 dark:border-gray-600 hover:bg-gray-50 dark:hover:bg-gray-800/20'}`}
                onClick={() => bulkExcelInputRef.current?.click()}
              >
                <div className="flex items-center justify-center gap-3">
                  <Download className={`w-7 h-7 ${bulkExcelFile ? 'text-green-600' : 'text-gray-400'}`} />
                  <div className="text-left">
                    <p className={`font-medium text-sm ${bulkExcelFile ? 'text-green-700 dark:text-green-400' : 'text-muted-foreground'}`}>
                      엑셀 파일 선택 <span className="text-xs font-normal">(선택사항)</span>
                    </p>
                    {bulkExcelFile ? (
                      <p className="text-xs text-green-600 dark:text-green-300">{bulkExcelFile.name}</p>
                    ) : (
                      <p className="text-xs text-muted-foreground">점검결과(그룹사) 엑셀 — 클릭하여 선택</p>
                    )}
                  </div>
                  {bulkExcelFile && (
                    <Button variant="ghost" size="icon" className="ml-auto h-6 w-6 text-gray-400 hover:text-red-500"
                      onClick={e => { e.stopPropagation(); setBulkExcelFile(null); }}>
                      <X className="w-3.5 h-3.5" />
                    </Button>
                  )}
                </div>
              </div>
              <input ref={bulkExcelInputRef} type="file" accept=".xlsx,.xls" className="hidden" onChange={e => handleBulkFileSelect(e, 'excel')} data-testid="input-bulk-excel" />

              <p className="text-xs text-muted-foreground text-center">
                추출 항목: 점검일자 · 팀명 · 작업장소 · 작업일시 · 점검방법 · 작업번호 · 점검결과 · 현장사진
              </p>

              <div className="flex justify-end gap-2 pt-1">
                <Button variant="outline" onClick={() => { setShowBulkImport(false); setBulkPdfFiles([]); setBulkExcelFile(null); }}>
                  취소
                </Button>
                <Button
                  className="bg-blue-600 hover:bg-blue-700 text-white gap-2"
                  onClick={handleBulkParse}
                  disabled={isBulkParsing || bulkPdfFiles.length === 0}
                  data-testid="button-start-parse"
                >
                  {isBulkParsing ? (
                    <><Loader2 className="w-4 h-4 animate-spin" />분석 중... (이미지 추출 포함)</>
                  ) : (
                    <><FileText className="w-4 h-4" />{bulkPdfFiles.length > 0 ? `${bulkPdfFiles.length}개 PDF 분석 시작` : 'PDF 파일을 선택하세요'}</>
                  )}
                </Button>
              </div>
            </div>
          )}

          {/* 파싱 결과 미리보기 테이블 */}
          {bulkRows.length > 0 && (
            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <Badge variant="outline" className="text-blue-600 border-blue-300">
                    {bulkRows.length}개 파싱됨
                  </Badge>
                  <Badge variant="outline" className="text-green-600 border-green-300">
                    {bulkRows.filter(r => r.selected).length}개 선택됨
                  </Badge>
                </div>
                <div className="flex gap-2">
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => { setBulkRows([]); setBulkExcelData([]); setBulkPdfFiles([]); setBulkExcelFile(null); }}
                    className="text-xs"
                  >
                    다시 선택
                  </Button>
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => setBulkRows(prev => prev.map(r => ({ ...r, selected: !r.error })))}
                    className="text-xs"
                  >
                    전체 선택
                  </Button>
                </div>
              </div>

              <ScrollArea className="h-[380px] rounded-md border">
                <Table>
                  <TableHeader>
                    <TableRow className="text-xs">
                      <TableHead className="w-10 text-center">선택</TableHead>
                      <TableHead className="min-w-[90px]">점검일자</TableHead>
                      <TableHead className="min-w-[110px]">점검유형</TableHead>
                      <TableHead className="min-w-[90px]">팀명</TableHead>
                      <TableHead className="min-w-[80px]">점검자</TableHead>
                      <TableHead className="min-w-[80px]">작업자</TableHead>
                      <TableHead className="min-w-[160px]">작업내용</TableHead>
                      <TableHead className="min-w-[180px]">작업국소(장소)</TableHead>
                      <TableHead className="min-w-[60px] text-center">사진</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {bulkRows.map((row, idx) => (
                      <TableRow
                        key={idx}
                        className={row.error ? 'bg-red-50 dark:bg-red-950/20' : row.selected ? '' : 'opacity-50'}
                      >
                        <TableCell className="text-center">
                          {row.error ? (
                            <AlertCircle className="w-4 h-4 text-red-500 mx-auto" />
                          ) : (
                            <Checkbox
                              checked={row.selected}
                              onCheckedChange={v => setBulkRows(prev => prev.map((r, i) => i === idx ? { ...r, selected: !!v } : r))}
                              data-testid={`checkbox-bulk-row-${idx}`}
                            />
                          )}
                        </TableCell>
                        <TableCell className="text-xs">
                          <Input
                            value={row.inspectionDate}
                            onChange={e => setBulkRows(prev => prev.map((r, i) => i === idx ? { ...r, inspectionDate: e.target.value } : r))}
                            className="h-7 text-xs min-w-[90px]"
                          />
                        </TableCell>
                        <TableCell className="text-xs">
                          <select
                            value={row.inspectionType || '안전점검'}
                            onChange={e => setBulkRows(prev => prev.map((r, i) => i === idx ? { ...r, inspectionType: e.target.value } : r))}
                            className="h-7 text-xs min-w-[100px] w-full rounded-md border border-input bg-background px-2 py-0.5"
                            data-testid={`select-bulk-inspection-type-${idx}`}
                          >
                            <option value="안전점검">안전점검</option>
                            <option value="동행점검">동행점검</option>
                            <option value="현장경영팀 점검">현장경영팀 점검</option>
                            <option value="본사 점검">본사 점검</option>
                            <option value="KT 점검">KT 점검</option>
                          </select>
                        </TableCell>
                        <TableCell className="text-xs">
                          <Input
                            value={row.team}
                            onChange={e => setBulkRows(prev => prev.map((r, i) => i === idx ? { ...r, team: e.target.value } : r))}
                            className="h-7 text-xs min-w-[90px]"
                          />
                        </TableCell>
                        <TableCell className="text-xs">
                          <Input
                            value={row.inspector}
                            onChange={e => setBulkRows(prev => prev.map((r, i) => i === idx ? { ...r, inspector: e.target.value } : r))}
                            className="h-7 text-xs min-w-[70px]"
                            placeholder="점검자"
                          />
                        </TableCell>
                        <TableCell className="text-xs">
                          <Input
                            value={row.workerName}
                            onChange={e => setBulkRows(prev => prev.map((r, i) => i === idx ? { ...r, workerName: e.target.value } : r))}
                            className="h-7 text-xs min-w-[70px]"
                            placeholder="작업자"
                          />
                        </TableCell>
                        <TableCell className="text-xs">
                          <Input
                            value={row.workContent}
                            onChange={e => {
                              const val = e.target.value;
                              const detected = detectTypeFromContent(val);
                              setBulkRows(prev => prev.map((r, i) => i === idx ? {
                                ...r,
                                workContent: detected ? detected.content : val,
                                inspectionType: detected ? detected.type : r.inspectionType,
                              } : r));
                            }}
                            className="h-7 text-xs min-w-[150px]"
                            placeholder="작업내용 입력"
                          />
                        </TableCell>
                        <TableCell className="text-xs">
                          <Input
                            value={row.location}
                            onChange={e => setBulkRows(prev => prev.map((r, i) => i === idx ? { ...r, location: e.target.value } : r))}
                            className="h-7 text-xs min-w-[170px]"
                          />
                        </TableCell>
                        <TableCell className="text-center text-xs text-muted-foreground">
                          {row.imageUrls.length > 0 ? (
                            <span className="flex items-center justify-center gap-1">
                              <Eye className="w-3 h-3" />
                              {row.imageUrls.length}장
                            </span>
                          ) : '-'}
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </ScrollArea>

              {/* 엑셀 데이터 표시 (있는 경우) */}
              {bulkExcelData.length > 0 && (
                <div className="p-3 bg-amber-50 dark:bg-amber-950/20 rounded-lg border border-amber-200 dark:border-amber-800">
                  <p className="text-xs text-amber-700 dark:text-amber-400 font-medium">
                    📊 엑셀 데이터 {bulkExcelData.length}행 로드됨 — 작업번호란에 수동 입력하여 연결하세요
                  </p>
                </div>
              )}

              <div className="flex justify-end gap-2 pt-1">
                <Button variant="outline" onClick={() => { setShowBulkImport(false); setBulkRows([]); setBulkExcelData([]); setBulkPdfFiles([]); setBulkExcelFile(null); }}>
                  취소
                </Button>
                <Button
                  className="bg-green-600 hover:bg-green-700 text-white gap-2"
                  onClick={handleBulkCreate}
                  disabled={isBulkCreating || bulkRows.filter(r => r.selected && !r.error).length === 0}
                  data-testid="button-bulk-create"
                >
                  {isBulkCreating ? (
                    <><Loader2 className="w-4 h-4 animate-spin" />등록 중...</>
                  ) : (
                    <><Check className="w-4 h-4" />{bulkRows.filter(r => r.selected && !r.error).length}건 일괄 등록</>
                  )}
                </Button>
              </div>
            </div>
          )}
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
