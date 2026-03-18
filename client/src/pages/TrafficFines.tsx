import { useState, useRef, useCallback } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { queryClient, apiRequest } from "@/lib/queryClient";
import { useAuth } from "@/hooks/use-auth";
import { useToast } from "@/hooks/use-toast";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Loader2, Upload, FileText, Pencil, Trash2, Plus, ReceiptText, Banknote, AlertCircle, CheckCircle2, ExternalLink } from "lucide-react";
import type { TrafficFine } from "@shared/schema";
import { format } from "date-fns";

const VIOLATION_TYPES = ["신호위반", "과속", "불법주정차", "중앙선침범", "안전거리미확보", "기타"];

const emptyForm = (): Partial<TrafficFine> => ({
  violationDate: "",
  department: "",
  licensePlate: "",
  violationType: "",
  amount: undefined,
  violationLocation: "",
  issuedAt: "",
  dueDate: "",
  paymentStatus: "미납",
  paidAt: "",
  note: "",
  pdfUrl: "",
});

export default function TrafficFines() {
  const { user } = useAuth();
  const { toast } = useToast();
  const fileRef = useRef<HTMLInputElement>(null);

  const [dragging, setDragging] = useState(false);
  const [parsing, setParsing] = useState(false);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editingId, setEditingId] = useState<number | null>(null);
  const [form, setForm] = useState<Partial<TrafficFine>>(emptyForm());
  const [filterStatus, setFilterStatus] = useState<"전체" | "미납" | "납부완료">("전체");
  const [filterText, setFilterText] = useState("");

  const { data: fines = [], isLoading } = useQuery<TrafficFine[]>({
    queryKey: ["/api/traffic-fines"],
  });

  const { data: stats } = useQuery<{
    total: number; totalAmount: number; unpaidAmount: number;
    paidAmount: number; unpaidCount: number; paidCount: number;
    byViolationType: Record<string, number>;
  }>({
    queryKey: ["/api/traffic-fines/stats"],
  });

  const createMutation = useMutation({
    mutationFn: (data: Partial<TrafficFine>) => apiRequest("POST", "/api/traffic-fines", data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/traffic-fines"] });
      queryClient.invalidateQueries({ queryKey: ["/api/traffic-fines/stats"] });
      toast({ title: "등록 완료" });
      setDialogOpen(false);
    },
    onError: () => toast({ title: "등록 실패", variant: "destructive" }),
  });

  const updateMutation = useMutation({
    mutationFn: ({ id, data }: { id: number; data: Partial<TrafficFine> }) =>
      apiRequest("PUT", `/api/traffic-fines/${id}`, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/traffic-fines"] });
      queryClient.invalidateQueries({ queryKey: ["/api/traffic-fines/stats"] });
      toast({ title: "수정 완료" });
      setDialogOpen(false);
    },
    onError: (e: any) => toast({ title: e?.message || "수정 실패", variant: "destructive" }),
  });

  const deleteMutation = useMutation({
    mutationFn: (id: number) => apiRequest("DELETE", `/api/traffic-fines/${id}`),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/traffic-fines"] });
      queryClient.invalidateQueries({ queryKey: ["/api/traffic-fines/stats"] });
      toast({ title: "삭제 완료" });
    },
    onError: (e: any) => toast({ title: e?.message || "삭제 실패", variant: "destructive" }),
  });

  const isOwner = (fine: TrafficFine) =>
    !fine.createdBy || user?.role === "admin" || user?.username === fine.createdBy;

  const handleParsePdf = async (file: File) => {
    if (!file || file.type !== "application/pdf") {
      toast({ title: "PDF 파일만 업로드 가능합니다", variant: "destructive" });
      return;
    }
    setParsing(true);
    try {
      const fd = new FormData();
      fd.append("pdf", file);
      const res = await fetch("/api/traffic-fines/parse-pdf", {
        method: "POST",
        body: fd,
        credentials: "include",
      });
      if (!res.ok) throw new Error("파싱 실패");
      const data = await res.json();
      setForm({ ...emptyForm(), ...data });
      setEditingId(null);
      setDialogOpen(true);
      toast({ title: "AI 분석 완료", description: "추출된 정보를 확인 후 저장하세요" });
    } catch (e) {
      toast({ title: "PDF 분석에 실패했습니다", variant: "destructive" });
    } finally {
      setParsing(false);
      if (fileRef.current) fileRef.current.value = "";
    }
  };

  const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setDragging(false);
    const file = e.dataTransfer.files[0];
    if (file) handleParsePdf(file);
  }, []);

  const handleSave = () => {
    const data = { ...form };
    if (editingId !== null) {
      updateMutation.mutate({ id: editingId, data });
    } else {
      createMutation.mutate(data);
    }
  };

  const openEdit = (fine: TrafficFine) => {
    setEditingId(fine.id);
    setForm({ ...fine });
    setDialogOpen(true);
  };

  const openNew = () => {
    setEditingId(null);
    setForm(emptyForm());
    setDialogOpen(true);
  };

  const filtered = fines.filter((f) => {
    const matchStatus = filterStatus === "전체" || f.paymentStatus === filterStatus;
    const search = filterText.toLowerCase();
    const matchText = !filterText ||
      (f.licensePlate || "").toLowerCase().includes(search) ||
      (f.department || "").toLowerCase().includes(search) ||
      (f.violationType || "").toLowerCase().includes(search) ||
      (f.violationLocation || "").toLowerCase().includes(search);
    return matchStatus && matchText;
  });

  const fmt = (n?: number | null) =>
    n != null ? n.toLocaleString("ko-KR") + "원" : "-";

  return (
    <div className="p-4 md:p-6 space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">과태료 현황</h1>
          <p className="text-sm text-muted-foreground mt-1">교통 과태료 PDF 업로드 시 자동 분석 · 등록</p>
        </div>
        <Button onClick={openNew} data-testid="button-new-fine">
          <Plus className="h-4 w-4 mr-1" /> 직접 등록
        </Button>
      </div>

      {/* 통계 카드 */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <Card>
          <CardContent className="pt-4">
            <div className="flex items-center gap-2">
              <ReceiptText className="h-5 w-5 text-blue-500" />
              <span className="text-sm text-muted-foreground">총 건수</span>
            </div>
            <p className="text-2xl font-bold mt-1" data-testid="stat-total">{stats?.total ?? "-"}</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-4">
            <div className="flex items-center gap-2">
              <Banknote className="h-5 w-5 text-red-500" />
              <span className="text-sm text-muted-foreground">미납액</span>
            </div>
            <p className="text-2xl font-bold mt-1 text-red-600" data-testid="stat-unpaid">{fmt(stats?.unpaidAmount)}</p>
            <p className="text-xs text-muted-foreground">{stats?.unpaidCount ?? 0}건 미납</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-4">
            <div className="flex items-center gap-2">
              <CheckCircle2 className="h-5 w-5 text-green-500" />
              <span className="text-sm text-muted-foreground">납부 완료액</span>
            </div>
            <p className="text-2xl font-bold mt-1 text-green-600" data-testid="stat-paid">{fmt(stats?.paidAmount)}</p>
            <p className="text-xs text-muted-foreground">{stats?.paidCount ?? 0}건 완료</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-4">
            <div className="flex items-center gap-2">
              <AlertCircle className="h-5 w-5 text-orange-500" />
              <span className="text-sm text-muted-foreground">총 과태료</span>
            </div>
            <p className="text-2xl font-bold mt-1" data-testid="stat-total-amount">{fmt(stats?.totalAmount)}</p>
          </CardContent>
        </Card>
      </div>

      {/* PDF 업로드 */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base flex items-center gap-2">
            <FileText className="h-4 w-4" /> PDF 자동 분석
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div
            className={`border-2 border-dashed rounded-lg p-8 text-center transition-colors cursor-pointer ${dragging ? "border-primary bg-primary/5" : "border-muted-foreground/30 hover:border-primary/50"}`}
            onDragOver={(e) => { e.preventDefault(); setDragging(true); }}
            onDragLeave={() => setDragging(false)}
            onDrop={handleDrop}
            onClick={() => fileRef.current?.click()}
            data-testid="upload-pdf-area"
          >
            {parsing ? (
              <div className="flex flex-col items-center gap-2">
                <Loader2 className="h-8 w-8 animate-spin text-primary" />
                <p className="text-sm font-medium">AI 분석 중...</p>
                <p className="text-xs text-muted-foreground">과태료 정보를 추출하고 있습니다</p>
              </div>
            ) : (
              <div className="flex flex-col items-center gap-2">
                <Upload className="h-8 w-8 text-muted-foreground" />
                <p className="text-sm font-medium">과태료 고지서 PDF를 드래그하거나 클릭하여 업로드</p>
                <p className="text-xs text-muted-foreground">업로드 즉시 AI가 자동으로 정보를 추출합니다</p>
              </div>
            )}
            <input
              ref={fileRef}
              type="file"
              accept="application/pdf"
              className="hidden"
              onChange={(e) => { const f = e.target.files?.[0]; if (f) handleParsePdf(f); }}
              data-testid="input-pdf-file"
            />
          </div>
        </CardContent>
      </Card>

      {/* 목록 */}
      <Card>
        <CardHeader>
          <div className="flex flex-col md:flex-row gap-3 md:items-center">
            <CardTitle className="text-base">과태료 목록</CardTitle>
            <div className="flex gap-2 ml-auto">
              <Input
                placeholder="차량번호, 위반유형 검색..."
                value={filterText}
                onChange={(e) => setFilterText(e.target.value)}
                className="w-48"
                data-testid="input-search-fine"
              />
              <Select value={filterStatus} onValueChange={(v: any) => setFilterStatus(v)}>
                <SelectTrigger className="w-32" data-testid="select-filter-status">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="전체">전체</SelectItem>
                  <SelectItem value="미납">미납</SelectItem>
                  <SelectItem value="납부완료">납부완료</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
        </CardHeader>
        <CardContent>
          {isLoading ? (
            <div className="flex justify-center py-12">
              <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
            </div>
          ) : filtered.length === 0 ? (
            <p className="text-center text-muted-foreground py-12 text-sm">과태료 내역이 없습니다</p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b text-muted-foreground">
                    <th className="text-left py-2 px-3 font-medium">위반일자</th>
                    <th className="text-left py-2 px-3 font-medium">차량번호</th>
                    <th className="text-left py-2 px-3 font-medium">위반유형</th>
                    <th className="text-left py-2 px-3 font-medium hidden md:table-cell">소속</th>
                    <th className="text-left py-2 px-3 font-medium hidden lg:table-cell">위반장소</th>
                    <th className="text-right py-2 px-3 font-medium">과태료</th>
                    <th className="text-left py-2 px-3 font-medium hidden md:table-cell">납부기한</th>
                    <th className="text-center py-2 px-3 font-medium">상태</th>
                    <th className="text-left py-2 px-3 font-medium hidden lg:table-cell">PDF</th>
                    <th className="py-2 px-3"></th>
                  </tr>
                </thead>
                <tbody>
                  {filtered.map((fine) => (
                    <tr key={fine.id} className="border-b hover:bg-muted/30 transition-colors" data-testid={`row-fine-${fine.id}`}>
                      <td className="py-2 px-3 whitespace-nowrap">{fine.violationDate || "-"}</td>
                      <td className="py-2 px-3 font-mono font-semibold whitespace-nowrap">{fine.licensePlate || "-"}</td>
                      <td className="py-2 px-3 whitespace-nowrap">{fine.violationType || "-"}</td>
                      <td className="py-2 px-3 hidden md:table-cell text-muted-foreground">{fine.department || "-"}</td>
                      <td className="py-2 px-3 hidden lg:table-cell text-muted-foreground max-w-[160px] truncate">{fine.violationLocation || "-"}</td>
                      <td className="py-2 px-3 text-right font-medium whitespace-nowrap">{fmt(fine.amount)}</td>
                      <td className="py-2 px-3 hidden md:table-cell whitespace-nowrap text-muted-foreground">{fine.dueDate || "-"}</td>
                      <td className="py-2 px-3 text-center">
                        <Badge
                          variant={fine.paymentStatus === "납부완료" ? "default" : "destructive"}
                          className="text-xs"
                          data-testid={`badge-status-${fine.id}`}
                        >
                          {fine.paymentStatus}
                        </Badge>
                      </td>
                      <td className="py-2 px-3 hidden lg:table-cell">
                        {fine.pdfUrl ? (
                          <a href={fine.pdfUrl} target="_blank" rel="noopener noreferrer" className="text-blue-500 hover:underline flex items-center gap-1 text-xs">
                            <ExternalLink className="h-3 w-3" /> PDF
                          </a>
                        ) : "-"}
                      </td>
                      <td className="py-2 px-3">
                        {isOwner(fine) && (
                          <div className="flex gap-1 justify-end">
                            <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => openEdit(fine)} data-testid={`button-edit-fine-${fine.id}`}>
                              <Pencil className="h-3.5 w-3.5" />
                            </Button>
                            <Button variant="ghost" size="icon" className="h-7 w-7 text-destructive hover:text-destructive" onClick={() => {
                              if (confirm("삭제하시겠습니까?")) deleteMutation.mutate(fine.id);
                            }} data-testid={`button-delete-fine-${fine.id}`}>
                              <Trash2 className="h-3.5 w-3.5" />
                            </Button>
                          </div>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </CardContent>
      </Card>

      {/* 등록/수정 다이얼로그 */}
      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>{editingId ? "과태료 수정" : "과태료 등록"}</DialogTitle>
          </DialogHeader>
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-1">
              <Label>위반일자</Label>
              <Input value={form.violationDate || ""} onChange={(e) => setForm({ ...form, violationDate: e.target.value })} placeholder="예: 2026-03-04" data-testid="input-violation-date" />
            </div>
            <div className="space-y-1">
              <Label>차량번호</Label>
              <Input value={form.licensePlate || ""} onChange={(e) => setForm({ ...form, licensePlate: e.target.value })} placeholder="예: 231허3948" data-testid="input-license-plate" />
            </div>
            <div className="space-y-1">
              <Label>위반유형</Label>
              <Select value={form.violationType || ""} onValueChange={(v) => setForm({ ...form, violationType: v })}>
                <SelectTrigger data-testid="select-violation-type">
                  <SelectValue placeholder="선택" />
                </SelectTrigger>
                <SelectContent>
                  {VIOLATION_TYPES.map((t) => (
                    <SelectItem key={t} value={t}>{t}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1">
              <Label>과태료 금액 (원)</Label>
              <Input type="number" value={form.amount ?? ""} onChange={(e) => setForm({ ...form, amount: e.target.value ? Number(e.target.value) : undefined })} placeholder="예: 70000" data-testid="input-amount" />
            </div>
            <div className="space-y-1">
              <Label>소속/본부</Label>
              <Input value={form.department || ""} onChange={(e) => setForm({ ...form, department: e.target.value })} placeholder="예: 대구본부" data-testid="input-department" />
            </div>
            <div className="space-y-1">
              <Label>위반장소</Label>
              <Input value={form.violationLocation || ""} onChange={(e) => setForm({ ...form, violationLocation: e.target.value })} data-testid="input-violation-location" />
            </div>
            <div className="space-y-1">
              <Label>고지일자</Label>
              <Input value={form.issuedAt || ""} onChange={(e) => setForm({ ...form, issuedAt: e.target.value })} data-testid="input-issued-at" />
            </div>
            <div className="space-y-1">
              <Label>납부기한</Label>
              <Input value={form.dueDate || ""} onChange={(e) => setForm({ ...form, dueDate: e.target.value })} data-testid="input-due-date" />
            </div>
            <div className="space-y-1">
              <Label>납부상태</Label>
              <Select value={form.paymentStatus || "미납"} onValueChange={(v) => setForm({ ...form, paymentStatus: v })}>
                <SelectTrigger data-testid="select-payment-status">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="미납">미납</SelectItem>
                  <SelectItem value="납부완료">납부완료</SelectItem>
                </SelectContent>
              </Select>
            </div>
            {form.paymentStatus === "납부완료" && (
              <div className="space-y-1">
                <Label>납부일자</Label>
                <Input value={form.paidAt || ""} onChange={(e) => setForm({ ...form, paidAt: e.target.value })} data-testid="input-paid-at" />
              </div>
            )}
            <div className="col-span-2 space-y-1">
              <Label>비고</Label>
              <Textarea value={form.note || ""} onChange={(e) => setForm({ ...form, note: e.target.value })} rows={2} data-testid="textarea-note" />
            </div>
          </div>
          <DialogFooter className="mt-4">
            <Button variant="outline" onClick={() => setDialogOpen(false)}>취소</Button>
            <Button
              onClick={handleSave}
              disabled={createMutation.isPending || updateMutation.isPending}
              data-testid="button-save-fine"
            >
              {(createMutation.isPending || updateMutation.isPending) && <Loader2 className="h-4 w-4 mr-1 animate-spin" />}
              저장
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
