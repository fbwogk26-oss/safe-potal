import { useQuery, useMutation } from "@tanstack/react-query";
import { useLockStatus } from "@/hooks/use-settings";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Label } from "@/components/ui/label";
import { ClipboardCheck, Plus, Trash2, ImagePlus, X, Calendar, MapPin, User, ChevronDown, ChevronUp, Download, Check, AlertCircle } from "lucide-react";
import { useState, useRef } from "react";
import { useToast } from "@/hooks/use-toast";
import { format } from "date-fns";
import { motion, AnimatePresence } from "framer-motion";
import { apiRequest, queryClient } from "@/lib/queryClient";
import type { SafetyInspection, Team } from "@shared/schema";
import ExcelJS from "exceljs";

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

export default function SafetyInspections() {
  const { data: inspections, isLoading } = useQuery<SafetyInspection[]>({
    queryKey: ["/api/safety-inspections"],
  });
  
  const { data: teams } = useQuery<Team[]>({
    queryKey: ["/api/teams"],
  });
  
  const createMutation = useMutation({
    mutationFn: async (data: {
      inspectionType: string;
      title: string;
      location?: string;
      inspector?: string;
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

  const { data: lockData } = useLockStatus();
  const isLocked = lockData?.isLocked;
  const { toast } = useToast();

  const [inspectionType, setInspectionType] = useState<string>("안전점검");
  const [department, setDepartment] = useState("");
  const [workContent, setWorkContent] = useState("");
  const [location, setLocation] = useState("");
  const [inspector, setInspector] = useState("");
  const [inspectionDate, setInspectionDate] = useState(format(new Date(), "yyyy-MM-dd"));
  const [checklist, setChecklist] = useState<ChecklistItem[]>(DEFAULT_CHECKLIST);
  const [notes, setNotes] = useState("");
  const [images, setImages] = useState<string[]>([]);
  const [isUploading, setIsUploading] = useState(false);
  const [showForm, setShowForm] = useState(false);
  const [expandedId, setExpandedId] = useState<number | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const resetForm = () => {
    setDepartment("");
    setWorkContent("");
    setLocation("");
    setInspector("");
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

  const handleChecklistChange = (index: number, status: ChecklistStatus) => {
    setChecklist(prev => prev.map((item, i) => 
      i === index ? { ...item, status } : item
    ));
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

    worksheet.columns = [
      { header: '점검유형', key: 'type', width: 12 },
      { header: '부서명', key: 'department', width: 15 },
      { header: '작업내용', key: 'workContent', width: 25 },
      { header: '점검국소', key: 'location', width: 20 },
      { header: '작업자', key: 'inspector', width: 15 },
      { header: '점검일', key: 'date', width: 12 },
      { header: '체크리스트', key: 'checklist', width: 50 },
      { header: '비고', key: 'notes', width: 30 },
      { header: '사진', key: 'images', width: 80 },
    ];

    worksheet.getRow(1).font = { bold: true };
    worksheet.getRow(1).fill = {
      type: 'pattern',
      pattern: 'solid',
      fgColor: { argb: 'FFE0E0E0' }
    };

    let currentRow = 2;
    for (const inspection of inspections) {
      const checklistItems = normalizeChecklist(inspection.checklist);
      const checklistText = checklistItems
        .map(item => `${item.item}: ${item.status}`)
        .join('\n');

      const titleParts = (inspection.title || '').split(' - ');
      const deptName = titleParts[0] || '-';
      const workDesc = titleParts.slice(1).join(' - ') || '-';
      
      const row = worksheet.addRow({
        type: inspection.inspectionType,
        department: deptName,
        workContent: workDesc,
        location: inspection.location || '-',
        inspector: inspection.inspector || '-',
        date: inspection.inspectionDate,
        checklist: checklistText,
        notes: inspection.notes || '-',
        images: '',
      });

      const images = inspection.images || [];
      if (images.length > 0) {
        let imageCol = 9;
        const imageHeight = 100;
        row.height = imageHeight * 0.75;

        for (let i = 0; i < images.length; i++) {
          try {
            const response = await fetch(images[i]);
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

            worksheet.addImage(imageId, {
              tl: { col: imageCol - 1 + i * 1.5, row: currentRow - 1 },
              ext: { width: 80, height: 80 },
            });
          } catch (err) {
            console.error('이미지 로드 실패:', err);
          }
        }
        
        if (images.length > 1) {
          worksheet.getColumn(9).width = 20 + (images.length * 15);
        }
      }
      currentRow++;
    }

    worksheet.eachRow((row, rowNumber) => {
      if (rowNumber > 1) {
        row.alignment = { wrapText: true, vertical: 'middle' };
      }
    });

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
          <Button
            variant="outline"
            onClick={handleExcelDownload}
            disabled={!inspections || inspections.length === 0}
            className="gap-2"
            data-testid="button-excel-download"
          >
            <Download className="w-4 h-4" />
            <span className="hidden sm:inline">엑셀 다운로드</span>
          </Button>
          <Button
            onClick={() => setShowForm(!showForm)}
            disabled={isLocked}
            className="bg-green-600 hover:bg-green-700 text-white gap-2"
            data-testid="button-toggle-form"
          >
            <Plus className="w-4 h-4" />
            새 점검 등록
          </Button>
        </div>
      </div>

      <AnimatePresence>
        {showForm && (
          <motion.div
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: "auto" }}
            exit={{ opacity: 0, height: 0 }}
          >
            <Card className="glass-card overflow-hidden border-green-200 dark:border-green-900/30">
              <CardHeader className="pb-4">
                <CardTitle className="text-lg">점검 등록</CardTitle>
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
                    <Label>작업자</Label>
                    <div className="relative">
                      <User className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                      <Input
                        placeholder="작업자 이름"
                        value={inspector}
                        onChange={e => setInspector(e.target.value)}
                        className="pl-10"
                        data-testid="input-inspector"
                      />
                    </div>
                  </div>
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
                  <input
                    type="file"
                    accept="image/*"
                    multiple
                    ref={fileInputRef}
                    onChange={handleImageUpload}
                    className="hidden"
                    data-testid="input-images"
                  />
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
                    {images.length < MAX_IMAGES && (
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
                    disabled={isLocked || createMutation.isPending || !department}
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

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {isLoading ? (
          <div className="col-span-full text-center py-8 text-muted-foreground">로딩 중...</div>
        ) : inspections?.length === 0 ? (
          <div className="col-span-full text-center py-12 text-muted-foreground">
            등록된 점검 내역이 없습니다.
          </div>
        ) : (
          <AnimatePresence>
            {inspections?.map((inspection) => {
              const checklistItems = normalizeChecklist(inspection.checklist);
              const goodItems = checklistItems.filter(c => c.status === '양호').length;
              const poorItems = checklistItems.filter(c => c.status === '미흡').length;
              const thumbnailImage = inspection.images?.[0];
              
              return (
                <motion.div
                  key={inspection.id}
                  initial={{ opacity: 0, y: 10 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, y: -10 }}
                  className="col-span-1"
                >
                  <Card
                    className="overflow-hidden group hover-elevate cursor-pointer"
                    onClick={() => setExpandedId(expandedId === inspection.id ? null : inspection.id)}
                    data-testid={`card-inspection-${inspection.id}`}
                  >
                    <CardContent className="p-0">
                      <div className="flex">
                        {thumbnailImage ? (
                          <div className="w-24 h-24 sm:w-32 sm:h-32 shrink-0">
                            <img 
                              src={thumbnailImage} 
                              alt="썸네일" 
                              className="w-full h-full object-cover"
                            />
                          </div>
                        ) : (
                          <div className={`w-24 h-24 sm:w-32 sm:h-32 shrink-0 flex items-center justify-center ${
                            inspection.inspectionType === "동행점검"
                              ? "bg-blue-100 dark:bg-blue-900/30"
                              : "bg-green-100 dark:bg-green-900/30"
                          }`}>
                            <ClipboardCheck className={`w-8 h-8 ${
                              inspection.inspectionType === "동행점검"
                                ? "text-blue-600 dark:text-blue-400"
                                : "text-green-600 dark:text-green-400"
                            }`} />
                          </div>
                        )}
                        <div className="flex-1 p-3 sm:p-4 min-w-0">
                          <div className="flex items-start justify-between gap-2">
                            <div className="min-w-0 flex-1">
                              <div className="flex items-center gap-2 flex-wrap mb-1">
                                <span className={`text-xs px-2 py-0.5 rounded-full ${
                                  inspection.inspectionType === "동행점검"
                                    ? "bg-blue-100 dark:bg-blue-900/30 text-blue-600 dark:text-blue-400"
                                    : "bg-green-100 dark:bg-green-900/30 text-green-600 dark:text-green-400"
                                }`}>
                                  {inspection.inspectionType}
                                </span>
                                {inspection.images && inspection.images.length > 0 && (
                                  <span className="text-xs text-muted-foreground">
                                    사진 {inspection.images.length}장
                                  </span>
                                )}
                              </div>
                              <h3 className="font-bold text-sm sm:text-base truncate">{inspection.title}</h3>
                              <div className="flex flex-wrap gap-x-3 gap-y-1 text-xs text-muted-foreground mt-1">
                                <span>{inspection.inspectionDate}</span>
                                {inspection.location && <span>{inspection.location}</span>}
                                {inspection.inspector && <span>{inspection.inspector}</span>}
                              </div>
                              <div className="flex gap-2 mt-2 text-xs">
                                <span className="text-green-600 dark:text-green-400">양호 {goodItems}</span>
                                <span className="text-red-600 dark:text-red-400">미흡 {poorItems}</span>
                              </div>
                            </div>
                            <div className="flex items-center gap-1">
                              <Button
                                variant="ghost"
                                size="icon"
                                className="h-8 w-8"
                                onClick={(e) => {
                                  e.stopPropagation();
                                  setExpandedId(expandedId === inspection.id ? null : inspection.id);
                                }}
                                data-testid={`button-expand-${inspection.id}`}
                              >
                                {expandedId === inspection.id ? (
                                  <ChevronUp className="w-4 h-4" />
                                ) : (
                                  <ChevronDown className="w-4 h-4" />
                                )}
                              </Button>
                              <Button
                                variant="ghost"
                                size="icon"
                                className="h-8 w-8 opacity-0 group-hover:opacity-100"
                                onClick={(e) => {
                                  e.stopPropagation();
                                  handleDelete(inspection.id);
                                }}
                                disabled={isLocked}
                                data-testid={`button-delete-${inspection.id}`}
                              >
                                <Trash2 className="w-4 h-4 text-destructive" />
                              </Button>
                            </div>
                          </div>
                        </div>
                      </div>
                      
                      <AnimatePresence>
                        {expandedId === inspection.id && (
                          <motion.div
                            initial={{ opacity: 0, height: 0 }}
                            animate={{ opacity: 1, height: "auto" }}
                            exit={{ opacity: 0, height: 0 }}
                            className="border-t"
                          >
                            <div className="p-4 space-y-3">
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
                    </CardContent>
                  </Card>
                </motion.div>
              );
            })}
          </AnimatePresence>
        )}
      </div>
    </div>
  );
}
