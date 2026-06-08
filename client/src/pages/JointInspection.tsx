import { useState } from "react";
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
import { Plus, Pencil, Trash2, ClipboardCheck, Camera, ChevronDown, ChevronUp, MapPin, Building2 } from "lucide-react";
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

type CheckItem = { item: string; issue: string; improvement: string };
type Photo = { url: string; name: string };

const emptyCheckItems = (): CheckItem[] =>
  CHECK_ITEMS_TEMPLATE.map(item => ({ item, issue: "양호", improvement: "양호" }));

const emptyForm = () => ({
  inspectionDate: "",
  siteName: "",
  subcontractor: "",
  checkItems: emptyCheckItems(),
  photos: [] as Photo[],
});

export default function JointInspectionPage() {
  const { toast } = useToast();
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editId, setEditId] = useState<number | null>(null);
  const [form, setForm] = useState(emptyForm());
  const [uploading, setUploading] = useState(false);
  const [expandedId, setExpandedId] = useState<number | null>(null);

  const { data: inspections = [], isLoading } = useQuery<JointInspection[]>({
    queryKey: ["/api/joint-inspections"],
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

  const openCreate = () => {
    setEditId(null);
    setForm(emptyForm());
    setDialogOpen(true);
  };

  const openEdit = (insp: JointInspection) => {
    setEditId(insp.id);
    const ci = (insp.checkItems as CheckItem[] | null);
    const checkItems = ci && ci.length > 0
      ? CHECK_ITEMS_TEMPLATE.map(item => ci.find(c => c.item === item) || { item, issue: "양호", improvement: "양호" })
      : emptyCheckItems();
    setForm({
      inspectionDate: insp.inspectionDate,
      siteName: insp.siteName,
      subcontractor: insp.subcontractor,
      checkItems,
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
      const res = await fetch("/api/joint-inspections/upload-photo", {
        method: "POST", body: fd, credentials: "include",
      });
      const data = await res.json();
      setForm(f => ({ ...f, photos: [...f.photos, { url: data.url, name: data.name }] }));
    } catch {
      toast({ title: "사진 업로드 실패", variant: "destructive" });
    } finally { setUploading(false); }
  };

  const removePhoto = (idx: number) => {
    setForm(f => ({ ...f, photos: f.photos.filter((_, i) => i !== idx) }));
  };

  const getStatusBadgeClass = (val: string) => {
    if (val === "양호") return "text-green-600";
    if (!val || val === "-") return "text-muted-foreground";
    return "text-amber-600";
  };

  return (
    <div className="p-6 max-w-5xl mx-auto space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold flex items-center gap-2">
            <ClipboardCheck className="w-6 h-6 text-green-600" />
            합동안전보건점검
          </h1>
          <p className="text-sm text-muted-foreground mt-1">도급인·수급인 2개월 1회 이상 합동 안전보건 점검 관리</p>
        </div>
        <Button onClick={openCreate} data-testid="button-create-inspection">
          <Plus className="w-4 h-4 mr-1" /> 점검 등록
        </Button>
      </div>

      {isLoading ? (
        <div className="text-center py-12 text-muted-foreground">불러오는 중...</div>
      ) : inspections.length === 0 ? (
        <Card>
          <CardContent className="py-12 text-center text-muted-foreground">
            <ClipboardCheck className="w-10 h-10 mx-auto mb-3 opacity-30" />
            <p>등록된 합동점검이 없습니다</p>
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-3">
          {inspections.map((insp) => {
            const ci = (insp.checkItems as CheckItem[] | null) ?? [];
            const issueCount = ci.filter(c => c.issue && c.issue !== "양호" && c.issue !== "-").length;
            return (
              <Card key={insp.id} className="overflow-hidden">
                <div
                  className="flex items-center justify-between p-4 cursor-pointer hover:bg-muted/30"
                  onClick={() => setExpandedId(expandedId === insp.id ? null : insp.id)}
                  data-testid={`card-inspection-${insp.id}`}
                >
                  <div className="flex items-center gap-4">
                    <div className="flex flex-col gap-1">
                      <div className="flex items-center gap-2">
                        <span className="font-semibold">{insp.inspectionDate}</span>
                        {issueCount > 0 && (
                          <span className="text-xs bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400 px-2 py-0.5 rounded-full">
                            지적사항 {issueCount}건
                          </span>
                        )}
                      </div>
                      <div className="flex items-center gap-3 text-sm text-muted-foreground">
                        <span className="flex items-center gap-1"><MapPin className="w-3 h-3" />{insp.siteName}</span>
                        <span className="flex items-center gap-1"><Building2 className="w-3 h-3" />{insp.subcontractor}</span>
                      </div>
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    <Button size="sm" variant="ghost" onClick={(e) => { e.stopPropagation(); openEdit(insp); }} data-testid={`button-edit-inspection-${insp.id}`}>
                      <Pencil className="w-4 h-4" />
                    </Button>
                    <Button size="sm" variant="ghost" className="text-destructive" onClick={(e) => { e.stopPropagation(); if (confirm("삭제하시겠습니까?")) deleteMutation.mutate(insp.id); }} data-testid={`button-delete-inspection-${insp.id}`}>
                      <Trash2 className="w-4 h-4" />
                    </Button>
                    {expandedId === insp.id ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
                  </div>
                </div>
                {expandedId === insp.id && (
                  <CardContent className="border-t bg-muted/10 pt-4 space-y-4">
                    <div className="overflow-x-auto">
                      <Table>
                        <TableHeader>
                          <TableRow>
                            <TableHead className="w-1/3">점검 항목</TableHead>
                            <TableHead className="w-1/3">문제점</TableHead>
                            <TableHead className="w-1/3">개선 대책</TableHead>
                          </TableRow>
                        </TableHeader>
                        <TableBody>
                          {ci.map((c, i) => (
                            <TableRow key={i}>
                              <TableCell className="font-medium text-sm">{c.item}</TableCell>
                              <TableCell className={`text-sm ${getStatusBadgeClass(c.issue)}`}>{c.issue || "-"}</TableCell>
                              <TableCell className="text-sm text-muted-foreground">{c.improvement || "-"}</TableCell>
                            </TableRow>
                          ))}
                        </TableBody>
                      </Table>
                    </div>
                    {(insp.photos as Photo[] | null)?.length ? (
                      <div>
                        <p className="text-xs font-semibold text-muted-foreground mb-1">점검사진</p>
                        <div className="flex flex-wrap gap-2">
                          {(insp.photos as Photo[]).map((p, i) => (
                            <img key={i} src={p.url} alt={p.name} className="w-32 h-24 object-cover rounded border" />
                          ))}
                        </div>
                      </div>
                    ) : null}
                  </CardContent>
                )}
              </Card>
            );
          })}
        </div>
      )}

      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="max-w-3xl max-h-[90vh] overflow-y-auto">
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

            <div className="space-y-2">
              <Label>점검 항목</Label>
              <div className="border rounded overflow-hidden">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead className="w-1/3">점검 항목</TableHead>
                      <TableHead className="w-1/3">문제점</TableHead>
                      <TableHead className="w-1/3">개선 대책</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {form.checkItems.map((c, i) => (
                      <TableRow key={i}>
                        <TableCell className="text-sm font-medium align-top pt-3">{c.item}</TableCell>
                        <TableCell>
                          <Textarea
                            className="text-sm min-h-[60px] resize-none"
                            value={c.issue}
                            onChange={e => updateCheckItem(i, "issue", e.target.value)}
                            placeholder="양호 또는 문제점 기재"
                            data-testid={`textarea-issue-${i}`}
                          />
                        </TableCell>
                        <TableCell>
                          <Textarea
                            className="text-sm min-h-[60px] resize-none"
                            value={c.improvement}
                            onChange={e => updateCheckItem(i, "improvement", e.target.value)}
                            placeholder="개선 대책 기재"
                            data-testid={`textarea-improvement-${i}`}
                          />
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            </div>

            <div className="space-y-2">
              <Label>점검사진</Label>
              <div className="flex flex-wrap gap-2">
                {form.photos.map((p, i) => (
                  <div key={i} className="relative">
                    <img src={p.url} alt={p.name} className="w-24 h-20 object-cover rounded border" />
                    <button type="button" onClick={() => removePhoto(i)} className="absolute -top-1.5 -right-1.5 bg-destructive text-white rounded-full w-4 h-4 flex items-center justify-center text-xs">×</button>
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
    </div>
  );
}
