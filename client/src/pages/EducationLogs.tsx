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
import { useToast } from "@/hooks/use-toast";
import { usePermissions } from "@/hooks/use-permissions";
import { motion, AnimatePresence } from "framer-motion";
import {
  GraduationCap, Plus, Trash2, ArrowLeft, Users, Calendar, FileText,
  PenTool, CheckCircle2, Clock, BarChart3, TrendingUp, Award, X, Search, Eye
} from "lucide-react";
import type { EducationSession, EducationSignature } from "@shared/schema";

const DEPARTMENTS = [
  "동대구운용팀", "서대구운용팀", "남대구운용팀", "포항운용팀",
  "안동운용팀", "구미운용팀", "문경운용팀"
];

const EDUCATION_TYPES = ["정기교육", "신규교육", "특별교육", "안전교육", "직무교육"];

interface ProgressData {
  department: string;
  totalSessions: number;
  completedSessions: number;
  totalParticipants: number;
  totalSigned: number;
  progressRate: number;
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

  if (isLoading) {
    return (
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
        {[1, 2, 3, 4, 5, 6].map(i => (
          <Card key={i}>
            <CardContent className="p-4">
              <div className="h-32 bg-muted/30 animate-pulse rounded-lg" />
            </CardContent>
          </Card>
        ))}
      </div>
    );
  }

  const totalSessions = progress?.reduce((a, b) => a + b.totalSessions, 0) || 0;
  const completedSessions = progress?.reduce((a, b) => a + b.completedSessions, 0) || 0;
  const totalParticipants = progress?.reduce((a, b) => a + b.totalParticipants, 0) || 0;
  const totalSigned = progress?.reduce((a, b) => a + b.totalSigned, 0) || 0;
  const overallRate = totalParticipants > 0 ? Math.round((totalSigned / totalParticipants) * 100) : 0;

  return (
    <div className="space-y-4 sm:space-y-6">
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        <Card>
          <CardContent className="p-3 sm:p-4 text-center">
            <FileText className="w-5 h-5 mx-auto mb-1 text-blue-500" />
            <p className="text-[11px] text-muted-foreground">총 교육</p>
            <p className="text-xl font-bold text-blue-600">{totalSessions}건</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-3 sm:p-4 text-center">
            <CheckCircle2 className="w-5 h-5 mx-auto mb-1 text-emerald-500" />
            <p className="text-[11px] text-muted-foreground">완료</p>
            <p className="text-xl font-bold text-emerald-600">{completedSessions}건</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-3 sm:p-4 text-center">
            <Users className="w-5 h-5 mx-auto mb-1 text-purple-500" />
            <p className="text-[11px] text-muted-foreground">서명 현황</p>
            <p className="text-xl font-bold text-purple-600">{totalSigned}/{totalParticipants}</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-3 sm:p-4 text-center">
            <TrendingUp className="w-5 h-5 mx-auto mb-1 text-amber-500" />
            <p className="text-[11px] text-muted-foreground">전체 진행율</p>
            <p className="text-xl font-bold text-amber-600">{overallRate}%</p>
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader className="bg-gradient-to-r from-indigo-50 to-blue-50 dark:from-indigo-900/20 dark:to-blue-900/20 border-b p-3 sm:p-4">
          <CardTitle className="text-sm sm:text-base flex items-center gap-2">
            <BarChart3 className="w-4 h-4 text-indigo-600" />
            부서별 교육 진행율
          </CardTitle>
        </CardHeader>
        <CardContent className="p-4 space-y-4">
          {(!progress || progress.length === 0) ? (
            <div className="py-8 text-center text-muted-foreground">
              <BarChart3 className="w-10 h-10 mx-auto mb-3 opacity-30" />
              <p className="text-sm">아직 등록된 교육이 없습니다.</p>
            </div>
          ) : (
            progress.map((dept, idx) => (
              <motion.div
                key={dept.department}
                initial={{ opacity: 0, x: -20 }}
                animate={{ opacity: 1, x: 0 }}
                transition={{ delay: idx * 0.05 }}
                className="space-y-1.5"
                data-testid={`progress-dept-${dept.department}`}
              >
                <div className="flex items-center justify-between text-sm">
                  <div className="flex items-center gap-2 min-w-0">
                    <span className="font-medium truncate">{dept.department}</span>
                    <Badge variant="secondary" className="text-[10px] shrink-0">
                      {dept.completedSessions}/{dept.totalSessions}건
                    </Badge>
                  </div>
                  <div className="flex items-center gap-2 shrink-0">
                    <span className="text-xs text-muted-foreground">
                      {dept.totalSigned}/{dept.totalParticipants}명
                    </span>
                    <span className={`text-sm font-bold ${
                      dept.progressRate >= 80 ? "text-emerald-600" :
                      dept.progressRate >= 50 ? "text-amber-600" :
                      "text-red-500"
                    }`}>
                      {dept.progressRate}%
                    </span>
                  </div>
                </div>
                <div className="w-full bg-muted/50 rounded-full h-2.5 overflow-hidden">
                  <motion.div
                    initial={{ width: 0 }}
                    animate={{ width: `${dept.progressRate}%` }}
                    transition={{ duration: 0.8, delay: idx * 0.1 }}
                    className={`h-full rounded-full ${
                      dept.progressRate >= 80 ? "bg-gradient-to-r from-emerald-400 to-emerald-600" :
                      dept.progressRate >= 50 ? "bg-gradient-to-r from-amber-400 to-amber-600" :
                      "bg-gradient-to-r from-red-400 to-red-500"
                    }`}
                  />
                </div>
              </motion.div>
            ))
          )}
        </CardContent>
      </Card>
    </div>
  );
}

export default function EducationLogs() {
  const { canRegisterEducation } = usePermissions();
  const { toast } = useToast();

  const [activeTab, setActiveTab] = useState<"dashboard" | "sessions">("dashboard");
  const [selectedSession, setSelectedSession] = useState<EducationSession | null>(null);
  const [showCreateDialog, setShowCreateDialog] = useState(false);
  const [showSignDialog, setShowSignDialog] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  const [filterDept, setFilterDept] = useState<string>("all");

  const [newTitle, setNewTitle] = useState("");
  const [newDate, setNewDate] = useState(new Date().toISOString().split("T")[0]);
  const [newDept, setNewDept] = useState("");
  const [newType, setNewType] = useState("정기교육");
  const [newInstructor, setNewInstructor] = useState("");
  const [newParticipants, setNewParticipants] = useState("");
  const [newDescription, setNewDescription] = useState("");

  const [signerName, setSignerName] = useState("");
  const [signerDept, setSignerDept] = useState("");

  const { data: sessions, isLoading: sessionsLoading } = useQuery<EducationSession[]>({
    queryKey: ["/api/education-sessions"],
  });

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

  const deleteMutation = useMutation({
    mutationFn: (id: number) => apiRequest("DELETE", `/api/education-sessions/${id}`),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/education-sessions"] });
      queryClient.invalidateQueries({ queryKey: ["/api/education-progress"] });
      setSelectedSession(null);
      toast({ title: "교육일지가 삭제되었습니다." });
    },
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

  const resetForm = () => {
    setNewTitle("");
    setNewDate(new Date().toISOString().split("T")[0]);
    setNewDept("");
    setNewType("정기교육");
    setNewInstructor("");
    setNewParticipants("");
    setNewDescription("");
  };

  const handleCreate = () => {
    if (!newTitle || !newDept || !newParticipants) return;
    createMutation.mutate({
      title: newTitle,
      educationDate: newDate,
      department: newDept,
      educationType: newType,
      instructor: newInstructor || undefined,
      totalParticipants: Number(newParticipants),
      description: newDescription || undefined,
    });
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
            {canRegisterEducation && selectedSession.status === "진행중" && (
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
            {canRegisterEducation && selectedSession.status === "완료" && (
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

        {selectedSession.description && (
          <Card>
            <CardContent className="p-4">
              <p className="text-xs text-muted-foreground mb-1">교육 내용</p>
              <p className="text-sm text-foreground whitespace-pre-wrap">{selectedSession.description}</p>
            </CardContent>
          </Card>
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
                  <AnimatePresence mode="popLayout">
                    {filteredSessions.map((session, idx) => (
                      <motion.div
                        key={session.id}
                        initial={{ opacity: 0, y: 10 }}
                        animate={{ opacity: 1, y: 0 }}
                        exit={{ opacity: 0, x: -20 }}
                        transition={{ delay: idx * 0.03 }}
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
                            {session.status === "완료" ? (
                              <CheckCircle2 className="w-5 h-5" />
                            ) : (
                              <Clock className="w-5 h-5" />
                            )}
                          </div>
                          <div className="flex-1 min-w-0">
                            <div className="flex items-center gap-2 flex-wrap">
                              <h3 className="font-medium text-sm truncate group-hover:text-indigo-600 dark:group-hover:text-indigo-400 transition-colors">
                                {session.title}
                              </h3>
                              <Badge variant={session.status === "완료" ? "default" : "secondary"} className="text-[10px]">
                                {session.status}
                              </Badge>
                              <Badge variant="outline" className="text-[10px]">{session.educationType}</Badge>
                            </div>
                            <div className="flex items-center gap-3 mt-1 text-xs text-muted-foreground flex-wrap">
                              <span className="flex items-center gap-1">
                                <Calendar className="w-3 h-3" />
                                {session.educationDate}
                              </span>
                              <span>{session.department}</span>
                              <span className="flex items-center gap-1">
                                <Users className="w-3 h-3" />
                                {session.totalParticipants}명
                              </span>
                            </div>
                          </div>
                          <div className="flex items-center gap-2 shrink-0">
                            <Button
                              variant="ghost"
                              size="icon"
                              className="h-8 w-8 text-muted-foreground"
                              onClick={(e) => { e.stopPropagation(); setSelectedSession(session); }}
                              data-testid={`button-view-session-${session.id}`}
                            >
                              <Eye className="w-4 h-4" />
                            </Button>
                            {canRegisterEducation && (
                              <Button
                                variant="ghost"
                                size="icon"
                                className="h-8 w-8 text-muted-foreground"
                                onClick={(e) => {
                                  e.stopPropagation();
                                  if (confirm("이 교육일지를 삭제하시겠습니까?")) {
                                    deleteMutation.mutate(session.id);
                                  }
                                }}
                                data-testid={`button-delete-session-${session.id}`}
                              >
                                <Trash2 className="w-4 h-4" />
                              </Button>
                            )}
                          </div>
                        </div>
                      </motion.div>
                    ))}
                  </AnimatePresence>
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
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="text-xs font-medium text-muted-foreground mb-1 block">부서 *</label>
                <Select value={newDept} onValueChange={setNewDept}>
                  <SelectTrigger data-testid="select-session-dept">
                    <SelectValue placeholder="부서 선택" />
                  </SelectTrigger>
                  <SelectContent>
                    {DEPARTMENTS.map(d => (
                      <SelectItem key={d} value={d}>{d}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div>
                <label className="text-xs font-medium text-muted-foreground mb-1 block">교육인원 *</label>
                <Input
                  type="number"
                  placeholder="인원수"
                  value={newParticipants}
                  onChange={e => setNewParticipants(e.target.value)}
                  min={1}
                  data-testid="input-session-participants"
                />
              </div>
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
                disabled={createMutation.isPending || !newTitle || !newDept || !newParticipants}
                className="bg-gradient-to-r from-indigo-500 to-purple-600 text-white gap-2"
                data-testid="button-submit-session"
              >
                <Plus className="w-4 h-4" /> 교육 등록
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
