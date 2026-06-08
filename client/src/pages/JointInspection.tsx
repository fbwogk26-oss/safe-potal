import { useState, useRef, useEffect, useCallback } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { queryClient, apiRequest } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Card, CardContent } from "@/components/ui/card";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Plus, Pencil, Trash2, ClipboardCheck, Camera, ChevronDown, ChevronUp, MapPin, Building2, PenTool, UserCheck, X, Users } from "lucide-react";
import type { JointInspection } from "@shared/schema";

const CHECK_ITEMS_TEMPLATE = [
  "장비 설치 상태",
  "위험요소 내재 상태",
  "화재 시 위험방지 상태",
  "전기관련 작업 시 안전 상태",
  "안전보건 표지판 상태(필요 시)",
  "적정 작업인력 배치 및 작업자 보호구의 착용 상태",
  "작업장 환경 상태",
  "기타",
];

const DEPARTMENTS = [
  "동대구운용팀", "포항운용팀", "안동운용팀",
  "서대구운용팀", "남대구운용팀", "구미운용팀", "문경운용팀",
  "운용계획팀", "사업지원팀", "현장경영팀",
];

type CheckItem = { item: string; issue: string; improvement: string };
type Photo = { url: string; name: string };

interface JoinInspectionSignature {
  id: number;
  inspectionId: number;
  signerName: string;
  signerDepartment?: string | null;
  signerRole?: string | null;
  signatureData: string;
  signedAt?: string | null;
}

const emptyCheckItems = (): CheckItem[] =>
  CHECK_ITEMS_TEMPLATE.map(item => ({ item, issue: "양호", improvement: "양호" }));

const emptyForm = () => ({
  inspectionDate: "",
  siteName: "",
  subcontractor: "",
  checkItems: emptyCheckItems(),
  photos: [] as Photo[],
});

// ── 서명 패드 컴포넌트 ──────────────────────────────────────
function SignaturePad({ onSave, onClear }: { onSave: (data: string) => void; onClear: () => void }) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [isDrawing, setIsDrawing] = useState(false);
  const [hasContent, setHasContent] = useState(false);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const resize = () => {
      const rect = canvas.getBoundingClientRect();
      canvas.width = rect.width;
      canvas.height = Math.max(rect.height, 140);
      const ctx = canvas.getContext("2d");
      if (!ctx) return;
      ctx.fillStyle = "#f9fafb";
      ctx.fillRect(0, 0, canvas.width, canvas.height);
    };
    resize();
  }, []);

  const getPos = useCallback((e: React.MouseEvent | React.TouchEvent) => {
    const canvas = canvasRef.current;
    if (!canvas) return { x: 0, y: 0 };
    const rect = canvas.getBoundingClientRect();
    if ("touches" in e) return { x: e.touches[0].clientX - rect.left, y: e.touches[0].clientY - rect.top };
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
    ctx.lineWidth = 2;
    ctx.lineCap = "round";
    ctx.strokeStyle = "#1e293b";
    const { x, y } = getPos(e);
    ctx.lineTo(x, y);
    ctx.stroke();
  }, [isDrawing, getPos]);

  const stopDraw = useCallback(() => setIsDrawing(false), []);

  const handleSave = () => {
    const canvas = canvasRef.current;
    if (!canvas || !hasContent) return;
    onSave(canvas.toDataURL("image/png"));
  };

  const handleClear = () => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    ctx.fillStyle = "#f9fafb";
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    setHasContent(false);
    onClear();
  };

  return (
    <div className="space-y-2">
      <canvas
        ref={canvasRef}
        className="w-full h-36 border-2 border-dashed border-blue-300 rounded-lg touch-none cursor-crosshair bg-gray-50"
        onMouseDown={startDraw} onMouseMove={draw} onMouseUp={stopDraw} onMouseLeave={stopDraw}
        onTouchStart={startDraw} onTouchMove={draw} onTouchEnd={stopDraw}
      />
      <div className="flex gap-2">
        <Button type="button" size="sm" variant="outline" className="flex-1" onClick={handleClear}>지우기</Button>
        <Button type="button" size="sm" className="flex-1 bg-blue-600 hover:bg-blue-700" onClick={handleSave} disabled={!hasContent}>
          <UserCheck className="w-3.5 h-3.5 mr-1" />서명 완료
        </Button>
      </div>
    </div>
  );
}

export default function JointInspectionPage() {
  const { toast } = useToast();
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editId, setEditId] = useState<number | null>(null);
  const [form, setForm] = useState(emptyForm());
  const [uploading, setUploading] = useState(false);
  const [expandedId, setExpandedId] = useState<number | null>(null);

  // 서명 다이얼로그
  const [signDialogOpen, setSignDialogOpen] = useState(false);
  const [signInspectionId, setSignInspectionId] = useState<number | null>(null);
  const [signForm, setSignForm] = useState({ signerName: "", signerDepartment: "", signerRole: "도급인" });
  const [signatureData, setSignatureData] = useState<string>("");

  const { data: inspections = [], isLoading } = useQuery<JointInspection[]>({
    queryKey: ["/api/joint-inspections"],
  });

  // 확장된 점검의 서명 목록
  const { data: signatures = [], refetch: refetchSigs } = useQuery<JoinInspectionSignature[]>({
    queryKey: ["/api/joint-inspections", expandedId, "signatures"],
    queryFn: async () => {
      if (!expandedId) return [];
      const res = await fetch(`/api/joint-inspections/${expandedId}/signatures`, { credentials: "include" });
      if (!res.ok) return [];
      return res.json();
    },
    enabled: !!expandedId,
  });

  const createMutation = useMutation({
    mutationFn: (data: any) => apiRequest("POST", "/api/joint-inspections", data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/joint-inspections"] });
      toast({ title: "합동점검이 등록됐습니다" });
      setDialogOpen(false);
    },
    onError: () => toast({ title: "저장 실패", variant: "destructive" }),
  });

  const updateMutation = useMutation({
    mutationFn: ({ id, data }: { id: number; data: any }) => apiRequest("PUT", `/api/joint-inspections/${id}`, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/joint-inspections"] });
      toast({ title: "수정됐습니다" });
      setDialogOpen(false);
    },
    onError: () => toast({ title: "수정 실패", variant: "destructive" }),
  });

  const deleteMutation = useMutation({
    mutationFn: (id: number) => apiRequest("DELETE", `/api/joint-inspections/${id}`),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/joint-inspections"] });
      toast({ title: "삭제됐습니다" });
    },
    onError: () => toast({ title: "삭제 실패", variant: "destructive" }),
  });

  const createSigMutation = useMutation({
    mutationFn: (data: { inspectionId: number; signerName: string; signerDepartment: string; signerRole: string; signatureData: string }) =>
      apiRequest("POST", `/api/joint-inspections/${data.inspectionId}/signatures`, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/joint-inspections", signInspectionId, "signatures"] });
      refetchSigs();
      toast({ title: "서명이 등록됐습니다" });
      setSignDialogOpen(false);
      setSignatureData("");
      setSignForm({ signerName: "", signerDepartment: "", signerRole: "도급인" });
    },
    onError: () => toast({ title: "서명 등록 실패", variant: "destructive" }),
  });

  const deleteSigMutation = useMutation({
    mutationFn: (id: number) => apiRequest("DELETE", `/api/joint-inspection-signatures/${id}`),
    onSuccess: () => {
      refetchSigs();
      toast({ title: "서명이 삭제됐습니다" });
    },
    onError: () => toast({ title: "삭제 실패", variant: "destructive" }),
  });

  const openCreate = () => { setEditId(null); setForm(emptyForm()); setDialogOpen(true); };
  const openEdit = (insp: JointInspection) => {
    setEditId(insp.id);
    const ci = insp.checkItems as CheckItem[] | null;
    setForm({
      inspectionDate: insp.inspectionDate,
      siteName: insp.siteName,
      subcontractor: insp.subcontractor,
      checkItems: ci && ci.length > 0
        ? CHECK_ITEMS_TEMPLATE.map(item => ci.find(c => c.item === item) || { item, issue: "양호", improvement: "양호" })
        : emptyCheckItems(),
      photos: (insp.photos as Photo[]) ?? [],
    });
    setDialogOpen(true);
  };

  const handleSubmit = () => {
    if (!form.inspectionDate) return toast({ title: "점검일을 입력하세요", variant: "destructive" });
    if (!form.siteName) return toast({ title: "국소명을 입력하세요", variant: "destructive" });
    if (!form.subcontractor) return toast({ title: "수급인을 입력하세요", variant: "destructive" });
    if (editId) updateMutation.mutate({ id: editId, data: form });
    else createMutation.mutate(form);
  };

  const updateCheckItem = (idx: number, field: "issue" | "improvement", val: string) => {
    setForm(f => {
      const items = [...f.checkItems];
      items[idx] = { ...items[idx], [field]: val };
      return { ...f, checkItems: items };
    });
  };

  const uploadPhoto = async (file: File) => {
    setUploading(true);
    try {
      const fd = new FormData();
      fd.append("photo", file);
      const res = await fetch("/api/joint-inspections/upload-photo", { method: "POST", body: fd, credentials: "include" });
      const data = await res.json();
      setForm(f => ({ ...f, photos: [...f.photos, { url: data.url, name: data.name }] }));
    } catch {
      toast({ title: "사진 업로드 실패", variant: "destructive" });
    } finally { setUploading(false); }
  };

  const openSignDialog = (inspectionId: number) => {
    setSignInspectionId(inspectionId);
    setSignForm({ signerName: "", signerDepartment: "", signerRole: "도급인" });
    setSignatureData("");
    setSignDialogOpen(true);
  };

  const handleSignSubmit = () => {
    if (!signForm.signerName.trim()) return toast({ title: "성명을 입력하세요", variant: "destructive" });
    if (!signatureData) return toast({ title: "서명을 해주세요", variant: "destructive" });
    if (!signInspectionId) return;
    createSigMutation.mutate({
      inspectionId: signInspectionId,
      signerName: signForm.signerName.trim(),
      signerDepartment: signForm.signerDepartment,
      signerRole: signForm.signerRole,
      signatureData,
    });
  };

  const getStatusColor = (val: string) =>
    val === "양호" ? "text-green-600" : (!val || val === "-") ? "text-muted-foreground" : "text-amber-600";

  return (
    <div className="p-4 sm:p-6 max-w-5xl mx-auto space-y-6">
      {/* 헤더 */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl sm:text-2xl font-bold flex items-center gap-2">
            <ClipboardCheck className="w-5 h-5 sm:w-6 sm:h-6 text-green-600 shrink-0" />
            합동안전보건점검
          </h1>
          <p className="text-xs sm:text-sm text-muted-foreground mt-1">도급인·수급인 2개월 1회 이상 합동 안전보건 점검 관리</p>
        </div>
        <Button onClick={openCreate} size="sm" data-testid="button-create-inspection">
          <Plus className="w-4 h-4 mr-1" />점검 등록
        </Button>
      </div>

      {/* 목록 */}
      {isLoading ? (
        <div className="text-center py-12 text-muted-foreground">불러오는 중...</div>
      ) : inspections.length === 0 ? (
        <Card><CardContent className="py-12 text-center text-muted-foreground">
          <ClipboardCheck className="w-10 h-10 mx-auto mb-3 opacity-30" />
          <p>등록된 합동점검이 없습니다</p>
        </CardContent></Card>
      ) : (
        <div className="space-y-3">
          {inspections.map((insp) => {
            const ci = (insp.checkItems as CheckItem[] | null) ?? [];
            const issueCount = ci.filter(c => c.issue && c.issue !== "양호" && c.issue !== "-").length;
            const isExpanded = expandedId === insp.id;
            return (
              <Card key={insp.id} className="overflow-hidden">
                {/* 헤더 행 */}
                <div
                  className="flex items-center justify-between p-4 cursor-pointer hover:bg-muted/30"
                  onClick={() => setExpandedId(isExpanded ? null : insp.id)}
                  data-testid={`card-inspection-${insp.id}`}
                >
                  <div className="flex-1 min-w-0 space-y-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="font-semibold">{insp.inspectionDate}</span>
                      {issueCount > 0 && (
                        <span className="text-xs bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400 px-2 py-0.5 rounded-full shrink-0">
                          지적 {issueCount}건
                        </span>
                      )}
                    </div>
                    <div className="flex flex-wrap items-center gap-3 text-sm text-muted-foreground">
                      <span className="flex items-center gap-1 min-w-0"><MapPin className="w-3 h-3 shrink-0" /><span className="truncate">{insp.siteName}</span></span>
                      <span className="flex items-center gap-1 min-w-0"><Building2 className="w-3 h-3 shrink-0" /><span className="truncate">{insp.subcontractor}</span></span>
                    </div>
                  </div>
                  <div className="flex items-center gap-1 shrink-0 ml-2">
                    <Button size="sm" variant="ghost" className="h-8 w-8 p-0" onClick={(e) => { e.stopPropagation(); openEdit(insp); }} data-testid={`button-edit-inspection-${insp.id}`}>
                      <Pencil className="w-3.5 h-3.5" />
                    </Button>
                    <Button size="sm" variant="ghost" className="h-8 w-8 p-0 text-destructive" onClick={(e) => { e.stopPropagation(); if (confirm("삭제하시겠습니까?")) deleteMutation.mutate(insp.id); }} data-testid={`button-delete-inspection-${insp.id}`}>
                      <Trash2 className="w-3.5 h-3.5" />
                    </Button>
                    {isExpanded ? <ChevronUp className="w-4 h-4 text-muted-foreground" /> : <ChevronDown className="w-4 h-4 text-muted-foreground" />}
                  </div>
                </div>

                {/* 확장 영역 */}
                {isExpanded && (
                  <CardContent className="border-t bg-muted/10 pt-4 space-y-6">
                    {/* 점검 항목 테이블 */}
                    <div className="overflow-x-auto">
                      <Table>
                        <TableHeader>
                          <TableRow>
                            <TableHead className="w-1/3 text-xs">점검 항목</TableHead>
                            <TableHead className="w-1/3 text-xs">문제점</TableHead>
                            <TableHead className="w-1/3 text-xs">개선 대책</TableHead>
                          </TableRow>
                        </TableHeader>
                        <TableBody>
                          {ci.map((c, i) => (
                            <TableRow key={i}>
                              <TableCell className="font-medium text-xs sm:text-sm">{c.item}</TableCell>
                              <TableCell className={`text-xs sm:text-sm ${getStatusColor(c.issue)}`}>{c.issue || "-"}</TableCell>
                              <TableCell className="text-xs sm:text-sm text-muted-foreground">{c.improvement || "-"}</TableCell>
                            </TableRow>
                          ))}
                        </TableBody>
                      </Table>
                    </div>

                    {/* 점검 사진 */}
                    {(insp.photos as Photo[] | null)?.length ? (
                      <div>
                        <p className="text-xs font-semibold text-muted-foreground mb-2">점검사진</p>
                        <div className="flex flex-wrap gap-2">
                          {(insp.photos as Photo[]).map((p, i) => (
                            <img key={i} src={p.url} alt={p.name} className="w-28 h-20 sm:w-32 sm:h-24 object-cover rounded border" />
                          ))}
                        </div>
                      </div>
                    ) : null}

                    {/* 참석자 서명 섹션 */}
                    <div>
                      <div className="flex items-center justify-between mb-3">
                        <p className="text-sm font-semibold flex items-center gap-2">
                          <Users className="w-4 h-4 text-blue-600" />참석자 서명 명단
                          {signatures.length > 0 && (
                            <span className="text-xs bg-blue-100 text-blue-700 px-1.5 py-0.5 rounded-full">{signatures.length}명</span>
                          )}
                        </p>
                        <Button size="sm" variant="outline" className="h-8 gap-1 text-xs" onClick={() => openSignDialog(insp.id)} data-testid={`button-add-signature-${insp.id}`}>
                          <PenTool className="w-3.5 h-3.5" />서명 추가
                        </Button>
                      </div>

                      {signatures.length === 0 ? (
                        <div className="border-2 border-dashed rounded-lg py-6 text-center text-muted-foreground text-sm">
                          <PenTool className="w-6 h-6 mx-auto mb-1 opacity-30" />
                          <p className="text-xs">아직 서명이 없습니다</p>
                        </div>
                      ) : (
                        <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
                          {signatures.map((sig) => (
                            <div key={sig.id} className="border rounded-lg p-3 bg-white dark:bg-muted/20 relative">
                              <button
                                className="absolute top-1.5 right-1.5 text-muted-foreground hover:text-destructive"
                                onClick={() => { if (confirm("서명을 삭제하시겠습니까?")) deleteSigMutation.mutate(sig.id); }}
                                data-testid={`button-delete-sig-${sig.id}`}
                              ><X className="w-3.5 h-3.5" /></button>
                              {/* 서명 이미지 */}
                              <div className="bg-gray-50 dark:bg-gray-800 rounded border mb-2 overflow-hidden">
                                <img src={sig.signatureData} alt="서명" className="w-full h-14 object-contain" />
                              </div>
                              {/* 이름/소속 */}
                              <p className="font-semibold text-sm truncate">{sig.signerName}</p>
                              <div className="flex items-center gap-1 mt-0.5">
                                {sig.signerRole && (
                                  <span className={`text-xs px-1.5 py-0.5 rounded-full shrink-0 ${sig.signerRole === "도급인" ? "bg-blue-100 text-blue-700" : "bg-orange-100 text-orange-700"}`}>
                                    {sig.signerRole}
                                  </span>
                                )}
                                {sig.signerDepartment && <span className="text-xs text-muted-foreground truncate">{sig.signerDepartment}</span>}
                              </div>
                              {sig.signedAt && (
                                <p className="text-xs text-muted-foreground/60 mt-1">{new Date(sig.signedAt).toLocaleDateString("ko-KR")}</p>
                              )}
                            </div>
                          ))}
                        </div>
                      )}
                    </div>
                  </CardContent>
                )}
              </Card>
            );
          })}
        </div>
      )}

      {/* ── 점검 등록/수정 다이얼로그 ── */}
      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="max-w-3xl max-h-[90vh] overflow-y-auto w-[95vw]">
          <DialogHeader>
            <DialogTitle>{editId ? "합동점검 수정" : "합동점검 등록"}</DialogTitle>
          </DialogHeader>
          <div className="space-y-5 py-2">
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-1">
                <Label>점검일 *</Label>
                <Input type="date" value={form.inspectionDate} onChange={e => setForm(f => ({ ...f, inspectionDate: e.target.value }))} data-testid="input-inspection-date" />
              </div>
              <div className="space-y-1">
                <Label>수급인(회사명) *</Label>
                <Input placeholder="예: 신화에스엔씨, 와이어블" value={form.subcontractor} onChange={e => setForm(f => ({ ...f, subcontractor: e.target.value }))} data-testid="input-subcontractor" />
              </div>
            </div>
            <div className="space-y-1">
              <Label>국소명(점검장소) *</Label>
              <Input placeholder="예: 동구청역3, 삼덕동1가21-24 전주" value={form.siteName} onChange={e => setForm(f => ({ ...f, siteName: e.target.value }))} data-testid="input-site-name" />
            </div>

            {/* 점검 항목 */}
            <div className="space-y-2">
              <Label>점검 항목</Label>
              <div className="border rounded overflow-hidden">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead className="w-1/3 text-xs">점검 항목</TableHead>
                      <TableHead className="w-1/3 text-xs">문제점</TableHead>
                      <TableHead className="w-1/3 text-xs">개선 대책</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {form.checkItems.map((c, i) => (
                      <TableRow key={i}>
                        <TableCell className="text-xs font-medium align-top pt-3">{c.item}</TableCell>
                        <TableCell>
                          <Textarea className="text-xs min-h-[50px] resize-none" value={c.issue}
                            onChange={e => updateCheckItem(i, "issue", e.target.value)}
                            placeholder="양호 또는 문제점 기재" data-testid={`textarea-issue-${i}`} />
                        </TableCell>
                        <TableCell>
                          <Textarea className="text-xs min-h-[50px] resize-none" value={c.improvement}
                            onChange={e => updateCheckItem(i, "improvement", e.target.value)}
                            placeholder="개선 대책" data-testid={`textarea-improvement-${i}`} />
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            </div>

            {/* 점검 사진 */}
            <div className="space-y-2">
              <Label>점검사진</Label>
              <div className="flex flex-wrap gap-2">
                {form.photos.map((p, i) => (
                  <div key={i} className="relative">
                    <img src={p.url} alt={p.name} className="w-24 h-20 object-cover rounded border" />
                    <button type="button" onClick={() => setForm(f => ({ ...f, photos: f.photos.filter((_, j) => j !== i) }))} className="absolute -top-1.5 -right-1.5 bg-destructive text-white rounded-full w-4 h-4 flex items-center justify-center text-xs">×</button>
                  </div>
                ))}
                <label className="w-24 h-20 border-2 border-dashed rounded flex flex-col items-center justify-center cursor-pointer hover:bg-muted/30 text-muted-foreground">
                  <Camera className="w-5 h-5 mb-1" />
                  <span className="text-xs">{uploading ? "업로드중" : "사진 추가"}</span>
                  <input type="file" accept="image/*" multiple className="hidden" disabled={uploading} onChange={e => { Array.from(e.target.files || []).forEach(uploadPhoto); e.target.value = ""; }} />
                </label>
              </div>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDialogOpen(false)}>취소</Button>
            <Button onClick={handleSubmit} disabled={createMutation.isPending || updateMutation.isPending} data-testid="button-submit-inspection">
              {createMutation.isPending || updateMutation.isPending ? "저장 중..." : (editId ? "수정" : "등록")}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ── 서명 추가 다이얼로그 ── */}
      <Dialog open={signDialogOpen} onOpenChange={setSignDialogOpen}>
        <DialogContent className="max-w-sm w-[95vw]">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <PenTool className="w-4 h-4 text-blue-600" />참석자 서명
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-2">
            {/* 구분 (도급인/수급인) */}
            <div className="space-y-1">
              <Label>구분</Label>
              <div className="flex gap-2">
                {["도급인", "수급인"].map(role => (
                  <button
                    key={role}
                    type="button"
                    onClick={() => setSignForm(f => ({ ...f, signerRole: role }))}
                    className={`flex-1 py-2 rounded-lg border-2 text-sm font-medium transition-colors ${
                      signForm.signerRole === role
                        ? role === "도급인" ? "border-blue-500 bg-blue-50 text-blue-700" : "border-orange-500 bg-orange-50 text-orange-700"
                        : "border-muted bg-background text-muted-foreground hover:border-muted-foreground"
                    }`}
                    data-testid={`button-role-${role}`}
                  >{role}</button>
                ))}
              </div>
            </div>

            {/* 성명 */}
            <div className="space-y-1">
              <Label>성명 *</Label>
              <Input placeholder="성명을 입력하세요" value={signForm.signerName}
                onChange={e => setSignForm(f => ({ ...f, signerName: e.target.value }))}
                data-testid="input-signer-name" />
            </div>

            {/* 소속 */}
            <div className="space-y-1">
              <Label>소속</Label>
              <Select value={signForm.signerDepartment} onValueChange={v => setSignForm(f => ({ ...f, signerDepartment: v }))}>
                <SelectTrigger data-testid="select-signer-dept">
                  <SelectValue placeholder="소속 선택 (선택)" />
                </SelectTrigger>
                <SelectContent>
                  {DEPARTMENTS.map(d => <SelectItem key={d} value={d}>{d}</SelectItem>)}
                  <SelectItem value="기타">기타</SelectItem>
                </SelectContent>
              </Select>
            </div>

            {/* 서명 패드 */}
            <div className="space-y-1">
              <Label className="flex items-center gap-1">
                <PenTool className="w-3.5 h-3.5" />서명 *
                <span className="text-xs text-muted-foreground font-normal">(아래에 손가락으로 서명하세요)</span>
              </Label>
              <SignaturePad
                onSave={(data) => setSignatureData(data)}
                onClear={() => setSignatureData("")}
              />
              {signatureData && (
                <p className="text-xs text-green-600 flex items-center gap-1">
                  <UserCheck className="w-3.5 h-3.5" />서명 완료
                </p>
              )}
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setSignDialogOpen(false)}>취소</Button>
            <Button
              onClick={handleSignSubmit}
              disabled={!signForm.signerName || !signatureData || createSigMutation.isPending}
              className="bg-blue-600 hover:bg-blue-700"
              data-testid="button-submit-signature"
            >
              {createSigMutation.isPending ? "등록 중..." : "서명 등록"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
