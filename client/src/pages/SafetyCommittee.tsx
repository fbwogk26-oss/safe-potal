import { useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { queryClient, apiRequest } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Plus, Pencil, Trash2, Users, Camera, X, MapPin, ChevronDown, ChevronUp, Presentation, FileText, Eye, Upload, Loader2 } from "lucide-react";
import type { SafetyCommittee } from "@shared/schema";

const DEFAULT_AGENDA = `1. 작업의 시작시간
2. 작업 또는 작업장 간의 연락 방법(긴급연락망)
3. 재해발생 위험이 있는 경우 예방 방법
4. 위험성평가의 실시에 관한 사항
5. 사업주와 수급인 또는 수급인 상호 간의 연락 방법 및 작업공정의 조정`;

type Attendee = { no: number; affiliation: string; position: string; name: string; note: string };
type Photo = { url: string; name: string };

const emptyForm = () => ({
  meetingDate: "",
  location: "",
  meetingType: "정기",
  principalCount: 0,
  subcontractorCount: 0,
  agendaItems: DEFAULT_AGENDA,
  resolutionItems: "",
  safetyActivities: "",
  attendees: [] as Attendee[],
  photos: [] as Photo[],
  meetingMaterialUrl: "",
  meetingMaterialName: "",
  meetingMinutesUrl: "",
  meetingMinutesName: "",
});

export default function SafetyCommitteePage() {
  const { toast } = useToast();
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editId, setEditId] = useState<number | null>(null);
  const [form, setForm] = useState(emptyForm());
  const [uploading, setUploading] = useState(false);
  const [uploadingMaterial, setUploadingMaterial] = useState(false);
  const [uploadingMinutes, setUploadingMinutes] = useState(false);
  const [expandedId, setExpandedId] = useState<number | null>(null);

  // 미리보기 모달 상태
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
      toast({ title: "협의체 회의가 등록됐습니다" });
      setDialogOpen(false);
    },
    onError: () => toast({ title: "저장 실패", variant: "destructive" }),
  });

  const updateMutation = useMutation({
    mutationFn: ({ id, data }: { id: number; data: any }) => apiRequest("PUT", `/api/safety-committees/${id}`, data),
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
    setForm(emptyForm());
    setDialogOpen(true);
  };

  const openEdit = (c: SafetyCommittee) => {
    setEditId(c.id);
    setForm({
      meetingDate: c.meetingDate,
      location: c.location,
      meetingType: c.meetingType,
      principalCount: c.principalCount ?? 0,
      subcontractorCount: c.subcontractorCount ?? 0,
      agendaItems: c.agendaItems ?? DEFAULT_AGENDA,
      resolutionItems: c.resolutionItems ?? "",
      safetyActivities: c.safetyActivities ?? "",
      attendees: (c.attendees as Attendee[]) ?? [],
      photos: (c.photos as Photo[]) ?? [],
      meetingMaterialUrl: c.meetingMaterialUrl ?? "",
      meetingMaterialName: c.meetingMaterialName ?? "",
      meetingMinutesUrl: c.meetingMinutesUrl ?? "",
      meetingMinutesName: c.meetingMinutesName ?? "",
    });
    setDialogOpen(true);
  };

  const handleSubmit = () => {
    if (!form.meetingDate) return toast({ title: "일시를 입력하세요", variant: "destructive" });
    if (!form.location) return toast({ title: "장소를 입력하세요", variant: "destructive" });
    const payload = {
      ...form,
      principalCount: Number(form.principalCount),
      subcontractorCount: Number(form.subcontractorCount),
    };
    if (editId) updateMutation.mutate({ id: editId, data: payload });
    else createMutation.mutate(payload);
  };

  const addAttendee = () => {
    setForm(f => ({
      ...f,
      attendees: [...f.attendees, { no: f.attendees.length + 1, affiliation: "", position: "", name: "", note: "서면대체" }],
    }));
  };

  const updateAttendee = (idx: number, field: keyof Attendee, val: string) => {
    setForm(f => {
      const att = [...f.attendees];
      att[idx] = { ...att[idx], [field]: val };
      return { ...f, attendees: att };
    });
  };

  const removeAttendee = (idx: number) => {
    setForm(f => ({ ...f, attendees: f.attendees.filter((_, i) => i !== idx) }));
  };

  const uploadPhoto = async (file: File) => {
    setUploading(true);
    try {
      const fd = new FormData();
      fd.append("photo", file);
      const res = await fetch("/api/safety-committees/upload-photo", {
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

  const uploadMaterial = async (file: File) => {
    setUploadingMaterial(true);
    try {
      const fd = new FormData();
      fd.append("file", file);
      const res = await fetch("/api/safety-committees/upload-material", {
        method: "POST", body: fd, credentials: "include",
      });
      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.message || "업로드 실패");
      }
      const data = await res.json();
      setForm(f => ({ ...f, meetingMaterialUrl: data.url, meetingMaterialName: data.name }));
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
      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.message || "업로드 실패");
      }
      const data = await res.json();
      setForm(f => ({ ...f, meetingMinutesUrl: data.url, meetingMinutesName: data.name }));
      toast({ title: "회의록이 업로드됐습니다" });
    } catch (e: any) {
      toast({ title: e.message || "업로드 실패", variant: "destructive" });
    } finally { setUploadingMinutes(false); }
  };

  const openPptPreview = (url: string) => {
    const fullUrl = `${window.location.origin}${url}`;
    const viewerUrl = `https://view.officeapps.live.com/op/embed.aspx?src=${encodeURIComponent(fullUrl)}`;
    setPptPreviewUrl(viewerUrl);
  };

  const openDocPreview = async (id: number) => {
    setDocPreviewLoading(true);
    setDocPreviewHtml("");
    try {
      const res = await fetch(`/api/safety-committees/${id}/preview-minutes`, {
        credentials: "include",
      });
      if (!res.ok) throw new Error("미리보기 불가");
      const data = await res.json();
      setDocPreviewHtml(data.html);
    } catch {
      toast({ title: "회의록 미리보기 실패", variant: "destructive" });
      setDocPreviewHtml(null);
    } finally { setDocPreviewLoading(false); }
  };

  return (
    <div className="p-6 max-w-5xl mx-auto space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold flex items-center gap-2">
            <Users className="w-6 h-6 text-blue-600" />
            산업안전보건협의체
          </h1>
          <p className="text-sm text-muted-foreground mt-1">도급인·수급인 월 1회 이상 정기 협의체 회의 관리</p>
        </div>
        <Button onClick={openCreate} data-testid="button-create-committee">
          <Plus className="w-4 h-4 mr-1" /> 회의 등록
        </Button>
      </div>

      {isLoading ? (
        <div className="text-center py-12 text-muted-foreground">불러오는 중...</div>
      ) : committees.length === 0 ? (
        <Card>
          <CardContent className="py-12 text-center text-muted-foreground">
            <Users className="w-10 h-10 mx-auto mb-3 opacity-30" />
            <p>등록된 협의체 회의가 없습니다</p>
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-3">
          {committees.map((c) => (
            <Card key={c.id} className="overflow-hidden">
              <div
                className="flex items-center justify-between p-4 cursor-pointer hover:bg-muted/30"
                onClick={() => setExpandedId(expandedId === c.id ? null : c.id)}
                data-testid={`card-committee-${c.id}`}
              >
                <div className="flex items-center gap-4">
                  <div className="flex flex-col gap-1">
                    <div className="flex items-center gap-2">
                      <span className="font-semibold">{c.meetingDate}</span>
                      <Badge variant={c.meetingType === "정기" ? "default" : "secondary"}>{c.meetingType}</Badge>
                      {c.meetingMaterialName && (
                        <Badge variant="outline" className="text-orange-600 border-orange-300 gap-1">
                          <Presentation className="w-3 h-3" />회의자료
                        </Badge>
                      )}
                      {c.meetingMinutesName && (
                        <Badge variant="outline" className="text-blue-600 border-blue-300 gap-1">
                          <FileText className="w-3 h-3" />회의록
                        </Badge>
                      )}
                    </div>
                    <div className="flex items-center gap-3 text-sm text-muted-foreground">
                      <span className="flex items-center gap-1"><MapPin className="w-3 h-3" />{c.location}</span>
                      <span className="flex items-center gap-1"><Users className="w-3 h-3" />도급인 {c.principalCount}명 / 수급인 {c.subcontractorCount}명</span>
                    </div>
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  {c.meetingMaterialUrl && (
                    <Button size="sm" variant="outline" className="text-orange-600 border-orange-300 hover:bg-orange-50 gap-1" onClick={(e) => { e.stopPropagation(); openPptPreview(c.meetingMaterialUrl!); }} data-testid={`button-preview-material-${c.id}`}>
                      <Eye className="w-3 h-3" />PPT
                    </Button>
                  )}
                  {c.meetingMinutesUrl && (
                    <Button size="sm" variant="outline" className="text-blue-600 border-blue-300 hover:bg-blue-50 gap-1" onClick={(e) => { e.stopPropagation(); openDocPreview(c.id); }} data-testid={`button-preview-minutes-${c.id}`}>
                      <Eye className="w-3 h-3" />회의록
                    </Button>
                  )}
                  <Button size="sm" variant="ghost" onClick={(e) => { e.stopPropagation(); openEdit(c); }} data-testid={`button-edit-committee-${c.id}`}>
                    <Pencil className="w-4 h-4" />
                  </Button>
                  <Button size="sm" variant="ghost" className="text-destructive" onClick={(e) => { e.stopPropagation(); if (confirm("삭제하시겠습니까?")) deleteMutation.mutate(c.id); }} data-testid={`button-delete-committee-${c.id}`}>
                    <Trash2 className="w-4 h-4" />
                  </Button>
                  {expandedId === c.id ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
                </div>
              </div>
              {expandedId === c.id && (
                <CardContent className="border-t bg-muted/10 pt-4 space-y-4">
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <div>
                      <p className="text-xs font-semibold text-muted-foreground mb-1">협의사항</p>
                      <p className="text-sm whitespace-pre-line bg-background rounded p-2 border">{c.agendaItems || "-"}</p>
                    </div>
                    <div>
                      <p className="text-xs font-semibold text-muted-foreground mb-1">의결사항</p>
                      <p className="text-sm whitespace-pre-line bg-background rounded p-2 border">{c.resolutionItems || "-"}</p>
                    </div>
                  </div>
                  {c.safetyActivities && (
                    <div>
                      <p className="text-xs font-semibold text-muted-foreground mb-1">산업재해예방조치 실적</p>
                      <p className="text-sm whitespace-pre-line bg-background rounded p-2 border">{c.safetyActivities}</p>
                    </div>
                  )}
                  {(c.attendees as Attendee[] | null)?.length ? (
                    <div>
                      <p className="text-xs font-semibold text-muted-foreground mb-1">참석자 명단 ({(c.attendees as Attendee[]).length}명)</p>
                      <div className="overflow-x-auto">
                        <Table>
                          <TableHeader>
                            <TableRow>
                              <TableHead className="w-12">순번</TableHead>
                              <TableHead>소속</TableHead>
                              <TableHead>직책</TableHead>
                              <TableHead>성명</TableHead>
                              <TableHead>비고</TableHead>
                            </TableRow>
                          </TableHeader>
                          <TableBody>
                            {(c.attendees as Attendee[]).map((a, i) => (
                              <TableRow key={i}>
                                <TableCell>{a.no || i + 1}</TableCell>
                                <TableCell>{a.affiliation}</TableCell>
                                <TableCell>{a.position}</TableCell>
                                <TableCell>{a.name}</TableCell>
                                <TableCell>{a.note}</TableCell>
                              </TableRow>
                            ))}
                          </TableBody>
                        </Table>
                      </div>
                    </div>
                  ) : null}
                  {(c.photos as Photo[] | null)?.length ? (
                    <div>
                      <p className="text-xs font-semibold text-muted-foreground mb-1">회의사진</p>
                      <div className="flex flex-wrap gap-2">
                        {(c.photos as Photo[]).map((p, i) => (
                          <img key={i} src={p.url} alt={p.name} className="w-32 h-24 object-cover rounded border" />
                        ))}
                      </div>
                    </div>
                  ) : null}
                </CardContent>
              )}
            </Card>
          ))}
        </div>
      )}

      {/* 회의 등록/수정 다이얼로그 */}
      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="max-w-3xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>{editId ? "협의체 회의 수정" : "협의체 회의 등록"}</DialogTitle>
          </DialogHeader>
          <div className="space-y-5 py-2">
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-1">
                <Label>일시 *</Label>
                <Input type="date" value={form.meetingDate} onChange={e => setForm(f => ({ ...f, meetingDate: e.target.value }))} data-testid="input-meeting-date" />
              </div>
              <div className="space-y-1">
                <Label>회의구분</Label>
                <Select value={form.meetingType} onValueChange={v => setForm(f => ({ ...f, meetingType: v }))}>
                  <SelectTrigger data-testid="select-meeting-type"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="정기">정기</SelectItem>
                    <SelectItem value="임시">임시</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>
            <div className="space-y-1">
              <Label>장소 *</Label>
              <Input placeholder="예: kt MOS남부 대구본부 회의실 / 서면대체" value={form.location} onChange={e => setForm(f => ({ ...f, location: e.target.value }))} data-testid="input-location" />
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-1">
                <Label>도급인 참석인원</Label>
                <Input type="number" min={0} value={form.principalCount} onChange={e => setForm(f => ({ ...f, principalCount: Number(e.target.value) }))} data-testid="input-principal-count" />
              </div>
              <div className="space-y-1">
                <Label>수급인 참석인원</Label>
                <Input type="number" min={0} value={form.subcontractorCount} onChange={e => setForm(f => ({ ...f, subcontractorCount: Number(e.target.value) }))} data-testid="input-subcontractor-count" />
              </div>
            </div>
            <div className="space-y-1">
              <Label>협의사항</Label>
              <Textarea rows={6} value={form.agendaItems} onChange={e => setForm(f => ({ ...f, agendaItems: e.target.value }))} data-testid="textarea-agenda" />
            </div>
            <div className="space-y-1">
              <Label>의결사항</Label>
              <Textarea rows={4} placeholder="의결된 사항을 입력하세요" value={form.resolutionItems} onChange={e => setForm(f => ({ ...f, resolutionItems: e.target.value }))} data-testid="textarea-resolution" />
            </div>
            <div className="space-y-1">
              <Label>산업재해예방조치 실적</Label>
              <Textarea rows={4} placeholder="도급인/수급인별 안전보건 활동 실적을 입력하세요" value={form.safetyActivities} onChange={e => setForm(f => ({ ...f, safetyActivities: e.target.value }))} data-testid="textarea-activities" />
            </div>

            {/* 회의자료(PPT) 업로드 */}
            <div className="space-y-2 border rounded-lg p-4 bg-orange-50/50">
              <Label className="flex items-center gap-2 text-orange-700 font-semibold">
                <Presentation className="w-4 h-4" />
                회의자료 (PPT/PPTX)
              </Label>
              {form.meetingMaterialName ? (
                <div className="flex items-center gap-2 bg-white border rounded p-2">
                  <Presentation className="w-4 h-4 text-orange-500 shrink-0" />
                  <span className="text-sm flex-1 truncate">{form.meetingMaterialName}</span>
                  <Button type="button" size="icon" variant="ghost" className="h-6 w-6" onClick={() => setForm(f => ({ ...f, meetingMaterialUrl: "", meetingMaterialName: "" }))}>
                    <X className="w-3 h-3" />
                  </Button>
                </div>
              ) : (
                <label className="flex items-center gap-2 border-2 border-dashed border-orange-300 rounded-lg p-3 cursor-pointer hover:bg-orange-50 text-orange-600">
                  {uploadingMaterial ? <Loader2 className="w-4 h-4 animate-spin" /> : <Upload className="w-4 h-4" />}
                  <span className="text-sm">{uploadingMaterial ? "업로드 중..." : "PPT/PPTX 파일 선택"}</span>
                  <input type="file" accept=".ppt,.pptx" className="hidden" disabled={uploadingMaterial} onChange={e => { if (e.target.files?.[0]) uploadMaterial(e.target.files[0]); e.target.value = ""; }} data-testid="input-material-file" />
                </label>
              )}
            </div>

            {/* 회의록(Word) 업로드 */}
            <div className="space-y-2 border rounded-lg p-4 bg-blue-50/50">
              <Label className="flex items-center gap-2 text-blue-700 font-semibold">
                <FileText className="w-4 h-4" />
                회의록 (DOC/DOCX)
              </Label>
              {form.meetingMinutesName ? (
                <div className="flex items-center gap-2 bg-white border rounded p-2">
                  <FileText className="w-4 h-4 text-blue-500 shrink-0" />
                  <span className="text-sm flex-1 truncate">{form.meetingMinutesName}</span>
                  <Button type="button" size="icon" variant="ghost" className="h-6 w-6" onClick={() => setForm(f => ({ ...f, meetingMinutesUrl: "", meetingMinutesName: "" }))}>
                    <X className="w-3 h-3" />
                  </Button>
                </div>
              ) : (
                <label className="flex items-center gap-2 border-2 border-dashed border-blue-300 rounded-lg p-3 cursor-pointer hover:bg-blue-50 text-blue-600">
                  {uploadingMinutes ? <Loader2 className="w-4 h-4 animate-spin" /> : <Upload className="w-4 h-4" />}
                  <span className="text-sm">{uploadingMinutes ? "업로드 중..." : "DOC/DOCX 파일 선택"}</span>
                  <input type="file" accept=".doc,.docx" className="hidden" disabled={uploadingMinutes} onChange={e => { if (e.target.files?.[0]) uploadMinutes(e.target.files[0]); e.target.value = ""; }} data-testid="input-minutes-file" />
                </label>
              )}
            </div>

            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <Label>참석자 명단</Label>
                <Button type="button" size="sm" variant="outline" onClick={addAttendee} data-testid="button-add-attendee">
                  <Plus className="w-3 h-3 mr-1" /> 행 추가
                </Button>
              </div>
              {form.attendees.length > 0 && (
                <div className="overflow-x-auto border rounded">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead className="w-10">순</TableHead>
                        <TableHead>소속</TableHead>
                        <TableHead>직책</TableHead>
                        <TableHead>성명</TableHead>
                        <TableHead>비고</TableHead>
                        <TableHead className="w-8"></TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {form.attendees.map((a, i) => (
                        <TableRow key={i}>
                          <TableCell className="text-center text-sm">{i + 1}</TableCell>
                          <TableCell><Input className="h-7 text-sm" value={a.affiliation} onChange={e => updateAttendee(i, "affiliation", e.target.value)} placeholder="소속" /></TableCell>
                          <TableCell><Input className="h-7 text-sm" value={a.position} onChange={e => updateAttendee(i, "position", e.target.value)} placeholder="직책" /></TableCell>
                          <TableCell><Input className="h-7 text-sm" value={a.name} onChange={e => updateAttendee(i, "name", e.target.value)} placeholder="성명" /></TableCell>
                          <TableCell><Input className="h-7 text-sm" value={a.note} onChange={e => updateAttendee(i, "note", e.target.value)} placeholder="서면대체" /></TableCell>
                          <TableCell><Button type="button" size="icon" variant="ghost" className="h-7 w-7" onClick={() => removeAttendee(i)}><X className="w-3 h-3" /></Button></TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </div>
              )}
            </div>

            <div className="space-y-2">
              <Label>회의사진</Label>
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
            <Button onClick={handleSubmit} disabled={createMutation.isPending || updateMutation.isPending} data-testid="button-submit-committee">
              {createMutation.isPending || updateMutation.isPending ? "저장 중..." : (editId ? "수정" : "등록")}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* PPT 미리보기 모달 (Office Online Viewer) */}
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
              <iframe
                src={pptPreviewUrl}
                className="w-full h-full rounded border"
                title="PPT 미리보기"
                allowFullScreen
              />
            )}
          </div>
        </DialogContent>
      </Dialog>

      {/* Word 미리보기 모달 (mammoth HTML) */}
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
              <div
                className="prose prose-sm max-w-none"
                dangerouslySetInnerHTML={{ __html: docPreviewHtml || "" }}
              />
            )}
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
