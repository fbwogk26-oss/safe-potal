import { useQuery, useMutation } from "@tanstack/react-query";
import { useLockStatus } from "@/hooks/use-settings";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Checkbox } from "@/components/ui/checkbox";
import { Label } from "@/components/ui/label";
import { ClipboardCheck, Plus, Trash2, ImagePlus, X, Calendar, MapPin, User, ChevronDown, ChevronUp } from "lucide-react";
import { useState, useRef } from "react";
import { useToast } from "@/hooks/use-toast";
import { format } from "date-fns";
import { motion, AnimatePresence } from "framer-motion";
import { apiRequest, queryClient } from "@/lib/queryClient";
import type { SafetyInspection } from "@shared/schema";

const DEFAULT_CHECKLIST = [
  { item: "안전모 착용 상태", checked: false },
  { item: "안전화 착용 상태", checked: false },
  { item: "안전조끼 착용 상태", checked: false },
  { item: "작업장 정리정돈", checked: false },
  { item: "소화기 비치 상태", checked: false },
  { item: "비상구 확보 상태", checked: false },
  { item: "전기 안전 상태", checked: false },
  { item: "위험물 보관 상태", checked: false },
];

export default function SafetyInspections() {
  const { data: inspections, isLoading } = useQuery<SafetyInspection[]>({
    queryKey: ["/api/safety-inspections"],
  });
  
  const createMutation = useMutation({
    mutationFn: async (data: {
      inspectionType: string;
      title: string;
      location?: string;
      inspector?: string;
      inspectionDate: string;
      checklist: Array<{ item: string; checked: boolean }>;
      notes?: string;
      images: string[];
    }) => {
      return apiRequest("/api/safety-inspections", {
        method: "POST",
        body: JSON.stringify(data),
        headers: { "Content-Type": "application/json" },
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/safety-inspections"] });
      resetForm();
      toast({ title: "점검 등록 완료" });
    },
  });
  
  const deleteMutation = useMutation({
    mutationFn: async (id: number) => {
      return apiRequest(`/api/safety-inspections/${id}`, { method: "DELETE" });
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
  const [title, setTitle] = useState("");
  const [location, setLocation] = useState("");
  const [inspector, setInspector] = useState("");
  const [inspectionDate, setInspectionDate] = useState(format(new Date(), "yyyy-MM-dd"));
  const [checklist, setChecklist] = useState(DEFAULT_CHECKLIST);
  const [notes, setNotes] = useState("");
  const [images, setImages] = useState<string[]>([]);
  const [isUploading, setIsUploading] = useState(false);
  const [showForm, setShowForm] = useState(false);
  const [expandedId, setExpandedId] = useState<number | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const resetForm = () => {
    setTitle("");
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
    
    setIsUploading(true);
    
    try {
      for (const file of Array.from(files)) {
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

  const handleChecklistChange = (index: number, checked: boolean) => {
    setChecklist(prev => prev.map((item, i) => 
      i === index ? { ...item, checked } : item
    ));
  };

  const handleSubmit = () => {
    if (!title) {
      toast({ variant: "destructive", title: "점검 제목을 입력하세요" });
      return;
    }
    
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

  const checkedCount = checklist.filter(c => c.checked).length;
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
                
                <div className="space-y-2">
                  <Label>점검 제목</Label>
                  <Input
                    placeholder="예: 1월 정기 안전점검"
                    value={title}
                    onChange={e => setTitle(e.target.value)}
                    data-testid="input-inspection-title"
                  />
                </div>
                
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label>점검 장소</Label>
                    <div className="relative">
                      <MapPin className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                      <Input
                        placeholder="점검 장소 입력"
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
                  <div className="flex items-center justify-between">
                    <Label>체크리스트 ({checkedCount}/{totalCount})</Label>
                    <span className="text-xs text-muted-foreground">
                      {Math.round((checkedCount / totalCount) * 100)}% 완료
                    </span>
                  </div>
                  <div className="bg-muted/50 rounded-lg p-4 space-y-3">
                    {checklist.map((item, index) => (
                      <div key={index} className="flex items-center gap-3">
                        <Checkbox
                          id={`check-${index}`}
                          checked={item.checked}
                          onCheckedChange={(checked) => handleChecklistChange(index, checked as boolean)}
                          data-testid={`checkbox-item-${index}`}
                        />
                        <Label htmlFor={`check-${index}`} className="cursor-pointer flex-1">
                          {item.item}
                        </Label>
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
                  <Label>사진 첨부</Label>
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
                  </div>
                </div>

                <div className="flex justify-end gap-2">
                  <Button variant="outline" onClick={resetForm} data-testid="button-cancel">
                    취소
                  </Button>
                  <Button
                    onClick={handleSubmit}
                    disabled={isLocked || createMutation.isPending || !title}
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

      <div className="space-y-4">
        {isLoading ? (
          <div className="text-center py-8 text-muted-foreground">로딩 중...</div>
        ) : inspections?.length === 0 ? (
          <div className="text-center py-12 text-muted-foreground">
            등록된 점검 내역이 없습니다.
          </div>
        ) : (
          <AnimatePresence>
            {inspections?.map((inspection) => (
              <motion.div
                key={inspection.id}
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -10 }}
              >
                <Card
                  className="overflow-hidden group"
                  data-testid={`card-inspection-${inspection.id}`}
                >
                  <CardContent className="p-4">
                    <div className="flex items-start gap-4">
                      <div className={`w-12 h-12 rounded-full flex items-center justify-center shrink-0 ${
                        inspection.inspectionType === "동행점검"
                          ? "bg-blue-100 dark:bg-blue-900/30"
                          : "bg-green-100 dark:bg-green-900/30"
                      }`}>
                        <ClipboardCheck className={`w-5 h-5 ${
                          inspection.inspectionType === "동행점검"
                            ? "text-blue-600 dark:text-blue-400"
                            : "text-green-600 dark:text-green-400"
                        }`} />
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 flex-wrap">
                          <span className={`text-xs px-2 py-0.5 rounded-full ${
                            inspection.inspectionType === "동행점검"
                              ? "bg-blue-100 dark:bg-blue-900/30 text-blue-600 dark:text-blue-400"
                              : "bg-green-100 dark:bg-green-900/30 text-green-600 dark:text-green-400"
                          }`}>
                            {inspection.inspectionType}
                          </span>
                          <h3 className="font-bold">{inspection.title}</h3>
                        </div>
                        <div className="flex flex-wrap gap-x-4 gap-y-1 text-sm text-muted-foreground mt-1">
                          <span>{inspection.inspectionDate}</span>
                          {inspection.location && <span>{inspection.location}</span>}
                          {inspection.inspector && <span>{inspection.inspector}</span>}
                        </div>
                        
                        <AnimatePresence>
                          {expandedId === inspection.id && (
                            <motion.div
                              initial={{ opacity: 0, height: 0 }}
                              animate={{ opacity: 1, height: "auto" }}
                              exit={{ opacity: 0, height: 0 }}
                              className="mt-4 space-y-3"
                            >
                              {inspection.checklist && (inspection.checklist as Array<{ item: string; checked: boolean }>).length > 0 && (
                                <div className="space-y-2">
                                  <Label className="text-sm">체크리스트</Label>
                                  <div className="bg-muted/50 rounded-lg p-3 space-y-2">
                                    {(inspection.checklist as Array<{ item: string; checked: boolean }>).map((item, idx) => (
                                      <div key={idx} className="flex items-center gap-2">
                                        <Checkbox checked={item.checked} disabled />
                                        <span className={item.checked ? "" : "text-muted-foreground"}>
                                          {item.item}
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
                                  <Label className="text-sm">첨부 사진</Label>
                                  <div className="flex flex-wrap gap-2">
                                    {inspection.images.map((img, idx) => (
                                      <img
                                        key={idx}
                                        src={img}
                                        alt={`점검 사진 ${idx + 1}`}
                                        className="h-24 w-24 object-cover rounded-lg border cursor-pointer hover:opacity-80"
                                        onClick={() => window.open(img, "_blank")}
                                      />
                                    ))}
                                  </div>
                                </div>
                              )}
                            </motion.div>
                          )}
                        </AnimatePresence>
                      </div>
                      <div className="flex items-center gap-1">
                        <Button
                          variant="ghost"
                          size="icon"
                          onClick={() => setExpandedId(expandedId === inspection.id ? null : inspection.id)}
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
                          className="opacity-0 group-hover:opacity-100"
                          onClick={() => handleDelete(inspection.id)}
                          disabled={isLocked}
                          data-testid={`button-delete-${inspection.id}`}
                        >
                          <Trash2 className="w-4 h-4 text-destructive" />
                        </Button>
                      </div>
                    </div>
                  </CardContent>
                </Card>
              </motion.div>
            ))}
          </AnimatePresence>
        )}
      </div>
    </div>
  );
}
