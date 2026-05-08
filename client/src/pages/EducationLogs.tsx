import { useState, useRef, useEffect, useCallback, useMemo } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { queryClient, apiRequest } from "@/lib/queryClient";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Checkbox } from "@/components/ui/checkbox";
import { useToast } from "@/hooks/use-toast";
import { usePermissions } from "@/hooks/use-permissions";
import { useAuth } from "@/hooks/use-auth";
import { useNotices, useCreateNotice, useDeleteNotice } from "@/hooks/use-notices";
import { motion, AnimatePresence } from "framer-motion";
import {
  GraduationCap, Plus, Trash2, ArrowLeft, Users, Calendar, FileText,
  PenTool, CheckCircle2, Clock, BarChart3, TrendingUp, Award, X, Search, Eye, Download,
  ChevronDown, ChevronRight, Copy, Pencil, Camera, ImagePlus, Save,
  BookOpen, Paperclip, FileSpreadsheet, FileIcon, Image, Video, Loader2, Link2, CheckSquare
} from "lucide-react";
import type { EducationSession, EducationSignature } from "@shared/schema";

const DEPARTMENTS = [
  "동대구운용팀", "포항운용팀", "안동운용팀",
  "서대구운용팀", "남대구운용팀", "구미운용팀", "문경운용팀",
  "운용계획팀", "사업지원팀", "현장경영팀"
];

const EDUCATION_TYPES = ["정기교육", "신규교육", "특별교육", "안전교육", "직무교육"];

interface DeptProgress {
  department: string;
  sessionId: number;
  status: string;
  totalParticipants: number;
  signed: number;
  progressRate: number;
  educationType: string;
}

interface ProgressData {
  title: string;
  educationDate: string;
  educationEndDate?: string | null;
  educationType: string;
  totalDepartments: number;
  completedSessions: number;
  totalParticipants: number;
  totalSigned: number;
  progressRate: number;
  departments: DeptProgress[];
}

function SignaturePad({ onSave, onCancel }: { onSave: (data: string) => void; onCancel: () => void }) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [isDrawing, setIsDrawing] = useState(false);
  const [hasContent, setHasContent] = useState(false);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    const rect = canvas.getBoundingClientRect();
    const dpr = window.devicePixelRatio || 1;
    canvas.width = rect.width * dpr;
    canvas.height = rect.height * dpr;
    ctx.scale(dpr, dpr);
    ctx.strokeStyle = "#1a1a2e";
    ctx.lineWidth = 2.5;
    ctx.lineCap = "round";
    ctx.lineJoin = "round";
    ctx.fillStyle = "#ffffff";
    ctx.fillRect(0, 0, rect.width, rect.height);
  }, []);

  const getPos = useCallback((e: React.TouchEvent | React.MouseEvent) => {
    const canvas = canvasRef.current;
    if (!canvas) return { x: 0, y: 0 };
    const rect = canvas.getBoundingClientRect();
    if ("touches" in e) {
      return {
        x: e.touches[0].clientX - rect.left,
        y: e.touches[0].clientY - rect.top,
      };
    }
    return { x: (e as React.MouseEvent).clientX - rect.left, y: (e as React.MouseEvent).clientY - rect.top };
  }, []);

  const startDraw = useCallback((e: React.TouchEvent | React.MouseEvent) => {
    e.preventDefault();
    const ctx = canvasRef.current?.getContext("2d");
    if (!ctx) return;
    setIsDrawing(true);
    const pos = getPos(e);
    ctx.beginPath();
    ctx.moveTo(pos.x, pos.y);
  }, [getPos]);

  const draw = useCallback((e: React.TouchEvent | React.MouseEvent) => {
    if (!isDrawing) return;
    e.preventDefault();
    const ctx = canvasRef.current?.getContext("2d");
    if (!ctx) return;
    const pos = getPos(e);
    ctx.lineTo(pos.x, pos.y);
    ctx.stroke();
    setHasContent(true);
  }, [isDrawing, getPos]);

  const endDraw = useCallback(() => {
    setIsDrawing(false);
  }, []);

  const clearCanvas = useCallback(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    const rect = canvas.getBoundingClientRect();
    ctx.fillStyle = "#ffffff";
    ctx.fillRect(0, 0, rect.width, rect.height);
    setHasContent(false);
  }, []);

  const handleSave = () => {
    if (!hasContent || !canvasRef.current) return;
    const data = canvasRef.current.toDataURL("image/png");
    onSave(data);
  };

  return (
    <div className="space-y-3">
      <div className="border-2 border-dashed border-primary/30 rounded-lg overflow-hidden bg-white">
        <canvas
          ref={canvasRef}
          className="w-full touch-none cursor-crosshair"
          style={{ height: "180px" }}
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
      <p className="text-xs text-center text-muted-foreground">
        위 영역에 서명해주세요
      </p>
      <div className="flex gap-2 justify-end">
        <Button variant="outline" size="sm" onClick={clearCanvas} data-testid="button-clear-signature">
          지우기
        </Button>
        <Button variant="outline" size="sm" onClick={onCancel} data-testid="button-cancel-signature">
          취소
        </Button>
        <Button
          size="sm"
          disabled={!hasContent}
          onClick={handleSave}
          className="bg-gradient-to-r from-emerald-500 to-teal-600 text-white"
          data-testid="button-save-signature"
        >
          <PenTool className="w-3.5 h-3.5 mr-1.5" />
          서명 완료
        </Button>
      </div>
    </div>
  );
}


function ProgressDashboard() {
  const { data: progress, isLoading } = useQuery<ProgressData[]>({
    queryKey: ["/api/education-progress"],
  });
  const [expandedKey, setExpandedKey] = useState<string | null>(null);

  if (isLoading) {
    return (
      <div className="space-y-3">
        {[1, 2, 3].map(i => (
          <Card key={i}>
            <CardContent className="p-4">
              <div className="h-16 bg-muted/30 animate-pulse rounded-lg" />
            </CardContent>
          </Card>
        ))}
      </div>
    );
  }

  const totalEducations = progress?.length || 0;
  // 전 부서 세션이 모두 '완료' 상태인 교육 건수
  const completedAll = progress?.filter(p => p.totalDepartments > 0 && p.completedSessions === p.totalDepartments).length || 0;
  // 아직 전체 완료되지 않은 교육 건수 (서명 시작 전 포함)
  const inProgress = progress?.filter(p => p.completedSessions < p.totalDepartments).length || 0;
  const completionRate = totalEducations > 0 ? Math.round((completedAll / totalEducations) * 100) : 0;

  const toggleExpand = (key: string) => {
    setExpandedKey(prev => prev === key ? null : key);
  };

  return (
    <div className="space-y-4 sm:space-y-6">
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        <Card>
          <CardContent className="p-3 sm:p-4 text-center">
            <FileText className="w-5 h-5 mx-auto mb-1 text-blue-500" />
            <p className="text-[11px] text-muted-foreground">총 교육</p>
            <p className="text-xl font-bold text-blue-600" data-testid="text-total-educations">{totalEducations}건</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-3 sm:p-4 text-center">
            <CheckCircle2 className="w-5 h-5 mx-auto mb-1 text-emerald-500" />
            <p className="text-[11px] text-muted-foreground">교육완료</p>
            <p className="text-xl font-bold text-emerald-600" data-testid="text-completed-educations">{completedAll}건</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-3 sm:p-4 text-center">
            <Clock className="w-5 h-5 mx-auto mb-1 text-amber-500" />
            <p className="text-[11px] text-muted-foreground">진행중</p>
            <p className="text-xl font-bold text-amber-600" data-testid="text-in-progress">{inProgress}건</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-3 sm:p-4 text-center">
            <TrendingUp className="w-5 h-5 mx-auto mb-1 text-indigo-500" />
            <p className="text-[11px] text-muted-foreground">완료율</p>
            <p className="text-xl font-bold text-indigo-600" data-testid="text-overall-rate">{completionRate}%</p>
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader className="bg-gradient-to-r from-indigo-50 to-blue-50 dark:from-indigo-900/20 dark:to-blue-900/20 border-b p-3 sm:p-4">
          <CardTitle className="text-sm sm:text-base flex items-center gap-2">
            <BarChart3 className="w-4 h-4 text-indigo-600" />
            교육별 진행율
          </CardTitle>
        </CardHeader>
        <CardContent className="p-3 sm:p-4 space-y-2">
          {(!progress || progress.length === 0) ? (
            <div className="py-8 text-center text-muted-foreground">
              <BarChart3 className="w-10 h-10 mx-auto mb-3 opacity-30" />
              <p className="text-sm">아직 등록된 교육이 없습니다.</p>
            </div>
          ) : (
            progress.map((edu, idx) => {
              const key = `${edu.title}||${edu.educationDate}`;
              const isExpanded = expandedKey === key;
              return (
                <motion.div
                  key={key}
                  initial={{ opacity: 0, y: -10 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: idx * 0.03 }}
                  data-testid={`progress-edu-${idx}`}
                >
                  <div
                    className="flex items-center gap-3 p-3 rounded-lg cursor-pointer hover-elevate transition-colors"
                    onClick={() => toggleExpand(key)}
                    data-testid={`button-expand-edu-${idx}`}
                  >
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="text-sm font-medium truncate">{edu.title}</span>
                        <Badge variant="secondary" className="text-[10px] shrink-0">{edu.educationType}</Badge>
                        {edu.completedSessions < edu.totalDepartments && (
                          <Badge className="text-[10px] shrink-0 bg-amber-100 text-amber-700 border border-amber-300 dark:bg-amber-900/30 dark:text-amber-400 dark:border-amber-700 gap-1">
                            <Clock className="w-2.5 h-2.5" />서명 진행중
                          </Badge>
                        )}
                      </div>
                      <div className="flex items-center gap-3 mt-1 text-xs text-muted-foreground flex-wrap">
                        <span className="flex items-center gap-1"><Calendar className="w-3 h-3" />{edu.educationDate}{edu.educationEndDate && edu.educationEndDate !== edu.educationDate ? ` ~ ${edu.educationEndDate}` : ""}</span>
                        <span>{edu.totalDepartments}개 부서</span>
                        <span className="flex items-center gap-1"><Users className="w-3 h-3" />{edu.totalSigned}/{edu.totalParticipants}명</span>
                      </div>
                      <div className="w-full bg-muted/50 rounded-full h-2 overflow-hidden mt-2">
                        <motion.div
                          initial={{ width: 0 }}
                          animate={{ width: `${edu.progressRate}%` }}
                          transition={{ duration: 0.8, delay: idx * 0.05 }}
                          className={`h-full rounded-full ${
                            edu.progressRate >= 80 ? "bg-gradient-to-r from-emerald-400 to-emerald-600" :
                            edu.progressRate >= 50 ? "bg-gradient-to-r from-amber-400 to-amber-600" :
                            "bg-gradient-to-r from-red-400 to-red-500"
                          }`}
                        />
                      </div>
                    </div>
                    <div className="flex items-center gap-2 shrink-0">
                      <span className={`text-sm font-bold ${
                        edu.progressRate >= 80 ? "text-emerald-600" :
                        edu.progressRate >= 50 ? "text-amber-600" :
                        "text-red-500"
                      }`}>
                        {edu.progressRate}%
                      </span>
                      {isExpanded ? <ChevronDown className="w-4 h-4 text-muted-foreground" /> : <ChevronRight className="w-4 h-4 text-muted-foreground" />}
                    </div>
                  </div>
                  <AnimatePresence>
                    {isExpanded && (
                      <motion.div
                        initial={{ height: 0, opacity: 0 }}
                        animate={{ height: "auto", opacity: 1 }}
                        exit={{ height: 0, opacity: 0 }}
                        transition={{ duration: 0.2 }}
                        className="overflow-hidden"
                      >
                        <div className="ml-3 pl-3 border-l-2 border-indigo-200 dark:border-indigo-800 space-y-2 py-2">
                          {edu.departments.map((dept) => (
                            <div key={dept.department} className="flex items-center justify-between text-sm p-2 rounded-md bg-muted/30" data-testid={`progress-dept-${dept.department}`}>
                              <div className="flex items-center gap-2 min-w-0 flex-1">
                                <span className="truncate text-sm">{dept.department}</span>
                                <Badge
                                  variant={dept.status === "완료" ? "default" : "outline"}
                                  className={`text-[10px] shrink-0 ${dept.status === "완료" ? "bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-400" : ""}`}
                                >
                                  {dept.status}
                                </Badge>
                              </div>
                              <div className="flex items-center gap-2 shrink-0">
                                <span className="text-xs text-muted-foreground">{dept.signed}/{dept.totalParticipants}명</span>
                                <div className="w-16 bg-muted/50 rounded-full h-1.5 overflow-hidden">
                                  <div
                                    className={`h-full rounded-full ${
                                      dept.progressRate >= 80 ? "bg-emerald-500" :
                                      dept.progressRate >= 50 ? "bg-amber-500" :
                                      "bg-red-500"
                                    }`}
                                    style={{ width: `${dept.progressRate}%` }}
                                  />
                                </div>
                                <span className={`text-xs font-bold w-10 text-right ${
                                  dept.progressRate >= 80 ? "text-emerald-600" :
                                  dept.progressRate >= 50 ? "text-amber-600" :
                                  "text-red-500"
                                }`}>
                                  {dept.progressRate}%
                                </span>
                              </div>
                            </div>
                          ))}
                        </div>
                      </motion.div>
                    )}
                  </AnimatePresence>
                </motion.div>
              );
            })
          )}
        </CardContent>
      </Card>
    </div>
  );
}

function getExtFromName(name: string | null | undefined) {
  if (!name) return '';
  return name.split('.').pop()?.toLowerCase() || '';
}

function getFileIconByMeta(fileType: string | null | undefined, fileName: string | null | undefined) {
  const ext = getExtFromName(fileName);
  if (fileType?.startsWith('image/')) return <Image className="w-4 h-4 text-blue-500" />;
  if (fileType?.startsWith('video/') || ['mp4','avi','mov','wmv','webm'].includes(ext)) return <Video className="w-4 h-4 text-purple-500" />;
  if (['pptx','ppt'].includes(ext) || fileType?.includes('presentation') || fileType?.includes('powerpoint')) return <FileText className="w-4 h-4 text-orange-500" />;
  if (['docx','doc'].includes(ext) || fileType?.includes('word')) return <FileText className="w-4 h-4 text-blue-500" />;
  if (['xlsx','xls'].includes(ext) || fileType?.includes('spreadsheet') || fileType?.includes('excel')) return <FileSpreadsheet className="w-4 h-4 text-green-500" />;
  if (ext === 'pdf' || fileType === 'application/pdf') return <FileIcon className="w-4 h-4 text-red-500" />;
  return <Paperclip className="w-4 h-4" />;
}

function getFileLabelByMeta(fileType: string | null | undefined, fileName: string | null | undefined) {
  const ext = getExtFromName(fileName);
  if (fileType?.startsWith('image/')) return '이미지';
  if (fileType?.startsWith('video/') || ['mp4','avi','mov','wmv','webm'].includes(ext)) return '동영상';
  if (['pptx','ppt'].includes(ext) || fileType?.includes('presentation') || fileType?.includes('powerpoint')) return 'PPT';
  if (['docx','doc'].includes(ext) || fileType?.includes('word')) return 'Word';
  if (['xlsx','xls'].includes(ext) || fileType?.includes('spreadsheet') || fileType?.includes('excel')) return 'Excel';
  if (ext === 'pdf' || fileType === 'application/pdf') return 'PDF';
  return '파일';
}

function isVideoByType(fileType: string | null | undefined, fileName: string | null | undefined) {
  if (fileType?.startsWith('video/')) return true;
  return ['mp4','avi','mov','wmv','webm'].includes(getExtFromName(fileName));
}

export default function EducationLogs() {
  const { isAdmin, canRegisterEducation, canEditEducationLogs, canDownloadEducationExcel, canUploadEducationPhotos, canDownloadEducationFiles } = usePermissions();
  const canEditLogs = canRegisterEducation || canEditEducationLogs;
  const { user } = useAuth();
  const { toast } = useToast();

  const [mainTab, setMainTab] = useState<"logs" | "materials">("logs");
  const [activeTab, setActiveTab] = useState<"dashboard" | "sessions">("dashboard");
  const [selectedSession, setSelectedSession] = useState<EducationSession | null>(null);

  const [matSearchQuery, setMatSearchQuery] = useState("");
  const [matShowAddForm, setMatShowAddForm] = useState(false);
  const [matTitle, setMatTitle] = useState("");
  const [matContent, setMatContent] = useState("");
  const [matAttachments, setMatAttachments] = useState<Array<{url: string; name: string; type: string}>>([]);
  const [matUploading, setMatUploading] = useState(false);
  const matFileInputRef = useRef<HTMLInputElement>(null);
  const [selectedMaterial, setSelectedMaterial] = useState<any | null>(null);

  const [newMaterialAttachments, setNewMaterialAttachments] = useState<Array<{url: string; name: string; type: string}>>([]);
  const [newMaterialUploading, setNewMaterialUploading] = useState(false);
  const newMaterialFileInputRef = useRef<HTMLInputElement>(null);
  const [showCreateDialog, setShowCreateDialog] = useState(false);
  const [showEditDialog, setShowEditDialog] = useState(false);
  const [editingSession, setEditingSession] = useState<EducationSession | null>(null);
  const [showSignDialog, setShowSignDialog] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  const [filterDept, setFilterDept] = useState<string>("all");

  const [newTitle, setNewTitle] = useState("");
  const [newDate, setNewDate] = useState(new Date().toISOString().split("T")[0]);
  const [newEndDate, setNewEndDate] = useState("");
  const [selectedDepts, setSelectedDepts] = useState<string[]>([]);
  const [deptParticipants, setDeptParticipants] = useState<Record<string, string>>({});
  const [newType, setNewType] = useState("정기교육");
  const [newInstructor, setNewInstructor] = useState("");
  const [newParticipants, setNewParticipants] = useState("");
  const [newDescription, setNewDescription] = useState("");

  const [editTitle, setEditTitle] = useState("");
  const [editDate, setEditDate] = useState("");
  const [editEndDate, setEditEndDate] = useState("");
  const [editType, setEditType] = useState("정기교육");
  const [editInstructor, setEditInstructor] = useState("");
  const [editParticipants, setEditParticipants] = useState("");
  const [editDescription, setEditDescription] = useState("");
  const [editDepartment, setEditDepartment] = useState("");

  const [signerName, setSignerName] = useState("");
  const [signerDept, setSignerDept] = useState("");


  const [expandedGroups, setExpandedGroups] = useState<Set<string>>(new Set());
  const [editingGroup, setEditingGroup] = useState<{ key: string; title: string; date: string; type: string; sessions: EducationSession[] } | null>(null);
  const [selectionMode, setSelectionMode] = useState(false);
  const [selectedSessionIds, setSelectedSessionIds] = useState<Set<number>>(new Set());

  const [isEditingDescription, setIsEditingDescription] = useState(false);
  const [inlineDescription, setInlineDescription] = useState("");
  const [uploadingPhotos, setUploadingPhotos] = useState(false);
  const photoInputRef = useRef<HTMLInputElement>(null);
  const [showPhotoPreview, setShowPhotoPreview] = useState<string | null>(null);

  // 교육 결과 미리보기 팝업
  const [previewSession, setPreviewSession] = useState<EducationSession | null>(null);
  const [previewPhotoIndex, setPreviewPhotoIndex] = useState<number | null>(null);

  const { data: sessions, isLoading: sessionsLoading } = useQuery<EducationSession[]>({
    queryKey: ["/api/education-sessions"],
  });

  useEffect(() => {
    if (selectedSession && sessions) {
      const updated = sessions.find(s => s.id === selectedSession.id);
      if (updated && JSON.stringify(updated) !== JSON.stringify(selectedSession)) {
        setSelectedSession(updated);
      }
    }
  }, [sessions]);

  const { data: signatures } = useQuery<EducationSignature[]>({
    queryKey: ["/api/education-sessions", selectedSession?.id, "signatures"],
    enabled: !!selectedSession,
  });

  const { data: previewSignatures } = useQuery<EducationSignature[]>({
    queryKey: ["/api/education-sessions", previewSession?.id, "signatures"],
    enabled: !!previewSession,
  });

  const createMutation = useMutation({
    mutationFn: (data: any) => apiRequest("POST", "/api/education-sessions", data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/education-sessions"] });
      queryClient.invalidateQueries({ queryKey: ["/api/education-progress"] });
      resetForm();
      setShowCreateDialog(false);
      toast({ title: "교육일지가 생성되었습니다." });
    },
    onError: () => toast({ variant: "destructive", title: "교육일지 생성 실패" }),
  });

  const batchCreateMutation = useMutation({
    mutationFn: (data: any) => apiRequest("POST", "/api/education-sessions/batch", data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/education-sessions"] });
      queryClient.invalidateQueries({ queryKey: ["/api/education-progress"] });
      resetForm();
      setShowCreateDialog(false);
      toast({ title: `${selectedDepts.length}개 부서에 교육일지가 일괄 생성되었습니다.` });
    },
    onError: (err: any) => {
      const msg = err?.message || "";
      if (msg.includes("401")) {
        toast({ variant: "destructive", title: "세션이 만료되었습니다. 다시 로그인해 주세요." });
      } else if (msg.includes("403")) {
        toast({ variant: "destructive", title: "교육 등록 권한이 없습니다." });
      } else {
        toast({ variant: "destructive", title: "교육일지 생성 실패", description: msg });
      }
    },
  });

  const deleteMutation = useMutation({
    mutationFn: (id: number) => apiRequest("DELETE", `/api/education-sessions/${id}`),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/education-sessions"] });
      queryClient.invalidateQueries({ queryKey: ["/api/education-progress"] });
      setSelectedSession(null);
      toast({ title: "교육일지가 삭제되었습니다." });
    },
  });

  const batchDeleteMutation = useMutation({
    mutationFn: async (ids: number[]) => {
      for (const id of ids) {
        await apiRequest("DELETE", `/api/education-sessions/${id}`);
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/education-sessions"] });
      queryClient.invalidateQueries({ queryKey: ["/api/education-progress"] });
      setSelectedSession(null);
      toast({ title: "교육 카테고리가 삭제되었습니다." });
    },
    onError: () => toast({ variant: "destructive", title: "삭제 실패" }),
  });

  const bulkDeleteSessionsMutation = useMutation({
    mutationFn: (ids: number[]) => apiRequest("POST", "/api/education-sessions/bulk-delete", { ids }),
    onSuccess: async (res) => {
      const data = await (res as any).json();
      queryClient.invalidateQueries({ queryKey: ["/api/education-sessions"] });
      queryClient.invalidateQueries({ queryKey: ["/api/education-progress"] });
      setSelectedSessionIds(new Set()); setSelectionMode(false);
      toast({ title: `${data.deleted}건 삭제 완료` });
    },
    onError: () => toast({ variant: "destructive", title: "삭제 실패" }),
  });

  const toggleSelectSession = (id: number) => setSelectedSessionIds(prev => { const n = new Set(prev); n.has(id) ? n.delete(id) : n.add(id); return n; });

  const batchEditMutation = useMutation({
    mutationFn: async ({ ids, data }: { ids: number[]; data: any }) => {
      for (const id of ids) {
        await apiRequest("PATCH", `/api/education-sessions/${id}`, data);
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/education-sessions"] });
      queryClient.invalidateQueries({ queryKey: ["/api/education-progress"] });
      setShowEditDialog(false);
      setEditingSession(null);
      setEditingGroup(null);
      toast({ title: "교육 카테고리가 수정되었습니다." });
    },
    onError: () => toast({ variant: "destructive", title: "수정 실패" }),
  });

  const updateStatusMutation = useMutation({
    mutationFn: ({ id, status }: { id: number; status: string }) =>
      apiRequest("PATCH", `/api/education-sessions/${id}`, { status }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/education-sessions"] });
      queryClient.invalidateQueries({ queryKey: ["/api/education-progress"] });
      toast({ title: "상태가 변경되었습니다." });
    },
  });

  const editMutation = useMutation({
    mutationFn: ({ id, data }: { id: number; data: any }) =>
      apiRequest("PATCH", `/api/education-sessions/${id}`, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/education-sessions"] });
      queryClient.invalidateQueries({ queryKey: ["/api/education-progress"] });
      setShowEditDialog(false);
      setEditingSession(null);
      if (selectedSession && editingSession && selectedSession.id === editingSession.id) {
        setSelectedSession(null);
      }
      toast({ title: "교육일지가 수정되었습니다." });
    },
    onError: () => toast({ variant: "destructive", title: "교육일지 수정 실패" }),
  });

  const signMutation = useMutation({
    mutationFn: async (data: { sessionId: number; signerName: string; signerDepartment: string; signatureData: string }) => {
      const res = await apiRequest("POST", `/api/education-sessions/${data.sessionId}/signatures`, data);
      return res;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/education-sessions", selectedSession?.id, "signatures"] });
      queryClient.invalidateQueries({ queryKey: ["/api/education-progress"] });
      setShowSignDialog(false);
      setSignerName("");
      setSignerDept("");
      toast({ title: "서명이 등록되었습니다." });
    },
    onError: (error: any) => {
      let msg = "서명 등록 실패";
      try {
        const errText = error?.message || "";
        const jsonMatch = errText.match(/\{.*\}/);
        if (jsonMatch) {
          const parsed = JSON.parse(jsonMatch[0]);
          if (parsed.message) msg = parsed.message;
        }
      } catch {}
      toast({ variant: "destructive", title: msg });
    },
  });

  const inlineEditMutation = useMutation({
    mutationFn: ({ id, data }: { id: number; data: any }) =>
      apiRequest("PATCH", `/api/education-sessions/${id}`, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/education-sessions"] });
      queryClient.invalidateQueries({ queryKey: ["/api/education-progress"] });
      setIsEditingDescription(false);
      toast({ title: "수정되었습니다." });
    },
    onError: () => toast({ variant: "destructive", title: "수정 실패" }),
  });

  const handlePhotoUpload = async (files: FileList) => {
    if (!selectedSession) return;
    setUploadingPhotos(true);
    try {
      const newImages: string[] = [...(selectedSession.images || [])];
      for (const file of Array.from(files)) {
        const res = await apiRequest("POST", "/api/uploads/request-url", {
          name: file.name,
          size: file.size,
          contentType: file.type,
        });
        const { uploadURL, objectPath } = await res.json();
        await fetch(uploadURL, {
          method: "PUT",
          body: file,
          headers: { "Content-Type": file.type },
        });
        newImages.push(objectPath);
      }
      await apiRequest("PATCH", `/api/education-sessions/${selectedSession.id}`, { images: newImages });
      queryClient.invalidateQueries({ queryKey: ["/api/education-sessions"] });
      toast({ title: `${files.length}장의 사진이 등록되었습니다.` });
    } catch (err) {
      toast({ variant: "destructive", title: "사진 업로드 실패" });
    } finally {
      setUploadingPhotos(false);
      if (photoInputRef.current) photoInputRef.current.value = "";
    }
  };

  const handleRemovePhoto = async (index: number) => {
    if (!selectedSession) return;
    const newImages = [...(selectedSession.images || [])];
    newImages.splice(index, 1);
    await apiRequest("PATCH", `/api/education-sessions/${selectedSession.id}`, { images: newImages });
    queryClient.invalidateQueries({ queryKey: ["/api/education-sessions"] });
    toast({ title: "사진이 삭제되었습니다." });
  };

  const { data: eduNotices } = useNotices("edu");
  const createNoticeMutation = useCreateNotice();
  const deleteNoticeMutation = useDeleteNotice();

  const handleNewMaterialUpload = async (files: FileList) => {
    setNewMaterialUploading(true);
    try {
      const uploaded: Array<{url: string; name: string; type: string}> = [];
      for (const file of Array.from(files)) {
        if (file.size > 100 * 1024 * 1024) {
          toast({ variant: "destructive", title: `파일이 너무 큽니다 (최대 100MB): ${file.name}` });
          continue;
        }
        const formData = new FormData();
        formData.append("file", file);
        const res = await fetch("/api/upload/general", { method: "POST", body: formData, credentials: "include" });
        if (res.ok) {
          const data = await res.json();
          uploaded.push({ url: data.url, name: file.name, type: file.type });
        } else if (res.status === 401) {
          toast({ variant: "destructive", title: "세션이 만료되었습니다. 다시 로그인해 주세요." });
          queryClient.setQueryData(["/api/auth/user"], null);
          break;
        } else {
          toast({ variant: "destructive", title: `업로드 실패: ${file.name}` });
        }
      }
      if (uploaded.length > 0) {
        setNewMaterialAttachments(prev => [...prev, ...uploaded]);
        toast({ title: `${uploaded.length}개 파일이 첨부되었습니다.` });
      }
    } catch {
      toast({ variant: "destructive", title: "파일 업로드 실패" });
    } finally {
      setNewMaterialUploading(false);
    }
  };

  const handleMatLibUpload = async (files: FileList) => {
    setMatUploading(true);
    try {
      const uploaded: Array<{url: string; name: string; type: string}> = [];
      for (const file of Array.from(files)) {
        if (file.size > 100 * 1024 * 1024) {
          toast({ variant: "destructive", title: `파일이 너무 큽니다 (최대 100MB): ${file.name}` });
          continue;
        }
        const formData = new FormData();
        formData.append("file", file);
        const res = await fetch("/api/upload/general", { method: "POST", body: formData, credentials: "include" });
        if (res.ok) {
          const data = await res.json();
          uploaded.push({ url: data.url, name: file.name, type: file.type });
        } else if (res.status === 401) {
          toast({ variant: "destructive", title: "세션이 만료되었습니다. 다시 로그인해 주세요." });
          queryClient.setQueryData(["/api/auth/user"], null);
          break;
        } else {
          toast({ variant: "destructive", title: `업로드 실패: ${file.name}` });
        }
      }
      if (uploaded.length > 0) {
        setMatAttachments(prev => [...prev, ...uploaded]);
        toast({ title: `${uploaded.length}개 파일이 첨부되었습니다.` });
      }
    } catch {
      toast({ variant: "destructive", title: "파일 업로드 실패" });
    } finally {
      setMatUploading(false);
    }
  };

  const handleCreateMaterial = async () => {
    if (!matTitle.trim()) {
      toast({ variant: "destructive", title: "자료 제목을 입력해주세요." });
      return;
    }
    try {
      await createNoticeMutation.mutateAsync({
        title: matTitle,
        content: matContent || undefined,
        category: "edu",
        attachments: matAttachments,
      });
      setMatTitle("");
      setMatContent("");
      setMatAttachments([]);
      setMatShowAddForm(false);
      toast({ title: "교육 자료가 등록되었습니다." });
    } catch {
      toast({ variant: "destructive", title: "자료 등록 실패" });
    }
  };

  const handleDeleteMaterial = async (id: number) => {
    if (!confirm("이 교육 자료를 삭제하시겠습니까?")) return;
    try {
      await deleteNoticeMutation.mutateAsync(id);
      if (selectedMaterial?.id === id) setSelectedMaterial(null);
      toast({ title: "교육 자료가 삭제되었습니다." });
    } catch {
      toast({ variant: "destructive", title: "삭제 실패" });
    }
  };

  const resetForm = () => {
    setNewTitle("");
    setNewDate(new Date().toISOString().split("T")[0]);
    setNewEndDate("");
    setSelectedDepts([]);
    setDeptParticipants({});
    setNewType("정기교육");
    setNewInstructor("");
    setNewParticipants("");
    setNewDescription("");
    setNewMaterialAttachments([]);
  };

  const toggleDept = (dept: string) => {
    setSelectedDepts(prev => {
      if (prev.includes(dept)) {
        const updated = { ...deptParticipants };
        delete updated[dept];
        setDeptParticipants(updated);
        return prev.filter(d => d !== dept);
      }
      return [...prev, dept];
    });
  };

  const toggleAllDepts = () => {
    if (selectedDepts.length === DEPARTMENTS.length) {
      setSelectedDepts([]);
      setDeptParticipants({});
    } else {
      setSelectedDepts([...DEPARTMENTS]);
    }
  };

  const applyParticipantsToAll = () => {
    if (!newParticipants) return;
    const updated: Record<string, string> = {};
    selectedDepts.forEach(d => { updated[d] = newParticipants; });
    setDeptParticipants(updated);
  };

  const handleCreate = () => {
    if (!newTitle || selectedDepts.length === 0) {
      toast({ variant: "destructive", title: "교육 제목과 부서를 입력해주세요." });
      return;
    }

    const mats = newMaterialAttachments.length > 0 ? newMaterialAttachments : undefined;

    if (selectedDepts.length === 1) {
      const participants = Number(deptParticipants[selectedDepts[0]] || newParticipants);
      if (!participants || participants < 1) {
        toast({ variant: "destructive", title: "인원수를 입력해주세요." });
        return;
      }
      createMutation.mutate({
        title: newTitle,
        educationDate: newDate,
        educationEndDate: newEndDate || undefined,
        department: selectedDepts[0],
        educationType: newType,
        instructor: newInstructor || undefined,
        totalParticipants: participants,
        description: newDescription || undefined,
        materialAttachments: mats,
      });
    } else {
      const departments = selectedDepts.map(dept => ({
        name: dept,
        participants: Number(deptParticipants[dept] || newParticipants || 0),
      }));
      const missing = departments.filter(d => !d.participants || d.participants < 1);
      if (missing.length > 0) {
        toast({ variant: "destructive", title: `${missing.map(m => m.name).join(", ")} 부서의 인원수를 입력해주세요.` });
        return;
      }
      batchCreateMutation.mutate({
        title: newTitle,
        educationDate: newDate,
        educationEndDate: newEndDate || undefined,
        departments,
        educationType: newType,
        instructor: newInstructor || undefined,
        description: newDescription || undefined,
        materialAttachments: mats,
      });
    }
  };

  const handleCopy = (session: EducationSession) => {
    resetForm();
    setNewTitle(session.title);
    setNewDate(new Date().toISOString().split("T")[0]);
    setSelectedDepts([session.department]);
    setDeptParticipants({ [session.department]: String(session.totalParticipants) });
    setNewType(session.educationType || "정기교육");
    setNewInstructor(session.instructor || "");
    setNewParticipants(String(session.totalParticipants));
    setNewDescription(session.description || "");
    setShowCreateDialog(true);
  };

  const handleStartEdit = (session: EducationSession) => {
    setEditingGroup(null);
    setEditingSession(session);
    setEditTitle(session.title);
    setEditDate(session.educationDate);
    setEditEndDate(session.educationEndDate || "");
    setEditType(session.educationType || "정기교육");
    setEditInstructor(session.instructor || "");
    setEditParticipants(String(session.totalParticipants));
    setEditDescription(session.description || "");
    setEditDepartment(session.department);
    setShowEditDialog(true);
  };

  const handleSaveEdit = () => {
    if (!editTitle) {
      toast({ variant: "destructive", title: "교육 제목을 입력해주세요." });
      return;
    }
    if (!editDate) {
      toast({ variant: "destructive", title: "교육일자를 입력해주세요." });
      return;
    }

    if (editingGroup) {
      const data: any = {
        title: editTitle,
        educationDate: editDate,
        educationEndDate: editEndDate || null,
        educationType: editType,
        instructor: editInstructor || undefined,
        description: editDescription || undefined,
      };
      batchEditMutation.mutate({
        ids: editingGroup.sessions.map(s => s.id),
        data,
      });
      return;
    }

    if (!editingSession) return;
    if (!editDepartment) {
      toast({ variant: "destructive", title: "부서를 선택해주세요." });
      return;
    }
    const participants = Number(editParticipants);
    if (!participants || participants < 1) {
      toast({ variant: "destructive", title: "인원수를 입력해주세요." });
      return;
    }
    editMutation.mutate({
      id: editingSession.id,
      data: {
        title: editTitle,
        educationDate: editDate,
        educationEndDate: editEndDate || null,
        department: editDepartment,
        educationType: editType,
        instructor: editInstructor || undefined,
        totalParticipants: participants,
        description: editDescription || undefined,
      },
    });
  };

  const handleGroupCopy = (group: { sessions: EducationSession[]; title: string; date: string; type: string }) => {
    resetForm();
    setNewTitle(group.title);
    setNewDate(new Date().toISOString().split("T")[0]);
    setNewType(group.type || "정기교육");
    const depts = group.sessions.map(s => s.department);
    setSelectedDepts(depts);
    const participantsMap: Record<string, string> = {};
    group.sessions.forEach(s => { participantsMap[s.department] = String(s.totalParticipants); });
    setDeptParticipants(participantsMap);
    setNewInstructor(group.sessions[0]?.instructor || "");
    setNewDescription(group.sessions[0]?.description || "");
    setShowCreateDialog(true);
  };

  const handleGroupEdit = (group: { key: string; title: string; date: string; type: string; sessions: EducationSession[] }) => {
    setEditingGroup(group);
    setEditingSession(null);
    setEditTitle(group.title);
    setEditDate(group.date);
    setEditType(group.type || "정기교육");
    setEditInstructor(group.sessions[0]?.instructor || "");
    setEditDescription(group.sessions[0]?.description || "");
    setEditDepartment("");
    setEditParticipants("");
    setShowEditDialog(true);
  };

  const handleGroupDelete = (group: { sessions: EducationSession[] }) => {
    if (confirm(`이 교육 카테고리의 ${group.sessions.length}개 부서 교육일지를 모두 삭제하시겠습니까?`)) {
      batchDeleteMutation.mutate(group.sessions.map(s => s.id));
    }
  };

  const [excelDownloading, setExcelDownloading] = useState(false);

  const handleGroupExcelDownload = async (group: { title: string; date: string }) => {
    setExcelDownloading(true);
    try {
      const params = new URLSearchParams({ title: group.title, date: group.date });
      const response = await fetch(`/api/education-sessions/group-excel?${params}`, {
        credentials: "include",
      });
      if (!response.ok) throw new Error("Download failed");
      const blob = await response.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `${group.title}_안전보건교육_참석자_서명_${group.date}.xlsx`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
      toast({ title: "엑셀 파일이 다운로드되었습니다." });
    } catch (e) {
      toast({ variant: "destructive", title: "엑셀 다운로드 실패" });
    } finally {
      setExcelDownloading(false);
    }
  };

  const hasAlreadySigned = useMemo(() => {
    if (!signatures || !user) return false;
    const userName = user.name || user.username || "";
    const userDept = user.department || "";
    return signatures.some(s => s.signerName === userName && s.signerDepartment === userDept);
  }, [signatures, user]);

  const handleSign = (signatureData: string) => {
    if (!selectedSession || !signerName) return;
    if (hasAlreadySigned) {
      toast({ variant: "destructive", title: "이미 서명을 등록하셨습니다. 한 사람당 한 번만 서명할 수 있습니다." });
      return;
    }
    signMutation.mutate({
      sessionId: selectedSession.id,
      signerName,
      signerDepartment: signerDept || selectedSession.department,
      signatureData,
    });
  };


  const filteredSessions = useMemo(() => {
    if (!sessions) return [];
    let result = sessions;
    if (filterDept && filterDept !== "all") {
      result = result.filter(s => s.department === filterDept);
    }
    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase();
      result = result.filter(s =>
        s.title.toLowerCase().includes(q) ||
        s.department.toLowerCase().includes(q) ||
        s.instructor?.toLowerCase().includes(q)
      );
    }
    return result;
  }, [sessions, filterDept, searchQuery]);

  const groupedSessions = useMemo(() => {
    const groups: { key: string; title: string; date: string; type: string; sessions: EducationSession[] }[] = [];
    const groupMap = new Map<string, typeof groups[0]>();
    for (const s of filteredSessions) {
      const gKey = `${s.title}__${s.educationDate}`;
      if (!groupMap.has(gKey)) {
        const group = { key: gKey, title: s.title, date: s.educationDate, type: s.educationType || "", sessions: [] as EducationSession[] };
        groupMap.set(gKey, group);
        groups.push(group);
      }
      groupMap.get(gKey)!.sessions.push(s);
    }
    return groups;
  }, [filteredSessions]);

  const filteredMaterials = useMemo(() => {
    if (!eduNotices) return [];
    if (!matSearchQuery.trim()) return eduNotices;
    const q = matSearchQuery.toLowerCase();
    return eduNotices.filter((m: any) => m.title?.toLowerCase().includes(q) || m.content?.toLowerCase().includes(q));
  }, [eduNotices, matSearchQuery]);

  const toggleGroup = (key: string) => {
    setExpandedGroups(prev => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  };

  if (selectedSession) {
    const signedCount = signatures?.length || 0;
    const progressRate = selectedSession.totalParticipants > 0
      ? Math.round((signedCount / selectedSession.totalParticipants) * 100)
      : 0;

    return (
      <div className="max-w-5xl mx-auto space-y-4 sm:space-y-6">
        <div className="flex items-center gap-2 sm:gap-3">
          <Button variant="ghost" size="icon" onClick={() => setSelectedSession(null)} data-testid="button-back-session">
            <ArrowLeft className="w-5 h-5" />
          </Button>
          <div className="bg-indigo-100 p-2 sm:p-2.5 rounded-lg text-indigo-600 dark:bg-indigo-900/30 dark:text-indigo-400">
            <GraduationCap className="w-5 h-5 sm:w-6 sm:h-6" />
          </div>
          <div className="flex-1 min-w-0">
            <h2 className="text-lg sm:text-xl font-bold text-foreground truncate" data-testid="text-session-title">
              {selectedSession.title}
            </h2>
            <p className="text-xs text-muted-foreground">
              {selectedSession.department} / {selectedSession.educationDate}{selectedSession.educationEndDate && selectedSession.educationEndDate !== selectedSession.educationDate ? ` ~ ${selectedSession.educationEndDate}` : ""}
            </p>
          </div>
          <div className="flex items-center gap-2 shrink-0">
            {canEditLogs && selectedSession.status === "진행중" && (
              <Button
                variant="outline"
                size="sm"
                onClick={() => updateStatusMutation.mutate({ id: selectedSession.id, status: "완료" })}
                className="gap-1.5"
                data-testid="button-complete-session"
              >
                <CheckCircle2 className="w-3.5 h-3.5" />
                완료
              </Button>
            )}
            {canEditLogs && selectedSession.status === "완료" && (
              <Button
                variant="outline"
                size="sm"
                onClick={() => updateStatusMutation.mutate({ id: selectedSession.id, status: "진행중" })}
                className="gap-1.5"
                data-testid="button-reopen-session"
              >
                <Clock className="w-3.5 h-3.5" />
                재개
              </Button>
            )}
          </div>
        </div>

        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
          <Card>
            <CardContent className="p-3 text-center">
              <p className="text-xs text-muted-foreground">교육유형</p>
              <p className="text-sm font-bold text-foreground">{selectedSession.educationType}</p>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="p-3 text-center">
              <p className="text-xs text-muted-foreground">교육인원</p>
              <p className="text-xl font-bold text-blue-600">{selectedSession.totalParticipants}명</p>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="p-3 text-center">
              <p className="text-xs text-muted-foreground">서명 완료</p>
              <p className="text-xl font-bold text-emerald-600">{signedCount}명</p>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="p-3 text-center">
              <p className="text-xs text-muted-foreground">진행율</p>
              <p className={`text-xl font-bold ${
                progressRate >= 80 ? "text-emerald-600" :
                progressRate >= 50 ? "text-amber-600" : "text-red-500"
              }`}>{progressRate}%</p>
            </CardContent>
          </Card>
        </div>

        <Card>
          <CardContent className="p-4">
            <div className="flex items-center justify-between gap-2 mb-2">
              <p className="text-xs text-muted-foreground">교육 내용</p>
              {canEditLogs && !isEditingDescription && (!selectedSession.createdBy || user?.role === "admin" || user?.username === selectedSession.createdBy) && (
                <Button variant="ghost" size="sm" className="h-6 text-xs gap-1" onClick={() => {
                  setInlineDescription(selectedSession.description || "");
                  setIsEditingDescription(true);
                }} data-testid="button-inline-edit-desc">
                  <Pencil className="w-3 h-3" />
                  수정
                </Button>
              )}
            </div>
            {isEditingDescription ? (
              <div className="space-y-2">
                <Textarea
                  value={inlineDescription}
                  onChange={e => setInlineDescription(e.target.value)}
                  className="min-h-[100px] text-sm"
                  data-testid="textarea-inline-desc"
                />
                <div className="flex justify-end gap-2">
                  <Button variant="outline" size="sm" onClick={() => setIsEditingDescription(false)}>취소</Button>
                  <Button size="sm" className="gap-1.5 bg-gradient-to-r from-indigo-500 to-purple-600 text-white"
                    disabled={inlineEditMutation.isPending}
                    onClick={() => inlineEditMutation.mutate({ id: selectedSession.id, data: { description: inlineDescription } })}
                    data-testid="button-save-inline-desc"
                  >
                    <Save className="w-3.5 h-3.5" />
                    저장
                  </Button>
                </div>
              </div>
            ) : (
              <p className="text-sm text-foreground whitespace-pre-wrap">
                {selectedSession.description || <span className="text-muted-foreground italic">교육 내용이 없습니다. 수정 버튼을 눌러 입력해주세요.</span>}
              </p>
            )}
          </CardContent>
        </Card>

        {selectedSession.materialAttachments && (selectedSession.materialAttachments as any[]).length > 0 && (
          <Card>
            <CardContent className="p-4">
              <p className="text-xs text-muted-foreground flex items-center gap-1.5 mb-3">
                <Paperclip className="w-3.5 h-3.5" />
                첨부 자료 ({(selectedSession.materialAttachments as any[]).length}개)
              </p>
              <div className="space-y-2">
                {(selectedSession.materialAttachments as any[]).map((att: any, idx: number) => (
                  <div key={idx} className="flex items-center gap-2 p-2 border rounded-lg bg-muted/10">
                    {getFileIconByMeta(att.type, att.name)}
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium truncate">{att.name}</p>
                      <p className="text-xs text-muted-foreground">{getFileLabelByMeta(att.type, att.name)}</p>
                    </div>
                    {(canDownloadEducationFiles || isAdmin) && (
                      <a
                        href={att.url}
                        download={att.name}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="shrink-0"
                      >
                        <Button variant="outline" size="sm" className="h-7 text-xs gap-1">
                          <Download className="w-3 h-3" />
                          다운로드
                        </Button>
                      </a>
                    )}
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>
        )}

        <Card>
          <CardContent className="p-4">
            <div className="flex items-center justify-between gap-2 mb-3">
              <p className="text-xs text-muted-foreground flex items-center gap-1.5">
                <Camera className="w-3.5 h-3.5" />
                교육 사진 ({(selectedSession.images || []).length}장)
              </p>
              {canEditLogs && canUploadEducationPhotos && (
                <>
                  <input
                    ref={photoInputRef}
                    type="file"
                    accept="image/*"
                    multiple
                    className="hidden"
                    onChange={e => e.target.files && e.target.files.length > 0 && handlePhotoUpload(e.target.files)}
                    data-testid="input-photo-upload"
                  />
                  <Button variant="outline" size="sm" className="h-7 text-xs gap-1.5"
                    disabled={uploadingPhotos}
                    onClick={() => photoInputRef.current?.click()}
                    data-testid="button-upload-photos"
                  >
                    <ImagePlus className="w-3.5 h-3.5" />
                    {uploadingPhotos ? "업로드 중..." : "사진 추가"}
                  </Button>
                </>
              )}
            </div>
            {(selectedSession.images || []).length > 0 ? (
              <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
                {(selectedSession.images || []).map((img, idx) => (
                  <div key={idx} className="relative group border rounded-lg overflow-visible">
                    <img
                      src={img}
                      alt={`교육 사진 ${idx + 1}`}
                      className="w-full h-32 sm:h-40 object-cover rounded-lg cursor-pointer"
                      onClick={() => setShowPhotoPreview(img)}
                      data-testid={`img-education-photo-${idx}`}
                    />
                    {canEditLogs && (
                      <Button variant="destructive" size="icon" className="absolute top-1.5 right-1.5 h-6 w-6 invisible group-hover:visible"
                        onClick={() => handleRemovePhoto(idx)}
                        data-testid={`button-remove-photo-${idx}`}
                      >
                        <X className="w-3 h-3" />
                      </Button>
                    )}
                  </div>
                ))}
              </div>
            ) : (
              <div className="border-2 border-dashed border-muted rounded-lg p-6 text-center text-muted-foreground">
                <Camera className="w-8 h-8 mx-auto mb-2 opacity-30" />
                <p className="text-xs">교육 사진을 등록해주세요</p>
                {canEditLogs && canUploadEducationPhotos && (
                  <Button variant="outline" size="sm" className="mt-2 gap-1.5 text-xs"
                    onClick={() => photoInputRef.current?.click()}
                    disabled={uploadingPhotos}
                  >
                    <ImagePlus className="w-3.5 h-3.5" />
                    사진 추가
                  </Button>
                )}
              </div>
            )}
          </CardContent>
        </Card>

        {showPhotoPreview && (
          <Dialog open={!!showPhotoPreview} onOpenChange={() => setShowPhotoPreview(null)}>
            <DialogContent className="sm:max-w-3xl p-2">
              <DialogHeader>
                <DialogTitle className="sr-only">사진 미리보기</DialogTitle>
              </DialogHeader>
              <img src={showPhotoPreview} alt="교육 사진 확대" className="w-full h-auto rounded-lg" />
            </DialogContent>
          </Dialog>
        )}

        {selectedSession.instructor && (
          <div className="flex items-center gap-2 text-sm text-muted-foreground px-1">
            <Award className="w-4 h-4" />
            교육자: <span className="font-medium text-foreground">{selectedSession.instructor}</span>
          </div>
        )}

        <div className="w-full bg-muted/40 rounded-full h-3 overflow-hidden">
          <motion.div
            initial={{ width: 0 }}
            animate={{ width: `${progressRate}%` }}
            transition={{ duration: 1 }}
            className={`h-full rounded-full ${
              progressRate >= 80 ? "bg-gradient-to-r from-emerald-400 to-emerald-600" :
              progressRate >= 50 ? "bg-gradient-to-r from-amber-400 to-amber-600" :
              "bg-gradient-to-r from-red-400 to-red-500"
            }`}
          />
        </div>

        <Card>
          <CardHeader className="bg-emerald-50/50 dark:bg-emerald-900/10 border-b p-3 sm:p-4 flex flex-row items-center justify-between gap-2">
            <CardTitle className="text-sm sm:text-base flex items-center gap-2">
              <PenTool className="w-4 h-4 text-emerald-600" />
              서명 현황 ({signedCount}/{selectedSession.totalParticipants})
            </CardTitle>
            {selectedSession.status === "진행중" && !hasAlreadySigned && (
              <Button
                size="sm"
                onClick={() => {
                  setSignerName(user?.name || user?.username || "");
                  setSignerDept(user?.department || selectedSession.department || "");
                  setShowSignDialog(true);
                }}
                className="bg-gradient-to-r from-emerald-500 to-teal-600 text-white gap-1.5"
                data-testid="button-open-sign"
              >
                <PenTool className="w-3.5 h-3.5" />
                서명하기
              </Button>
            )}
            {hasAlreadySigned && (
              <Badge className="bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-400 text-xs">
                <CheckCircle2 className="w-3 h-3 mr-1" />
                서명 완료
              </Badge>
            )}
          </CardHeader>
          <CardContent className="p-0">
            {signatures && signatures.length > 0 ? (
              <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-3 p-4">
                {signatures.map((sig, idx) => (
                  <motion.div
                    key={sig.id}
                    initial={{ opacity: 0, scale: 0.9 }}
                    animate={{ opacity: 1, scale: 1 }}
                    transition={{ delay: idx * 0.03 }}
                    className="border rounded-lg overflow-hidden bg-card"
                    data-testid={`signature-card-${sig.id}`}
                  >
                    <div className="bg-muted/20 p-1.5">
                      <img
                        src={sig.signatureData}
                        alt={`${sig.signerName} 서명`}
                        className="w-full h-16 object-contain"
                      />
                    </div>
                    <div className="p-2 text-center border-t">
                      <p className="text-xs font-medium truncate">{sig.signerName}</p>
                      {sig.signerDepartment && (
                        <p className="text-[10px] text-muted-foreground truncate">{sig.signerDepartment}</p>
                      )}
                    </div>
                  </motion.div>
                ))}
              </div>
            ) : (
              <div className="py-10 text-center text-muted-foreground">
                <PenTool className="w-10 h-10 mx-auto mb-3 opacity-30" />
                <p className="text-sm">아직 서명이 없습니다.</p>
                {selectedSession.status === "진행중" && !hasAlreadySigned && (
                  <Button
                    variant="outline"
                    size="sm"
                    className="mt-3 gap-1.5"
                    onClick={() => {
                      setSignerName(user?.name || user?.username || "");
                      setSignerDept(user?.department || selectedSession.department || "");
                      setShowSignDialog(true);
                    }}
                  >
                    <PenTool className="w-3.5 h-3.5" /> 첫 번째 서명하기
                  </Button>
                )}
              </div>
            )}
          </CardContent>
        </Card>

        <Dialog open={showSignDialog} onOpenChange={setShowSignDialog}>
          <DialogContent className="sm:max-w-md">
            <DialogHeader>
              <DialogTitle className="flex items-center gap-2">
                <PenTool className="w-5 h-5 text-emerald-500" />
                교육 서명
              </DialogTitle>
            </DialogHeader>
            <div className="space-y-4 pt-2">
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-xs font-medium text-muted-foreground mb-1 block">이름</label>
                  <Input
                    value={signerName}
                    readOnly
                    className="bg-muted/50"
                    data-testid="input-signer-name"
                  />
                </div>
                <div>
                  <label className="text-xs font-medium text-muted-foreground mb-1 block">소속</label>
                  <Input
                    value={signerDept}
                    readOnly
                    className="bg-muted/50"
                    data-testid="input-signer-dept"
                  />
                </div>
              </div>
              <SignaturePad
                onSave={handleSign}
                onCancel={() => setShowSignDialog(false)}
              />
            </div>
          </DialogContent>
        </Dialog>
      </div>
    );
  }

  return (
    <div className="max-w-5xl mx-auto space-y-4">
      <Card className="border-indigo-200/50 dark:border-indigo-900/30 overflow-hidden">
        <CardHeader className="bg-gradient-to-r from-indigo-50 to-purple-50 dark:from-indigo-900/20 dark:to-purple-900/20 border-b p-4">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
            <CardTitle className="flex items-center gap-3">
              <div className="bg-gradient-to-br from-indigo-500 to-purple-600 p-2 rounded-lg text-white">
                <GraduationCap className="w-5 h-5" />
              </div>
              <div>
                <span className="text-lg font-bold">교육 관리</span>
                <p className="text-xs font-normal text-muted-foreground">교육일지 및 교육 자료 관리</p>
              </div>
            </CardTitle>
            <div className="flex items-center gap-2">
              {mainTab === "logs" && isAdmin && (
                <Button
                  onClick={() => setShowCreateDialog(true)}
                  size="sm"
                  className="bg-gradient-to-r from-indigo-500 to-purple-600 text-white gap-1.5"
                  data-testid="button-create-session"
                >
                  <Plus className="w-4 h-4" />
                  교육 등록
                </Button>
              )}
            </div>
          </div>
          <div className="flex gap-0 mt-3 border-b -mb-4 -mx-4 px-4">
            <button
              className={`px-4 py-2 text-sm font-medium border-b-2 transition-colors ${mainTab === "logs" ? "border-indigo-500 text-indigo-600" : "border-transparent text-muted-foreground hover:text-foreground"}`}
              onClick={() => setMainTab("logs")}
              data-testid="main-tab-logs"
            >
              <FileText className="w-4 h-4 inline mr-1.5 -mt-0.5" />
              교육일지
            </button>
            <button
              className={`px-4 py-2 text-sm font-medium border-b-2 transition-colors ${mainTab === "materials" ? "border-indigo-500 text-indigo-600" : "border-transparent text-muted-foreground hover:text-foreground"}`}
              onClick={() => setMainTab("materials")}
              data-testid="main-tab-materials"
            >
              <BookOpen className="w-4 h-4 inline mr-1.5 -mt-0.5" />
              교육 자료
            </button>
          </div>
        </CardHeader>
        <CardContent className="p-0">
          {mainTab === "materials" ? (
            <div className="p-4 space-y-4">
              <div className="relative">
                <Input
                  placeholder="자료 검색..."
                  value={matSearchQuery}
                  onChange={e => setMatSearchQuery(e.target.value)}
                  className="pr-8"
                  data-testid="input-search-materials"
                />
                <Search className="absolute right-2.5 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
              </div>
              {filteredMaterials.length === 0 ? (
                <div className="py-12 text-center text-muted-foreground">
                  <BookOpen className="w-12 h-12 mx-auto mb-3 opacity-30" />
                  <p className="text-sm">{matSearchQuery ? "검색 결과가 없습니다." : "등록된 교육 자료가 없습니다."}</p>
                  {!matSearchQuery && (
                    <p className="text-xs mt-1 text-muted-foreground/70">교육일지 등록 시 자료를 첨부하면 자동으로 여기에 나타납니다.</p>
                  )}
                </div>
              ) : (
                <div className="grid gap-3">
                  {filteredMaterials.map((mat: any) => {
                    const atts: any[] = mat.attachments || [];
                    return (
                      <motion.div
                        key={mat.id}
                        initial={{ opacity: 0, y: 8 }}
                        animate={{ opacity: 1, y: 0 }}
                        className="border rounded-lg p-4 hover:bg-indigo-50/30 dark:hover:bg-indigo-900/10 transition-colors cursor-pointer"
                        onClick={() => setSelectedMaterial(mat)}
                        data-testid={`material-card-${mat.id}`}
                      >
                        <div className="flex items-start gap-3">
                          <div className="bg-indigo-100 dark:bg-indigo-900/30 p-2 rounded-lg text-indigo-600 dark:text-indigo-400 shrink-0">
                            <BookOpen className="w-5 h-5" />
                          </div>
                          <div className="flex-1 min-w-0">
                            <h3 className="font-medium text-sm text-foreground">{mat.title}</h3>
                            {mat.content && <p className="text-xs text-muted-foreground mt-0.5 line-clamp-2">{mat.content}</p>}
                            <div className="flex flex-wrap gap-1 mt-2">
                              {atts.map((att: any, i: number) => (
                                <Badge key={i} variant="secondary" className="text-[10px] gap-1 h-5">
                                  {getFileIconByMeta(att.type, att.name)}
                                  {att.name?.split('/').pop() || att.name}
                                </Badge>
                              ))}
                            </div>
                            <p className="text-[10px] text-muted-foreground mt-1">{mat.createdAt ? new Date(mat.createdAt).toLocaleDateString("ko-KR") : ""}</p>
                          </div>
                          <div className="shrink-0 flex gap-1">
                            {(isAdmin || user?.username === mat.createdBy) && (
                              <Button
                                variant="ghost" size="icon" className="h-7 w-7 text-red-400 hover:text-red-600"
                                onClick={e => { e.stopPropagation(); handleDeleteMaterial(mat.id); }}
                                data-testid={`button-delete-material-${mat.id}`}
                              >
                                <Trash2 className="w-3.5 h-3.5" />
                              </Button>
                            )}
                          </div>
                        </div>
                      </motion.div>
                    );
                  })}
                </div>
              )}
            </div>
          ) : (
          <>
          <div className="flex border-b bg-muted/20">
            <button
              className={`flex-1 px-4 py-2.5 text-sm font-medium transition-colors ${
                activeTab === "dashboard"
                  ? "border-b-2 border-indigo-500 text-indigo-600 bg-background/50"
                  : "text-muted-foreground"
              }`}
              onClick={() => setActiveTab("dashboard")}
              data-testid="tab-dashboard"
            >
              <BarChart3 className="w-4 h-4 inline mr-1.5 -mt-0.5" />
              진행율 대시보드
            </button>
            <button
              className={`flex-1 px-4 py-2.5 text-sm font-medium transition-colors ${
                activeTab === "sessions"
                  ? "border-b-2 border-indigo-500 text-indigo-600 bg-background/50"
                  : "text-muted-foreground"
              }`}
              onClick={() => setActiveTab("sessions")}
              data-testid="tab-sessions"
            >
              <FileText className="w-4 h-4 inline mr-1.5 -mt-0.5" />
              교육 결과 등록
            </button>
          </div>

          <div className="p-4">
            {activeTab === "dashboard" ? (
              <ProgressDashboard />
            ) : (
              <div className="space-y-4">
                <div className="flex flex-col sm:flex-row gap-2">
                  <div className="relative flex-1">
                    <Input
                      placeholder="교육 검색..."
                      value={searchQuery}
                      onChange={e => setSearchQuery(e.target.value)}
                      className="pr-8"
                      data-testid="input-search-sessions"
                    />
                    <Search className="absolute right-2.5 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                  </div>
                  <Select value={filterDept} onValueChange={setFilterDept}>
                    <SelectTrigger className="w-full sm:w-44" data-testid="select-filter-dept">
                      <SelectValue placeholder="부서 필터" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="all">전체 부서</SelectItem>
                      {DEPARTMENTS.map(d => (
                        <SelectItem key={d} value={d}>{d}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  {canEditLogs && (
                    <Button
                      variant={selectionMode ? "default" : "outline"}
                      size="sm"
                      className={`gap-1.5 shrink-0 ${selectionMode ? "bg-red-500 hover:bg-red-600 text-white" : ""}`}
                      onClick={() => { setSelectionMode(v => !v); setSelectedSessionIds(new Set()); }}
                      data-testid="button-toggle-selection"
                    >
                      <CheckSquare className="w-4 h-4" />
                      {selectionMode ? `취소${selectedSessionIds.size > 0 ? ` (${selectedSessionIds.size})` : ""}` : "선택"}
                    </Button>
                  )}
                </div>

                {sessionsLoading ? (
                  <div className="space-y-3">
                    {[1, 2, 3].map(i => (
                      <div key={i} className="h-20 bg-muted/20 animate-pulse rounded-lg" />
                    ))}
                  </div>
                ) : filteredSessions.length === 0 ? (
                  <div className="py-12 text-center text-muted-foreground">
                    <FileText className="w-12 h-12 mx-auto mb-3 opacity-30" />
                    <p className="text-sm">
                      {searchQuery || filterDept !== "all" ? "검색 결과가 없습니다." : "등록된 교육일지가 없습니다."}
                    </p>
                    {!searchQuery && filterDept === "all" && isAdmin && (
                      <Button
                        onClick={() => setShowCreateDialog(true)}
                        variant="outline"
                        size="sm"
                        className="mt-3 gap-1.5"
                      >
                        <Plus className="w-4 h-4" /> 첫 번째 교육 등록
                      </Button>
                    )}
                  </div>
                ) : (
                  <div className="space-y-3">
                    {groupedSessions.map((group) => {
                      const isExpanded = expandedGroups.has(group.key);
                      const isSingleDept = group.sessions.length === 1;
                      const completedCount = group.sessions.filter(s => s.status === "완료").length;
                      const totalParticipants = group.sessions.reduce((sum, s) => sum + s.totalParticipants, 0);

                      if (isSingleDept) {
                        const session = group.sessions[0];
                        return (
                          <motion.div
                            key={session.id}
                            initial={{ opacity: 0, y: 10 }}
                            animate={{ opacity: 1, y: 0 }}
                            onClick={() => selectionMode ? toggleSelectSession(session.id) : setSelectedSession(session)}
                            className={`group border rounded-lg p-3 sm:p-4 cursor-pointer transition-colors ${selectionMode && selectedSessionIds.has(session.id) ? "bg-red-50 dark:bg-red-900/20 border-red-300 dark:border-red-700" : "hover:bg-indigo-50/50 dark:hover:bg-indigo-900/10"}`}
                            data-testid={`session-card-${session.id}`}
                          >
                            <div className="flex items-start gap-3">
                              {selectionMode && (
                                <Checkbox
                                  checked={selectedSessionIds.has(session.id)}
                                  onCheckedChange={() => toggleSelectSession(session.id)}
                                  onClick={e => e.stopPropagation()}
                                  className="mt-1 shrink-0"
                                  data-testid={`checkbox-session-${session.id}`}
                                />
                              )}
                              <div className={`shrink-0 w-10 h-10 rounded-lg flex items-center justify-center ${
                                session.status === "완료"
                                  ? "bg-emerald-100 text-emerald-600 dark:bg-emerald-900/30 dark:text-emerald-400"
                                  : "bg-indigo-100 text-indigo-600 dark:bg-indigo-900/30 dark:text-indigo-400"
                              }`}>
                                {session.status === "완료" ? <CheckCircle2 className="w-5 h-5" /> : <Clock className="w-5 h-5" />}
                              </div>
                              <div className="flex-1 min-w-0">
                                <div className="flex items-center gap-2 flex-wrap">
                                  <h3 className="font-semibold text-sm truncate group-hover:text-indigo-600 dark:group-hover:text-indigo-400 transition-colors">{session.title}</h3>
                                  <Badge variant="secondary" className="text-[10px]">{session.educationType}</Badge>
                                  {session.status !== "완료" && (
                                    <Badge className="text-[10px] shrink-0 bg-amber-100 text-amber-700 border border-amber-300 dark:bg-amber-900/30 dark:text-amber-400 dark:border-amber-700 gap-1">
                                      <Clock className="w-2.5 h-2.5" />서명 진행중
                                    </Badge>
                                  )}
                                  {session.status === "완료" && (
                                    <Badge className="text-[10px] bg-emerald-100 text-emerald-700 border border-emerald-300 dark:bg-emerald-900/30 dark:text-emerald-400 dark:border-emerald-700">완료</Badge>
                                  )}
                                </div>
                                <div className="flex items-center gap-2 mt-1 text-xs text-muted-foreground flex-wrap">
                                  <span className="flex items-center gap-1 whitespace-nowrap"><Calendar className="w-3 h-3" />{session.educationDate}{session.educationEndDate && session.educationEndDate !== session.educationDate ? ` ~ ${session.educationEndDate}` : ""}</span>
                                  <span className="whitespace-nowrap">{session.department}</span>
                                  <span className="flex items-center gap-1 whitespace-nowrap"><Users className="w-3 h-3" />{session.totalParticipants}명</span>
                                </div>
                              </div>
                              <div className="flex items-center gap-0.5 shrink-0">
                                <Button
                                  variant="ghost" size="icon" className="h-8 w-8 text-indigo-500 hover:text-indigo-700 hover:bg-indigo-50"
                                  onClick={(e) => { e.stopPropagation(); setPreviewSession(session); }}
                                  data-testid={`button-preview-session-${session.id}`}
                                  title="교육 결과 보기"
                                ><Eye className="w-4 h-4" /></Button>
                                {canEditLogs && (!session.createdBy || user?.role === "admin" || user?.username === session.createdBy) && (
                                  <Button variant="ghost" size="icon" className="hidden sm:flex h-8 w-8 text-muted-foreground"
                                    onClick={(e) => { e.stopPropagation(); handleStartEdit(session); }}
                                    data-testid={`button-edit-session-${session.id}`}
                                  ><Pencil className="w-4 h-4" /></Button>
                                )}
                                {canRegisterEducation && (
                                  <>
                                    <Button variant="ghost" size="icon" className="hidden sm:flex h-8 w-8 text-muted-foreground"
                                      onClick={(e) => { e.stopPropagation(); handleCopy(session); }}
                                      data-testid={`button-copy-session-${session.id}`}
                                    ><Copy className="w-4 h-4" /></Button>
                                    {(!session.createdBy || user?.role === "admin" || user?.username === session.createdBy) && (
                                      <Button variant="ghost" size="icon" className="h-8 w-8 text-muted-foreground hover:text-red-500"
                                        onClick={(e) => { e.stopPropagation(); if (confirm("이 교육일지를 삭제하시겠습니까?")) deleteMutation.mutate(session.id); }}
                                        data-testid={`button-delete-session-${session.id}`}
                                      ><Trash2 className="w-4 h-4" /></Button>
                                    )}
                                  </>
                                )}
                              </div>
                            </div>
                          </motion.div>
                        );
                      }

                      return (
                        <div key={group.key} className={`border rounded-lg overflow-hidden ${selectionMode && group.sessions.every(s => selectedSessionIds.has(s.id)) ? "border-red-300 dark:border-red-700 bg-red-50/20 dark:bg-red-900/10" : ""}`} data-testid={`session-group-${group.key}`}>
                          <div
                            className="flex items-center gap-3 p-3 sm:p-4 cursor-pointer hover:bg-indigo-50/30 dark:hover:bg-indigo-900/5 transition-colors"
                            onClick={() => {
                              if (selectionMode) {
                                const allSelected = group.sessions.every(s => selectedSessionIds.has(s.id));
                                setSelectedSessionIds(prev => { const n = new Set(prev); group.sessions.forEach(s => allSelected ? n.delete(s.id) : n.add(s.id)); return n; });
                              } else {
                                toggleGroup(group.key);
                              }
                            }}
                          >
                            {selectionMode && (
                              <Checkbox
                                checked={group.sessions.every(s => selectedSessionIds.has(s.id))}
                                onCheckedChange={() => {
                                  const allSelected = group.sessions.every(s => selectedSessionIds.has(s.id));
                                  setSelectedSessionIds(prev => { const n = new Set(prev); group.sessions.forEach(s => allSelected ? n.delete(s.id) : n.add(s.id)); return n; });
                                }}
                                onClick={e => e.stopPropagation()}
                                className="shrink-0"
                                data-testid={`checkbox-group-${group.key}`}
                              />
                            )}
                            <div className="shrink-0 w-10 h-10 rounded-lg flex items-center justify-center bg-indigo-100 text-indigo-600 dark:bg-indigo-900/30 dark:text-indigo-400">
                              <GraduationCap className="w-5 h-5" />
                            </div>
                            <div className="flex-1 min-w-0">
                              <div className="flex items-center gap-2 flex-wrap">
                                <h3 className="font-semibold text-sm truncate">{group.title}</h3>
                                <Badge variant="secondary" className="text-[10px]">{group.type}</Badge>
                                {completedCount < group.sessions.length ? (
                                  <Badge className="text-[10px] shrink-0 bg-amber-100 text-amber-700 border border-amber-300 dark:bg-amber-900/30 dark:text-amber-400 dark:border-amber-700 gap-1">
                                    <Clock className="w-2.5 h-2.5" />서명 진행중
                                  </Badge>
                                ) : (
                                  <Badge className="text-[10px] bg-emerald-100 text-emerald-700 border border-emerald-300 dark:bg-emerald-900/30 dark:text-emerald-400 dark:border-emerald-700">전체완료</Badge>
                                )}
                              </div>
                              <div className="flex items-center gap-2 mt-1 text-xs text-muted-foreground flex-wrap">
                                <span className="flex items-center gap-1 whitespace-nowrap"><Calendar className="w-3 h-3" />{group.date}</span>
                                <span className="whitespace-nowrap">{group.sessions.length}개 부서</span>
                                <span className="flex items-center gap-1 whitespace-nowrap"><Users className="w-3 h-3" />총 {totalParticipants}명</span>
                              </div>
                            </div>
                            <div className="flex items-center gap-0.5 shrink-0">
                              <Button
                                variant="ghost"
                                size="icon"
                                className="hidden sm:flex h-8 w-8"
                                onClick={(e) => {
                                  e.stopPropagation();
                                  const firstSession = group.sessions[0];
                                  if (!firstSession) return;
                                  const url = `${window.location.origin}/sign/${firstSession.id}`;
                                  navigator.clipboard.writeText(url).then(() => {
                                    toast({ title: "서명 링크가 복사되었습니다.", description: "참석자들에게 링크를 공유하세요." });
                                  });
                                }}
                                data-testid={`button-group-sign-url-${group.key}`}
                                title="서명 링크 복사"
                              >
                                <Link2 className="w-4 h-4" />
                              </Button>
                              {canDownloadEducationExcel && (
                                <Button variant="ghost" size="icon"
                                  className="hidden sm:flex h-8 w-8"
                                  disabled={excelDownloading}
                                  onClick={(e) => { e.stopPropagation(); handleGroupExcelDownload(group); }}
                                  data-testid={`button-group-excel-${group.key}`}
                                  title="엑셀 다운로드"
                                ><Download className="w-4 h-4" /></Button>
                              )}
                              {canEditLogs && (!group.sessions[0]?.createdBy || user?.role === "admin" || user?.username === group.sessions[0]?.createdBy) && (
                                <Button variant="ghost" size="icon" className="h-8 w-8"
                                  onClick={(e) => { e.stopPropagation(); handleGroupEdit(group); }}
                                  data-testid={`button-group-edit-${group.key}`}
                                ><Pencil className="w-4 h-4" /></Button>
                              )}
                              {canRegisterEducation && (
                                <>
                                  <Button variant="ghost" size="icon"
                                    className="hidden sm:flex h-8 w-8"
                                    onClick={(e) => { e.stopPropagation(); handleGroupCopy(group); }}
                                    data-testid={`button-group-copy-${group.key}`}
                                  ><Copy className="w-4 h-4" /></Button>
                                  {(!group.sessions[0]?.createdBy || user?.role === "admin" || user?.username === group.sessions[0]?.createdBy) && (
                                    <Button variant="ghost" size="icon" className="h-8 w-8 hover:text-red-500"
                                      onClick={(e) => { e.stopPropagation(); handleGroupDelete(group); }}
                                      data-testid={`button-group-delete-${group.key}`}
                                    ><Trash2 className="w-4 h-4" /></Button>
                                  )}
                                </>
                              )}
                              {isExpanded ? <ChevronDown className="w-5 h-5 text-muted-foreground" /> : <ChevronRight className="w-5 h-5 text-muted-foreground" />}
                            </div>
                          </div>

                          <AnimatePresence>
                            {isExpanded && (
                              <motion.div
                                initial={{ height: 0, opacity: 0 }}
                                animate={{ height: "auto", opacity: 1 }}
                                exit={{ height: 0, opacity: 0 }}
                                transition={{ duration: 0.2 }}
                                className="overflow-hidden"
                              >
                                <div className="border-t divide-y bg-muted/5">
                                  {group.sessions.map((session) => (
                                    <div
                                      key={session.id}
                                      className={`flex items-center gap-3 px-4 sm:px-6 py-2.5 cursor-pointer transition-colors group ${selectionMode && selectedSessionIds.has(session.id) ? "bg-red-50 dark:bg-red-900/20" : "hover:bg-indigo-50/50 dark:hover:bg-indigo-900/10"}`}
                                      onClick={() => selectionMode ? toggleSelectSession(session.id) : setSelectedSession(session)}
                                      data-testid={`session-card-${session.id}`}
                                    >
                                      {selectionMode && (
                                        <Checkbox
                                          checked={selectedSessionIds.has(session.id)}
                                          onCheckedChange={() => toggleSelectSession(session.id)}
                                          onClick={e => e.stopPropagation()}
                                          className="shrink-0"
                                          data-testid={`checkbox-session-${session.id}`}
                                        />
                                      )}
                                      <div className={`shrink-0 w-7 h-7 rounded-md flex items-center justify-center ${
                                        session.status === "완료"
                                          ? "bg-emerald-100 text-emerald-600 dark:bg-emerald-900/30 dark:text-emerald-400"
                                          : "bg-indigo-50 text-indigo-500 dark:bg-indigo-900/20 dark:text-indigo-400"
                                      }`}>
                                        {session.status === "완료" ? <CheckCircle2 className="w-3.5 h-3.5" /> : <Clock className="w-3.5 h-3.5" />}
                                      </div>
                                      <div className="flex-1 min-w-0">
                                        <div className="flex items-center gap-2 flex-wrap">
                                          <span className="text-sm font-medium truncate group-hover:text-indigo-600 dark:group-hover:text-indigo-400 transition-colors">
                                            {session.department}
                                          </span>
                                          <Badge variant={session.status === "완료" ? "default" : "secondary"} className="text-[10px]">{session.status}</Badge>
                                        </div>
                                      </div>
                                      <div className="flex items-center gap-1 shrink-0">
                                        <Button
                                          variant="ghost" size="icon" className="h-7 w-7 text-indigo-500 hover:text-indigo-700 hover:bg-indigo-50"
                                          onClick={(e) => { e.stopPropagation(); setPreviewSession(session); }}
                                          data-testid={`button-preview-session-${session.id}`}
                                          title="교육 결과 보기"
                                        ><Eye className="w-3.5 h-3.5" /></Button>
                                        <span className="text-xs text-muted-foreground flex items-center gap-1"><Users className="w-3 h-3" />{session.totalParticipants}명</span>
                                      </div>
                                    </div>
                                  ))}
                                </div>
                              </motion.div>
                            )}
                          </AnimatePresence>
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>
            )}
          </div>
          </>
          )}
        </CardContent>
      </Card>

      <Dialog open={showCreateDialog} onOpenChange={setShowCreateDialog}>
        <DialogContent className="sm:max-w-lg max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <GraduationCap className="w-5 h-5 text-indigo-500" />
              새 교육일지 등록
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-4 pt-2">
            <div>
              <label className="text-xs font-medium text-muted-foreground mb-1 block">교육 제목 *</label>
              <Input
                placeholder="예: 2025년 1월 정기 안전교육"
                value={newTitle}
                onChange={e => setNewTitle(e.target.value)}
                data-testid="input-session-title"
              />
            </div>
            <div>
              <label className="text-xs font-medium text-muted-foreground mb-1 block">교육 기간 *</label>
              <div className="flex items-center gap-2">
                <Input
                  type="date"
                  value={newDate}
                  onChange={e => {
                    setNewDate(e.target.value);
                    if (newEndDate && e.target.value > newEndDate) setNewEndDate(e.target.value);
                  }}
                  className="flex-1"
                  data-testid="input-session-date"
                />
                <span className="text-xs text-muted-foreground shrink-0">~</span>
                <div className="flex-1 relative">
                  <Input
                    type="date"
                    value={newEndDate}
                    min={newDate}
                    onChange={e => setNewEndDate(e.target.value)}
                    placeholder="종료일 (선택)"
                    className={`flex-1 ${!newEndDate ? "text-muted-foreground" : ""}`}
                    data-testid="input-session-end-date"
                  />
                  {newEndDate && (
                    <button
                      type="button"
                      className="absolute right-2 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground text-xs"
                      onClick={() => setNewEndDate("")}
                    >✕</button>
                  )}
                </div>
              </div>
              <p className="text-[10px] text-muted-foreground mt-1">종료일이 없으면 당일 교육으로 처리됩니다.</p>
            </div>
            <div className="grid grid-cols-1 gap-3">
              <div>
                <label className="text-xs font-medium text-muted-foreground mb-1 block">교육유형</label>
                <Select value={newType} onValueChange={setNewType}>
                  <SelectTrigger data-testid="select-session-type">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {EDUCATION_TYPES.map(t => (
                      <SelectItem key={t} value={t}>{t}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>

            <div>
              <div className="flex items-center justify-between mb-2">
                <label className="text-xs font-medium text-muted-foreground">부서 선택 * (복수 선택 가능)</label>
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={toggleAllDepts}
                  className="text-xs h-6 px-2"
                  data-testid="button-toggle-all-depts"
                >
                  {selectedDepts.length === DEPARTMENTS.length ? "전체 해제" : "전체 선택"}
                </Button>
              </div>
              <div className="border rounded-lg p-3 space-y-1 bg-muted/10">
                {DEPARTMENTS.map(dept => (
                  <div
                    key={dept}
                    className="flex items-center gap-2.5 hover:bg-muted/30 rounded-md px-2 py-1.5 transition-colors"
                    data-testid={`checkbox-dept-${dept}`}
                  >
                    <label className="flex items-center gap-2.5 cursor-pointer flex-1 min-w-0">
                      <Checkbox
                        checked={selectedDepts.includes(dept)}
                        onCheckedChange={() => toggleDept(dept)}
                      />
                      <span className="text-sm truncate">{dept}</span>
                    </label>
                    {selectedDepts.includes(dept) && (
                      <Input
                        type="number"
                        placeholder="인원"
                        value={deptParticipants[dept] || ""}
                        onChange={e => setDeptParticipants(prev => ({ ...prev, [dept]: e.target.value }))}
                        min={1}
                        className="w-20 h-7 text-xs text-center"
                        data-testid={`input-dept-participants-${dept}`}
                      />
                    )}
                  </div>
                ))}
              </div>
              {selectedDepts.length > 0 && (
                <p className="text-xs text-muted-foreground mt-1.5">
                  {selectedDepts.length}개 부서 선택됨
                  {selectedDepts.length > 1 && " - 각 부서별로 교육일지가 생성됩니다"}
                </p>
              )}
            </div>

            {selectedDepts.length > 1 && (
              <div className="flex items-center gap-2">
                <Input
                  type="number"
                  placeholder="일괄 인원수"
                  value={newParticipants}
                  onChange={e => setNewParticipants(e.target.value)}
                  min={1}
                  className="w-32"
                  data-testid="input-session-participants"
                />
                <Button
                  variant="outline"
                  size="sm"
                  onClick={applyParticipantsToAll}
                  disabled={!newParticipants}
                  data-testid="button-apply-all-participants"
                >
                  전체 적용
                </Button>
                <span className="text-xs text-muted-foreground">선택된 부서에 동일 인원 적용</span>
              </div>
            )}

            {selectedDepts.length <= 1 && (
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-xs font-medium text-muted-foreground mb-1 block">교육인원 *</label>
                  <Input
                    type="number"
                    placeholder="인원수"
                    value={selectedDepts.length === 1 ? (deptParticipants[selectedDepts[0]] || newParticipants) : newParticipants}
                    onChange={e => {
                      if (selectedDepts.length === 1) {
                        setDeptParticipants(prev => ({ ...prev, [selectedDepts[0]]: e.target.value }));
                      }
                      setNewParticipants(e.target.value);
                    }}
                    min={1}
                    data-testid="input-session-participants"
                  />
                </div>
                <div>
                  <label className="text-xs font-medium text-muted-foreground mb-1 block">교육자</label>
                  <Input
                    placeholder="교육 진행자 이름"
                    value={newInstructor}
                    onChange={e => setNewInstructor(e.target.value)}
                    data-testid="input-session-instructor"
                  />
                </div>
              </div>
            )}

            {selectedDepts.length > 1 && (
              <div>
                <label className="text-xs font-medium text-muted-foreground mb-1 block">교육자</label>
                <Input
                  placeholder="교육 진행자 이름"
                  value={newInstructor}
                  onChange={e => setNewInstructor(e.target.value)}
                  data-testid="input-session-instructor"
                />
              </div>
            )}
            <div>
              <div className="flex items-center justify-between mb-1">
                <label className="text-xs font-medium text-muted-foreground">교육 내용</label>
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  className="h-6 text-[10px] px-2 gap-1 text-indigo-600 border-indigo-200 hover:bg-indigo-50"
                  onClick={() => {
                    const depts = selectedDepts.length > 0 ? selectedDepts.join(", ") : "-";
                    const participants = selectedDepts.length === 1
                      ? (deptParticipants[selectedDepts[0]] || newParticipants || "-")
                      : selectedDepts.length > 1
                        ? `부서별 상이`
                        : newParticipants || "-";
                    const template =
`▶ 교육 내용
  -

▶ 특이사항
  -`;
                    setNewDescription(template);
                  }}
                  data-testid="button-auto-fill-description"
                >
                  <FileText className="w-2.5 h-2.5" />
                  양식 자동작성
                </Button>
              </div>
              <Textarea
                placeholder="교육 내용을 직접 입력하거나 '양식 자동작성'을 눌러 자동으로 채워보세요."
                value={newDescription}
                onChange={e => setNewDescription(e.target.value)}
                className="min-h-[100px] text-sm"
                data-testid="input-session-description"
              />
            </div>
            <div>
              <label className="text-xs font-medium text-muted-foreground mb-1 block flex items-center gap-1">
                <Paperclip className="w-3.5 h-3.5" />
                교육 자료 첨부 (선택)
              </label>
              <input
                ref={newMaterialFileInputRef}
                type="file"
                multiple
                accept="image/*,video/*,.pdf,.ppt,.pptx,.doc,.docx,.xls,.xlsx"
                className="hidden"
                onChange={e => e.target.files && e.target.files.length > 0 && handleNewMaterialUpload(e.target.files)}
                data-testid="input-new-material-files"
              />
              <div className="border rounded-lg p-3 bg-muted/10 space-y-2">
                {newMaterialAttachments.length > 0 && (
                  <div className="space-y-1">
                    {newMaterialAttachments.map((att, idx) => (
                      <div key={idx} className="flex items-center gap-2 text-xs p-1.5 bg-background rounded border">
                        {getFileIconByMeta(att.type, att.name)}
                        <span className="flex-1 truncate">{att.name}</span>
                        <button
                          type="button"
                          onClick={() => setNewMaterialAttachments(prev => prev.filter((_, i) => i !== idx))}
                          className="text-muted-foreground hover:text-red-500"
                        >
                          <X className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    ))}
                  </div>
                )}
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  className="w-full gap-1.5 text-xs h-8"
                  disabled={newMaterialUploading}
                  onClick={() => newMaterialFileInputRef.current?.click()}
                  data-testid="button-add-new-material-files"
                >
                  {newMaterialUploading ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Paperclip className="w-3.5 h-3.5" />}
                  {newMaterialUploading ? "업로드 중..." : "파일 선택"}
                </Button>
              </div>
            </div>
            <div className="flex justify-end gap-2 pt-2">
              <Button variant="outline" onClick={() => { setShowCreateDialog(false); resetForm(); }}>
                취소
              </Button>
              <Button
                onClick={handleCreate}
                disabled={createMutation.isPending || batchCreateMutation.isPending || !newTitle || selectedDepts.length === 0}
                className="bg-gradient-to-r from-indigo-500 to-purple-600 text-white gap-2"
                data-testid="button-submit-session"
              >
                <Plus className="w-4 h-4" />
                {selectedDepts.length > 1 ? `${selectedDepts.length}개 부서 일괄 등록` : "교육 등록"}
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      <Dialog open={showEditDialog} onOpenChange={(open) => { if (!open) { setShowEditDialog(false); setEditingSession(null); setEditingGroup(null); } }}>
        <DialogContent className="sm:max-w-lg max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Pencil className="w-5 h-5 text-indigo-500" />
              {editingGroup ? `교육 카테고리 수정 (${editingGroup.sessions.length}개 부서)` : "교육일지 수정"}
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-4 pt-2">
            <div>
              <label className="text-xs font-medium text-muted-foreground mb-1 block">교육 제목 *</label>
              <Input
                value={editTitle}
                onChange={e => setEditTitle(e.target.value)}
                data-testid="input-edit-title"
              />
            </div>
            <div>
              <label className="text-xs font-medium text-muted-foreground mb-1 block">교육 기간 *</label>
              <div className="flex items-center gap-2">
                <Input
                  type="date"
                  value={editDate}
                  onChange={e => {
                    setEditDate(e.target.value);
                    if (editEndDate && e.target.value > editEndDate) setEditEndDate(e.target.value);
                  }}
                  className="flex-1"
                  data-testid="input-edit-date"
                />
                <span className="text-xs text-muted-foreground shrink-0">~</span>
                <div className="flex-1 relative">
                  <Input
                    type="date"
                    value={editEndDate}
                    min={editDate}
                    onChange={e => setEditEndDate(e.target.value)}
                    className="flex-1"
                    data-testid="input-edit-end-date"
                  />
                  {editEndDate && (
                    <button
                      type="button"
                      className="absolute right-2 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground text-xs"
                      onClick={() => setEditEndDate("")}
                    >✕</button>
                  )}
                </div>
              </div>
              <p className="text-[10px] text-muted-foreground mt-1">종료일이 없으면 당일 교육으로 처리됩니다.</p>
            </div>
            <div>
              <label className="text-xs font-medium text-muted-foreground mb-1 block">교육유형</label>
              <Select value={editType} onValueChange={setEditType}>
                  <SelectTrigger data-testid="select-edit-type">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {EDUCATION_TYPES.map(t => (
                      <SelectItem key={t} value={t}>{t}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
            </div>
            {editingGroup && (
              <div className="border rounded-lg p-3 bg-muted/10">
                <p className="text-xs font-medium text-muted-foreground mb-2">포함 부서 ({editingGroup.sessions.length}개)</p>
                <div className="flex flex-wrap gap-1.5">
                  {editingGroup.sessions.map(s => (
                    <Badge key={s.id} variant="secondary" className="text-[10px]">
                      {s.department} ({s.totalParticipants}명)
                    </Badge>
                  ))}
                </div>
              </div>
            )}
            {!editingGroup && (
              <div>
                <label className="text-xs font-medium text-muted-foreground mb-1 block">부서</label>
                <Select value={editDepartment} onValueChange={setEditDepartment}>
                  <SelectTrigger data-testid="select-edit-department">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {DEPARTMENTS.map(d => (
                      <SelectItem key={d} value={d}>{d}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            )}
            {!editingGroup && (
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-xs font-medium text-muted-foreground mb-1 block">교육인원 *</label>
                  <Input
                    type="number"
                    value={editParticipants}
                    onChange={e => setEditParticipants(e.target.value)}
                    min={1}
                    data-testid="input-edit-participants"
                  />
                </div>
                <div>
                  <label className="text-xs font-medium text-muted-foreground mb-1 block">교육자</label>
                  <Input
                    value={editInstructor}
                    onChange={e => setEditInstructor(e.target.value)}
                    data-testid="input-edit-instructor"
                  />
                </div>
              </div>
            )}
            {editingGroup && (
              <div>
                <label className="text-xs font-medium text-muted-foreground mb-1 block">교육자</label>
                <Input
                  value={editInstructor}
                  onChange={e => setEditInstructor(e.target.value)}
                  data-testid="input-edit-instructor"
                />
              </div>
            )}
            <div>
              <label className="text-xs font-medium text-muted-foreground mb-1 block">교육 내용</label>
              <Textarea
                value={editDescription}
                onChange={e => setEditDescription(e.target.value)}
                className="min-h-[80px]"
                data-testid="input-edit-description"
              />
            </div>
            <div className="flex justify-end gap-2 pt-2">
              <Button variant="outline" onClick={() => { setShowEditDialog(false); setEditingSession(null); setEditingGroup(null); }}>
                취소
              </Button>
              <Button
                onClick={handleSaveEdit}
                disabled={(editMutation.isPending || batchEditMutation.isPending) || !editTitle}
                className="bg-gradient-to-r from-indigo-500 to-purple-600 text-white gap-2"
                data-testid="button-save-edit"
              >
                <Pencil className="w-4 h-4" />
                {editingGroup ? `${editingGroup.sessions.length}개 부서 일괄 수정` : "수정 저장"}
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      <Dialog open={matShowAddForm} onOpenChange={setMatShowAddForm}>
        <DialogContent className="sm:max-w-lg max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <BookOpen className="w-5 h-5 text-indigo-500" />
              교육 자료 등록
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-4 pt-2">
            <div>
              <label className="text-xs font-medium text-muted-foreground mb-1 block">자료 제목 *</label>
              <Input
                placeholder="교육 자료 제목"
                value={matTitle}
                onChange={e => setMatTitle(e.target.value)}
                data-testid="input-material-title"
              />
            </div>
            <div>
              <label className="text-xs font-medium text-muted-foreground mb-1 block">자료 설명</label>
              <Textarea
                placeholder="자료에 대한 설명..."
                value={matContent}
                onChange={e => setMatContent(e.target.value)}
                className="min-h-[80px]"
                data-testid="input-material-content"
              />
            </div>
            <div>
              <label className="text-xs font-medium text-muted-foreground mb-1 block">파일 첨부</label>
              <input
                ref={matFileInputRef}
                type="file"
                multiple
                accept="image/*,video/*,.pdf,.ppt,.pptx,.doc,.docx,.xls,.xlsx"
                className="hidden"
                onChange={e => e.target.files && e.target.files.length > 0 && handleMatLibUpload(e.target.files)}
                data-testid="input-material-files"
              />
              <div className="border rounded-lg p-3 bg-muted/10 space-y-2">
                {matAttachments.length > 0 && (
                  <div className="space-y-1">
                    {matAttachments.map((att, idx) => (
                      <div key={idx} className="flex items-center gap-2 text-xs p-1.5 bg-background rounded border">
                        {getFileIconByMeta(att.type, att.name)}
                        <span className="flex-1 truncate">{att.name}</span>
                        <button
                          type="button"
                          onClick={() => setMatAttachments(prev => prev.filter((_, i) => i !== idx))}
                          className="text-muted-foreground hover:text-red-500"
                        >
                          <X className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    ))}
                  </div>
                )}
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  className="w-full gap-1.5 text-xs h-8"
                  disabled={matUploading}
                  onClick={() => matFileInputRef.current?.click()}
                  data-testid="button-upload-material-files"
                >
                  {matUploading ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Paperclip className="w-3.5 h-3.5" />}
                  {matUploading ? "업로드 중..." : "파일 선택 (이미지/동영상/PDF/PPT/Word/Excel)"}
                </Button>
              </div>
            </div>
            <div className="flex justify-end gap-2 pt-2">
              <Button variant="outline" onClick={() => { setMatShowAddForm(false); setMatTitle(""); setMatContent(""); setMatAttachments([]); }}>
                취소
              </Button>
              <Button
                onClick={handleCreateMaterial}
                disabled={createNoticeMutation.isPending || !matTitle.trim()}
                className="bg-gradient-to-r from-indigo-500 to-purple-600 text-white gap-2"
                data-testid="button-submit-material"
              >
                <Plus className="w-4 h-4" />
                자료 등록
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      <Dialog open={!!selectedMaterial} onOpenChange={open => !open && setSelectedMaterial(null)}>
        <DialogContent className="sm:max-w-lg max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <BookOpen className="w-5 h-5 text-indigo-500" />
              {selectedMaterial?.title}
            </DialogTitle>
          </DialogHeader>
          {selectedMaterial && (
            <div className="space-y-4 pt-2">
              {selectedMaterial.content && (
                <p className="text-sm text-muted-foreground whitespace-pre-wrap">{selectedMaterial.content}</p>
              )}
              {selectedMaterial.attachments && selectedMaterial.attachments.length > 0 && (
                <div className="space-y-2">
                  <p className="text-xs font-medium text-muted-foreground">첨부 파일 ({selectedMaterial.attachments.length}개)</p>
                  {selectedMaterial.attachments.map((att: any, idx: number) => (
                    <div key={idx} className="flex items-center gap-2 p-2 border rounded-lg bg-muted/10">
                      {getFileIconByMeta(att.type, att.name)}
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-medium truncate">{att.name}</p>
                        <p className="text-xs text-muted-foreground">{getFileLabelByMeta(att.type, att.name)}</p>
                      </div>
                      {isVideoByType(att.type, att.name) ? (
                        <a href={att.url} target="_blank" rel="noopener noreferrer">
                          <Button variant="outline" size="sm" className="h-7 text-xs gap-1">
                            <Eye className="w-3 h-3" />재생
                          </Button>
                        </a>
                      ) : att.type?.startsWith('image/') ? (
                        <a href={att.url} target="_blank" rel="noopener noreferrer">
                          <Button variant="outline" size="sm" className="h-7 text-xs gap-1">
                            <Eye className="w-3 h-3" />보기
                          </Button>
                        </a>
                      ) : (canDownloadEducationFiles || isAdmin) ? (
                        <a href={att.url} download={att.name} target="_blank" rel="noopener noreferrer">
                          <Button variant="outline" size="sm" className="h-7 text-xs gap-1">
                            <Download className="w-3 h-3" />다운로드
                          </Button>
                        </a>
                      ) : null}
                    </div>
                  ))}
                </div>
              )}
              <p className="text-[10px] text-muted-foreground">
                등록일: {selectedMaterial.createdAt ? new Date(selectedMaterial.createdAt).toLocaleDateString("ko-KR") : ""}
                {selectedMaterial.createdBy && ` · ${selectedMaterial.createdBy}`}
              </p>
            </div>
          )}
        </DialogContent>
      </Dialog>

      {/* 교육 결과 미리보기 팝업 - 출석표 형식 */}
      <Dialog open={!!previewSession} onOpenChange={(open) => { if (!open) { setPreviewSession(null); setPreviewPhotoIndex(null); } }}>
        <DialogContent className="sm:max-w-2xl max-h-[92vh] flex flex-col p-0 gap-0 overflow-hidden">
          {/* Header */}
          <DialogHeader className="px-5 pt-5 pb-3 border-b bg-gradient-to-r from-indigo-50 to-blue-50 dark:from-indigo-900/20 dark:to-blue-900/20 shrink-0">
            <DialogTitle className="flex items-center gap-2 text-sm font-bold">
              <GraduationCap className="w-4 h-4 text-indigo-600" />
              {previewSession?.title || ""} — 교육 결과
            </DialogTitle>
            {previewSession && (
              <div className="flex flex-wrap gap-x-4 gap-y-0.5 text-[11px] text-muted-foreground mt-0.5">
                <span>□ 시행일시: <strong className="text-foreground">{previewSession.educationDate}{previewSession.educationEndDate && previewSession.educationEndDate !== previewSession.educationDate ? ` ~ ${previewSession.educationEndDate}` : ""}</strong></span>
                <span>□ 부서명: <strong className="text-foreground">{previewSession.department}</strong></span>
                <span>□ 교육유형: <strong className="text-foreground">{previewSession.educationType}</strong></span>
                {previewSession.instructor && <span>□ 강사: <strong className="text-foreground">{previewSession.instructor}</strong></span>}
              </div>
            )}
          </DialogHeader>

          {previewSession && (
            <div className="flex-1 overflow-y-auto">
              {/* 요약 바 */}
              <div className="flex items-center gap-4 px-5 py-3 border-b bg-muted/20 text-sm">
                <div className="flex items-center gap-1.5">
                  <Users className="w-4 h-4 text-blue-500" />
                  <span className="text-muted-foreground">총 인원</span>
                  <span className="font-bold text-blue-600">{previewSession.totalParticipants}명</span>
                </div>
                <div className="flex items-center gap-1.5">
                  <PenTool className="w-4 h-4 text-emerald-500" />
                  <span className="text-muted-foreground">서명 완료</span>
                  <span className="font-bold text-emerald-600">{previewSignatures?.length ?? 0}명</span>
                </div>
                <div className="flex items-center gap-1.5 ml-auto">
                  <span className={`text-lg font-bold ${
                    ((previewSignatures?.length ?? 0) / Math.max(previewSession.totalParticipants, 1) * 100) >= 80
                      ? "text-emerald-600" : ((previewSignatures?.length ?? 0) / Math.max(previewSession.totalParticipants, 1) * 100) >= 50
                      ? "text-amber-600" : "text-red-500"
                  }`}>
                    {previewSession.totalParticipants > 0
                      ? Math.round(((previewSignatures?.length ?? 0) / previewSession.totalParticipants) * 100)
                      : 0}%
                  </span>
                  <div className="w-24 bg-muted rounded-full h-2 overflow-hidden">
                    <div
                      className="h-full bg-gradient-to-r from-emerald-400 to-emerald-600 rounded-full"
                      style={{ width: `${previewSession.totalParticipants > 0 ? Math.round(((previewSignatures?.length ?? 0) / previewSession.totalParticipants) * 100) : 0}%` }}
                    />
                  </div>
                </div>
              </div>

              <div className="p-5 space-y-5">
                {/* 참석자 출석표 - 테이블 형식 */}
                <div>
                  <h3 className="text-sm font-bold flex items-center gap-2 mb-3 text-indigo-700 dark:text-indigo-400">
                    <PenTool className="w-4 h-4" />
                    참석자 서명 명단
                  </h3>
                  {previewSignatures && previewSignatures.length > 0 ? (
                    <div className="border rounded-lg overflow-hidden">
                      {/* 테이블 헤더 */}
                      <div className="grid grid-cols-[40px_1fr_140px] bg-indigo-50 dark:bg-indigo-900/30 border-b">
                        <div className="px-3 py-2 text-center text-xs font-bold text-muted-foreground border-r">순번</div>
                        <div className="px-3 py-2 text-xs font-bold text-muted-foreground border-r">이름</div>
                        <div className="px-3 py-2 text-center text-xs font-bold text-muted-foreground">서명</div>
                      </div>
                      {/* 참석자 행 */}
                      {previewSignatures.map((sig, idx) => (
                        <div
                          key={sig.id}
                          className={`grid grid-cols-[40px_1fr_140px] border-b last:border-b-0 ${idx % 2 === 0 ? "bg-white dark:bg-card" : "bg-muted/20"}`}
                          data-testid={`preview-sig-row-${sig.id}`}
                        >
                          <div className="px-3 py-2.5 text-center text-sm text-muted-foreground border-r font-mono">{idx + 1}</div>
                          <div className="px-3 py-2.5 border-r">
                            <p className="text-sm font-semibold">{sig.signerName}</p>
                            {sig.signerDepartment && (
                              <p className="text-[10px] text-muted-foreground">{sig.signerDepartment}</p>
                            )}
                          </div>
                          <div className="px-2 py-1.5 flex items-center justify-center">
                            <img
                              src={sig.signatureData}
                              alt={`${sig.signerName} 서명`}
                              className="max-h-10 max-w-[120px] object-contain"
                            />
                          </div>
                        </div>
                      ))}
                      {/* 빈 행 (서명 안 한 인원 수만큼) */}
                      {Array.from({ length: Math.max(0, previewSession.totalParticipants - (previewSignatures?.length ?? 0)) }).map((_, idx) => (
                        <div
                          key={`empty-${idx}`}
                          className={`grid grid-cols-[40px_1fr_140px] border-b last:border-b-0 ${(previewSignatures.length + idx) % 2 === 0 ? "bg-white dark:bg-card" : "bg-muted/20"}`}
                        >
                          <div className="px-3 py-2.5 text-center text-sm text-muted-foreground/50 border-r font-mono">{(previewSignatures?.length ?? 0) + idx + 1}</div>
                          <div className="px-3 py-2.5 border-r">
                            <div className="h-4 w-24 bg-muted/40 rounded" />
                          </div>
                          <div className="px-2 py-1.5" />
                        </div>
                      ))}
                    </div>
                  ) : (
                    <div className="py-10 text-center text-muted-foreground border-2 border-dashed rounded-xl">
                      <PenTool className="w-8 h-8 mx-auto mb-2 opacity-30" />
                      <p className="text-sm">아직 서명한 참석자가 없습니다.</p>
                    </div>
                  )}
                </div>

                {/* 교육 내용 */}
                {previewSession.description && (
                  <div>
                    <h3 className="text-sm font-bold flex items-center gap-2 mb-2 text-amber-700 dark:text-amber-400">
                      <FileText className="w-4 h-4" />
                      교육 내용
                    </h3>
                    <div className="p-4 bg-amber-50/60 dark:bg-amber-900/10 border border-amber-100 dark:border-amber-900/30 rounded-xl text-sm whitespace-pre-wrap leading-relaxed text-foreground">
                      {previewSession.description}
                    </div>
                  </div>
                )}

                {/* 교육 사진 */}
                {(previewSession.images || []).length > 0 && (
                  <div>
                    <h3 className="text-sm font-bold flex items-center gap-2 mb-3 text-indigo-700 dark:text-indigo-400">
                      <Camera className="w-4 h-4" />
                      교육 사진 <span className="font-normal text-xs text-muted-foreground">({(previewSession.images || []).length}장)</span>
                    </h3>
                    <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
                      {(previewSession.images || []).map((img, idx) => (
                        <div
                          key={idx}
                          className="relative group overflow-hidden rounded-xl border cursor-pointer"
                          onClick={() => setPreviewPhotoIndex(idx)}
                          data-testid={`preview-photo-${idx}`}
                        >
                          <img
                            src={img}
                            alt={`교육 사진 ${idx + 1}`}
                            className="w-full h-32 object-cover group-hover:scale-105 transition-transform duration-200"
                          />
                          <div className="absolute inset-0 bg-black/0 group-hover:bg-black/20 transition-colors flex items-center justify-center">
                            <Eye className="w-5 h-5 text-white opacity-0 group-hover:opacity-100 transition-opacity" />
                          </div>
                          <div className="absolute bottom-1 right-1 bg-black/50 text-white text-[10px] px-1.5 py-0.5 rounded">
                            {idx + 1}/{(previewSession.images || []).length}
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>

      {/* 사진 전체화면 미리보기 */}
      {previewPhotoIndex !== null && previewSession && (
        <Dialog open={previewPhotoIndex !== null} onOpenChange={() => setPreviewPhotoIndex(null)}>
          <DialogContent className="sm:max-w-4xl p-2">
            <DialogHeader>
              <DialogTitle className="sr-only">사진 미리보기</DialogTitle>
            </DialogHeader>
            <div className="relative">
              <img
                src={(previewSession.images || [])[previewPhotoIndex]}
                alt="교육 사진"
                className="w-full max-h-[75vh] object-contain rounded-lg"
              />
              <div className="flex justify-center gap-2 mt-3">
                {(previewSession.images || []).map((_, i) => (
                  <button
                    key={i}
                    className={`w-2 h-2 rounded-full transition-colors ${i === previewPhotoIndex ? "bg-indigo-500" : "bg-gray-300"}`}
                    onClick={() => setPreviewPhotoIndex(i)}
                  />
                ))}
              </div>
              {(previewSession.images || []).length > 1 && (
                <>
                  <Button
                    variant="outline" size="icon"
                    className="absolute left-2 top-1/2 -translate-y-1/2 bg-white/80"
                    onClick={() => setPreviewPhotoIndex(prev => prev !== null ? (prev - 1 + (previewSession.images || []).length) % (previewSession.images || []).length : 0)}
                  ><ChevronDown className="w-4 h-4 rotate-90" /></Button>
                  <Button
                    variant="outline" size="icon"
                    className="absolute right-2 top-1/2 -translate-y-1/2 bg-white/80"
                    onClick={() => setPreviewPhotoIndex(prev => prev !== null ? (prev + 1) % (previewSession.images || []).length : 0)}
                  ><ChevronDown className="w-4 h-4 -rotate-90" /></Button>
                </>
              )}
            </div>
          </DialogContent>
        </Dialog>
      )}

      {/* 플로팅 벌크 액션 바 */}
      {selectionMode && selectedSessionIds.size > 0 && (
        <div className="fixed bottom-6 left-1/2 -translate-x-1/2 z-50 flex items-center gap-3 bg-background border border-border shadow-xl rounded-full px-5 py-3">
          <span className="text-sm font-semibold text-red-600">{selectedSessionIds.size}건 선택됨</span>
          <div className="w-px h-5 bg-border" />
          <Button variant="ghost" size="sm" className="h-8" onClick={() => setSelectedSessionIds(new Set())}>
            <X className="w-3.5 h-3.5 mr-1" />선택 해제
          </Button>
          <Button
            variant="destructive" size="sm" className="h-8"
            disabled={bulkDeleteSessionsMutation.isPending}
            onClick={() => { if (confirm(`선택한 ${selectedSessionIds.size}건을 삭제하시겠습니까?`)) bulkDeleteSessionsMutation.mutate(Array.from(selectedSessionIds)); }}
            data-testid="button-bulk-delete"
          >
            <Trash2 className="w-3.5 h-3.5 mr-1" />삭제
          </Button>
        </div>
      )}
    </div>
  );
}
