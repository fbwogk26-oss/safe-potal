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
import { motion, AnimatePresence } from "framer-motion";
import {
  GraduationCap, Plus, Trash2, ArrowLeft, Users, Calendar, FileText,
  PenTool, CheckCircle2, Clock, BarChart3, TrendingUp, Award, X, Search, Eye, Download,
  ChevronDown, ChevronRight, Copy, Pencil, Camera, ImagePlus, Save
} from "lucide-react";
import type { EducationSession, EducationSignature } from "@shared/schema";

const DEPARTMENTS = [
  "동대구운용팀", "서대구운용팀", "남대구운용팀", "포항운용팀",
  "안동운용팀", "구미운용팀", "문경운용팀",
  "운용지원팀", "운용계획팀", "사업지원팀", "현장경영팀", "공공망관제팀"
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
  const totalParticipants = progress?.reduce((a, b) => a + b.totalParticipants, 0) || 0;
  const totalSigned = progress?.reduce((a, b) => a + b.totalSigned, 0) || 0;
  const overallRate = totalParticipants > 0 ? Math.round((totalSigned / totalParticipants) * 100) : 0;
  const completedAll = progress?.filter(p => p.progressRate === 100).length || 0;

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
            <p className="text-[11px] text-muted-foreground">완료</p>
            <p className="text-xl font-bold text-emerald-600" data-testid="text-completed-educations">{completedAll}건</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-3 sm:p-4 text-center">
            <Users className="w-5 h-5 mx-auto mb-1 text-purple-500" />
            <p className="text-[11px] text-muted-foreground">서명 현황</p>
            <p className="text-xl font-bold text-purple-600" data-testid="text-sign-status">{totalSigned}/{totalParticipants}</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-3 sm:p-4 text-center">
            <TrendingUp className="w-5 h-5 mx-auto mb-1 text-amber-500" />
            <p className="text-[11px] text-muted-foreground">전체 진행율</p>
            <p className="text-xl font-bold text-amber-600" data-testid="text-overall-rate">{overallRate}%</p>
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
                      </div>
                      <div className="flex items-center gap-3 mt-1 text-xs text-muted-foreground flex-wrap">
                        <span className="flex items-center gap-1"><Calendar className="w-3 h-3" />{edu.educationDate}</span>
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

export default function EducationLogs() {
  const { canRegisterEducation, canEditEducationLogs } = usePermissions();
  const canEditLogs = canRegisterEducation || canEditEducationLogs;
  const { toast } = useToast();

  const [activeTab, setActiveTab] = useState<"dashboard" | "sessions">("dashboard");
  const [selectedSession, setSelectedSession] = useState<EducationSession | null>(null);
  const [showCreateDialog, setShowCreateDialog] = useState(false);
  const [showEditDialog, setShowEditDialog] = useState(false);
  const [editingSession, setEditingSession] = useState<EducationSession | null>(null);
  const [showSignDialog, setShowSignDialog] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  const [filterDept, setFilterDept] = useState<string>("all");

  const [newTitle, setNewTitle] = useState("");
  const [newDate, setNewDate] = useState(new Date().toISOString().split("T")[0]);
  const [selectedDepts, setSelectedDepts] = useState<string[]>([]);
  const [deptParticipants, setDeptParticipants] = useState<Record<string, string>>({});
  const [newType, setNewType] = useState("정기교육");
  const [newInstructor, setNewInstructor] = useState("");
  const [newParticipants, setNewParticipants] = useState("");
  const [newDescription, setNewDescription] = useState("");

  const [editTitle, setEditTitle] = useState("");
  const [editDate, setEditDate] = useState("");
  const [editType, setEditType] = useState("정기교육");
  const [editInstructor, setEditInstructor] = useState("");
  const [editParticipants, setEditParticipants] = useState("");
  const [editDescription, setEditDescription] = useState("");
  const [editDepartment, setEditDepartment] = useState("");

  const [signerName, setSignerName] = useState("");
  const [signerDept, setSignerDept] = useState("");


  const [expandedGroups, setExpandedGroups] = useState<Set<string>>(new Set());
  const [editingGroup, setEditingGroup] = useState<{ key: string; title: string; date: string; type: string; sessions: EducationSession[] } | null>(null);

  const [isEditingDescription, setIsEditingDescription] = useState(false);
  const [inlineDescription, setInlineDescription] = useState("");
  const [uploadingPhotos, setUploadingPhotos] = useState(false);
  const photoInputRef = useRef<HTMLInputElement>(null);
  const [showPhotoPreview, setShowPhotoPreview] = useState<string | null>(null);

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
    onError: () => toast({ variant: "destructive", title: "일괄 교육일지 생성 실패" }),
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
    mutationFn: (data: { sessionId: number; signerName: string; signerDepartment: string; signatureData: string }) =>
      apiRequest("POST", `/api/education-sessions/${data.sessionId}/signatures`, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/education-sessions", selectedSession?.id, "signatures"] });
      queryClient.invalidateQueries({ queryKey: ["/api/education-progress"] });
      setShowSignDialog(false);
      setSignerName("");
      setSignerDept("");
      toast({ title: "서명이 등록되었습니다." });
    },
    onError: () => toast({ variant: "destructive", title: "서명 등록 실패" }),
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

  const resetForm = () => {
    setNewTitle("");
    setNewDate(new Date().toISOString().split("T")[0]);
    setSelectedDepts([]);
    setDeptParticipants({});
    setNewType("정기교육");
    setNewInstructor("");
    setNewParticipants("");
    setNewDescription("");
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

    if (selectedDepts.length === 1) {
      const participants = Number(deptParticipants[selectedDepts[0]] || newParticipants);
      if (!participants || participants < 1) {
        toast({ variant: "destructive", title: "인원수를 입력해주세요." });
        return;
      }
      createMutation.mutate({
        title: newTitle,
        educationDate: newDate,
        department: selectedDepts[0],
        educationType: newType,
        instructor: newInstructor || undefined,
        totalParticipants: participants,
        description: newDescription || undefined,
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
        departments,
        educationType: newType,
        instructor: newInstructor || undefined,
        description: newDescription || undefined,
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

  const handleSign = (signatureData: string) => {
    if (!selectedSession || !signerName) return;
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
              {selectedSession.department} / {selectedSession.educationDate}
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
                <span className="hidden sm:inline">완료</span>
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
                <span className="hidden sm:inline">재개</span>
              </Button>
            )}
            {canEditLogs && (
              <Button variant="outline" size="sm" onClick={() => handleStartEdit(selectedSession)} className="gap-1.5" data-testid="button-edit-detail">
                <Pencil className="w-3.5 h-3.5" />
                <span className="hidden sm:inline">수정</span>
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
              {canEditLogs && !isEditingDescription && (
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

        <Card>
          <CardContent className="p-4">
            <div className="flex items-center justify-between gap-2 mb-3">
              <p className="text-xs text-muted-foreground flex items-center gap-1.5">
                <Camera className="w-3.5 h-3.5" />
                교육 사진 ({(selectedSession.images || []).length}장)
              </p>
              {canEditLogs && (
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
                {canEditLogs && (
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
            {selectedSession.status === "진행중" && (
              <Button
                size="sm"
                onClick={() => setShowSignDialog(true)}
                className="bg-gradient-to-r from-emerald-500 to-teal-600 text-white gap-1.5"
                data-testid="button-open-sign"
              >
                <PenTool className="w-3.5 h-3.5" />
                <span className="hidden sm:inline">서명하기</span>
              </Button>
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
                {selectedSession.status === "진행중" && (
                  <Button
                    variant="outline"
                    size="sm"
                    className="mt-3 gap-1.5"
                    onClick={() => setShowSignDialog(true)}
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
                  <label className="text-xs font-medium text-muted-foreground mb-1 block">이름 *</label>
                  <Input
                    placeholder="서명자 이름"
                    value={signerName}
                    onChange={e => setSignerName(e.target.value)}
                    data-testid="input-signer-name"
                  />
                </div>
                <div>
                  <label className="text-xs font-medium text-muted-foreground mb-1 block">소속</label>
                  <Input
                    placeholder="소속 부서"
                    value={signerDept}
                    onChange={e => setSignerDept(e.target.value)}
                    data-testid="input-signer-dept"
                  />
                </div>
              </div>
              {signerName.trim() ? (
                <SignaturePad
                  onSave={handleSign}
                  onCancel={() => setShowSignDialog(false)}
                />
              ) : (
                <div className="border-2 border-dashed border-muted rounded-lg p-8 text-center text-muted-foreground text-sm">
                  이름을 입력하면 서명 영역이 나타납니다
                </div>
              )}
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
                <span className="text-lg font-bold">안전교육일지</span>
                <p className="text-xs font-normal text-muted-foreground">교육 관리 및 서명</p>
              </div>
            </CardTitle>
            <div className="flex items-center gap-2">
              {canRegisterEducation && (
                <Button
                  onClick={() => setShowCreateDialog(true)}
                  size="sm"
                  className="bg-gradient-to-r from-indigo-500 to-purple-600 text-white gap-1.5"
                  data-testid="button-create-session"
                >
                  <Plus className="w-4 h-4" />
                  <span className="hidden sm:inline">교육 등록</span>
                </Button>
              )}
            </div>
          </div>
        </CardHeader>
        <CardContent className="p-0">
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
              교육일지 목록
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
                    {!searchQuery && filterDept === "all" && canRegisterEducation && (
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
                            onClick={() => setSelectedSession(session)}
                            className="group border rounded-lg p-3 sm:p-4 hover:bg-indigo-50/50 dark:hover:bg-indigo-900/10 cursor-pointer transition-colors"
                            data-testid={`session-card-${session.id}`}
                          >
                            <div className="flex items-start gap-3">
                              <div className={`shrink-0 w-10 h-10 rounded-lg flex items-center justify-center ${
                                session.status === "완료"
                                  ? "bg-emerald-100 text-emerald-600 dark:bg-emerald-900/30 dark:text-emerald-400"
                                  : "bg-indigo-100 text-indigo-600 dark:bg-indigo-900/30 dark:text-indigo-400"
                              }`}>
                                {session.status === "완료" ? <CheckCircle2 className="w-5 h-5" /> : <Clock className="w-5 h-5" />}
                              </div>
                              <div className="flex-1 min-w-0">
                                <div className="flex items-center gap-2 flex-wrap">
                                  <h3 className="font-medium text-sm truncate group-hover:text-indigo-600 dark:group-hover:text-indigo-400 transition-colors">{session.title}</h3>
                                  <Badge variant={session.status === "완료" ? "default" : "secondary"} className="text-[10px]">{session.status}</Badge>
                                  <Badge variant="outline" className="text-[10px]">{session.educationType}</Badge>
                                </div>
                                <div className="flex items-center gap-3 mt-1 text-xs text-muted-foreground flex-wrap">
                                  <span className="flex items-center gap-1"><Calendar className="w-3 h-3" />{session.educationDate}</span>
                                  <span>{session.department}</span>
                                  <span className="flex items-center gap-1"><Users className="w-3 h-3" />{session.totalParticipants}명</span>
                                </div>
                              </div>
                              <div className="flex items-center gap-1 shrink-0">
                                {canEditLogs && (
                                  <Button variant="ghost" size="icon" className="h-8 w-8 text-muted-foreground"
                                    onClick={(e) => { e.stopPropagation(); handleStartEdit(session); }}
                                    data-testid={`button-edit-session-${session.id}`}
                                  ><Pencil className="w-4 h-4" /></Button>
                                )}
                                {canRegisterEducation && (
                                  <>
                                    <Button variant="ghost" size="icon" className="h-8 w-8 text-muted-foreground"
                                      onClick={(e) => { e.stopPropagation(); handleCopy(session); }}
                                      data-testid={`button-copy-session-${session.id}`}
                                    ><Copy className="w-4 h-4" /></Button>
                                    <Button variant="ghost" size="icon" className="h-8 w-8 text-muted-foreground"
                                      onClick={(e) => { e.stopPropagation(); if (confirm("이 교육일지를 삭제하시겠습니까?")) deleteMutation.mutate(session.id); }}
                                      data-testid={`button-delete-session-${session.id}`}
                                    ><Trash2 className="w-4 h-4" /></Button>
                                  </>
                                )}
                              </div>
                            </div>
                          </motion.div>
                        );
                      }

                      return (
                        <div key={group.key} className="border rounded-lg overflow-hidden" data-testid={`session-group-${group.key}`}>
                          <div
                            className="flex items-center gap-3 p-3 sm:p-4 cursor-pointer hover:bg-indigo-50/30 dark:hover:bg-indigo-900/5 transition-colors"
                            onClick={() => toggleGroup(group.key)}
                          >
                            <div className="shrink-0 w-10 h-10 rounded-lg flex items-center justify-center bg-indigo-100 text-indigo-600 dark:bg-indigo-900/30 dark:text-indigo-400">
                              <GraduationCap className="w-5 h-5" />
                            </div>
                            <div className="flex-1 min-w-0">
                              <div className="flex items-center gap-2 flex-wrap">
                                <h3 className="font-medium text-sm truncate">{group.title}</h3>
                                <Badge variant="outline" className="text-[10px]">{group.type}</Badge>
                                <Badge variant="secondary" className="text-[10px]">{group.sessions.length}개 부서</Badge>
                                {completedCount === group.sessions.length && (
                                  <Badge className="text-[10px] bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-400">전체완료</Badge>
                                )}
                              </div>
                              <div className="flex items-center gap-3 mt-1 text-xs text-muted-foreground flex-wrap">
                                <span className="flex items-center gap-1"><Calendar className="w-3 h-3" />{group.date}</span>
                                <span className="flex items-center gap-1"><Users className="w-3 h-3" />총 {totalParticipants}명</span>
                                <span>{completedCount}/{group.sessions.length} 완료</span>
                              </div>
                            </div>
                            <div className="flex items-center gap-1 shrink-0">
                              <Button variant="ghost" size="icon"
                                disabled={excelDownloading}
                                onClick={(e) => { e.stopPropagation(); handleGroupExcelDownload(group); }}
                                data-testid={`button-group-excel-${group.key}`}
                                title="엑셀 다운로드"
                              ><Download className="w-4 h-4" /></Button>
                              {canEditLogs && (
                                <Button variant="ghost" size="icon"
                                  onClick={(e) => { e.stopPropagation(); handleGroupEdit(group); }}
                                  data-testid={`button-group-edit-${group.key}`}
                                ><Pencil className="w-4 h-4" /></Button>
                              )}
                              {canRegisterEducation && (
                                <>
                                  <Button variant="ghost" size="icon"
                                    onClick={(e) => { e.stopPropagation(); handleGroupCopy(group); }}
                                    data-testid={`button-group-copy-${group.key}`}
                                  ><Copy className="w-4 h-4" /></Button>
                                  <Button variant="ghost" size="icon"
                                    onClick={(e) => { e.stopPropagation(); handleGroupDelete(group); }}
                                    data-testid={`button-group-delete-${group.key}`}
                                  ><Trash2 className="w-4 h-4" /></Button>
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
                                      className="flex items-center gap-3 px-4 sm:px-6 py-2.5 cursor-pointer hover:bg-indigo-50/50 dark:hover:bg-indigo-900/10 transition-colors group"
                                      onClick={() => setSelectedSession(session)}
                                      data-testid={`session-card-${session.id}`}
                                    >
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
                                        {canEditLogs && (
                                          <Button variant="ghost" size="icon" className="h-7 w-7 text-muted-foreground"
                                            onClick={(e) => { e.stopPropagation(); handleStartEdit(session); }}
                                            data-testid={`button-edit-dept-session-${session.id}`}
                                          ><Pencil className="w-3.5 h-3.5" /></Button>
                                        )}
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
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="text-xs font-medium text-muted-foreground mb-1 block">교육일자 *</label>
                <Input
                  type="date"
                  value={newDate}
                  onChange={e => setNewDate(e.target.value)}
                  data-testid="input-session-date"
                />
              </div>
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
              <label className="text-xs font-medium text-muted-foreground mb-1 block">교육 내용</label>
              <Textarea
                placeholder="교육 내용 설명..."
                value={newDescription}
                onChange={e => setNewDescription(e.target.value)}
                className="min-h-[80px]"
                data-testid="input-session-description"
              />
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
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="text-xs font-medium text-muted-foreground mb-1 block">교육일자 *</label>
                <Input
                  type="date"
                  value={editDate}
                  onChange={e => setEditDate(e.target.value)}
                  data-testid="input-edit-date"
                />
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
    </div>
  );
}
