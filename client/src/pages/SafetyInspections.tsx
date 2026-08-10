import { useQuery, useMutation } from "@tanstack/react-query";
import * as XLSX from "xlsx";
import { useHeadquarters } from "@/contexts/HeadquartersContext";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { ClipboardCheck, ClipboardList, Plus, Trash2, ImagePlus, X, Calendar, MapPin, User, ChevronDown, ChevronUp, ChevronLeft, ChevronRight, Download, Check, AlertCircle, BarChart3, Settings, FileText, Loader2, Pencil, CheckSquare, Upload, Eye, Mail, ImageOff, TrendingUp } from "lucide-react";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
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
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer, LabelList, LineChart, Line, ReferenceLine, Cell } from "recharts";

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
  const [showReportDialog, setShowReportDialog] = useState(false);
  const [reportStartDate, setReportStartDate] = useState(format(new Date(), "yyyy-MM-dd"));
  const [reportEndDate, setReportEndDate] = useState(format(new Date(), "yyyy-MM-dd"));
  const [reportTitle, setReportTitle] = useState("특별안전점검");
  const [reportIsGenerating, setReportIsGenerating] = useState(false);

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
  const [dashboardPeriod, setDashboardPeriod] = useState<"week" | "month" | "year" | "custom">("month");
  const [selectedMonth, setSelectedMonth] = useState<number>(new Date().getMonth() + 1);
  const [customStart, setCustomStart] = useState<string>(() => format(new Date(new Date().getFullYear(), new Date().getMonth(), 1), "yyyy-MM-dd"));
  const [customEnd, setCustomEnd] = useState<string>(() => format(new Date(), "yyyy-MM-dd"));
  const [selectedWeekStart, setSelectedWeekStart] = useState<Date>(() => {
    const now = new Date();
    const day = now.getDay(); // 0=일, 1=월, ..., 6=토
    const diff = day === 0 ? -6 : 1 - day; // 이번 주 월요일
    const monday = new Date(now);
    monday.setDate(now.getDate() + diff);
    return monday;
  });

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
      // 점검자 이름 그룹 (조직 규칙 명시 그룹만)
      const INSPECTOR_HQ_TEAM  = ['류재하','이연태'];
      const INSPECTOR_HQ       = ['손성태','이훈휘','김용주','이옥재'];
      // 점검자·서버감지 유형 기반 점검유형 결정
      // 서버는 이미 작업내용 접미사(안전점검/동행점검 등)를 감지해 inspectionType 반환 + workContent에서 접미사 제거
      // 따라서 프론트에서 workContent 재파싱 불필요 — serverType을 기본값으로 활용
      const detectBulkType = (serverType: string, inspector: string): string => {
        // 1순위: 원격점검은 항상 유지 (D열 빈칸에서 서버가 감지)
        if (serverType === '원격점검') return '원격점검';
        // 2순위: 점검조직유형 컬럼에서 KT 점검 감지 → 항상 유지
        if (serverType === 'KT 점검') return 'KT 점검';
        // 2순위: 점검자 이름 그룹 규칙 (명시적 조직 규칙 우선)
        if (INSPECTOR_HQ_TEAM.includes(inspector)) return '현장경영팀 점검';
        if (INSPECTOR_HQ.includes(inspector))      return '본사 점검';
        // 3순위: 서버가 작업내용 접미사에서 감지한 유형 (동행점검, 현장경영팀 점검 등)
        //        INSPECTOR_SAFETY 그룹 또는 기타 점검자 모두 해당
        if (serverType && serverType !== '안전점검') return serverType;
        // 기본값
        return '안전점검';
      };

      setBulkRows(
        allResults
          .map((r: any) => ({
            ...r,
            workerName: r.workerName || r.team || '',
            inspectionType: detectBulkType(r.inspectionType || '', r.inspector || ''),
            selected: !r.error,
          }))
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
    setActiveTab("자체");
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

  // 이미지 Canvas 압축 (용량 절감)
  const compressImage = async (imageUrl: string, maxW = 320, maxH = 240, quality = 0.65): Promise<string | null> => {
    try {
      const absUrl = imageUrl.startsWith('/') ? window.location.origin + imageUrl : imageUrl;
      return await new Promise<string>((resolve, reject) => {
        const img = new Image();
        img.crossOrigin = 'anonymous';
        img.onload = () => {
          const scale = Math.min(maxW / img.width, maxH / img.height, 1);
          const canvas = document.createElement('canvas');
          canvas.width = Math.max(1, Math.round(img.width * scale));
          canvas.height = Math.max(1, Math.round(img.height * scale));
          canvas.getContext('2d')!.drawImage(img, 0, 0, canvas.width, canvas.height);
          resolve(canvas.toDataURL('image/jpeg', quality).split(',')[1]);
        };
        img.onerror = () => reject(new Error('load fail'));
        img.src = absUrl;
      });
    } catch { return null; }
  };

  const handleExcelDownload = async (includePhotos = true) => {
    if (!inspections || inspections.length === 0) {
      toast({ variant: "destructive", title: "다운로드할 점검 내역이 없습니다." });
      return;
    }
    toast({ title: includePhotos ? "엑셀 생성 중... (사진 압축 포함, 잠시 기다려주세요)" : "엑셀 파일 생성 중..." });

    const workbook = new ExcelJS.Workbook();

    // ── 시트 1: 안전점검 내역 ─────────────────────────────
    const worksheet = workbook.addWorksheet('안전점검 내역');
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
    DEFAULT_CHECKLIST.forEach((item, idx) => {
      worksheet.getColumn(10 + idx).width = 12;
      worksheet.getColumn(10 + idx).key = `check_${idx}`;
    });
    const MAX_IMAGES = 10;
    const firstImageCol = 10 + DEFAULT_CHECKLIST.length;
    if (includePhotos) {
      for (let i = 0; i < MAX_IMAGES; i++) {
        worksheet.getColumn(firstImageCol + i).width = 16;
        worksheet.getColumn(firstImageCol + i).key = `image_${i}`;
      }
    }
    const totalCols = includePhotos ? firstImageCol + MAX_IMAGES - 1 : firstImageCol - 1;

    const headerRow = worksheet.getRow(1);
    DEFAULT_CHECKLIST.forEach((item, idx) => { headerRow.getCell(10 + idx).value = item.item; });
    if (includePhotos) { for (let i = 0; i < MAX_IMAGES; i++) headerRow.getCell(firstImageCol + i).value = `사진${i + 1}`; }
    headerRow.font = { bold: true, color: { argb: 'FFFFFFFF' }, size: 10 };
    headerRow.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF4472C4' } };
    headerRow.alignment = { horizontal: 'center', vertical: 'middle', wrapText: true };
    headerRow.height = 35;
    for (let i = 1; i <= totalCols; i++) headerRow.getCell(i).border = { top: { style: 'thin' }, left: { style: 'thin' }, bottom: { style: 'thin' }, right: { style: 'thin' } };

    let rowNum = 1;
    for (const inspection of inspections) {
      const checklistItems = normalizeChecklist(inspection.checklist);
      const titleParts = (inspection.title || '').split(' - ');
      const rowData: Record<string, unknown> = {
        no: rowNum, type: inspection.inspectionType,
        department: titleParts[0] || '-',
        workContent: titleParts.slice(1).join(' - ') || '-',
        location: inspection.location || '-', inspector: inspection.inspector || '-',
        workerName: inspection.workerName || '-', date: inspection.inspectionDate, notes: inspection.notes || '-',
      };
      checklistItems.forEach((item, idx) => { rowData[`check_${idx}`] = item.status; });
      const row = worksheet.addRow(rowData);
      row.height = 22;
      row.alignment = { vertical: 'middle', wrapText: true };
      checklistItems.forEach((item, idx) => {
        const cell = row.getCell(10 + idx);
        cell.alignment = { horizontal: 'center', vertical: 'middle' };
        if (item.status === '양호') { cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFC6EFCE' } }; cell.font = { color: { argb: 'FF006100' } }; }
        else if (item.status === '미흡') { cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFFFC7CE' } }; cell.font = { color: { argb: 'FF9C0006' } }; }
        else { cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFFFEB9C' } }; cell.font = { color: { argb: 'FF9C6500' } }; }
      });
      for (let i = 1; i <= totalCols; i++) row.getCell(i).border = { top: { style: 'thin' }, left: { style: 'thin' }, bottom: { style: 'thin' }, right: { style: 'thin' } };
      if (rowNum % 2 === 0) {
        for (let i = 1; i <= 8; i++) {
          const cell = row.getCell(i);
          if (!cell.fill || (cell.fill as ExcelJS.FillPattern).fgColor?.argb === undefined)
            cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFF2F2F2' } };
        }
      }
      if (includePhotos) {
        const imgs = inspection.images || [];
        const numImages = Math.min(imgs.length, MAX_IMAGES);
        if (numImages > 0) {
          row.height = 69;
          for (let i = 0; i < numImages; i++) {
            try {
              const b64 = await compressImage(imgs[i]);
              if (!b64) continue;
              const imageId = workbook.addImage({ base64: b64, extension: 'jpeg' });
              worksheet.addImage(imageId, { tl: { col: firstImageCol - 1 + i, row: rowNum + 0.05 }, ext: { width: 113, height: 92 } });
            } catch (err) { console.error('이미지 로드 실패:', err); }
          }
        }
      }
      rowNum++;
    }
    worksheet.views = [{ state: 'frozen', ySplit: 1 }];

    // ── 시트 2: 기간별 요약 ───────────────────────────────
    const sumSheet = workbook.addWorksheet('기간별 요약');
    const allInsp = rawInspections || [];
    const TYPES = ['안전점검', '동행점검', '현장경영팀 점검', '본사 점검', 'KT 점검', '원격점검'];
    const TYPE_LABELS = ['안전점검', '동행점검', '현장경영팀', '본사', 'KT', '원격점검'];
    const getInspType = (insp: SafetyInspection) => {
      if (insp.inspectionType === '동행점검') return '동행점검';
      if (insp.inspectionType === '현장경영팀 점검') return '현장경영팀 점검';
      if (insp.inspectionType === '본사 점검') return '본사 점검';
      if (insp.inspectionType === 'KT 점검') return 'KT 점검';
      return '안전점검';
    };
    const COL_W = 14;
    sumSheet.getColumn(1).width = 20;
    for (let i = 2; i <= 7; i++) sumSheet.getColumn(i).width = COL_W;

    const addSumHeader = (row: ExcelJS.Row, color: string) => {
      row.font = { bold: true, color: { argb: 'FFFFFFFF' }, size: 10 };
      row.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: color } };
      row.alignment = { horizontal: 'center', vertical: 'middle' };
      row.height = 26;
      for (let i = 1; i <= 7; i++) row.getCell(i).border = { top: { style: 'thin' }, left: { style: 'thin' }, bottom: { style: 'thin' }, right: { style: 'thin' } };
    };
    const addSumData = (row: ExcelJS.Row, alt: boolean) => {
      row.height = 20;
      row.alignment = { horizontal: 'center', vertical: 'middle' };
      for (let i = 1; i <= 7; i++) {
        row.getCell(i).border = { top: { style: 'thin' }, left: { style: 'thin' }, bottom: { style: 'thin' }, right: { style: 'thin' } };
        if (alt) row.getCell(i).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFF8FAFC' } };
      }
      row.getCell(1).alignment = { horizontal: 'left', vertical: 'middle' };
    };
    const addTitle = (title: string, bgColor: string) => {
      const r = sumSheet.addRow([title]);
      r.font = { bold: true, size: 11, color: { argb: 'FFFFFFFF' } };
      r.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: bgColor } };
      r.height = 32;
      sumSheet.mergeCells(`A${r.number}:G${r.number}`);
      r.getCell(1).alignment = { horizontal: 'left', vertical: 'middle' };
      sumSheet.addRow([]);
    };

    const nowDate = new Date();
    const curYear = format(nowDate, 'yyyy');

    // 섹션 1: 연간 요약 (월별)
    addTitle(`📅 연간 요약 — ${curYear}년 월별 집계`, 'FF1D4ED8');
    const annHdr = sumSheet.addRow(['월', '합계', ...TYPE_LABELS]);
    addSumHeader(annHdr, 'FF3B82F6');
    for (let m = 1; m <= 12; m++) {
      const prefix = `${curYear}-${String(m).padStart(2, '0')}`;
      const mo = allInsp.filter(i => i.inspectionDate.startsWith(prefix));
      const r = sumSheet.addRow([`${m}월`, mo.length, ...TYPES.map(t => mo.filter(i => getInspType(i) === t).length)]);
      addSumData(r, m % 2 === 0);
      r.getCell(2).font = { bold: true };
    }
    const annAll = allInsp.filter(i => i.inspectionDate.startsWith(curYear));
    const annTotRow = sumSheet.addRow(['연간 합계', annAll.length, ...TYPES.map(t => annAll.filter(i => getInspType(i) === t).length)]);
    annTotRow.font = { bold: true };
    annTotRow.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFDBEAFE' } };
    annTotRow.height = 24;
    for (let i = 1; i <= 7; i++) annTotRow.getCell(i).border = { top: { style: 'medium' }, left: { style: 'thin' }, bottom: { style: 'medium' }, right: { style: 'thin' } };
    annTotRow.alignment = { horizontal: 'center', vertical: 'middle' };
    sumSheet.addRow([]);

    // 섹션 2: 주별 요약 (최근 12주, 월~금)
    addTitle('📋 주별 요약 — 최근 12주 (월~금)', 'FF047857');
    const wkHdr = sumSheet.addRow(['주간 (월~금)', '합계', ...TYPE_LABELS]);
    addSumHeader(wkHdr, 'FF10B981');
    const day = nowDate.getDay();
    const diffMon = day === 0 ? -6 : 1 - day;
    const thisMon = new Date(nowDate);
    thisMon.setDate(nowDate.getDate() + diffMon);
    thisMon.setHours(0, 0, 0, 0);
    for (let w = 0; w < 12; w++) {
      const ws = new Date(thisMon); ws.setDate(thisMon.getDate() - w * 7);
      const we = new Date(ws); we.setDate(ws.getDate() + 4);
      const wsStr = format(ws, 'yyyy-MM-dd'), weStr = format(we, 'yyyy-MM-dd');
      const wi = allInsp.filter(i => i.inspectionDate >= wsStr && i.inspectionDate <= weStr);
      const r = sumSheet.addRow([`${format(ws, 'M/d')}~${format(we, 'M/d')}`, wi.length, ...TYPES.map(t => wi.filter(i => getInspType(i) === t).length)]);
      addSumData(r, w % 2 !== 0);
      r.getCell(2).font = { bold: true };
      if (w === 0) { r.font = { bold: true }; r.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFD1FAE5' } }; }
    }
    sumSheet.addRow([]);

    // 섹션 3: 최근 3개월 일별 유건 현황 (데이터 있는 날만)
    addTitle('📊 최근 3개월 일별 현황 (점검 있는 날만)', 'FF6D28D9');
    for (let mo = 0; mo < 3; mo++) {
      const td = new Date(nowDate); td.setMonth(nowDate.getMonth() - mo);
      const yr = format(td, 'yyyy'), mn = format(td, 'MM');
      const prefix = `${yr}-${mn}`;
      const daysInMo = new Date(parseInt(yr), parseInt(mn), 0).getDate();
      const moHdr = sumSheet.addRow([`${parseInt(mn)}월 일별`, '합계', ...TYPE_LABELS]);
      addSumHeader(moHdr, 'FF8B5CF6');
      let hasAny = false;
      for (let d = 1; d <= daysInMo; d++) {
        const dStr = `${prefix}-${String(d).padStart(2, '0')}`;
        const di = allInsp.filter(i => i.inspectionDate === dStr);
        if (di.length === 0) continue;
        hasAny = true;
        const r = sumSheet.addRow([`${parseInt(mn)}/${d}`, di.length, ...TYPES.map(t => di.filter(i => getInspType(i) === t).length)]);
        addSumData(r, d % 2 === 0);
        r.getCell(2).font = { bold: true };
      }
      if (!hasAny) { const nr = sumSheet.addRow(['점검 내역 없음']); nr.getCell(1).alignment = { horizontal: 'center' }; }
      sumSheet.addRow([]);
    }

    // ── 다운로드 ──────────────────────────────────────────
    const buffer = await workbook.xlsx.writeBuffer();
    const blob = new Blob([buffer], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `안전점검내역_${format(new Date(), 'yyyyMMdd')}${includePhotos ? '' : '_사진제외'}.xlsx`;
    a.click();
    URL.revokeObjectURL(url);
    toast({ title: "엑셀 다운로드 완료" });
  };

  // ══════════════════════════════════════════════════════════════════
  // 특별안전점검 기간 종합 엑셀 다운로드 (7/9 ~ 8/5)
  // 안전점검 / 동행점검 / 원격점검 분리 + 수식 자동계산
  // ══════════════════════════════════════════════════════════════════
  const handleSpecialPeriodDownload = async (startDate: string, endDate: string, title: string) => {
    if (!rawInspections || !teams) {
      toast({ variant: "destructive", title: "데이터를 불러오는 중입니다. 잠시 후 다시 시도해주세요." });
      return;
    }
    toast({ title: "보고서 엑셀 생성 중..." });

    // ── 상수 ──────────────────────────────────────────────────────
    const PERIOD_START = startDate;
    const PERIOD_END   = endDate;
    const DAY_KR_LABEL = ["일","월","화","수","목","금","토"];
    const fmtDateLabel = (d: string) => {
      const dt = new Date(d + "T00:00:00");
      return `${dt.getFullYear()}. ${dt.getMonth()+1}. ${dt.getDate()}(${DAY_KR_LABEL[dt.getDay()]})`;
    };
    const PERIOD_LABEL = `${fmtDateLabel(PERIOD_START)} ~ ${fmtDateLabel(PERIOD_END)}`;
    const TODAY_LABEL  = format(new Date(), "yyyy. M. d") + " 현재";

    // ── 공휴일 목록 (평일이지만 쉬는 날) ─────────────────────────
    const HOLIDAYS = new Set([
      "2026-01-01", // 신정
      "2026-01-28", // 설날 연휴
      "2026-01-29", // 설날
      "2026-01-30", // 설날 연휴
      "2026-03-01", // 삼일절
      "2026-05-05", // 어린이날
      "2026-05-25", // 부처님오신날
      "2026-06-06", // 현충일
      "2026-07-17", // 제헌절
      "2026-08-15", // 광복절
      "2026-09-24", // 추석 연휴
      "2026-09-25", // 추석
      "2026-09-26", // 추석 연휴
      "2026-10-03", // 개천절
      "2026-10-09", // 한글날
      "2026-12-25", // 성탄절
    ]);

    // ── 영업일(월~금, 공휴일 제외) 목록 ──────────────────────────
    const workingDays: string[] = [];
    const cur = new Date(PERIOD_START + "T00:00:00");
    const endD = new Date(PERIOD_END + "T00:00:00");
    while (cur <= endD) {
      const dow = cur.getDay();
      const dateStr = format(cur, "yyyy-MM-dd");
      if (dow !== 0 && dow !== 6 && !HOLIDAYS.has(dateStr)) workingDays.push(dateStr);
      cur.setDate(cur.getDate() + 1);
    }
    const WD = workingDays.length;

    // ── 기간 내 점검 데이터 ───────────────────────────────────────
    const periodInsp = rawInspections.filter(
      i => i.inspectionDate >= PERIOD_START && i.inspectionDate <= PERIOD_END
    );
    const DEPT_ORDER = ["동대구운용팀","포항운용팀","안동운용팀","서대구운용팀","남대구운용팀","구미운용팀","문경운용팀"];
    const allDepts = DEPT_ORDER.filter(d => teams.some(t => t.name === d))
      .concat(teams.map(t => t.name).filter(n => !DEPT_ORDER.includes(n)));

    const matchDept = (insp: (typeof rawInspections)[0], dept: string) =>
      insp.title.startsWith(dept) || ((insp as any).department || "").startsWith(dept);

    // ── 부서별 통계 (유형별 분리, 합계 = 안전+동행+원격) ───────────
    const deptStats = allDepts.map(dept => {
      const safe   = periodInsp.filter(i => matchDept(i, dept) && i.inspectionType === "안전점검").length;
      const accomp = periodInsp.filter(i => matchDept(i, dept) && i.inspectionType === "동행점검").length;
      const remote = periodInsp.filter(i => matchDept(i, dept) && i.inspectionType === "원격점검").length;
      const total  = safe + accomp + remote;
      const rate   = WD > 0 ? Math.round(total / WD * 100) : 0;
      return { dept, safe, accomp, remote, total, rate, target: WD };
    });

    const wb = new ExcelJS.Workbook();
    wb.creator = "SafetyBoard";

    // ══════════════════════════════════════════════════════════════
    // Sheet 1 컬럼 (7열)
    //  A: 구분  B: 안전점검  C: 동행점검  D: 원격점검
    //  E: 합계(=B+C+D)  F: 목표건수  G: 목표대비점검율 + 그래프(바 시각화)
    // ══════════════════════════════════════════════════════════════
    const NC1 = 7;
    const C = { dept:1, safe:2, accomp:3, remote:4, total:5, target:6, rate:7 };

    const applyFill = (cell: ExcelJS.Cell, argb: string) => {
      cell.fill = { type:"pattern", pattern:"solid", fgColor:{ argb } };
    };
    const colLetter = (n: number) => n <= 26
      ? String.fromCharCode(64 + n)
      : String.fromCharCode(64 + Math.floor((n-1)/26)) + String.fromCharCode(64 + ((n-1)%26) + 1);

    // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
    // Sheet 1: 종합표
    // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
    const ws1 = wb.addWorksheet("종합표");
    // A  B    C    D    E    F    G    H(그래프)
    [20, 13, 13, 13, 12, 12, 34].forEach((w, i) => { ws1.getColumn(i+1).width = w; });

    const mergeNC1 = (row: ExcelJS.Row) =>
      ws1.mergeCells(`A${row.number}:${colLetter(NC1)}${row.number}`);
    const bdr1 = (row: ExcelJS.Row, cols = NC1, style: ExcelJS.BorderStyle = "thin") => {
      for (let c = 1; c <= cols; c++)
        row.getCell(c).border = { top:{style}, left:{style}, bottom:{style}, right:{style} };
    };

    // ▶ 제목
    const r1 = ws1.addRow(["특별안전점검 기간 종합 현황"]);
    mergeNC1(r1); r1.height = 38;
    r1.getCell(1).font      = { bold:true, size:15, color:{ argb:"FFFFFFFF" } };
    r1.getCell(1).fill      = { type:"pattern", pattern:"solid", fgColor:{ argb:"FFC0392B" } };
    r1.getCell(1).alignment = { horizontal:"center", vertical:"middle" };

    const r2 = ws1.addRow([`점검기간: ${PERIOD_LABEL}     목표: 부서별 매일 1건 이상     영업일수: ${WD}일     ${TODAY_LABEL}`]);
    mergeNC1(r2); r2.height = 22;
    r2.getCell(1).font      = { bold:true, size:10, color:{ argb:"FF7F1D1D" } };
    r2.getCell(1).fill      = { type:"pattern", pattern:"solid", fgColor:{ argb:"FFFEF2F2" } };
    r2.getCell(1).alignment = { horizontal:"center", vertical:"middle" };

    // ▶ 헤더 2단
    // h1: 구분(A세로병합) | 점검내역(B~D가로병합) | 합계(E세로병합) | 목표건수(F세로병합) | 목표대비점검율(G세로병합) | 그래프(H세로병합)
    // h2:                 | 안전점검 | 동행점검 | 원격점검 |
    const h1 = ws1.addRow(["구분", "점검내역", "", "", "합계", "목표건수", "목표대비\n점검율"]);
    h1.height = 30;
    h1.font      = { bold:true, color:{ argb:"FFFFFFFF" }, size:10 };
    h1.fill      = { type:"pattern", pattern:"solid", fgColor:{ argb:"FF1F3864" } };
    h1.alignment = { horizontal:"center", vertical:"middle", wrapText:true };
    ws1.mergeCells(`B${h1.number}:D${h1.number}`);                          // 점검내역 가로 병합
    ["A","E","F","G"].forEach(col =>
      ws1.mergeCells(`${col}${h1.number}:${col}${h1.number+1}`)             // 나머지 세로 2행 병합
    );
    bdr1(h1, NC1, "medium");

    const h2 = ws1.addRow(["", "안전점검", "동행점검", "원격점검", "", "", ""]);
    h2.height = 22;
    h2.font      = { bold:true, color:{ argb:"FFFFFFFF" }, size:10 };
    h2.alignment = { horizontal:"center", vertical:"middle" };
    applyFill(h2.getCell(C.dept),   "FF1F3864");
    applyFill(h2.getCell(C.safe),   "FF1A3C6E");
    applyFill(h2.getCell(C.accomp), "FF14532D");
    applyFill(h2.getCell(C.remote), "FF3B0764");
    applyFill(h2.getCell(C.total),  "FF1F3864");
    applyFill(h2.getCell(C.target), "FF1F3864");
    applyFill(h2.getCell(C.rate),   "FF1F3864");
    bdr1(h2, NC1, "medium");

    // ▶ 부서별 데이터 행
    const dataStart = ws1.rowCount + 1;
    deptStats.forEach((s, idx) => {
      const rn    = ws1.rowCount + 1;
      const altBg = idx % 2 !== 0 ? "FFF5F5F5" : "FFFFFFFF";

      // 그래프 바 생성 (10칸 × 10% = 100%)
      const filled   = Math.min(Math.floor(s.rate / 10), 10);
      const barArgb  = s.rate >= 100 ? "FF1D8348" : s.rate >= 70 ? "FF9C6500" : "FF9C0006";
      const barText  = "█".repeat(filled) + "░".repeat(10 - filled) + `  ${s.rate}%`;

      const dr = ws1.addRow([
        s.dept,
        s.safe,
        s.accomp,
        s.remote,
        { formula: `B${rn}+C${rn}+D${rn}` },
        WD,
        barText,
      ]);
      dr.height = 22;
      dr.alignment = { horizontal:"center", vertical:"middle" };
      dr.getCell(C.dept).alignment = { horizontal:"left", vertical:"middle", indent:1 };

      // 교대 배경
      [C.dept, C.total, C.target].forEach(c => applyFill(dr.getCell(c), altBg));

      applyFill(dr.getCell(C.safe),   "FFE8F0FE");
      dr.getCell(C.safe).font   = { size:10, color:{ argb:"FF1A3C6E" }, bold: s.safe > 0 };

      applyFill(dr.getCell(C.accomp), "FFE6F4EA");
      dr.getCell(C.accomp).font = { size:10, color:{ argb:"FF137333" }, bold: s.accomp > 0 };

      applyFill(dr.getCell(C.remote), "FFF3E8FD");
      dr.getCell(C.remote).font = { size:10, color:{ argb:"FF6A0DAD" }, bold: s.remote > 0 };

      applyFill(dr.getCell(C.total),  "FFE8F0FE");
      dr.getCell(C.total).font  = { bold:true, size:10, color:{ argb:"FF1A3C6E" } };

      const rateBgArgb = s.rate >= 100 ? "FFC6EFCE" : s.rate >= 70 ? "FFFFEB9C" : "FFFFC7CE";
      applyFill(dr.getCell(C.rate), rateBgArgb);
      dr.getCell(C.rate).font      = { name:"Courier New", size:9, bold:true, color:{ argb: barArgb } };
      dr.getCell(C.rate).alignment = { horizontal:"left", vertical:"middle" };

      bdr1(dr, NC1);
    });
    const dataEnd = ws1.rowCount;

    // ▶ 합계 행
    const totRn = ws1.rowCount + 1;
    const totSafe   = deptStats.reduce((a, s) => a + s.safe, 0);
    const totAccomp = deptStats.reduce((a, s) => a + s.accomp, 0);
    const totRemote = deptStats.reduce((a, s) => a + s.remote, 0);
    const totAll    = totSafe + totAccomp + totRemote;
    const totTarget = WD * allDepts.length;
    const totRate   = totTarget > 0 ? Math.round(totAll / totTarget * 100) : 0;
    const totFilled = Math.min(Math.floor(totRate / 10), 10);
    const totBarArgb = totRate >= 100 ? "FF1D8348" : totRate >= 70 ? "FF9C6500" : "FF9C0006";
    const totBarText = "█".repeat(totFilled) + "░".repeat(10 - totFilled) + `  ${totRate}%`;

    const totRow = ws1.addRow([
      "합  계",
      { formula: `SUM(B${dataStart}:B${dataEnd})` },
      { formula: `SUM(C${dataStart}:C${dataEnd})` },
      { formula: `SUM(D${dataStart}:D${dataEnd})` },
      { formula: `SUM(E${dataStart}:E${dataEnd})` },
      { formula: `SUM(F${dataStart}:F${dataEnd})` },
      totBarText,
    ]);
    totRow.font      = { bold:true, size:11 };
    totRow.height    = 26;
    totRow.alignment = { horizontal:"center", vertical:"middle" };
    totRow.getCell(C.dept).alignment = { horizontal:"center", vertical:"middle" };
    for (let c = 1; c <= NC1; c++) applyFill(totRow.getCell(c), "FFD9E1F2");
    totRow.getCell(C.rate).font      = { name:"Courier New", size:9, bold:true, color:{ argb: totBarArgb } };
    totRow.getCell(C.rate).alignment = { horizontal:"left", vertical:"middle" };
    bdr1(totRow, NC1, "medium");

    // ▶ 안내 주석
    ws1.addRow([]);
    const noteRow = ws1.addRow(["※ B(안전)·C(동행)·D(원격) 셀을 직접 수정하면 E(합계)가 자동 재계산됩니다."]);
    mergeNC1(noteRow);
    noteRow.getCell(1).font      = { italic:true, size:9, color:{ argb:"FF555555" } };
    noteRow.getCell(1).alignment = { horizontal:"left" };

    ws1.views = [{ state:"frozen", xSplit:1, ySplit:4 }];

    // ══════════════════════════════════════════════════════════════
    // Sheet 2: 일자별 현황 (안전 / 동행 / 원격 구분 표시)
    // 컬럼: 날짜 | [부서A: 안전, 동행, 원격] × N | 일합계
    // ══════════════════════════════════════════════════════════════
    const ws2 = wb.addWorksheet("일자별현황");

    // 부서당 3열 (안전/동행/원격)
    const DEPT_COLS = 3;
    const NC2 = 1 + allDepts.length * DEPT_COLS + 1; // 날짜 + (3 × N부서) + 합계
    ws2.getColumn(1).width = 12; // 날짜
    allDepts.forEach((_, di) => {
      ws2.getColumn(1 + di * DEPT_COLS + 1).width = 9;  // 안전
      ws2.getColumn(1 + di * DEPT_COLS + 2).width = 9;  // 동행
      ws2.getColumn(1 + di * DEPT_COLS + 3).width = 8;  // 원격
    });
    ws2.getColumn(NC2).width = 9; // 합계

    const colLetterWide = (n: number): string => {
      if (n <= 26) return String.fromCharCode(64 + n);
      return String.fromCharCode(64 + Math.floor((n - 1) / 26)) + String.fromCharCode(64 + ((n - 1) % 26) + 1);
    };
    const merge2 = (row: ExcelJS.Row) =>
      ws2.mergeCells(`A${row.number}:${colLetterWide(NC2)}${row.number}`);
    const bdr2 = (row: ExcelJS.Row, style: ExcelJS.BorderStyle = "thin") => {
      for (let c = 1; c <= NC2; c++)
        row.getCell(c).border = { top:{style}, left:{style}, bottom:{style}, right:{style} };
    };

    // 제목
    const d1 = ws2.addRow([`📅 특별안전점검 일자별 현황  (${PERIOD_LABEL})`]);
    merge2(d1); d1.height = 32;
    Object.assign(d1.getCell(1), {
      font: { bold:true, size:13, color:{ argb:"FFFFFFFF" } },
      fill: { type:"pattern", pattern:"solid", fgColor:{ argb:"FF0F5132" } },
      alignment: { horizontal:"center", vertical:"middle" },
    });

    const d2 = ws2.addRow(["🎯 목표: 부서별 매일 1건 이상 (안전점검+동행점검)  |  🟩 달성  🟥 미시행  |  각 부서: 안전 / 동행 / 원격(별도)"]);
    merge2(d2); d2.height = 20;
    Object.assign(d2.getCell(1), {
      font: { italic:true, size:9, color:{ argb:"FF0F5132" } },
      fill: { type:"pattern", pattern:"solid", fgColor:{ argb:"FFD1FAE5" } },
      alignment: { horizontal:"center", vertical:"middle" },
    });

    // ▶ 헤더 2단
    // 1단: 부서명 병합
    const dh1Vals: (string | number)[] = ["날짜(요일)"];
    allDepts.forEach(d => { dh1Vals.push(d.replace("운용팀","팀")); dh1Vals.push(""); dh1Vals.push(""); });
    dh1Vals.push("합계");
    const dh1 = ws2.addRow(dh1Vals);
    dh1.height = 28;
    dh1.font = { bold:true, color:{ argb:"FFFFFFFF" }, size:9 };
    dh1.fill = { type:"pattern", pattern:"solid", fgColor:{ argb:"FF0F5132" } };
    dh1.alignment = { horizontal:"center", vertical:"middle" };
    // 각 부서 헤더 병합 (3열씩)
    allDepts.forEach((_, di) => {
      const startCol = 2 + di * DEPT_COLS;
      ws2.mergeCells(`${colLetterWide(startCol)}${dh1.number}:${colLetterWide(startCol + 2)}${dh1.number}`);
    });
    // 날짜, 합계 2행 병합
    ws2.mergeCells(`A${dh1.number}:A${dh1.number + 1}`);
    ws2.mergeCells(`${colLetterWide(NC2)}${dh1.number}:${colLetterWide(NC2)}${dh1.number + 1}`);
    bdr2(dh1, "medium");

    // 2단: 유형 헤더
    const dh2Vals: string[] = [""];
    allDepts.forEach(() => { dh2Vals.push("안전"); dh2Vals.push("동행"); dh2Vals.push("원격"); });
    dh2Vals.push("");
    const dh2 = ws2.addRow(dh2Vals);
    dh2.height = 18;
    dh2.font = { bold:true, size:8, color:{ argb:"FFFFFFFF" } };
    dh2.alignment = { horizontal:"center", vertical:"middle" };
    // 안전=파랑, 동행=초록, 원격=보라
    allDepts.forEach((_, di) => {
      applyFill(dh2.getCell(2 + di * DEPT_COLS + 0), "FF1E3A5F");
      applyFill(dh2.getCell(2 + di * DEPT_COLS + 1), "FF064E3B");
      applyFill(dh2.getCell(2 + di * DEPT_COLS + 2), "FF3B0764");
    });
    applyFill(dh2.getCell(NC2), "FF1F2937");
    bdr2(dh2, "medium");

    const DAY_KR = ["일","월","화","수","목","금","토"];

    const dataStart2 = ws2.rowCount + 1;
    workingDays.forEach((dateStr, wdIdx) => {
      const dow = new Date(dateStr + "T00:00:00").getDay();
      const label = `${dateStr.slice(5)}(${DAY_KR[dow]})`;

      const deptData = allDepts.map(dept => ({
        safe:   periodInsp.filter(i => i.inspectionDate === dateStr && matchDept(i, dept) && i.inspectionType === "안전점검").length,
        accomp: periodInsp.filter(i => i.inspectionDate === dateStr && matchDept(i, dept) && i.inspectionType === "동행점검").length,
        remote: periodInsp.filter(i => i.inspectionDate === dateStr && matchDept(i, dept) && i.inspectionType === "원격점검").length,
      }));

      const rowVals: (string | number | { formula: string })[] = [label];
      deptData.forEach(d => { rowVals.push(d.safe || ""); rowVals.push(d.accomp || ""); rowVals.push(d.remote || ""); });
      // 합계 열: SUM(B~NC2-1) 수식으로 전체 유형 합산
      const nextRn = ws2.rowCount + 1;
      const firstDataCol = colLetterWide(2);
      const lastDataCol  = colLetterWide(NC2 - 1);
      rowVals.push({ formula: `SUM(${firstDataCol}${nextRn}:${lastDataCol}${nextRn})` });

      const dr = ws2.addRow(rowVals);
      dr.height = 18;
      dr.alignment = { horizontal:"center", vertical:"middle" };
      dr.getCell(1).font = { size:8 };
      const altBg = wdIdx % 2 !== 0 ? "FFF0F4F8" : "FFFFFFFF";
      dr.getCell(1).fill = { type:"pattern", pattern:"solid", fgColor:{ argb: altBg } };

      deptData.forEach((d, di) => {
        const onsite = d.safe + d.accomp + d.remote;
        const cSafe   = dr.getCell(2 + di * DEPT_COLS + 0);
        const cAccomp = dr.getCell(2 + di * DEPT_COLS + 1);
        const cRemote = dr.getCell(2 + di * DEPT_COLS + 2);

        // 안전점검 색
        applyFill(cSafe, d.safe > 0 ? "FFE8F0FE" : altBg);
        cSafe.font = { size:9, color:{ argb: d.safe > 0 ? "FF1A3C6E" : "FFAAAAAA" }, bold: d.safe > 0 };
        // 동행점검 색
        applyFill(cAccomp, d.accomp > 0 ? "FFE6F4EA" : altBg);
        cAccomp.font = { size:9, color:{ argb: d.accomp > 0 ? "FF137333" : "FFAAAAAA" }, bold: d.accomp > 0 };
        // 원격점검 색
        applyFill(cRemote, d.remote > 0 ? "FFF3E8FD" : altBg);
        cRemote.font = { size:9, color:{ argb: d.remote > 0 ? "FF6A0DAD" : "FFAAAAAA" }, bold: d.remote > 0 };
      });

      // 합계 셀 색상
      const totCell = dr.getCell(NC2);
      const dayTotal = deptData.reduce((a, d) => a + d.safe + d.accomp + d.remote, 0);
      totCell.font = { bold:true, size:9 };
      if (dayTotal >= allDepts.length) {
        applyFill(totCell, "FFC6EFCE"); totCell.font = { bold:true, size:9, color:{ argb:"FF006100" } };
      } else if (dayTotal > 0) {
        applyFill(totCell, "FFFFEB9C"); totCell.font = { bold:true, size:9, color:{ argb:"FF9C6500" } };
      } else {
        applyFill(totCell, "FFFFC7CE"); totCell.font = { bold:true, size:9, color:{ argb:"FF9C0006" } };
      }

      bdr2(dr);
    });
    const dataEnd2 = ws2.rowCount;

    // ▶ 기간 합계 행 (SUM 수식)
    const sumVals2: (string | { formula: string })[] = ["기간 합계"];
    for (let c = 2; c <= NC2; c++) {
      const cl = colLetterWide(c);
      sumVals2.push({ formula: `SUM(${cl}${dataStart2}:${cl}${dataEnd2})` });
    }
    const ptRow = ws2.addRow(sumVals2);
    ptRow.font = { bold:true, size:10 };
    ptRow.height = 24;
    ptRow.alignment = { horizontal:"center", vertical:"middle" };
    for (let c = 1; c <= NC2; c++) applyFill(ptRow.getCell(c), "FFD6EAF8");
    bdr2(ptRow, "medium");

    // ▶ 목표건수 행
    const tgtVals2: (string | number)[] = ["목표건수"];
    allDepts.forEach(() => { tgtVals2.push(WD); tgtVals2.push(""); tgtVals2.push(""); });
    tgtVals2.push(WD * allDepts.length); // 전체 목표
    const tgtRow = ws2.addRow(tgtVals2);
    tgtRow.font = { bold:true, size:9 };
    tgtRow.height = 20;
    tgtRow.alignment = { horizontal:"center", vertical:"middle" };
    for (let c = 1; c <= NC2; c++) applyFill(tgtRow.getCell(c), "FFFFF2CC");
    // 부서별 3열 병합
    allDepts.forEach((_, di) => {
      ws2.mergeCells(`${colLetterWide(2 + di * DEPT_COLS)}${tgtRow.number}:${colLetterWide(2 + di * DEPT_COLS + 2)}${tgtRow.number}`);
    });
    bdr2(tgtRow, "medium");

    // ▶ 목표달성률 행 (수식: 기간합계 / 목표건수)
    const pctVals2: (string | { formula: string; result: number })[] = ["목표달성률"];
    const sumRow  = ptRow.number;
    const tgtRn   = tgtRow.number;
    allDepts.forEach((_, di) => {
      const cSafe   = colLetterWide(2 + di * DEPT_COLS + 0);
      const cAccomp = colLetterWide(2 + di * DEPT_COLS + 1);
      const cRemote = colLetterWide(2 + di * DEPT_COLS + 2);
      const tgtCell = colLetterWide(2 + di * DEPT_COLS);
      // 안전+동행+원격 합계 / 목표건수
      pctVals2.push({
        formula: `IF(${tgtCell}${tgtRn}>0,(${cSafe}${sumRow}+${cAccomp}${sumRow}+${cRemote}${sumRow})/${tgtCell}${tgtRn},0)`,
        result: WD > 0 ? deptStats[di].total / WD : 0
      });
      pctVals2.push(""); // 동행 열
      pctVals2.push(""); // 원격 열
    });
    // 전체 달성률: 기간합계 마지막 열 / 전체 목표건수
    const sumTotal = deptStats.reduce((a, s) => a + s.total, 0);
    pctVals2.push({
      formula: `IF(${colLetterWide(NC2)}${tgtRn}>0,${colLetterWide(NC2)}${sumRow}/${colLetterWide(NC2)}${tgtRn},0)`,
      result: (WD * allDepts.length) > 0 ? sumTotal / (WD * allDepts.length) : 0
    });
    const prRow = ws2.addRow(pctVals2);
    prRow.height = 22;
    prRow.alignment = { horizontal:"center", vertical:"middle" };
    prRow.font = { bold:true, size:9 };
    // 달성률 셀 서식 + 색상 (부서당 첫 번째 열, 3열 병합)
    allDepts.forEach((_, di) => {
      const cell = prRow.getCell(2 + di * DEPT_COLS);
      cell.numFmt = "0%";
      const r = deptStats[di].rate;
      if (r >= 100) { applyFill(cell, "FFC6EFCE"); cell.font = { bold:true, size:9, color:{ argb:"FF006100" } }; }
      else if (r >= 70) { applyFill(cell, "FFFFEB9C"); cell.font = { bold:true, size:9, color:{ argb:"FF9C6500" } }; }
      else { applyFill(cell, "FFFFC7CE"); cell.font = { bold:true, size:9, color:{ argb:"FF9C0006" } }; }
      ws2.mergeCells(`${colLetterWide(2 + di * DEPT_COLS)}${prRow.number}:${colLetterWide(2 + di * DEPT_COLS + 2)}${prRow.number}`);
    });
    applyFill(prRow.getCell(1), "FFE8F4FD");
    const totPctCell = prRow.getCell(NC2);
    totPctCell.numFmt = "0%";
    const overallRate = (WD * allDepts.length) > 0 ? Math.round(sumTotal / (WD * allDepts.length) * 100) : 0;
    if (overallRate >= 100) { applyFill(totPctCell, "FFC6EFCE"); totPctCell.font = { bold:true, size:9, color:{ argb:"FF006100" } }; }
    else if (overallRate >= 70) { applyFill(totPctCell, "FFFFEB9C"); totPctCell.font = { bold:true, size:9, color:{ argb:"FF9C6500" } }; }
    else { applyFill(totPctCell, "FFFFC7CE"); totPctCell.font = { bold:true, size:9, color:{ argb:"FF9C0006" } }; }
    bdr2(prRow, "medium");

    ws2.views = [{ state:"frozen", xSplit:1, ySplit:4 }];

    // ══════════════════════════════════════════════════════════════
    // Sheet 3: 주차별 × 부서별 추이
    // 컬럼(9열): A=주차(병합) B=기간(병합) C=구분(부서명/소계)
    //            D=안전점검  E=동행점검  F=원격점검
    //            G=합계(수식)  H=목표건수  I=달성율(수식)
    // ══════════════════════════════════════════════════════════════
    const ws3 = wb.addWorksheet("유형별추이");
    const NC3 = 9;
    [10, 14, 18, 12, 12, 12, 12, 12, 14].forEach((w, i) => { ws3.getColumn(i+1).width = w; });

    const merge3 = (row: ExcelJS.Row) =>
      ws3.mergeCells(`A${row.number}:${colLetter(NC3)}${row.number}`);
    const bdr3 = (row: ExcelJS.Row, style: ExcelJS.BorderStyle = "thin") => {
      for (let c = 1; c <= NC3; c++)
        row.getCell(c).border = { top:{style}, left:{style}, bottom:{style}, right:{style} };
    };

    // ▶ 제목
    const t1 = ws3.addRow([`특별점검기간 주차별·부서별 유형 추이  (${PERIOD_LABEL})`]);
    merge3(t1); t1.height = 32;
    Object.assign(t1.getCell(1), {
      font: { bold:true, size:13, color:{ argb:"FFFFFFFF" } },
      fill: { type:"pattern", pattern:"solid", fgColor:{ argb:"FF1F3864" } },
      alignment: { horizontal:"center", vertical:"middle" },
    });

    // ▶ 헤더
    const t2 = ws3.addRow(["주차", "기간", "구분", "안전점검", "동행점검", "원격점검", "합계", "목표건수", "목표대비\n점검율"]);
    t2.height = 30;
    t2.font = { bold:true, color:{ argb:"FFFFFFFF" }, size:10 };
    t2.fill = { type:"pattern", pattern:"solid", fgColor:{ argb:"FF1F3864" } };
    t2.alignment = { horizontal:"center", vertical:"middle", wrapText:true };
    applyFill(t2.getCell(4), "FF1A3C6E"); // 안전
    applyFill(t2.getCell(5), "FF14532D"); // 동행
    applyFill(t2.getCell(6), "FF3B0764"); // 원격
    bdr3(t2, "medium");

    // ▶ 주별 집계
    const weeks: { label: string; days: string[] }[] = [];
    let wkStart = new Date(PERIOD_START + "T00:00:00");
    while (wkStart.getDay() !== 1) wkStart.setDate(wkStart.getDate() - 1);
    while (wkStart <= endD) {
      const wkEndD = new Date(wkStart); wkEndD.setDate(wkStart.getDate() + 4);
      const label = `${format(wkStart,"M/d")}~${format(wkEndD,"M/d")}`;
      const days: string[] = [];
      for (let d = new Date(wkStart); d <= wkEndD; d.setDate(d.getDate() + 1)) {
        const s = format(d, "yyyy-MM-dd");
        if (s >= PERIOD_START && s <= PERIOD_END && d.getDay() !== 0 && d.getDay() !== 6) days.push(s);
      }
      if (days.length > 0) weeks.push({ label, days });
      wkStart.setDate(wkStart.getDate() + 7);
    }

    // 주차별 소계 행 번호 모음 (전체합계 SUM 수식용)
    const subTotRowNums: number[] = [];

    weeks.forEach((wk, wi) => {
      const wkBg = wi % 2 === 0 ? "FFEEF2F7" : "FFF8F9FA";
      const deptRowStart = ws3.rowCount + 1;

      // ── 부서별 행 ──────────────────────────────────
      allDepts.forEach((dept, di) => {
        const safe   = periodInsp.filter(i => wk.days.includes(i.inspectionDate) && matchDept(i, dept) && i.inspectionType === "안전점검").length;
        const accomp = periodInsp.filter(i => wk.days.includes(i.inspectionDate) && matchDept(i, dept) && i.inspectionType === "동행점검").length;
        const remote = periodInsp.filter(i => wk.days.includes(i.inspectionDate) && matchDept(i, dept) && i.inspectionType === "원격점검").length;
        const deptTgt = wk.days.length; // 부서별 목표: 영업일수
        const rn = ws3.rowCount + 1;

        const dr = ws3.addRow([
          wi === 0 || true ? `${wi+1}주차` : "", // A 나중에 병합
          wk.label,                               // B 나중에 병합
          dept,                                   // C: 구분
          safe,                                   // D: 안전
          accomp,                                 // E: 동행
          remote,                                 // F: 원격
          { formula: `D${rn}+E${rn}+F${rn}` },  // G: 합계
          deptTgt,                                // H: 목표건수
          { formula: `IF(H${rn}>0,G${rn}/H${rn},0)`, result: deptTgt > 0 ? (safe+accomp+remote)/deptTgt : 0 }, // I: 달성율
        ]);
        dr.height = 20;
        dr.alignment = { horizontal:"center", vertical:"middle" };
        dr.getCell(3).alignment = { horizontal:"left", vertical:"middle", indent:1 };
        dr.getCell(3).font = { size:9 };

        // 교대 배경 (주차 단위)
        [1, 2, 3, 8].forEach(c => applyFill(dr.getCell(c), wkBg));

        // 유형별 색
        applyFill(dr.getCell(4), "FFE8F0FE");
        dr.getCell(4).font = { size:9, color:{ argb:"FF1A3C6E" }, bold: safe > 0 };
        applyFill(dr.getCell(5), "FFE6F4EA");
        dr.getCell(5).font = { size:9, color:{ argb:"FF137333" }, bold: accomp > 0 };
        applyFill(dr.getCell(6), "FFF3E8FD");
        dr.getCell(6).font = { size:9, color:{ argb:"FF6A0DAD" }, bold: remote > 0 };
        applyFill(dr.getCell(7), "FFE8F0FE");
        dr.getCell(7).font = { bold:true, size:9, color:{ argb:"FF1A3C6E" } };

        // 달성율 색
        dr.getCell(9).numFmt = "0%";
        const ratePct = deptTgt > 0 ? Math.round((safe+accomp+remote)/deptTgt*100) : 0;
        applyFill(dr.getCell(9), ratePct>=100?"FFC6EFCE": ratePct>=70?"FFFFEB9C":"FFFFC7CE");
        dr.getCell(9).font = { bold:true, size:9, color:{ argb: ratePct>=100?"FF006100": ratePct>=70?"FF9C6500":"FF9C0006" } };

        bdr3(dr);
      });

      const deptRowEnd = ws3.rowCount;

      // ── 주차 소계 행 ──────────────────────────────
      const subRn = ws3.rowCount + 1;
      const subRow = ws3.addRow([
        "",
        "",
        "소  계",
        { formula: `SUM(D${deptRowStart}:D${deptRowEnd})` },
        { formula: `SUM(E${deptRowStart}:E${deptRowEnd})` },
        { formula: `SUM(F${deptRowStart}:F${deptRowEnd})` },
        { formula: `D${subRn}+E${subRn}+F${subRn}` },
        wk.days.length * allDepts.length,
        { formula: `IF(H${subRn}>0,G${subRn}/H${subRn},0)`, result: 0 },
      ]);
      subRow.height = 22;
      subRow.alignment = { horizontal:"center", vertical:"middle" };
      subRow.font = { bold:true, size:10 };
      subRow.getCell(3).alignment = { horizontal:"center", vertical:"middle" };
      for (let c = 1; c <= NC3; c++) applyFill(subRow.getCell(c), "FFD9E1F2");
      subRow.getCell(9).numFmt = "0%";
      const subRate = wk.days.length * allDepts.length > 0
        ? Math.round(periodInsp.filter(i => wk.days.includes(i.inspectionDate)).length / (wk.days.length * allDepts.length) * 100) : 0;
      applyFill(subRow.getCell(9), subRate>=100?"FFC6EFCE": subRate>=70?"FFFFEB9C":"FFFFC7CE");
      subRow.getCell(9).font = { bold:true, size:10, color:{ argb: subRate>=100?"FF006100": subRate>=70?"FF9C6500":"FF9C0006" } };
      bdr3(subRow, "medium");
      subTotRowNums.push(subRn);

      // ── 주차/기간 A·B 병합 (부서행 + 소계행) ──────
      const mergeStart = deptRowStart;
      const mergeEnd   = subRn;
      ws3.mergeCells(`A${mergeStart}:A${mergeEnd}`);
      ws3.mergeCells(`B${mergeStart}:B${mergeEnd}`);
      const aCell = ws3.getCell(`A${mergeStart}`);
      aCell.value = `${wi+1}주차`;
      aCell.alignment = { horizontal:"center", vertical:"middle" };
      aCell.font = { bold:true, size:10 };
      applyFill(aCell, "FF1F3864");
      aCell.font = { bold:true, size:10, color:{ argb:"FFFFFFFF" } };
      const bCell = ws3.getCell(`B${mergeStart}`);
      bCell.value = wk.label;
      bCell.alignment = { horizontal:"center", vertical:"middle" };
      bCell.font = { bold:true, size:9 };
      applyFill(bCell, wkBg);
    });

    // ▶ 전체 합계 행 (소계 행들의 SUM)
    const grandRn = ws3.rowCount + 1;
    const grandSumD = subTotRowNums.map(r => `D${r}`).join("+");
    const grandSumE = subTotRowNums.map(r => `E${r}`).join("+");
    const grandSumF = subTotRowNums.map(r => `F${r}`).join("+");
    const grandTot = ws3.addRow([
      "전체",
      `${PERIOD_START.slice(5)}~${PERIOD_END.slice(5)}`,
      "전체합계",
      { formula: grandSumD },
      { formula: grandSumE },
      { formula: grandSumF },
      { formula: `D${grandRn}+E${grandRn}+F${grandRn}` },
      WD * allDepts.length,
      { formula: `IF(H${grandRn}>0,G${grandRn}/H${grandRn},0)`, result: 0 },
    ]);
    grandTot.getCell(9).numFmt = "0%";
    grandTot.font = { bold:true, size:11 };
    grandTot.height = 28;
    grandTot.alignment = { horizontal:"center", vertical:"middle" };
    grandTot.getCell(3).alignment = { horizontal:"center", vertical:"middle" };
    for (let c = 1; c <= NC3; c++) applyFill(grandTot.getCell(c), "FF1F3864");
    grandTot.font = { bold:true, size:11, color:{ argb:"FFFFFFFF" } };
    const grandRateVal = (WD * allDepts.length) > 0
      ? Math.round(periodInsp.length / (WD * allDepts.length) * 100) : 0;
    applyFill(grandTot.getCell(9), grandRateVal>=100?"FF1D8348": grandRateVal>=70?"FFB8860B":"FFC0392B");
    grandTot.getCell(9).font = { bold:true, size:11, color:{ argb:"FFFFFFFF" } };
    bdr3(grandTot, "medium");

    ws3.views = [{ state:"frozen", xSplit:3, ySplit:2 }];

    // ━━ 다운로드 ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
    const buf  = await wb.xlsx.writeBuffer();
    const blob = new Blob([buf], { type:"application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" });
    const url  = URL.createObjectURL(blob);
    const a    = document.createElement("a");
    a.href = url;
    a.download = `특별안전점검_종합현황_${format(new Date(), "yyyyMMdd")}.xlsx`;
    a.click();
    URL.revokeObjectURL(url);
    toast({ title: "특별점검 종합 엑셀 다운로드 완료 ✅ (시트3개: 종합표·일자별·유형별추이)" });
  };

  const goodCount = checklist.filter(c => c.status === '양호').length;
  const poorCount = checklist.filter(c => c.status === '미흡').length;
  const totalCount = checklist.length;

  const weekEndDate = useMemo(() => {
    const d = new Date(selectedWeekStart);
    d.setDate(d.getDate() + 4); // 월요일 + 4 = 금요일
    return d;
  }, [selectedWeekStart]);

  const inspectionStats = useMemo(() => {
    if (!rawInspections || rawInspections.length === 0 || !teams) return null;
    const now = new Date();
    const currentYear = format(now, "yyyy");
    const monthStr = String(selectedMonth).padStart(2, "0");
    const targetMonth = `${currentYear}-${monthStr}`;
    const weekStart = format(selectedWeekStart, "yyyy-MM-dd");
    const weekEnd = format(weekEndDate, "yyyy-MM-dd");

    const filtered = rawInspections.filter(insp => {
      if (dashboardPeriod === "week") return insp.inspectionDate >= weekStart && insp.inspectionDate <= weekEnd;
      if (dashboardPeriod === "month") return insp.inspectionDate.startsWith(targetMonth);
      if (dashboardPeriod === "custom") return customStart && customEnd ? insp.inspectionDate >= customStart && insp.inspectionDate <= customEnd : true;
      return insp.inspectionDate.startsWith(currentYear);
    });

    const allDepts = teams.map(t => t.name);
    const safetyBujang = inspectionTargets?.safetyBujang || 0;
    const safetyTeamjang = inspectionTargets?.safetyTeamjang || 0;
    const accompanyBujang = inspectionTargets?.accompanyBujang || 0;
    const accompanyTeamjang = inspectionTargets?.accompanyTeamjang || 0;
    const multiplier = dashboardPeriod === "year" ? 12 : dashboardPeriod === "week" ? 0.25 : 1;
    const safetyTotal = (safetyBujang + safetyTeamjang) * multiplier;
    const accompanyTotal = (accompanyBujang + accompanyTeamjang) * multiplier;

    const deptMap = new Map<string, { 안전점검: number; 동행점검: number; 현장경영팀: number; 본사: number; KT: number; 원격점검: number }>();
    for (const dept of allDepts) {
      deptMap.set(dept, { 안전점검: 0, 동행점검: 0, 현장경영팀: 0, 본사: 0, KT: 0, 원격점검: 0 });
    }
    let totalSafety = 0, totalAccompany = 0, totalHQ = 0, totalHQ2 = 0, totalKT = 0, totalRemote = 0;
    for (const insp of filtered) {
      const matchedDept = allDepts.find(d => insp.title.startsWith(d) || (insp.department || "").startsWith(d));
      const entry = matchedDept ? deptMap.get(matchedDept) : null;
      if (insp.inspectionType === "동행점검") { totalAccompany++; if (entry) entry.동행점검++; }
      else if (insp.inspectionType === "현장경영팀 점검") { totalHQ++; if (entry) entry.현장경영팀++; }
      else if (insp.inspectionType === "본사 점검") { totalHQ2++; if (entry) entry.본사++; }
      else if (insp.inspectionType === "KT 점검") { totalKT++; if (entry) entry.KT++; }
      else if (insp.inspectionType === "원격점검") { totalRemote++; if (entry) entry.원격점검++; }
      else { totalSafety++; if (entry) entry.안전점검++; }
    }

    const numDepts = allDepts.length || 1;
    const safetyPerDept = safetyTotal / numDepts;
    const accompanyPerDept = accompanyTotal / numDepts;
    const combinedPerDept = safetyPerDept + accompanyPerDept;

    const chartData = allDepts.map(dept => {
      const s = deptMap.get(dept)!;
      const shortName = dept.replace("운용팀", "").replace("팀", "");
      const total = s.안전점검 + s.동행점검 + s.현장경영팀 + s.본사 + s.KT + s.원격점검;
      const pct = combinedPerDept > 0 ? Math.round(total / combinedPerDept * 100) : null;
      return { name: shortName, 안전점검: s.안전점검, 동행점검: s.동행점검, 현장경영팀: s.현장경영팀, 본사: s.본사, KT: s.KT, 원격점검: s.원격점검, 진행율: pct };
    });

    const totalTarget = inspectionTargets?.totalTarget || 0;
    return {
      total: filtered.length,
      totalSafety, totalAccompany, totalHQ, totalHQ2, totalKT, totalRemote,
      safetyBujang, safetyTeamjang, accompanyBujang, accompanyTeamjang,
      safetyTotal, accompanyTotal, safetyPerDept, accompanyPerDept, combinedPerDept,
      totalTarget,
      chartData,
      periodLabel: dashboardPeriod === "week"
        ? `${format(selectedWeekStart, "M/d")}~${format(weekEndDate, "M/d")}`
        : dashboardPeriod === "month" ? `${selectedMonth}월`
        : dashboardPeriod === "custom" ? `${customStart}~${customEnd}`
        : `${now.getFullYear()}년`,
    };
  }, [rawInspections, teams, inspectionTargets, dashboardPeriod, selectedMonth, selectedWeekStart, weekEndDate, customStart, customEnd]);

  // ── 점검 진행율 탭: 부서별 월목표 (annualProgressStats보다 먼저 선언) ──────
  const [showDeptTargetDialog, setShowDeptTargetDialog] = useState(false);
  const [deptMonthlyTargets, setDeptMonthlyTargets] = useState<Record<string, number>>(() => {
    try { const s = localStorage.getItem('inspDeptMonthlyTargets'); return s ? JSON.parse(s) : {}; } catch { return {}; }
  });
  const updateDeptMonthlyTarget = (dept: string, val: number) => {
    setDeptMonthlyTargets(prev => {
      const next = { ...prev, [dept]: val };
      localStorage.setItem('inspDeptMonthlyTargets', JSON.stringify(next));
      return next;
    });
  };

  // ── 업로드 행 (annualProgressStats useMemo보다 먼저 선언) ──────────────────
  interface UploadedInspRow { id: string; method: string; date: string; inspector: string; org: string; team: string; result: string; }
  const [uploadedInspRows, setUploadedInspRows] = useState<UploadedInspRow[]>([]);

  const TEAM_MERGE: Record<string, string> = {
    "대구본부": "현장경영팀",
    "동대구운용부": "현장경영팀",
    "서대구운용부": "현장경영팀",
    "사업지원팀": "동대구운용팀",
  };
  const normalizeUploadTeam = (team: string) => TEAM_MERGE[team] ?? team;

  // 팀 표시 순서 (전역 고정)
  const TEAM_ORDER = ["동대구운용팀","포항운용팀","안동운용팀","서대구운용팀","남대구운용팀","구미운용팀","문경운용팀","현장경영팀"];
  const teamOrderKey = (name: string) => { const i = TEAM_ORDER.indexOf(name); return i >= 0 ? i : TEAM_ORDER.length; };

  // ISO 주차 키 반환 ("YYYY-WNN")
  const getISOWeekKey = (dateStr: string): string => {
    const d = new Date(dateStr.slice(0, 10));
    if (isNaN(d.getTime())) return "";
    const day = (d.getDay() + 6) % 7; // Mon=0
    const thu = new Date(d); thu.setDate(d.getDate() - day + 3);
    const firstThu = new Date(thu.getFullYear(), 0, 4);
    const wn = 1 + Math.round((thu.getTime() - firstThu.getTime()) / 604800000);
    return `${thu.getFullYear()}-W${String(wn).padStart(2, "0")}`;
  };

  // ── 12월까지 연간 목표 대비 진행률 (부서별 잔여 포함) ───────────────────────
  const annualProgressStats = useMemo(() => {
    if (!rawInspections || !teams) return null;
    const now = new Date();
    const currentYear = format(now, 'yyyy');

    // 전체 실적: 업로드 파일 우선, 없으면 DB 올해 데이터
    const doneThisYear = uploadedInspRows.length > 0
      ? uploadedInspRows.length
      : rawInspections.filter(i => i.inspectionDate.startsWith(currentYear)).length;

    // 부서별 월목표 입력값 우선 사용, 없으면 전역 설정으로 균등 분배
    // 현장경영팀은 teams DB에 없을 수 있으므로 항상 포함
    const EXTRA_DEPTS = ["현장경영팀"];
    const allDepts = [...new Set([...teams.map(t => t.name), ...EXTRA_DEPTS])]
      .sort((a, b) => teamOrderKey(a) - teamOrderKey(b));
    const hasDeptTargets = allDepts.some(d => (deptMonthlyTargets[d] || 0) > 0);

    let annualTarget: number;
    let deptAnnualTargetMap: Record<string, number>;

    if (hasDeptTargets) {
      deptAnnualTargetMap = Object.fromEntries(
        allDepts.map(d => [d, (deptMonthlyTargets[d] || 0) * 12])
      );
      annualTarget = Object.values(deptAnnualTargetMap).reduce((a, b) => a + b, 0);
    } else {
      const numDepts = allDepts.length || 1;
      const monthlyBase = (inspectionTargets?.safetyBujang || 0) + (inspectionTargets?.safetyTeamjang || 0)
                        + (inspectionTargets?.accompanyBujang || 0) + (inspectionTargets?.accompanyTeamjang || 0);
      annualTarget = (inspectionTargets?.totalTarget && inspectionTargets.totalTarget > 0)
        ? inspectionTargets.totalTarget
        : monthlyBase * 12;
      const perDept = annualTarget / numDepts;
      deptAnnualTargetMap = Object.fromEntries(allDepts.map(d => [d, perDept]));
    }

    if (annualTarget <= 0) return null;

    // 12월 31일까지 남은 기간
    const yearEnd = new Date(now.getFullYear(), 11, 31);
    const msRemaining = Math.max(0, yearEnd.getTime() - now.getTime());
    const weeksRemaining = Math.max(1, msRemaining / (7 * 24 * 60 * 60 * 1000));
    const monthsRemaining = Math.max(0.5, msRemaining / (30.44 * 24 * 60 * 60 * 1000));

    // 부서별 집계: 업로드 파일 우선, 없으면 DB 데이터
    const deptDone = new Map<string, number>();
    for (const dept of allDepts) deptDone.set(dept, 0);

    if (uploadedInspRows.length > 0) {
      for (const r of uploadedInspRows) {
        const team = TEAM_MERGE[r.team] ?? r.team;
        if (deptDone.has(team)) deptDone.set(team, (deptDone.get(team) || 0) + 1);
      }
    } else {
      const yearInspections = rawInspections.filter(i => i.inspectionDate.startsWith(currentYear));
      for (const insp of yearInspections) {
        const matchedDept = allDepts.find(d =>
          insp.title.startsWith(d) || ((insp as any).department || '').startsWith(d)
        );
        if (matchedDept) deptDone.set(matchedDept, (deptDone.get(matchedDept) || 0) + 1);
      }
    }

    const deptStats = allDepts.map(dept => {
      const done = deptDone.get(dept) || 0;
      const target = Math.round(deptAnnualTargetMap[dept] || 0);
      const remaining = Math.max(0, target - done);
      const weeklyNeed = remaining > 0 ? remaining / weeksRemaining : 0;
      const monthlyNeed = remaining > 0 ? remaining / monthsRemaining : 0;
      return {
        dept,
        done, target, remaining, weeklyNeed, monthlyNeed,
        monthlyTarget: deptMonthlyTargets[dept] || 0,
      };
    }).sort((a, b) => teamOrderKey(a.dept) - teamOrderKey(b.dept));

    const totalRemaining = Math.max(0, annualTarget - doneThisYear);
    const pct = Math.min(100, Math.round(doneThisYear / annualTarget * 100));

    return {
      doneThisYear, annualTarget, totalRemaining, pct,
      weeksRemaining: Math.ceil(weeksRemaining),
      monthsRemaining: Math.ceil(monthsRemaining),
      weeklyNeedTotal: totalRemaining > 0 ? totalRemaining / weeksRemaining : 0,
      monthlyNeedTotal: totalRemaining > 0 ? totalRemaining / monthsRemaining : 0,
      deptStats, hasDeptTargets,
    };
  }, [rawInspections, teams, inspectionTargets, deptMonthlyTargets, uploadedInspRows]);

  const filteredInspections = useMemo(() => {
    if (!rawInspections) return [];
    const currentYear = format(new Date(), "yyyy");
    let result: typeof rawInspections;
    if (dashboardPeriod === "year") {
      result = rawInspections.filter(i => i.inspectionDate.startsWith(currentYear));
    } else if (dashboardPeriod === "week") {
      const weekStart = format(selectedWeekStart, "yyyy-MM-dd");
      const weekEnd = format(weekEndDate, "yyyy-MM-dd");
      result = rawInspections.filter(i => i.inspectionDate >= weekStart && i.inspectionDate <= weekEnd);
    } else if (dashboardPeriod === "custom") {
      result = customStart && customEnd
        ? rawInspections.filter(i => i.inspectionDate >= customStart && i.inspectionDate <= customEnd)
        : rawInspections;
    } else {
      const monthStr = String(selectedMonth).padStart(2, "0");
      const prefix = `${currentYear}-${monthStr}`;
      result = rawInspections.filter(i => i.inspectionDate.startsWith(prefix));
    }
    return [...result].sort((a, b) => b.inspectionDate.localeCompare(a.inspectionDate));
  }, [rawInspections, selectedMonth, dashboardPeriod, selectedWeekStart, weekEndDate, customStart, customEnd]);

  const [showInspDashboard, setShowInspDashboard] = useState(true);

  const [activeTab, setActiveTab] = useState<"자체" | "진행율">("자체");
  const [chartView, setChartView] = useState<"팀별" | "월별" | "주별">("팀별");
  const [monthChartMode, setMonthChartMode] = useState<"합계" | "팀별">("합계");

  // ── 점검 진행율 탭: 업로드 파일 데이터 ─────────────────────────────────────
  const [uploadedFileName, setUploadedFileName] = useState<string>("");
  const uploadedInspFileRef = useRef<HTMLInputElement>(null);

  const handleUploadedInspFile = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setUploadedFileName(file.name);
    const reader = new FileReader();
    reader.onload = (ev) => {
      const data = new Uint8Array(ev.target?.result as ArrayBuffer);
      const wb = XLSX.read(data, { type: "array" });
      const ws = wb.Sheets[wb.SheetNames[0]];
      const raw: any[][] = XLSX.utils.sheet_to_json(ws, { header: 1 });
      // 헤더 제거 후 파싱 (컬럼: 0=ID,3=방법,4=일시,5=점검자,6=수행조직,21=결과)
      const rows: UploadedInspRow[] = raw.slice(1)
        .filter(r => r[4])  // 날짜 있는 행만
        .map(r => {
          const org = String(r[6] || "");
          const team = org.includes(">") ? org.split(">").pop()!.trim() : org.trim();
          return {
            id: String(r[0] || ""),
            method: String(r[3] || ""),
            date: String(r[4] || ""),
            inspector: String(r[5] || ""),
            org,
            team,
            result: String(r[21] || ""),
          };
        })
        .filter(r => r.team);
      setUploadedInspRows(rows);
    };
    reader.readAsArrayBuffer(file);
    e.target.value = "";
  };

  // 대구본부·동대구운용부·서대구운용부 → 현장경영팀으로 합산
  const uploadedInspStats = useMemo(() => {
    if (!uploadedInspRows.length) return null;
    const byTeam: Record<string, number> = {};
    const byMonth: Record<string, number> = {};
    const byMonthByTeam: Record<string, Record<string, number>> = {};
    const byWeek: Record<string, number> = {};
    const byResult: Record<string, number> = {};
    for (const r of uploadedInspRows) {
      const team = normalizeUploadTeam(r.team);
      byTeam[team] = (byTeam[team] || 0) + 1;
      const month = r.date.slice(0, 7);
      if (month) {
        byMonth[month] = (byMonth[month] || 0) + 1;
        if (!byMonthByTeam[month]) byMonthByTeam[month] = {};
        byMonthByTeam[month][team] = (byMonthByTeam[month][team] || 0) + 1;
      }
      const wk = getISOWeekKey(r.date);
      if (wk) byWeek[wk] = (byWeek[wk] || 0) + 1;
      const res = r.result || "미기재";
      byResult[res] = (byResult[res] || 0) + 1;
    }
    const sortedMonths = Object.entries(byMonth).sort((a, b) => a[0].localeCompare(b[0]));
    const sortedWeeks  = Object.entries(byWeek).sort((a, b) => a[0].localeCompare(b[0]));
    const sortedTeams  = Object.entries(byTeam).sort((a, b) => teamOrderKey(a[0]) - teamOrderKey(b[0]));
    const maxTeam  = Math.max(...Object.values(byTeam));
    const maxMonth = Math.max(...Object.values(byMonth));
    const maxWeek  = sortedWeeks.length ? Math.max(...Object.values(byWeek)) : 1;
    // 주간 목표: 총 월목표 합계 / 4.33
    const totalMonthly = Object.values(deptMonthlyTargets).reduce((s, v) => s + v, 0);
    const weeklyTargetTotal = totalMonthly > 0 ? Math.round(totalMonthly / 4.33) : 0;
    return { total: uploadedInspRows.length, byTeam, byMonth, byMonthByTeam, byWeek, byResult, sortedMonths, sortedWeeks, sortedTeams, maxTeam, maxMonth, maxWeek, weeklyTargetTotal };
  }, [uploadedInspRows, deptMonthlyTargets]);

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
                <DropdownMenu>
                  <DropdownMenuTrigger asChild>
                    <Button variant="outline" disabled={!inspections || inspections.length === 0} className="gap-2" data-testid="button-excel-download">
                      <Download className="w-4 h-4" />
                      엑셀 다운로드
                      <ChevronDown className="w-3 h-3" />
                    </Button>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent align="end" className="w-60">
                    <DropdownMenuItem onClick={() => handleExcelDownload(true)} data-testid="button-excel-with-photos">
                      <Download className="w-4 h-4 mr-2 text-blue-500" />
                      <div>
                        <div className="font-medium">사진 포함 다운로드</div>
                        <div className="text-xs text-muted-foreground">압축 이미지 삽입 (느림)</div>
                      </div>
                    </DropdownMenuItem>
                    <DropdownMenuSeparator />
                    <DropdownMenuItem onClick={() => handleExcelDownload(false)} data-testid="button-excel-no-photos">
                      <ImageOff className="w-4 h-4 mr-2 text-green-500" />
                      <div>
                        <div className="font-medium">빠른 다운로드</div>
                        <div className="text-xs text-muted-foreground">사진 제외, 즉시 완료</div>
                      </div>
                    </DropdownMenuItem>
                    <DropdownMenuSeparator />
                    <DropdownMenuItem onClick={() => setShowReportDialog(true)}>
                      <BarChart3 className="w-4 h-4 mr-2 text-red-500" />
                      <div>
                        <div className="font-medium text-red-600">기간별 보고서 다운로드</div>
                        <div className="text-xs text-muted-foreground">기간 선택 → 종합표·일자별·추이 엑셀</div>
                      </div>
                    </DropdownMenuItem>
                  </DropdownMenuContent>
                </DropdownMenu>
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
        <button
          onClick={() => setActiveTab("진행율")}
          className={`px-4 py-2 text-sm font-semibold border-b-2 transition-colors flex items-center gap-1.5 ${activeTab === "진행율" ? "border-indigo-500 text-indigo-600 dark:text-indigo-400" : "border-transparent text-muted-foreground hover:text-foreground"}`}
          data-testid="tab-progress"
        >
          <TrendingUp className="w-3.5 h-3.5" />
          점검 진행율
        </button>
      </div>

      {inspectionStats && activeTab === "자체" && (
        <Card>
          <CardHeader
            className="bg-gradient-to-r from-slate-50 to-blue-50 dark:from-slate-900/40 dark:to-blue-900/20 border-b p-3 sm:p-4 cursor-pointer"
            onClick={() => { if (activeTab !== "진행율") setShowInspDashboard(!showInspDashboard); }}
            data-testid="button-toggle-dashboard"
            style={activeTab === "진행율" ? { cursor: "default" } : undefined}
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
                {activeTab !== "진행율" && (showInspDashboard ? <ChevronUp className="w-4 h-4 text-muted-foreground" /> : <ChevronDown className="w-4 h-4 text-muted-foreground" />)}
              </div>
            </CardTitle>
          </CardHeader>
          <AnimatePresence>
            {(activeTab === "진행율" || showInspDashboard) && (
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
                    <Button variant={dashboardPeriod === "week" ? "default" : "outline"} size="sm" className="h-7 text-xs px-2.5"
                      onClick={(e) => { e.stopPropagation(); setDashboardPeriod("week"); }} data-testid="button-period-week">주별</Button>
                    <Button variant={dashboardPeriod === "month" ? "default" : "outline"} size="sm" className="h-7 text-xs px-2.5"
                      onClick={(e) => { e.stopPropagation(); setDashboardPeriod("month"); }} data-testid="button-period-month">월별</Button>
                    <Button variant={dashboardPeriod === "year" ? "default" : "outline"} size="sm" className="h-7 text-xs px-2.5"
                      onClick={(e) => { e.stopPropagation(); setDashboardPeriod("year"); }} data-testid="button-period-year">연간</Button>
                    <Button variant={dashboardPeriod === "custom" ? "default" : "outline"} size="sm" className="h-7 text-xs px-2.5"
                      onClick={(e) => { e.stopPropagation(); setDashboardPeriod("custom"); }} data-testid="button-period-custom">기간별</Button>
                    {dashboardPeriod === "week" && (
                      <div className="flex items-center gap-0.5">
                        <Button variant="outline" size="sm" className="h-7 w-7 p-0"
                          onClick={(e) => { e.stopPropagation(); setSelectedWeekStart(prev => { const d = new Date(prev); d.setDate(d.getDate() - 7); return d; }); }}
                          data-testid="button-week-prev">
                          <ChevronLeft className="w-3 h-3" />
                        </Button>
                        <span className="text-xs font-medium px-1 min-w-[80px] text-center">
                          {format(selectedWeekStart, "M/d")}~{format(weekEndDate, "M/d")}
                        </span>
                        <Button variant="outline" size="sm" className="h-7 w-7 p-0"
                          onClick={(e) => { e.stopPropagation(); setSelectedWeekStart(prev => { const d = new Date(prev); d.setDate(d.getDate() + 7); return d; }); }}
                          data-testid="button-week-next">
                          <ChevronRight className="w-3 h-3" />
                        </Button>
                      </div>
                    )}
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
                    {dashboardPeriod === "custom" && (
                      <div className="flex items-center gap-1.5 flex-wrap" onClick={(e) => e.stopPropagation()}>
                        <input
                          type="date"
                          value={customStart}
                          onChange={(e) => setCustomStart(e.target.value)}
                          className="h-7 text-xs px-2 border border-input rounded-md bg-background text-foreground focus:outline-none focus:ring-1 focus:ring-ring"
                          data-testid="input-custom-start"
                        />
                        <span className="text-xs text-muted-foreground font-medium">~</span>
                        <input
                          type="date"
                          value={customEnd}
                          min={customStart}
                          onChange={(e) => setCustomEnd(e.target.value)}
                          className="h-7 text-xs px-2 border border-input rounded-md bg-background text-foreground focus:outline-none focus:ring-1 focus:ring-ring"
                          data-testid="input-custom-end"
                        />
                      </div>
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

                    {/* 원격점검 */}
                    <div className="rounded-xl p-3 bg-gradient-to-br from-pink-50 to-rose-50 dark:from-pink-950/40 dark:to-rose-950/20 border border-pink-100 dark:border-pink-900/30">
                      <p className="text-[11px] font-semibold text-pink-600 dark:text-pink-400 mb-1">🖥 원격점검</p>
                      <p className="text-2xl font-black text-pink-700 dark:text-pink-300" data-testid="text-remote-count">
                        {inspectionStats.totalRemote}<span className="text-xs font-normal ml-0.5">건</span>
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
                          <Bar dataKey="KT" stackId="a" fill="#0ea5e9" radius={[0,0,0,0]}>
                            <LabelList dataKey="KT" position="inside" style={{ fontSize: 9, fontWeight: 700, fill: "#fff" }} formatter={(v: number) => v > 0 ? v : ""} />
                          </Bar>
                          <Bar dataKey="원격점검" stackId="a" fill="#ec4899" radius={[4,4,0,0]}>
                            <LabelList dataKey="원격점검" position="inside" style={{ fontSize: 9, fontWeight: 700, fill: "#fff" }} formatter={(v: number) => v > 0 ? v : ""} />
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

      {/* ── 점검 진행율 탭 ── */}
      {activeTab === "진행율" && (
        <div className="space-y-4">
          {/* 파일 업로드 영역 */}
          <div className="border border-dashed border-indigo-300 dark:border-indigo-700 rounded-xl p-4 flex items-center justify-between gap-3 bg-indigo-50/40 dark:bg-indigo-950/20">
            <div className="flex items-center gap-2 min-w-0">
              <FileText className="w-4 h-4 text-indigo-500 shrink-0" />
              {uploadedFileName ? (
                <span className="text-xs font-medium text-foreground truncate">{uploadedFileName}</span>
              ) : (
                <span className="text-xs text-muted-foreground">xlsx / xls 파일을 업로드하면 팀별·월별 진행율을 분석합니다</span>
              )}
            </div>
            <Button size="sm" variant="outline" className="h-7 text-xs shrink-0 gap-1 border-indigo-300 text-indigo-700 hover:bg-indigo-50 dark:border-indigo-700 dark:text-indigo-400"
              onClick={() => uploadedInspFileRef.current?.click()}>
              <Upload className="w-3.5 h-3.5" />
              {uploadedFileName ? "파일 변경" : "파일 업로드"}
            </Button>
            <input ref={uploadedInspFileRef} type="file" accept=".xlsx,.xls,.csv" className="hidden" onChange={handleUploadedInspFile} />
          </div>

          {/* 월목표 설정 버튼 */}
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              {annualProgressStats?.hasDeptTargets && (
                <span className="text-xs text-muted-foreground">
                  월 합계 <span className="font-semibold text-indigo-600">
                    {Object.values(deptMonthlyTargets).reduce((s, v) => s + v, 0)}건
                  </span> · 연간 <span className="font-semibold text-indigo-600">
                    {Object.values(deptMonthlyTargets).reduce((s, v) => s + v * 12, 0)}건
                  </span>
                </span>
              )}
            </div>
            <Button size="sm" variant="outline" className="h-8 text-xs gap-1.5 border-indigo-300 text-indigo-700 hover:bg-indigo-50 dark:border-indigo-700 dark:text-indigo-400"
              onClick={() => setShowDeptTargetDialog(true)}>
              <Settings className="w-3.5 h-3.5" />
              부서별 월목표 설정
            </Button>
          </div>

          {/* 업로드된 데이터 통계 */}
          {uploadedInspStats && (
            <div className="space-y-3">
              {/* 요약 카드 */}
              <div className="grid grid-cols-3 gap-2">
                <div className="bg-indigo-50 dark:bg-indigo-950/30 rounded-lg p-3 text-center">
                  <p className="text-2xl font-black text-indigo-700 dark:text-indigo-300">{uploadedInspStats.total}</p>
                  <p className="text-[11px] text-muted-foreground mt-0.5">총 점검</p>
                </div>
                <div className="bg-emerald-50 dark:bg-emerald-950/30 rounded-lg p-3 text-center">
                  <p className="text-2xl font-black text-emerald-700 dark:text-emerald-300">{uploadedInspStats.byResult["양호"] || 0}</p>
                  <p className="text-[11px] text-muted-foreground mt-0.5">양호</p>
                </div>
                <div className="bg-orange-50 dark:bg-orange-950/30 rounded-lg p-3 text-center">
                  <p className="text-2xl font-black text-orange-600">{uploadedInspStats.byResult["미흡"] || 0}</p>
                  <p className="text-[11px] text-muted-foreground mt-0.5">미흡</p>
                </div>
              </div>

              {/* 차트 탭 선택 */}
              <div className="border border-border rounded-xl overflow-hidden">
                {/* 탭 버튼 */}
                <div className="flex border-b border-border bg-slate-50 dark:bg-slate-900/40">
                  {(["팀별", "월별", "주별"] as const).map(v => (
                    <button
                      key={v}
                      onClick={() => setChartView(v)}
                      className={`flex-1 py-2 text-xs font-semibold transition-colors ${
                        chartView === v
                          ? "bg-white dark:bg-slate-800 text-indigo-600 border-b-2 border-indigo-500"
                          : "text-muted-foreground hover:text-foreground"
                      }`}
                    >
                      {v} 현황
                    </button>
                  ))}
                </div>

                {/* 팀별 */}
                {chartView === "팀별" && (() => {
                  const chartData = uploadedInspStats.sortedTeams.map(([team, cnt]) => {
                    const annualTarget = (deptMonthlyTargets[team] || 0) * 12;
                    const remaining = annualTarget > 0 ? Math.max(0, annualTarget - cnt) : 0;
                    const pct = annualTarget > 0 ? Math.round(cnt / annualTarget * 100) : null;
                    return {
                      team: team.replace("운용팀","").replace("현장경영팀","현장경영"),
                      fullTeam: team,
                      점검건수: cnt,
                      잔여횟수: remaining,
                      annualTarget,
                      pct,
                    };
                  });
                  const chartHeight = Math.max(240, chartData.length * 56);
                  return (
                    <div className="px-2 pt-4 pb-2">
                      <ResponsiveContainer width="100%" height={chartHeight}>
                        <BarChart data={chartData} layout="vertical" margin={{ top: 4, right: 60, left: 56, bottom: 4 }} barCategoryGap="28%">
                          <CartesianGrid strokeDasharray="3 3" horizontal={false} stroke="rgba(148,163,184,0.15)" />
                          <XAxis type="number" tick={{ fontSize: 11, fill: "#94a3b8" }} tickLine={false} axisLine={false} allowDecimals={false} />
                          <YAxis type="category" dataKey="team" tick={{ fontSize: 12, fontWeight: 700, fill: "#475569" }} tickLine={false} axisLine={false} width={56} />
                          <Tooltip
                            cursor={{ fill: "rgba(99,102,241,0.06)" }}
                            contentStyle={{ fontSize: 12, borderRadius: 8, border: "1px solid #e2e8f0", boxShadow: "0 4px 12px rgba(0,0,0,0.08)" }}
                            content={({ active, payload }) => {
                              if (!active || !payload?.length) return null;
                              const d = payload[0]?.payload;
                              return (
                                <div className="bg-white rounded-lg border border-slate-200 shadow-lg p-2.5 text-xs">
                                  <p className="font-bold text-slate-700 mb-1.5">{d.fullTeam}</p>
                                  <p className="text-indigo-600 font-semibold">점검건수: {d.점검건수}건</p>
                                  {d.annualTarget > 0 && <>
                                    <p className="text-slate-400 font-medium">잔여횟수: {d.잔여횟수}건</p>
                                    <p className="text-slate-500 mt-1">연간목표: {d.annualTarget}건
                                      {d.pct !== null && <span className={`ml-1.5 font-bold ${d.pct >= 100 ? "text-emerald-600" : d.pct >= 70 ? "text-indigo-600" : "text-orange-500"}`}>({d.pct}%)</span>}
                                    </p>
                                  </>}
                                </div>
                              );
                            }}
                          />
                          <Legend wrapperStyle={{ fontSize: 11, paddingTop: 8 }}
                            formatter={(v) => v === "점검건수" ? "점검건수 (달성)" : "잔여횟수"} />
                          <Bar dataKey="점검건수" stackId="a" radius={[0, 0, 0, 0]}>
                            {chartData.map((d, i) => (
                              <Cell key={i} fill={
                                d.pct === null ? "#6366f1"
                                : d.pct >= 100 ? "#10b981"
                                : d.pct >= 70  ? "#6366f1"
                                : "#f97316"
                              } />
                            ))}
                            <LabelList dataKey="점검건수" position="inside"
                              style={{ fontSize: 11, fill: "#fff", fontWeight: 700 }}
                              formatter={(v: number) => v > 0 ? `${v}건` : ""} />
                          </Bar>
                          <Bar dataKey="잔여횟수" stackId="a" fill="rgba(148,163,184,0.25)" radius={[0, 4, 4, 0]}>
                            <LabelList dataKey="잔여횟수" position="insideRight"
                              style={{ fontSize: 10, fill: "#94a3b8", fontWeight: 600 }}
                              formatter={(v: number) => v > 0 ? `잔여 ${v}` : ""} />
                          </Bar>
                        </BarChart>
                      </ResponsiveContainer>
                      <div className="flex justify-center gap-5 mt-1 text-[10px] text-muted-foreground">
                        <span className="flex items-center gap-1"><span className="w-2.5 h-2.5 rounded-sm bg-emerald-500 inline-block"/>100% 이상</span>
                        <span className="flex items-center gap-1"><span className="w-2.5 h-2.5 rounded-sm bg-indigo-500 inline-block"/>70% 이상</span>
                        <span className="flex items-center gap-1"><span className="w-2.5 h-2.5 rounded-sm bg-orange-400 inline-block"/>70% 미만</span>
                        <span className="flex items-center gap-1"><span className="w-2.5 h-2.5 rounded-sm bg-slate-300 inline-block"/>잔여</span>
                      </div>
                    </div>
                  );
                })()}

                {/* 월별 */}
                {chartView === "월별" && (
                  <div>
                    {/* 합계/팀별 토글 */}
                    <div className="flex border-b border-border">
                      {(["합계", "팀별"] as const).map(m => (
                        <button key={m} onClick={() => setMonthChartMode(m)}
                          className={`flex-1 py-1.5 text-[11px] font-semibold transition-colors ${
                            monthChartMode === m
                              ? "bg-white dark:bg-slate-800 text-blue-600 border-b-2 border-blue-500"
                              : "text-muted-foreground hover:text-foreground"
                          }`}>
                          {m}
                        </button>
                      ))}
                    </div>

                    {/* 합계 뷰 — 세로 막대 + 목표 기준선 */}
                    {monthChartMode === "합계" && (() => {
                      const monthlyTargetTotal = Object.values(deptMonthlyTargets).reduce((s, v) => s + v, 0);
                      const barData = uploadedInspStats.sortedMonths.map(([month, cnt]) => ({
                        month: `${parseInt(month.slice(5))}월`,
                        실적: cnt,
                      }));
                      const yMax = Math.max(uploadedInspStats.maxMonth, monthlyTargetTotal) * 1.2;
                      return (
                        <div className="px-3 pt-4 pb-2">
                          <ResponsiveContainer width="100%" height={260}>
                            <BarChart data={barData} margin={{ top: 20, right: 12, left: -10, bottom: 0 }} barCategoryGap="35%">
                              <defs>
                                <linearGradient id="barGradGreen" x1="0" y1="0" x2="0" y2="1">
                                  <stop offset="0%" stopColor="#10b981" stopOpacity={1} />
                                  <stop offset="100%" stopColor="#34d399" stopOpacity={0.7} />
                                </linearGradient>
                                <linearGradient id="barGradIndigo" x1="0" y1="0" x2="0" y2="1">
                                  <stop offset="0%" stopColor="#6366f1" stopOpacity={1} />
                                  <stop offset="100%" stopColor="#818cf8" stopOpacity={0.7} />
                                </linearGradient>
                                <linearGradient id="barGradAmber" x1="0" y1="0" x2="0" y2="1">
                                  <stop offset="0%" stopColor="#f59e0b" stopOpacity={1} />
                                  <stop offset="100%" stopColor="#fbbf24" stopOpacity={0.7} />
                                </linearGradient>
                              </defs>
                              <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f1f5f9" strokeWidth={1} />
                              <XAxis dataKey="month" tick={{ fontSize: 11, fill: "#64748b" }} axisLine={false} tickLine={false} />
                              <YAxis domain={[0, yMax]} tick={{ fontSize: 11, fill: "#64748b" }} axisLine={false} tickLine={false} allowDecimals={false} width={30} />
                              <Tooltip
                                cursor={{ fill: "rgba(99,102,241,0.06)", radius: 4 }}
                                contentStyle={{ fontSize: 12, borderRadius: 10, border: "1px solid #e2e8f0", boxShadow: "0 4px 16px rgba(0,0,0,0.08)", padding: "8px 12px" }}
                                formatter={(val: number) => [`${val}건`, "실적"]}
                                labelStyle={{ fontWeight: 700, color: "#1e293b", marginBottom: 2 }}
                              />
                              {monthlyTargetTotal > 0 && (
                                <ReferenceLine y={monthlyTargetTotal} stroke="#64748b" strokeDasharray="6 3" strokeWidth={1.5}
                                  label={{ value: `목표 ${monthlyTargetTotal}건`, position: "insideTopRight", fontSize: 10, fill: "#64748b", fontWeight: 600 }} />
                              )}
                              <Bar dataKey="실적" radius={[6, 6, 0, 0]} maxBarSize={44}>
                                {barData.map((entry, i) => {
                                  const pct = monthlyTargetTotal > 0 ? entry.실적 / monthlyTargetTotal : null;
                                  const grad = pct === null ? "url(#barGradIndigo)"
                                    : pct >= 1 ? "url(#barGradGreen)"
                                    : pct >= 0.7 ? "url(#barGradIndigo)"
                                    : "url(#barGradAmber)";
                                  return <Cell key={i} fill={grad} />;
                                })}
                                <LabelList dataKey="실적" position="top" style={{ fontSize: 10, fill: "#475569", fontWeight: 600 }} />
                              </Bar>
                            </BarChart>
                          </ResponsiveContainer>
                          {monthlyTargetTotal > 0 && (
                            <div className="flex justify-center gap-5 mt-2 text-[10px] text-muted-foreground">
                              <span className="flex items-center gap-1.5"><span className="inline-block w-2.5 h-2.5 rounded-sm bg-emerald-500" />목표 달성</span>
                              <span className="flex items-center gap-1.5"><span className="inline-block w-2.5 h-2.5 rounded-sm bg-indigo-500" />70% 이상</span>
                              <span className="flex items-center gap-1.5"><span className="inline-block w-2.5 h-2.5 rounded-sm bg-amber-400" />70% 미만</span>
                            </div>
                          )}
                        </div>
                      );
                    })()}

                    {/* 팀별 뷰 — 히트맵 테이블 */}
                    {monthChartMode === "팀별" && (() => {
                      const activeTeams = TEAM_ORDER.filter(t =>
                        Object.values(uploadedInspStats.byMonthByTeam).some(m => m[t])
                      );
                      const allVals = uploadedInspStats.sortedMonths.flatMap(([month]) =>
                        activeTeams.map(t => uploadedInspStats.byMonthByTeam[month]?.[t] ?? 0)
                      );
                      const globalMax = Math.max(...allVals, 1);
                      const abbr = (name: string) => name.replace("운용팀","").replace("현장경영팀","현장경영");
                      const cellStyle = (v: number): { bg: string; fg: string } => {
                        const r = v / globalMax;
                        if (r === 0) return { bg: "transparent", fg: "#94a3b8" };
                        if (r < 0.25) return { bg: `rgba(199,210,254,${0.4 + r * 2})`, fg: "#4338ca" };
                        if (r < 0.55) return { bg: `rgba(99,102,241,${0.45 + r * 0.7})`, fg: "#fff" };
                        return { bg: `rgba(55,48,163,${0.6 + r * 0.4})`, fg: "#fff" };
                      };
                      return (
                        <div>
                          <div className="overflow-x-auto">
                            <table className="w-full text-center border-collapse" style={{ minWidth: activeTeams.length * 54 + 52 }}>
                              <thead>
                                <tr className="border-b-2 border-indigo-100 dark:border-indigo-900/40">
                                  <th className="py-2.5 px-3 text-left text-[10px] font-bold text-muted-foreground sticky left-0 bg-white dark:bg-slate-900 z-10 w-10">월</th>
                                  {activeTeams.map(t => (
                                    <th key={t} className="py-2.5 px-1 text-[10px] font-bold text-muted-foreground whitespace-nowrap">{abbr(t)}</th>
                                  ))}
                                  <th className="py-2.5 px-3 text-[10px] font-bold text-indigo-500 whitespace-nowrap">합계</th>
                                </tr>
                              </thead>
                              <tbody>
                                {uploadedInspStats.sortedMonths.map(([month, rowTotal]) => (
                                  <tr key={month} className="border-b border-border/40 hover:bg-indigo-50/30 dark:hover:bg-indigo-950/10 transition-colors">
                                    <td className="py-1 px-3 text-left text-[11px] font-bold text-foreground sticky left-0 bg-white dark:bg-slate-900 z-10">
                                      {parseInt(month.slice(5))}월
                                    </td>
                                    {activeTeams.map(t => {
                                      const v = uploadedInspStats.byMonthByTeam[month]?.[t] ?? 0;
                                      const { bg, fg } = cellStyle(v);
                                      return (
                                        <td key={t} className="py-1 px-0.5">
                                          <div className="mx-auto rounded-lg flex items-center justify-center font-bold transition-all duration-200"
                                            style={{ background: bg, color: fg, width: 38, height: 30, fontSize: 12 }}>
                                            {v > 0 ? v : <span style={{ color: "#e2e8f0", fontSize: 8 }}>·</span>}
                                          </div>
                                        </td>
                                      );
                                    })}
                                    <td className="py-1 px-3 text-[12px] font-black text-indigo-600">{rowTotal}</td>
                                  </tr>
                                ))}
                                <tr className="border-t-2 border-indigo-200 dark:border-indigo-800">
                                  <td className="py-2 px-3 text-left text-[10px] font-bold text-muted-foreground sticky left-0 bg-indigo-50 dark:bg-indigo-950/20 z-10">합계</td>
                                  {activeTeams.map(t => {
                                    const tot = uploadedInspStats.sortedMonths.reduce((s,[m]) => s + (uploadedInspStats.byMonthByTeam[m]?.[t] ?? 0), 0);
                                    return <td key={t} className="py-2 px-0.5 text-[12px] font-black text-indigo-600 bg-indigo-50 dark:bg-indigo-950/20">{tot || ""}</td>;
                                  })}
                                  <td className="py-2 px-3 text-[12px] font-black text-indigo-700 bg-indigo-50 dark:bg-indigo-950/20">{uploadedInspStats.total}</td>
                                </tr>
                              </tbody>
                            </table>
                          </div>
                          <div className="flex items-center justify-end gap-1 px-3 py-2">
                            <span className="text-[10px] text-muted-foreground mr-0.5">적음</span>
                            {[0.15,0.35,0.55,0.75,0.95].map((r, i) => (
                              <div key={i} className="w-4 h-4 rounded" style={{
                                background: r < 0.25 ? `rgba(199,210,254,${0.4+r*2})`
                                  : r < 0.55 ? `rgba(99,102,241,${0.45+r*0.7})`
                                  : `rgba(55,48,163,${0.6+r*0.4})`
                              }} />
                            ))}
                            <span className="text-[10px] text-muted-foreground ml-0.5">많음</span>
                          </div>
                        </div>
                      );
                    })()}
                  </div>
                )}

                {/* 주별 */}
                {chartView === "주별" && (
                  <div className="divide-y divide-border">
                    {uploadedInspStats.weeklyTargetTotal > 0 && (
                      <div className="px-3 py-1.5 bg-slate-50/50 dark:bg-slate-900/20 flex justify-end">
                        <span className="text-[10px] text-muted-foreground">주간 목표 {uploadedInspStats.weeklyTargetTotal}건</span>
                      </div>
                    )}
                    {uploadedInspStats.sortedWeeks.length === 0 ? (
                      <p className="text-xs text-muted-foreground text-center py-6">주별 데이터 없음</p>
                    ) : uploadedInspStats.sortedWeeks.map(([wk, cnt]) => {
                      const wt = uploadedInspStats.weeklyTargetTotal;
                      const pct = wt > 0 ? Math.round(cnt / wt * 100) : null;
                      const barWidth = wt > 0
                        ? Math.min(100, (cnt / wt) * 100)
                        : (cnt / uploadedInspStats.maxWeek) * 100;
                      const barColor = pct === null ? "bg-violet-400"
                        : pct >= 100 ? "bg-emerald-500"
                        : pct >= 70 ? "bg-violet-500"
                        : "bg-orange-400";
                      const [wy, wn] = wk.split("-W");
                      const weekNum = parseInt(wn || "0");
                      // ISO week → 월요일 날짜 계산
                      const jan4 = new Date(parseInt(wy), 0, 4);
                      const mon1 = new Date(jan4); mon1.setDate(jan4.getDate() - ((jan4.getDay() + 6) % 7));
                      const monDate = new Date(mon1); monDate.setDate(mon1.getDate() + (weekNum - 1) * 7);
                      const friDate = new Date(monDate); friDate.setDate(monDate.getDate() + 4);
                      const fmt = (d: Date) => `${d.getMonth() + 1}/${d.getDate()}`;
                      const weekLabel = weekNum ? `${weekNum}주차` : wk;
                      const weekRange = weekNum ? `${fmt(monDate)}~${fmt(friDate)}` : "";
                      return (
                        <div key={wk} className="flex items-center gap-2 px-3 py-1.5">
                          <div className="w-24 shrink-0">
                            <span className="text-xs font-medium text-foreground block">{weekLabel}</span>
                            {weekRange && <span className="text-[10px] text-muted-foreground">{weekRange}</span>}
                          </div>
                          <div className="flex-1 h-2 bg-muted rounded-full overflow-hidden">
                            <div className={`h-full ${barColor} rounded-full transition-all`} style={{ width: `${barWidth}%` }} />
                          </div>
                          <span className="text-xs font-bold text-violet-600 w-16 text-right shrink-0">
                            {cnt}{wt > 0 ? `/${wt}` : ""}
                          </span>
                          <span className={`text-[10px] font-semibold w-10 text-right shrink-0 ${
                            pct === null ? "text-muted-foreground"
                            : pct >= 100 ? "text-emerald-600"
                            : pct >= 70 ? "text-violet-600"
                            : "text-orange-500"
                          }`}>
                            {pct !== null ? `${pct}%` : `${Math.round(cnt / uploadedInspStats.maxWeek * 100)}%`}
                          </span>
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>
            </div>
          )}
        </div>
      )}

      {/* ── 기존 연간 목표 대비 (파일 업로드 없을 때도 항상 표시) ── */}
      {activeTab === "진행율" && annualProgressStats && (
        <div className="border border-indigo-100 dark:border-indigo-900/30 rounded-xl p-3 space-y-3 bg-gradient-to-br from-indigo-50/60 to-blue-50/30 dark:from-indigo-950/20 dark:to-blue-950/10">
          {/* 헤더 */}
          <div className="flex items-center justify-between flex-wrap gap-1">
            <p className="text-xs font-semibold text-indigo-700 dark:text-indigo-300 flex items-center gap-1.5">
              <Calendar className="w-3.5 h-3.5" />
              12월까지 연간 목표 대비 진행률
            </p>
            <span className="text-[11px] text-muted-foreground">
              남은 기간 약 <span className="font-semibold text-foreground">{annualProgressStats.weeksRemaining}주</span>
              {' / '}
              <span className="font-semibold text-foreground">{annualProgressStats.monthsRemaining}개월</span>
            </span>
          </div>

          {/* 전체 진행 게이지 */}
          <div>
            <div className="flex items-end justify-between mb-1">
              <div className="flex items-baseline gap-1">
                <span className="text-2xl font-black text-indigo-700 dark:text-indigo-300">
                  {annualProgressStats.doneThisYear}
                </span>
                <span className="text-xs text-muted-foreground font-semibold">
                  / {annualProgressStats.annualTarget}건
                </span>
              </div>
              <span className={`text-sm font-bold ${
                annualProgressStats.pct >= 100 ? 'text-emerald-600' :
                annualProgressStats.pct >= 70 ? 'text-blue-600' : 'text-orange-500'
              }`}>
                {annualProgressStats.pct}% 달성
              </span>
            </div>
            <div className="h-3 w-full bg-indigo-100 dark:bg-indigo-900/40 rounded-full overflow-hidden">
              <div
                className={`h-full rounded-full transition-all ${
                  annualProgressStats.pct >= 100 ? 'bg-emerald-500' :
                  annualProgressStats.pct >= 70 ? 'bg-indigo-500' : 'bg-orange-400'
                }`}
                style={{ width: `${annualProgressStats.pct}%` }}
              />
            </div>
            <div className="flex justify-between mt-1 text-[11px] text-muted-foreground">
              <span>잔여 <span className="font-semibold text-foreground">{annualProgressStats.totalRemaining}건</span></span>
              <span>
                주당 <span className="font-semibold text-orange-600">{annualProgressStats.weeklyNeedTotal.toFixed(1)}건</span>
                {' · '}
                월당 <span className="font-semibold text-orange-600">{annualProgressStats.monthlyNeedTotal.toFixed(1)}건</span> 필요
              </span>
            </div>
          </div>

          {/* 부서별 잔여 테이블 */}
          <div className="overflow-x-auto -mx-1">
            <table className="w-full text-xs border-separate border-spacing-0">
              <thead>
                <tr>
                  <th className="text-left py-1.5 px-2 font-semibold text-muted-foreground bg-indigo-50/80 dark:bg-indigo-950/30 rounded-tl-lg">부서</th>
                  <th className="text-center py-1.5 px-2 font-semibold text-muted-foreground bg-indigo-50/80 dark:bg-indigo-950/30">목표</th>
                  <th className="text-center py-1.5 px-2 font-semibold text-indigo-600 dark:text-indigo-400 bg-indigo-50/80 dark:bg-indigo-950/30">진행</th>
                  <th className="text-center py-1.5 px-2 font-semibold text-muted-foreground bg-indigo-50/80 dark:bg-indigo-950/30">잔여</th>
                  <th className="text-center py-1.5 px-2 font-semibold text-orange-600 bg-indigo-50/80 dark:bg-indigo-950/30">월당 필요</th>
                  <th className="text-center py-1.5 px-2 font-semibold text-orange-600 bg-indigo-50/80 dark:bg-indigo-950/30 rounded-tr-lg">주당 필요</th>
                </tr>
              </thead>
              <tbody>
                {annualProgressStats.deptStats.map(({ dept, done, target, remaining, weeklyNeed, monthlyNeed }) => (
                  <tr key={dept} className="border-b border-indigo-50 dark:border-indigo-900/20 hover:bg-indigo-50/40 dark:hover:bg-indigo-950/20 transition-colors">
                    <td className="py-1.5 px-2 font-medium text-foreground whitespace-nowrap">{dept}</td>
                    <td className="text-center py-1.5 px-2 text-muted-foreground">{target}</td>
                    <td className="text-center py-1.5 px-2 font-bold text-indigo-600">{done}</td>
                    <td className={`text-center py-1.5 px-2 font-semibold ${
                      remaining === 0 ? 'text-emerald-600' :
                      remaining <= 10 ? 'text-blue-600' : 'text-orange-600'
                    }`}>
                      {remaining === 0 ? '✓' : remaining}
                    </td>
                    <td className="text-center py-1.5 px-2 text-orange-600 font-medium">
                      {remaining === 0 ? <span className="text-emerald-600">-</span> : monthlyNeed.toFixed(1)}
                    </td>
                    <td className="text-center py-1.5 px-2 text-orange-600 font-medium">
                      {remaining === 0 ? <span className="text-emerald-600">-</span> : weeklyNeed.toFixed(1)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {activeTab === "자체" && (<>
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
              {dashboardPeriod === "year" ? `${new Date().getFullYear()}년 전체`
                : dashboardPeriod === "week" ? `${format(selectedWeekStart, "M/d")}~${format(weekEndDate, "M/d")}`
                : dashboardPeriod === "custom" ? `${customStart} ~ ${customEnd}`
                : `${selectedMonth}월`}
            </Badge>
            <span className="text-xs text-muted-foreground">{filteredInspections.length}건</span>
          </div>
          <div className="flex items-center gap-2">
            <span className="text-[11px] text-muted-foreground hidden sm:block">위 그래프 기간 필터와 연동</span>
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
            {dashboardPeriod === "year" ? "올해"
              : dashboardPeriod === "week" ? `${format(selectedWeekStart, "M/d")}~${format(weekEndDate, "M/d")} 주간`
              : dashboardPeriod === "custom" ? `${customStart} ~ ${customEnd} 기간에`
              : `${selectedMonth}월`} 등록된 점검 내역이 없습니다.
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
      </>)}

      <Dialog open={showTargetDialog} onOpenChange={setShowTargetDialog}>
        <DialogContent className="sm:max-w-sm">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Settings className="w-5 h-5 text-green-600" />
              목표건수 설정
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-4 pt-2">
            <div className="space-y-2">
              <Label className="font-semibold">총 점검 목표 건수</Label>
              <Input
                type="number"
                min={0}
                value={editTotalTarget}
                onChange={e => setEditTotalTarget(e.target.value)}
                placeholder="0"
                data-testid="input-total-target"
              />
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

      {/* ── 기간별 보고서 다운로드 다이얼로그 ── */}
      <Dialog open={showReportDialog} onOpenChange={setShowReportDialog}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-red-600">
              <BarChart3 className="w-5 h-5" />
              기간별 보고서 다운로드
            </DialogTitle>
          </DialogHeader>

          <div className="space-y-4 pt-2">
            {/* 보고서 제목 */}
            <div className="space-y-1.5">
              <Label className="text-sm font-medium">보고서 제목</Label>
              <Input
                value={reportTitle}
                onChange={e => setReportTitle(e.target.value)}
                placeholder="예: 특별안전점검, 하계점검 등"
              />
            </div>

            {/* 기간 선택 */}
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label className="text-sm font-medium">시작일</Label>
                <Input
                  type="date"
                  value={reportStartDate}
                  onChange={e => setReportStartDate(e.target.value)}
                />
              </div>
              <div className="space-y-1.5">
                <Label className="text-sm font-medium">종료일</Label>
                <Input
                  type="date"
                  value={reportEndDate}
                  onChange={e => setReportEndDate(e.target.value)}
                />
              </div>
            </div>

            {/* 영업일 미리보기 */}
            {reportStartDate && reportEndDate && reportStartDate <= reportEndDate && (() => {
              const HOLIDAYS_PREVIEW = new Set(["2026-01-01","2026-01-28","2026-01-29","2026-01-30","2026-03-01","2026-05-05","2026-05-25","2026-06-06","2026-07-17","2026-08-15","2026-09-24","2026-09-25","2026-09-26","2026-10-03","2026-10-09","2026-12-25"]);
              let wd = 0;
              const c = new Date(reportStartDate + "T00:00:00");
              const e = new Date(reportEndDate + "T00:00:00");
              while (c <= e) {
                const d = c.getDay();
                const ds = `${c.getFullYear()}-${String(c.getMonth()+1).padStart(2,"0")}-${String(c.getDate()).padStart(2,"0")}`;
                if (d !== 0 && d !== 6 && !HOLIDAYS_PREVIEW.has(ds)) wd++;
                c.setDate(c.getDate() + 1);
              }
              return (
                <div className="rounded-md bg-muted px-3 py-2 text-sm text-muted-foreground">
                  📅 영업일(월~금): <span className="font-semibold text-foreground">{wd}일</span>
                  &nbsp;·&nbsp; 목표건수: <span className="font-semibold text-foreground">{wd * 7}건</span>
                  <span className="text-xs ml-1">(7개 부서 × {wd}일)</span>
                </div>
              );
            })()}

            {/* 유효성 경고 */}
            {reportStartDate > reportEndDate && (
              <p className="text-xs text-red-500">⚠ 시작일이 종료일보다 늦습니다.</p>
            )}

            <div className="flex gap-2 pt-2">
              <Button
                variant="outline"
                className="flex-1"
                onClick={() => setShowReportDialog(false)}
              >
                취소
              </Button>
              <Button
                className="flex-1 bg-red-600 hover:bg-red-700 text-white gap-2"
                disabled={
                  reportIsGenerating ||
                  !reportStartDate ||
                  !reportEndDate ||
                  reportStartDate > reportEndDate
                }
                onClick={async () => {
                  setReportIsGenerating(true);
                  try {
                    await handleSpecialPeriodDownload(reportStartDate, reportEndDate, reportTitle);
                    setShowReportDialog(false);
                  } finally {
                    setReportIsGenerating(false);
                  }
                }}
              >
                {reportIsGenerating ? (
                  <><Loader2 className="w-4 h-4 animate-spin" /> 생성 중...</>
                ) : (
                  <><Download className="w-4 h-4" /> 엑셀 다운로드</>
                )}
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      {/* ── 부서별 월목표 설정 팝업 ── */}
      <Dialog open={showDeptTargetDialog} onOpenChange={setShowDeptTargetDialog}>
        <DialogContent className="max-w-sm p-0 gap-0">
          <DialogHeader className="px-4 py-3 border-b border-border">
            <DialogTitle className="text-sm flex items-center gap-2">
              <Settings className="w-4 h-4 text-indigo-500" />
              부서별 월목표 설정
            </DialogTitle>
            <p className="text-[11px] text-muted-foreground mt-0.5">입력 즉시 연간목표 자동 계산 · 브라우저에 저장됨</p>
          </DialogHeader>
          <div className="divide-y divide-border max-h-[60vh] overflow-y-auto">
            {/* 헤더 */}
            <div className="grid grid-cols-3 px-4 py-1.5 bg-slate-50 dark:bg-slate-900/40 sticky top-0">
              <span className="text-[10px] font-semibold text-muted-foreground">부서</span>
              <span className="text-[10px] font-semibold text-muted-foreground text-center">월 목표 (건)</span>
              <span className="text-[10px] font-semibold text-indigo-600 text-right">연간 (×12)</span>
            </div>
            {/* 팀 목록 (운용팀 + 현장경영팀) */}
            {[...(teams || []).map(t => t.name), "현장경영팀"]
              .filter((v, i, a) => a.indexOf(v) === i)
              .sort((a, b) => teamOrderKey(a) - teamOrderKey(b))
              .map(name => {
                const monthly = deptMonthlyTargets[name] || 0;
                const annual = monthly * 12;
                return (
                  <div key={name} className="grid grid-cols-3 items-center px-4 py-2 gap-2 hover:bg-muted/30 transition-colors">
                    <span className="text-xs font-medium text-foreground">{name}</span>
                    <div className="flex justify-center">
                      <input
                        type="number"
                        min={0}
                        max={999}
                        value={monthly || ""}
                        placeholder="0"
                        onChange={e => updateDeptMonthlyTarget(name, Number(e.target.value) || 0)}
                        className="w-16 h-7 text-xs text-center border border-input rounded-md bg-background text-foreground focus:outline-none focus:ring-1 focus:ring-indigo-400 px-1"
                      />
                    </div>
                    <div className="text-right">
                      {annual > 0 ? (
                        <span className="text-sm font-bold text-indigo-600">
                          {annual}<span className="text-[10px] font-normal text-muted-foreground ml-0.5">건</span>
                        </span>
                      ) : (
                        <span className="text-xs text-muted-foreground">—</span>
                      )}
                    </div>
                  </div>
                );
              })}
            {/* 합계 행 */}
            {Object.values(deptMonthlyTargets).some(v => v > 0) && (
              <div className="grid grid-cols-3 items-center px-4 py-2.5 bg-indigo-50/70 dark:bg-indigo-950/20 sticky bottom-0 gap-2">
                <span className="text-xs font-bold text-foreground">합계</span>
                <div className="text-center">
                  <span className="text-xs font-semibold text-foreground">
                    {Object.values(deptMonthlyTargets).reduce((s, v) => s + v, 0)}건/월
                  </span>
                </div>
                <div className="text-right">
                  <span className="text-sm font-bold text-indigo-700 dark:text-indigo-300">
                    {Object.values(deptMonthlyTargets).reduce((s, v) => s + v * 12, 0)}
                    <span className="text-[10px] font-normal text-muted-foreground ml-0.5">건/년</span>
                  </span>
                </div>
              </div>
            )}
          </div>
          <div className="px-4 py-3 border-t border-border flex justify-end">
            <Button size="sm" onClick={() => setShowDeptTargetDialog(false)} className="h-8 text-xs">
              확인
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
