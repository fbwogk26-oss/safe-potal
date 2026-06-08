import { useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { queryClient, apiRequest } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Users, Trash2, Presentation, FileText, Eye, Upload, Loader2, Plus } from "lucide-react";
import type { SafetyCommittee } from "@shared/schema";

export default function SafetyCommitteePage() {
  const { toast } = useToast();
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editId, setEditId] = useState<number | null>(null);

  const [materialUrl, setMaterialUrl] = useState("");
  const [materialName, setMaterialName] = useState("");
  const [minutesUrl, setMinutesUrl] = useState("");
  const [minutesName, setMinutesName] = useState("");

  const [uploadingMaterial, setUploadingMaterial] = useState(false);
  const [uploadingMinutes, setUploadingMinutes] = useState(false);

  const [pptPreviewUrl, setPptPreviewUrl] = useState<string | null>(null);
  const [docPreviewHtml, setDocPreviewHtml] = useState<string | null>(null);
  const [docPreviewLoading, setDocPreviewLoading] = useState(false);

  const { data: committees = [], isLoading } = useQuery<SafetyCommittee[]>({
    queryKey: ["/api/safety-committees"],
  });

  const createMutation = useMutation({
    mutationFn: (data: any) => apiRequest("POST", "/api/safety-committees", data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/safety-committees"] });
      toast({ title: "등록됐습니다" });
      setDialogOpen(false);
    },
    onError: () => toast({ title: "저장 실패", variant: "destructive" }),
  });

  const updateMutation = useMutation({
    mutationFn: ({ id, data }: { id: number; data: any }) =>
      apiRequest("PUT", `/api/safety-committees/${id}`, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/safety-committees"] });
      toast({ title: "수정됐습니다" });
      setDialogOpen(false);
    },
    onError: () => toast({ title: "수정 실패", variant: "destructive" }),
  });

  const deleteMutation = useMutation({
    mutationFn: (id: number) => apiRequest("DELETE", `/api/safety-committees/${id}`),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/safety-committees"] });
      toast({ title: "삭제됐습니다" });
    },
    onError: () => toast({ title: "삭제 실패", variant: "destructive" }),
  });

  const openCreate = () => {
    setEditId(null);
    setMaterialUrl(""); setMaterialName("");
    setMinutesUrl(""); setMinutesName("");
    setDialogOpen(true);
  };

  const openEdit = (c: SafetyCommittee) => {
    setEditId(c.id);
    setMaterialUrl(c.meetingMaterialUrl ?? "");
    setMaterialName(c.meetingMaterialName ?? "");
    setMinutesUrl(c.meetingMinutesUrl ?? "");
    setMinutesName(c.meetingMinutesName ?? "");
    setDialogOpen(true);
  };

  const handleSubmit = () => {
    const today = new Date().toISOString().slice(0, 10);
    const payload = {
      meetingDate: today,
      location: "-",
      meetingType: "정기",
      principalCount: 0,
      subcontractorCount: 0,
      meetingMaterialUrl: materialUrl,
      meetingMaterialName: materialName,
      meetingMinutesUrl: minutesUrl,
      meetingMinutesName: minutesName,
    };
    if (editId) updateMutation.mutate({ id: editId, data: payload });
    else createMutation.mutate(payload);
  };

  const uploadMaterial = async (file: File) => {
    setUploadingMaterial(true);
    try {
      const fd = new FormData();
      fd.append("file", file);
      const res = await fetch("/api/safety-committees/upload-material", {
        method: "POST", body: fd, credentials: "include",
      });
      if (!res.ok) { const e = await res.json(); throw new Error(e.message); }
      const data = await res.json();
      setMaterialUrl(data.url);
      setMaterialName(data.name);
      toast({ title: "회의자료가 업로드됐습니다" });
    } catch (e: any) {
      toast({ title: e.message || "업로드 실패", variant: "destructive" });
    } finally { setUploadingMaterial(false); }
  };

  const uploadMinutes = async (file: File) => {
    setUploadingMinutes(true);
    try {
      const fd = new FormData();
      fd.append("file", file);
      const res = await fetch("/api/safety-committees/upload-minutes", {
        method: "POST", body: fd, credentials: "include",
      });
      if (!res.ok) { const e = await res.json(); throw new Error(e.message); }
      const data = await res.json();
      setMinutesUrl(data.url);
      setMinutesName(data.name);
      toast({ title: "회의록이 업로드됐습니다" });
    } catch (e: any) {
      toast({ title: e.message || "업로드 실패", variant: "destructive" });
    } finally { setUploadingMinutes(false); }
  };

  const openPptPreview = (url: string) => {
    const fullUrl = `${window.location.origin}${url}`;
    setPptPreviewUrl(`https://view.officeapps.live.com/op/embed.aspx?src=${encodeURIComponent(fullUrl)}`);
  };

  const openDocPreview = async (id: number) => {
    setDocPreviewLoading(true);
    setDocPreviewHtml("");
    try {
      const res = await fetch(`/api/safety-committees/${id}/preview-minutes`, { credentials: "include" });
      if (!res.ok) throw new Error("미리보기 불가");
      const data = await res.json();
      setDocPreviewHtml(data.html);
    } catch {
      toast({ title: "회의록 미리보기 실패", variant: "destructive" });
      setDocPreviewHtml(null);
    } finally { setDocPreviewLoading(false); }
  };

  return (
    <div className="p-6 max-w-3xl mx-auto space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold flex items-center gap-2">
            <Users className="w-6 h-6 text-blue-600" />
            산업안전보건협의체
          </h1>
          <p className="text-sm text-muted-foreground mt-1">회의자료 및 회의록 관리</p>
        </div>
        <Button onClick={openCreate} data-testid="button-create-committee">
          <Plus className="w-4 h-4 mr-1" /> 등록
        </Button>
      </div>

      {isLoading ? (
        <div className="text-center py-12 text-muted-foreground">불러오는 중...</div>
      ) : committees.length === 0 ? (
        <Card>
          <CardContent className="py-12 text-center text-muted-foreground">
            <Users className="w-10 h-10 mx-auto mb-3 opacity-30" />
            <p>등록된 항목이 없습니다</p>
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-3">
          {committees.map((c) => (
            <Card key={c.id} className="p-4" data-testid={`card-committee-${c.id}`}>
              <div className="flex items-center justify-between gap-4">
                <div className="flex flex-col gap-2 flex-1">
                  <span className="text-sm text-muted-foreground">
                    {c.createdAt ? new Date(c.createdAt).toLocaleDateString("ko-KR") : c.meetingDate}
                  </span>
                  <div className="flex flex-wrap gap-2">
                    {c.meetingMaterialName ? (
                      <div className="flex items-center gap-1.5 px-3 py-1.5 bg-orange-50 border border-orange-200 rounded text-sm text-orange-700">
                        <Presentation className="w-3.5 h-3.5 shrink-0" />
                        <span className="truncate max-w-[180px]">{c.meetingMaterialName}</span>
                      </div>
                    ) : (
                      <div className="flex items-center gap-1.5 px-3 py-1.5 bg-muted/40 border border-dashed rounded text-sm text-muted-foreground">
                        <Presentation className="w-3.5 h-3.5" />
                        <span>회의자료 없음</span>
                      </div>
                    )}
                    {c.meetingMinutesName ? (
                      <div className="flex items-center gap-1.5 px-3 py-1.5 bg-blue-50 border border-blue-200 rounded text-sm text-blue-700">
                        <FileText className="w-3.5 h-3.5 shrink-0" />
                        <span className="truncate max-w-[180px]">{c.meetingMinutesName}</span>
                      </div>
                    ) : (
                      <div className="flex items-center gap-1.5 px-3 py-1.5 bg-muted/40 border border-dashed rounded text-sm text-muted-foreground">
                        <FileText className="w-3.5 h-3.5" />
                        <span>회의록 없음</span>
                      </div>
                    )}
                  </div>
                </div>
                <div className="flex items-center gap-1.5 shrink-0">
                  {c.meetingMaterialUrl && (
                    <Button size="sm" variant="outline" className="gap-1 text-orange-600 border-orange-300 hover:bg-orange-50" onClick={() => openPptPreview(c.meetingMaterialUrl!)} data-testid={`button-preview-material-${c.id}`}>
                      <Eye className="w-3.5 h-3.5" />PPT
                    </Button>
                  )}
                  {c.meetingMinutesUrl && (
                    <Button size="sm" variant="outline" className="gap-1 text-blue-600 border-blue-300 hover:bg-blue-50" onClick={() => openDocPreview(c.id)} data-testid={`button-preview-minutes-${c.id}`}>
                      <Eye className="w-3.5 h-3.5" />회의록
                    </Button>
                  )}
                  <Button size="sm" variant="ghost" onClick={() => openEdit(c)} data-testid={`button-edit-committee-${c.id}`}>
                    수정
                  </Button>
                  <Button size="sm" variant="ghost" className="text-destructive" onClick={() => { if (confirm("삭제하시겠습니까?")) deleteMutation.mutate(c.id); }} data-testid={`button-delete-committee-${c.id}`}>
                    <Trash2 className="w-4 h-4" />
                  </Button>
                </div>
              </div>
            </Card>
          ))}
        </div>
      )}

      {/* 등록/수정 다이얼로그 */}
      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>{editId ? "수정" : "회의자료/회의록 등록"}</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-2">
            {/* 회의자료(PPT) */}
            <div className="space-y-2 border rounded-lg p-4 bg-orange-50/50">
              <p className="flex items-center gap-2 text-sm font-semibold text-orange-700">
                <Presentation className="w-4 h-4" />회의자료 (PPT/PPTX)
              </p>
              {materialName ? (
                <div className="flex items-center gap-2 bg-white border rounded p-2 text-sm">
                  <Presentation className="w-4 h-4 text-orange-500 shrink-0" />
                  <span className="flex-1 truncate">{materialName}</span>
                  <button type="button" className="text-muted-foreground hover:text-destructive text-xs" onClick={() => { setMaterialUrl(""); setMaterialName(""); }}>삭제</button>
                </div>
              ) : (
                <label className="flex items-center gap-2 border-2 border-dashed border-orange-300 rounded-lg p-3 cursor-pointer hover:bg-orange-50 text-orange-600">
                  {uploadingMaterial ? <Loader2 className="w-4 h-4 animate-spin" /> : <Upload className="w-4 h-4" />}
                  <span className="text-sm">{uploadingMaterial ? "업로드 중..." : "파일 선택"}</span>
                  <input type="file" accept=".ppt,.pptx" className="hidden" disabled={uploadingMaterial} onChange={e => { if (e.target.files?.[0]) uploadMaterial(e.target.files[0]); e.target.value = ""; }} data-testid="input-material-file" />
                </label>
              )}
            </div>

            {/* 회의록(Word) */}
            <div className="space-y-2 border rounded-lg p-4 bg-blue-50/50">
              <p className="flex items-center gap-2 text-sm font-semibold text-blue-700">
                <FileText className="w-4 h-4" />회의록 (DOC/DOCX)
              </p>
              {minutesName ? (
                <div className="flex items-center gap-2 bg-white border rounded p-2 text-sm">
                  <FileText className="w-4 h-4 text-blue-500 shrink-0" />
                  <span className="flex-1 truncate">{minutesName}</span>
                  <button type="button" className="text-muted-foreground hover:text-destructive text-xs" onClick={() => { setMinutesUrl(""); setMinutesName(""); }}>삭제</button>
                </div>
              ) : (
                <label className="flex items-center gap-2 border-2 border-dashed border-blue-300 rounded-lg p-3 cursor-pointer hover:bg-blue-50 text-blue-600">
                  {uploadingMinutes ? <Loader2 className="w-4 h-4 animate-spin" /> : <Upload className="w-4 h-4" />}
                  <span className="text-sm">{uploadingMinutes ? "업로드 중..." : "파일 선택"}</span>
                  <input type="file" accept=".doc,.docx" className="hidden" disabled={uploadingMinutes} onChange={e => { if (e.target.files?.[0]) uploadMinutes(e.target.files[0]); e.target.value = ""; }} data-testid="input-minutes-file" />
                </label>
              )}
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDialogOpen(false)}>취소</Button>
            <Button onClick={handleSubmit} disabled={createMutation.isPending || updateMutation.isPending} data-testid="button-submit-committee">
              {createMutation.isPending || updateMutation.isPending ? "저장 중..." : (editId ? "수정" : "등록")}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* PPT 미리보기 모달 */}
      <Dialog open={!!pptPreviewUrl} onOpenChange={() => setPptPreviewUrl(null)}>
        <DialogContent className="max-w-5xl w-full h-[85vh] flex flex-col p-0 gap-0">
          <DialogHeader className="p-4 pb-2 shrink-0">
            <DialogTitle className="flex items-center gap-2">
              <Presentation className="w-5 h-5 text-orange-500" />
              회의자료 미리보기
            </DialogTitle>
          </DialogHeader>
          <div className="flex-1 overflow-hidden px-4 pb-4">
            {pptPreviewUrl && (
              <iframe src={pptPreviewUrl} className="w-full h-full rounded border" title="PPT 미리보기" allowFullScreen />
            )}
          </div>
        </DialogContent>
      </Dialog>

      {/* 회의록 미리보기 모달 */}
      <Dialog open={docPreviewHtml !== null} onOpenChange={() => setDocPreviewHtml(null)}>
        <DialogContent className="max-w-4xl w-full max-h-[85vh] flex flex-col p-0 gap-0">
          <DialogHeader className="p-4 pb-2 shrink-0">
            <DialogTitle className="flex items-center gap-2">
              <FileText className="w-5 h-5 text-blue-500" />
              회의록 미리보기
            </DialogTitle>
          </DialogHeader>
          <div className="flex-1 overflow-y-auto px-6 pb-6">
            {docPreviewLoading ? (
              <div className="flex items-center justify-center py-16">
                <Loader2 className="w-8 h-8 animate-spin text-muted-foreground" />
              </div>
            ) : (
              <div className="prose prose-sm max-w-none" dangerouslySetInnerHTML={{ __html: docPreviewHtml || "" }} />
            )}
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
