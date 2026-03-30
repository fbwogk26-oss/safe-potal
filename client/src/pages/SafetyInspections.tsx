import { useQuery, useMutation } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { ClipboardCheck, Plus, Trash2, ImagePlus, X, Calendar, MapPin, User, ChevronDown, ChevronUp, Download, Check, AlertCircle, BarChart3, Settings, FileText, Loader2 } from "lucide-react";
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

const EXTRA_DEPARTMENTS = [
  "운용지원팀",
  "운용계획팀",
  "사업지원팀",
  "현장경영팀",
];

export default function SafetyInspections() {
  const { canEditInspections, canDownloadInspectionExcel, canUploadInspectionPhotos } = usePermissions();
  const { user } = useAuth();
  const { data: inspections, isLoading } = useQuery<SafetyInspection[]>({
    queryKey: ["/api/safety-inspections"],
  });
  
  const { data: teams } = useQuery<Team[]>({
    queryKey: ["/api/teams"],
  });

  const { data: inspectionTargets } = useQuery<{
    safetyBujang: number; safetyTeamjang: number;
    accompanyBujang: number; accompanyTeamjang: number;
    safetyTarget: number; accompanyTarget: number;
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
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/safety-inspections"] });
      resetForm();
      toast({ title: "점검 등록 완료" });
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
  const [editSafetyBujang, setEditSafetyBujang] = useState("");
  const [editSafetyTeamjang, setEditSafetyTeamjang] = useState("");
  const [editAccompanyBujang, setEditAccompanyBujang] = useState("");
  const [editAccompanyTeamjang, setEditAccompanyTeamjang] = useState("");
  const fileInputRef = useRef<HTMLInputElement>(null);
  const pdfFileInputRef = useRef<HTMLInputElement>(null);
  const [isPdfParsing, setIsPdfParsing] = useState(false);
  const [dashboardPeriod, setDashboardPeriod] = useState<"month" | "year">("month");
  const [selectedMonth, setSelectedMonth] = useState<number>(new Date().getMonth() + 1);
  const [listMonth, setListMonth] = useState<number>(new Date().getMonth() + 1);

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
    
    setIsUploading(true);
    
    try {
      for (const file of filesToUpload) {
        const urlRes = await fetch('/api/uploads/request-url', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            name: file.name,
            size: file.size,
            contentType: file.type,
          }),
        });
        const { uploadURL, objectPath } = await urlRes.json();
        
        await fetch(uploadURL, {
          method: 'PUT',
          body: file,
          headers: { 'Content-Type': file.type },
        });
        
        setImages(prev => [...prev, objectPath]);
      }
      toast({ title: "이미지 업로드 완료" });
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
    
    createMutation.mutate({
      inspectionType,
      title,
      location: location || undefined,
      inspector: inspector || undefined,
      workerName: workerName || undefined,
      inspectionDate,
      checklist,
      notes: notes || undefined,
      images,
    });
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
    if (!inspections || inspections.length === 0 || !teams) return null;
    const now = new Date();
    const currentYear = format(now, "yyyy");
    const monthStr = String(selectedMonth).padStart(2, "0");
    const targetMonth = `${currentYear}-${monthStr}`;

    const filtered = inspections.filter(insp => {
      if (dashboardPeriod === "month") {
        return insp.inspectionDate.startsWith(targetMonth);
      }
      return insp.inspectionDate.startsWith(currentYear);
    });

    const allDepts = teams.map(t => t.name);
    const safetyBujang = inspectionTargets?.safetyBujang || 0;
    const safetyTeamjang = inspectionTargets?.safetyTeamjang || 0;
    const accompanyBujang = inspectionTargets?.accompanyBujang || 0;
    const accompanyTeamjang = inspectionTargets?.accompanyTeamjang || 0;
    const safetyTotal = safetyBujang + safetyTeamjang;
    const accompanyTotal = accompanyBujang + accompanyTeamjang;

    const deptMap = new Map<string, { safetyCount: number; accompanyCount: number }>();
    for (const dept of allDepts) {
      deptMap.set(dept, { safetyCount: 0, accompanyCount: 0 });
    }
    let totalSafety = 0;
    let totalAccompany = 0;
    for (const insp of filtered) {
      const matchedDept = allDepts.find(d => insp.title.startsWith(d));
      const entry = matchedDept ? deptMap.get(matchedDept) : null;
      if (entry) {
        if (insp.inspectionType === "동행점검") {
          entry.accompanyCount++;
          totalAccompany++;
        } else {
          entry.safetyCount++;
          totalSafety++;
        }
      }
    }
    const chartData = allDepts.map(dept => {
      const stats = deptMap.get(dept)!;
      const shortName = dept.replace("운용팀", "").replace("팀", "");
      return {
        name: shortName,
        안전점검: stats.safetyCount,
        동행점검: stats.accompanyCount,
      };
    });

    return {
      total: filtered.length,
      totalSafety,
      totalAccompany,
      safetyBujang,
      safetyTeamjang,
      accompanyBujang,
      accompanyTeamjang,
      safetyTotal,
      accompanyTotal,
      chartData,
      periodLabel: dashboardPeriod === "month" ? `${selectedMonth}월` : `${now.getFullYear()}년`,
    };
  }, [inspections, teams, inspectionTargets, dashboardPeriod, selectedMonth]);

  const filteredInspections = useMemo(() => {
    if (!inspections) return [];
    const currentYear = format(new Date(), "yyyy");
    const monthStr = String(listMonth).padStart(2, "0");
    const prefix = `${currentYear}-${monthStr}`;
    return inspections.filter(i => i.inspectionDate.startsWith(prefix));
  }, [inspections, listMonth]);

  const [showInspDashboard, setShowInspDashboard] = useState(true);

  return (
    <div className="max-w-4xl mx-auto space-y-4 sm:space-y-6 md:space-y-8">
      <div className="flex items-center justify-between gap-2 sm:gap-3">
        <div className="flex items-center gap-2 sm:gap-3">
          <div className="bg-green-100 p-2 sm:p-2.5 rounded-lg sm:rounded-xl text-green-600 dark:bg-green-900/30 dark:text-green-400">
            <ClipboardCheck className="w-5 h-5 sm:w-6 sm:h-6 md:w-8 md:h-8" />
          </div>
          <div>
            <h2 className="text-xl sm:text-2xl md:text-3xl font-display font-bold text-foreground">
              안전점검
            </h2>
            <p className="text-xs sm:text-sm text-muted-foreground">점검 내역 관리</p>
          </div>
        </div>
        <div className="flex gap-2">
          {canDownloadInspectionExcel && (
            <Button
              variant="outline"
              onClick={handleExcelDownload}
              disabled={!inspections || inspections.length === 0}
              className="gap-2"
              data-testid="button-excel-download"
            >
              <Download className="w-4 h-4" />
              엑셀 다운로드
            </Button>
          )}
          {canEditInspections && (
            <Button
              onClick={() => {
                if (!showForm) {
                  setInspector(user?.name || user?.username || "");
                }
                setShowForm(!showForm);
              }}
              className="bg-green-600 hover:bg-green-700 text-white gap-2"
              data-testid="button-toggle-form"
            >
              <Plus className="w-4 h-4" />
              새 점검 등록
            </Button>
          )}
        </div>
      </div>

      {inspectionStats && (
        <Card>
          <CardHeader
            className="bg-gradient-to-r from-green-50 to-emerald-50 dark:from-green-900/20 dark:to-emerald-900/20 border-b p-3 sm:p-4 cursor-pointer"
            onClick={() => setShowInspDashboard(!showInspDashboard)}
            data-testid="button-toggle-dashboard"
          >
            <CardTitle className="text-sm sm:text-base flex items-center justify-between gap-2">
              <div className="flex items-center gap-2">
                <BarChart3 className="w-4 h-4 text-green-600" />
                점검 진행 현황
              </div>
              <div className="flex items-center gap-1">
                {isAdmin && (
                  <Button
                    variant="ghost"
                    size="icon"
                    onClick={(e) => {
                      e.stopPropagation();
                      setEditSafetyBujang(String(inspectionTargets?.safetyBujang || ""));
                      setEditSafetyTeamjang(String(inspectionTargets?.safetyTeamjang || ""));
                      setEditAccompanyBujang(String(inspectionTargets?.accompanyBujang || ""));
                      setEditAccompanyTeamjang(String(inspectionTargets?.accompanyTeamjang || ""));
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
                  <div className="flex items-center justify-between gap-2 flex-wrap">
                    <div className="flex items-center gap-1 flex-wrap">
                      <Button
                        variant={dashboardPeriod === "month" ? "default" : "outline"}
                        size="sm"
                        onClick={(e) => { e.stopPropagation(); setDashboardPeriod("month"); }}
                        data-testid="button-period-month"
                      >
                        월별
                      </Button>
                      <Button
                        variant={dashboardPeriod === "year" ? "default" : "outline"}
                        size="sm"
                        onClick={(e) => { e.stopPropagation(); setDashboardPeriod("year"); }}
                        data-testid="button-period-year"
                      >
                        연간
                      </Button>
                      {dashboardPeriod === "month" && (
                        <Select value={String(selectedMonth)} onValueChange={(v) => { setSelectedMonth(Number(v)); }}>
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
                    <Badge variant="secondary" className="text-xs">{inspectionStats.periodLabel} 현황</Badge>
                  </div>
                  <div className="grid grid-cols-3 gap-3">
                    {/* 총 점검 */}
                    <div className="rounded-xl p-3 bg-gradient-to-br from-green-50 to-emerald-50 dark:from-green-950/40 dark:to-emerald-950/20 border border-green-100 dark:border-green-900/30">
                      <p className="text-[11px] font-semibold text-green-600 dark:text-green-400 mb-1">📋 총 점검</p>
                      <p className="text-2xl font-black text-green-700 dark:text-green-300" data-testid="text-total-inspections">
                        {inspectionStats.total}<span className="text-xs font-normal ml-0.5">건</span>
                      </p>
                      <p className="text-[10px] text-muted-foreground mt-1">안전 {inspectionStats.totalSafety} + 동행 {inspectionStats.totalAccompany}</p>
                    </div>
                    {/* 안전점검 */}
                    <div className="rounded-xl p-3 bg-gradient-to-br from-blue-50 to-sky-50 dark:from-blue-950/40 dark:to-sky-950/20 border border-blue-100 dark:border-blue-900/30">
                      <p className="text-[11px] font-semibold text-blue-600 dark:text-blue-400 mb-1">🛡 안전점검</p>
                      <p className="text-2xl font-black text-blue-700 dark:text-blue-300" data-testid="text-safety-count">
                        {inspectionStats.totalSafety}
                        {inspectionStats.safetyTotal > 0 && <span className="text-sm font-semibold text-muted-foreground">/{inspectionStats.safetyTotal}</span>}
                        <span className="text-xs font-normal ml-0.5">건</span>
                      </p>
                      {inspectionStats.safetyTotal > 0 && (
                        <div className="mt-1.5">
                          <div className="h-1.5 w-full bg-blue-100 dark:bg-blue-900/40 rounded-full overflow-hidden">
                            <div
                              className="h-full bg-blue-500 rounded-full transition-all"
                              style={{ width: `${Math.min(100, Math.round(inspectionStats.totalSafety / inspectionStats.safetyTotal * 100))}%` }}
                            />
                          </div>
                          <p className="text-[10px] text-blue-500 dark:text-blue-400 mt-0.5 font-semibold">
                            {Math.round(inspectionStats.totalSafety / inspectionStats.safetyTotal * 100)}% 달성
                          </p>
                        </div>
                      )}
                    </div>
                    {/* 동행점검 */}
                    <div className="rounded-xl p-3 bg-gradient-to-br from-emerald-50 to-teal-50 dark:from-emerald-950/40 dark:to-teal-950/20 border border-emerald-100 dark:border-emerald-900/30">
                      <p className="text-[11px] font-semibold text-emerald-600 dark:text-emerald-400 mb-1">🤝 동행점검</p>
                      <p className="text-2xl font-black text-emerald-700 dark:text-emerald-300" data-testid="text-accompany-count">
                        {inspectionStats.totalAccompany}
                        {inspectionStats.accompanyTotal > 0 && <span className="text-sm font-semibold text-muted-foreground">/{inspectionStats.accompanyTotal}</span>}
                        <span className="text-xs font-normal ml-0.5">건</span>
                      </p>
                      {inspectionStats.accompanyTotal > 0 && (
                        <div className="mt-1.5">
                          <div className="h-1.5 w-full bg-emerald-100 dark:bg-emerald-900/40 rounded-full overflow-hidden">
                            <div
                              className="h-full bg-emerald-500 rounded-full transition-all"
                              style={{ width: `${Math.min(100, Math.round(inspectionStats.totalAccompany / inspectionStats.accompanyTotal * 100))}%` }}
                            />
                          </div>
                          <p className="text-[10px] text-emerald-500 dark:text-emerald-400 mt-0.5 font-semibold">
                            {Math.round(inspectionStats.totalAccompany / inspectionStats.accompanyTotal * 100)}% 달성
                          </p>
                        </div>
                      )}
                    </div>
                  </div>
                  <div className="w-full" style={{ height: 280 }}>
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
                        <Legend
                          wrapperStyle={{ fontSize: 12, paddingTop: 8 }}
                          iconType="circle"
                          iconSize={8}
                        />
                        <Bar dataKey="안전점검" stackId="a" fill="#3b82f6" radius={[0, 0, 0, 0]}>
                          <LabelList dataKey="안전점검" position="inside" style={{ fontSize: 10, fontWeight: 700, fill: "#fff" }} formatter={(v: number) => v > 0 ? v : ""} />
                        </Bar>
                        <Bar dataKey="동행점검" stackId="a" fill="#10b981" radius={[4, 4, 0, 0]}>
                          <LabelList dataKey="동행점검" position="inside" style={{ fontSize: 10, fontWeight: 700, fill: "#fff" }} formatter={(v: number) => v > 0 ? v : ""} />
                        </Bar>
                      </BarChart>
                    </ResponsiveContainer>
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
                  <CardTitle className="text-lg">점검 등록</CardTitle>
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
                  <Button
                    onClick={handleSubmit}
                    disabled={createMutation.isPending || !department}
                    className="bg-green-600 hover:bg-green-700 text-white"
                    data-testid="button-submit-inspection"
                  >
                    {createMutation.isPending ? "등록 중..." : "점검 등록"}
                  </Button>
                </div>
              </CardContent>
            </Card>
          </motion.div>
        )}
      </AnimatePresence>

      <div className="space-y-1">
        <div className="flex items-center justify-between mb-2">
          <div className="flex items-center gap-2">
            <Calendar className="w-4 h-4 text-muted-foreground" />
            <span className="text-sm font-medium text-muted-foreground">등록월</span>
            <Select value={String(listMonth)} onValueChange={(v) => setListMonth(Number(v))}>
              <SelectTrigger className="w-[80px] h-8" data-testid="select-list-month">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {Array.from({ length: 12 }, (_, i) => i + 1).map(m => (
                  <SelectItem key={m} value={String(m)}>{m}월</SelectItem>
                ))}
              </SelectContent>
            </Select>
            <span className="text-xs text-muted-foreground">{filteredInspections.length}건</span>
          </div>
        </div>
        {isLoading ? (
          <div className="text-center py-8 text-muted-foreground">로딩 중...</div>
        ) : filteredInspections.length === 0 ? (
          <div className="text-center py-12 text-muted-foreground">
            {listMonth}월 등록된 점검 내역이 없습니다.
          </div>
        ) : (
          <Card>
            <CardContent className="p-0 divide-y">
              {filteredInspections.map((inspection) => {
                const checklistItems = normalizeChecklist(inspection.checklist);
                const goodItems = checklistItems.filter(c => c.status === '양호').length;
                const poorItems = checklistItems.filter(c => c.status === '미흡').length;
                const isExpanded = expandedId === inspection.id;

                return (
                  <div key={inspection.id} data-testid={`card-inspection-${inspection.id}`}>
                    <div
                      className="flex items-center gap-2 sm:gap-3 px-3 sm:px-4 py-2.5 cursor-pointer hover:bg-muted/30 transition-colors group"
                      onClick={() => setExpandedId(isExpanded ? null : inspection.id)}
                    >
                      <span className="text-[10px] px-1.5 py-0.5 rounded bg-green-100 dark:bg-green-900/30 text-green-600 dark:text-green-400 shrink-0 font-medium">
                        {inspection.inspectionType === "안전점검" ? "안전" : "동행"}
                      </span>
                      <span className="text-xs text-muted-foreground shrink-0 w-[72px]">{inspection.inspectionDate}</span>
                      <span className="text-sm font-medium truncate flex-1 min-w-0">{inspection.title}</span>
                      <span className="text-xs text-muted-foreground truncate max-w-[80px]">{inspection.department}</span>
                      {inspection.location && (
                        <span className="text-xs text-muted-foreground truncate max-w-[80px]">{inspection.location}</span>
                      )}
                      <div className="flex items-center gap-1.5 shrink-0 text-[10px]">
                        <span className="text-green-600 dark:text-green-400">{goodItems}</span>
                        <span className="text-muted-foreground">/</span>
                        <span className="text-red-600 dark:text-red-400">{poorItems}</span>
                      </div>
                      {inspection.images && inspection.images.length > 0 && (
                        <span className="text-[10px] text-muted-foreground shrink-0">
                          {inspection.images.length}장
                        </span>
                      )}
                      <div className="flex items-center gap-0.5 shrink-0">
                        {isExpanded ? <ChevronUp className="w-3.5 h-3.5 text-muted-foreground" /> : <ChevronDown className="w-3.5 h-3.5 text-muted-foreground" />}
                        {canEditInspections && (!inspection.createdBy || user?.role === "admin" || user?.username === inspection.createdBy) && (
                          <Button
                            variant="ghost"
                            size="icon"
                            className="h-7 w-7 opacity-0 group-hover:opacity-100"
                            onClick={(e) => {
                              e.stopPropagation();
                              handleDelete(inspection.id);
                            }}
                            data-testid={`button-delete-${inspection.id}`}
                          >
                            <Trash2 className="w-3.5 h-3.5 text-destructive" />
                          </Button>
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
                              {inspection.workContent && <span>작업내용: {inspection.workContent}</span>}
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
                                <p className="text-sm text-muted-foreground bg-muted/50 rounded-lg p-3">
                                  {inspection.notes}
                                </p>
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
                                      onClick={(e) => {
                                        e.stopPropagation();
                                        window.open(img, "_blank");
                                      }}
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

      <Dialog open={showTargetDialog} onOpenChange={setShowTargetDialog}>
        <DialogContent className="sm:max-w-sm">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Settings className="w-5 h-5 text-green-600" />
              점검 목표건수 설정
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-4 pt-2">
            <div className="space-y-3">
              <Label className="text-blue-600 font-semibold">안전점검</Label>
              <div className="grid grid-cols-2 gap-3 pl-2">
                <div className="space-y-1">
                  <Label className="text-xs text-muted-foreground">운용부장 목표</Label>
                  <Input
                    type="number"
                    min={0}
                    value={editSafetyBujang}
                    onChange={e => setEditSafetyBujang(e.target.value)}
                    placeholder="0"
                    data-testid="input-safety-bujang"
                  />
                </div>
                <div className="space-y-1">
                  <Label className="text-xs text-muted-foreground">운용팀장 목표</Label>
                  <Input
                    type="number"
                    min={0}
                    value={editSafetyTeamjang}
                    onChange={e => setEditSafetyTeamjang(e.target.value)}
                    placeholder="0"
                    data-testid="input-safety-teamjang"
                  />
                </div>
              </div>
            </div>
            <div className="space-y-3">
              <Label className="text-emerald-600 font-semibold">동행점검</Label>
              <div className="grid grid-cols-2 gap-3 pl-2">
                <div className="space-y-1">
                  <Label className="text-xs text-muted-foreground">운용부장 목표</Label>
                  <Input
                    type="number"
                    min={0}
                    value={editAccompanyBujang}
                    onChange={e => setEditAccompanyBujang(e.target.value)}
                    placeholder="0"
                    data-testid="input-accompany-bujang"
                  />
                </div>
                <div className="space-y-1">
                  <Label className="text-xs text-muted-foreground">운용팀장 목표</Label>
                  <Input
                    type="number"
                    min={0}
                    value={editAccompanyTeamjang}
                    onChange={e => setEditAccompanyTeamjang(e.target.value)}
                    placeholder="0"
                    data-testid="input-accompany-teamjang"
                  />
                </div>
              </div>
            </div>
            <div className="flex justify-end gap-2 pt-2">
              <Button variant="outline" onClick={() => setShowTargetDialog(false)}>
                취소
              </Button>
              <Button
                onClick={() => {
                  saveTargetsMutation.mutate({
                    safetyBujang: Number(editSafetyBujang) || 0,
                    safetyTeamjang: Number(editSafetyTeamjang) || 0,
                    accompanyBujang: Number(editAccompanyBujang) || 0,
                    accompanyTeamjang: Number(editAccompanyTeamjang) || 0,
                  });
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
    </div>
  );
}
