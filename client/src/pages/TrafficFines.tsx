import { useState, useRef, useCallback, useEffect } from "react";
import { createPortal } from "react-dom";
import { useQuery, useMutation } from "@tanstack/react-query";
import { queryClient, apiRequest } from "@/lib/queryClient";
import { useAuth } from "@/hooks/use-auth";
import { useToast } from "@/hooks/use-toast";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Label } from "@/components/ui/label";
import { Loader2, Upload, FileText, Pencil, Trash2, Plus, ReceiptText, AlertCircle, Car, X, ZoomIn, FileDown, Zap, AlertTriangle } from "lucide-react";
import type { TrafficFine, Vehicle } from "@shared/schema";

const todayStr = () => {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
};

const emptyForm = (): Partial<TrafficFine> => ({
  violationDate: "",
  licensePlate: "",
  vehicleType: "",
  department: "",
  driver: "",
  violationType: "",
  violationLocation: "",
  amount: undefined,
  paymentDestination: "",
  requestDate: todayStr(),
  paymentStatus: "미납",
  paidAt: "",
  pdfUrl: "",
  thumbnailUrl: "",
});

// 차량번호 자동완성 컴포넌트
function PlateAutocomplete({
  value,
  onChange,
  onVehicleSelect,
  vehicles,
}: {
  value: string;
  onChange: (v: string) => void;
  onVehicleSelect: (v: Vehicle) => void;
  vehicles: Vehicle[];
}) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  const matches = value.trim().length > 0
    ? vehicles.filter((v) =>
        v.plateNumber.replace(/\s/g, "").includes(value.replace(/\s/g, ""))
      ).slice(0, 8)
    : [];

  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, []);

  return (
    <div ref={ref} className="relative">
      <Input
        value={value}
        onChange={(e) => { onChange(e.target.value); setOpen(true); }}
        onFocus={() => { if (value.trim()) setOpen(true); }}
        placeholder="예: 231허3948"
        autoComplete="off"
        data-testid="input-license-plate"
      />
      {open && matches.length > 0 && (
        <div className="absolute z-50 top-full left-0 right-0 mt-1 bg-popover border rounded-md shadow-lg max-h-52 overflow-auto">
          {matches.map((v) => (
            <button
              key={v.id}
              type="button"
              className="w-full text-left px-3 py-2 hover:bg-accent transition-colors text-sm flex items-center gap-2"
              onMouseDown={(e) => {
                e.preventDefault();
                onVehicleSelect(v);
                setOpen(false);
              }}
            >
              <Car className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
              <span className="font-mono font-semibold">{v.plateNumber}</span>
              <span className="text-muted-foreground">{v.vehicleType}</span>
              <span className="ml-auto text-muted-foreground text-xs">{v.team}</span>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

// 납부상태 인라인 편집
function PaymentStatusCell({
  fine,
  onUpdate,
  canEdit,
}: {
  fine: TrafficFine;
  onUpdate: (id: number, status: string, paidAt?: string) => void;
  canEdit: boolean;
}) {
  const [editing, setEditing] = useState(false);
  const [pendingStatus, setPendingStatus] = useState(fine.paymentStatus || "미납");
  const [paidAt, setPaidAt] = useState(fine.paidAt || todayStr());
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setEditing(false);
    };
    if (editing) document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, [editing]);

  if (!canEdit) {
    return (
      <Badge variant={fine.paymentStatus === "납부완료" ? "default" : "destructive"} className="text-xs">
        {fine.paymentStatus || "미납"}
      </Badge>
    );
  }

  if (editing) {
    return (
      <div ref={ref} className="flex flex-col gap-1.5 p-2 bg-popover border rounded-md shadow-lg absolute z-50 min-w-[160px] right-0">
        <Select value={pendingStatus} onValueChange={setPendingStatus}>
          <SelectTrigger className="h-7 text-xs">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="미납">미납</SelectItem>
            <SelectItem value="납부완료">납부완료</SelectItem>
          </SelectContent>
        </Select>
        {pendingStatus === "납부완료" && (
          <Input
            type="date"
            value={paidAt}
            onChange={(e) => setPaidAt(e.target.value)}
            className="h-7 text-xs"
          />
        )}
        <div className="flex gap-1">
          <Button
            size="sm"
            className="h-6 text-xs flex-1"
            onClick={() => { onUpdate(fine.id, pendingStatus, pendingStatus === "납부완료" ? paidAt : undefined); setEditing(false); }}
          >
            저장
          </Button>
          <Button size="sm" variant="outline" className="h-6 text-xs" onClick={() => setEditing(false)}>취소</Button>
        </div>
      </div>
    );
  }

  return (
    <button
      className="cursor-pointer hover:opacity-80 transition-opacity"
      onClick={() => { setPendingStatus(fine.paymentStatus || "미납"); setEditing(true); }}
      title="클릭하여 납부상태 변경"
      data-testid={`badge-status-${fine.id}`}
    >
      <Badge variant={fine.paymentStatus === "납부완료" ? "default" : "destructive"} className="text-xs">
        {fine.paymentStatus || "미납"} ✎
      </Badge>
    </button>
  );
}

// 이미지 전체화면 뷰어
function ImageViewer({ src, pdfUrl, onClose }: { src: string; pdfUrl?: string | null; onClose: () => void }) {
  return createPortal(
    <div
      className="fixed inset-0 z-[9999] bg-black/80 flex items-center justify-center p-4"
      onClick={onClose}
    >
      <div className="relative max-w-4xl max-h-full" onClick={(e) => e.stopPropagation()}>
        <button
          className="absolute -top-10 right-0 text-white hover:text-gray-300 flex items-center gap-2"
          onClick={onClose}
        >
          <X className="h-6 w-6" />
        </button>
        <img src={src} alt="과태료 고지서" className="max-h-[85vh] max-w-full object-contain rounded-lg shadow-2xl" />
        {pdfUrl && (
          <a
            href={pdfUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="absolute bottom-3 right-3 bg-white/90 text-black px-3 py-1.5 rounded-md text-xs flex items-center gap-1.5 hover:bg-white transition-colors"
          >
            <FileText className="h-3.5 w-3.5" />
            PDF 원본 열기
          </a>
        )}
      </div>
    </div>,
    document.body
  );
}

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
  const [viewerSrc, setViewerSrc] = useState<{ src: string; pdfUrl?: string | null } | null>(null);

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

  const { data: vehicles = [] } = useQuery<Vehicle[]>({
    queryKey: ["/api/vehicles"],
  });

  const createMutation = useMutation({
    mutationFn: (data: Partial<TrafficFine>) => apiRequest("POST", "/api/traffic-fines", data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/traffic-fines"] });
      queryClient.invalidateQueries({ queryKey: ["/api/traffic-fines/stats"] });
      queryClient.invalidateQueries({ queryKey: ["/api/teams"] });
      toast({ title: "등록 완료" });
      setDialogOpen(false);
    },
    onError: (e: any) => toast({ title: "등록 실패", description: e?.message || "저장에 실패했습니다", variant: "destructive" }),
  });

  const updateMutation = useMutation({
    mutationFn: ({ id, data }: { id: number; data: Partial<TrafficFine> }) =>
      apiRequest("PUT", `/api/traffic-fines/${id}`, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/traffic-fines"] });
      queryClient.invalidateQueries({ queryKey: ["/api/traffic-fines/stats"] });
      queryClient.invalidateQueries({ queryKey: ["/api/teams"] });
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
      queryClient.invalidateQueries({ queryKey: ["/api/teams"] });
      toast({ title: "삭제 완료" });
    },
    onError: (e: any) => toast({ title: e?.message || "삭제 실패", variant: "destructive" }),
  });

  const paymentStatusMutation = useMutation({
    mutationFn: ({ id, paymentStatus, paidAt }: { id: number; paymentStatus: string; paidAt?: string }) =>
      apiRequest("PATCH", `/api/traffic-fines/${id}/payment-status`, { paymentStatus, paidAt }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/traffic-fines"] });
      queryClient.invalidateQueries({ queryKey: ["/api/traffic-fines/stats"] });
    },
    onError: () => toast({ title: "납부상태 변경 실패", variant: "destructive" }),
  });

  const isOwner = (fine: TrafficFine) =>
    !fine.createdBy || user?.role === "admin" || user?.username === fine.createdBy;

  const setField = (key: keyof TrafficFine, val: any) =>
    setForm((f) => ({ ...f, [key]: val }));

  // 차량 선택 시 차량번호·차종·소속 자동 입력
  const handleVehicleSelect = (vehicle: Vehicle) => {
    setForm((f) => ({
      ...f,
      licensePlate: vehicle.plateNumber,
      vehicleType: vehicle.vehicleType,
      department: vehicle.team,
    }));
  };

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

      // 서버 반환값에 vehicleType/department가 없으면 프론트 차량 DB에서 직접 조회
      const plate = data.licensePlate || "";
      const normalizedPlate = plate.replace(/\s/g, "");
      const matchedVehicle = normalizedPlate
        ? vehicles.find((v: Vehicle) => v.plateNumber.replace(/\s/g, "") === normalizedPlate)
        : null;

      setForm({
        ...emptyForm(),
        violationDate: data.violationDate || "",
        licensePlate: plate,
        vehicleType: data.vehicleType || matchedVehicle?.vehicleType || "",
        department: data.department || matchedVehicle?.team || "",
        driver: data.driver || "",
        violationType: data.violationType || "",
        violationLocation: data.violationLocation || "",
        amount: data.amount || undefined,
        paymentDestination: data.paymentDestination || "",
        requestDate: todayStr(),
        paymentStatus: "미납",
        pdfUrl: data.pdfUrl || "",
        thumbnailUrl: data.thumbnailUrl || "",
      });
      setEditingId(null);
      setDialogOpen(true);
      toast({ title: "AI 분석 완료", description: "추출된 정보를 확인 후 저장하세요" });
    } catch {
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
  }, [vehicles]);

  const handleSave = () => {
    if (editingId !== null) {
      updateMutation.mutate({ id: editingId, data: form });
    } else {
      createMutation.mutate(form);
    }
  };

  const handleInlineStatusUpdate = (id: number, status: string, paidAt?: string) => {
    paymentStatusMutation.mutate({ id, paymentStatus: status, paidAt });
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
      (f.driver || "").toLowerCase().includes(search) ||
      (f.department || "").toLowerCase().includes(search) ||
      (f.violationType || "").toLowerCase().includes(search) ||
      (f.violationLocation || "").toLowerCase().includes(search);
    return matchStatus && matchText;
  });

  const fmt = (n?: number | null) =>
    n != null ? n.toLocaleString("ko-KR") + "원" : "-";

  return (
    <div className="p-4 md:p-6 space-y-6">
      {/* 이미지 전체화면 뷰어 */}
      {viewerSrc && (
        <ImageViewer
          src={viewerSrc.src}
          pdfUrl={viewerSrc.pdfUrl}
          onClose={() => setViewerSrc(null)}
        />
      )}

      {/* 헤더 */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">과태료 현황</h1>
          <p className="text-sm text-muted-foreground mt-1">교통 과태료 PDF 업로드 시 자동 분석 · 등록</p>
        </div>
        <div className="flex items-center gap-2">
          <Button
            variant="outline"
            size="sm"
            className="text-xs h-8"
            onClick={() => window.open("/api/traffic-fines/excel", "_blank")}
            data-testid="button-excel-download"
          >
            <FileDown className="h-3.5 w-3.5 mr-1" /> 엑셀
          </Button>
          <Button onClick={openNew} data-testid="button-new-fine">
            <Plus className="h-4 w-4 mr-1" /> 직접 등록
          </Button>
        </div>
      </div>

      {/* 통계 카드 */}
      {(() => {
        const EXCLUDED = ["주정차 위반", "통행료 미납"];
        const speedCnt = stats?.byViolationType?.["속도위반"] ?? 0;
        const signalCnt = stats?.byViolationType?.["신호위반"] ?? 0;
        const laneCnt = stats?.byViolationType?.["법규위반"] ?? 0;
        const excludedCnt = EXCLUDED.reduce((s, t) => s + (stats?.byViolationType?.[t] ?? 0), 0);
        const filteredTotal = (stats?.total ?? 0) - excludedCnt;
        const cards = [
          {
            label: "총 건수",
            value: filteredTotal,
            icon: <ReceiptText className="h-6 w-6" />,
            color: "text-blue-600",
            bg: "bg-blue-50 dark:bg-blue-950/40",
            border: "border-blue-200 dark:border-blue-800",
            testId: "stat-total",
          },
          {
            label: "속도위반",
            value: speedCnt,
            icon: <Zap className="h-6 w-6" />,
            color: "text-red-600",
            bg: "bg-red-50 dark:bg-red-950/40",
            border: "border-red-200 dark:border-red-800",
            testId: "stat-speed",
          },
          {
            label: "신호위반",
            value: signalCnt,
            icon: <AlertTriangle className="h-6 w-6" />,
            color: "text-amber-600",
            bg: "bg-amber-50 dark:bg-amber-950/40",
            border: "border-amber-200 dark:border-amber-800",
            testId: "stat-signal",
          },
          {
            label: "법규위반",
            value: laneCnt,
            icon: <AlertCircle className="h-6 w-6" />,
            color: "text-orange-600",
            bg: "bg-orange-50 dark:bg-orange-950/40",
            border: "border-orange-200 dark:border-orange-800",
            testId: "stat-other",
          },
        ];
        return (
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            {cards.map((c) => (
              <Card key={c.label} className={`border ${c.border} ${c.bg} shadow-sm`}>
                <CardContent className="p-0">
                  <div className={`flex items-center justify-center gap-2 py-3 px-4 ${c.color}`}>
                    {c.icon}
                    <span className="text-sm font-semibold tracking-wide">{c.label}</span>
                  </div>
                  <div className={`border-t ${c.border}`} />
                  <div className="flex items-center justify-center py-5">
                    <p className={`text-4xl font-extrabold ${c.color}`} data-testid={c.testId}>
                      {c.value}
                    </p>
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        );
      })()}

      {/* PDF 업로드 */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base flex items-center gap-2">
            <FileText className="h-4 w-4" /> PDF 자동 분석
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div
            className={`border-2 border-dashed rounded-lg p-8 text-center transition-colors cursor-pointer ${
              dragging ? "border-primary bg-primary/5" : "border-muted-foreground/30 hover:border-primary/50"
            }`}
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
                <p className="text-xs text-muted-foreground">차량 DB 조회 및 과태료 정보 추출 중입니다</p>
              </div>
            ) : (
              <div className="flex flex-col items-center gap-2">
                <Upload className="h-8 w-8 text-muted-foreground" />
                <p className="text-sm font-medium">과태료 고지서 PDF를 드래그하거나 클릭하여 업로드</p>
                <p className="text-xs text-muted-foreground">AI가 자동 분석 → 차량번호로 차종·소속 자동입력</p>
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
                placeholder="차량번호, 운전자, 위반내역 검색..."
                value={filterText}
                onChange={(e) => setFilterText(e.target.value)}
                className="w-52"
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
                    <th className="text-left py-2 px-2 font-medium">고지서</th>
                    <th className="text-left py-2 px-2 font-medium">위반일시</th>
                    <th className="text-left py-2 px-2 font-medium">차량번호</th>
                    <th className="text-left py-2 px-2 font-medium hidden md:table-cell">차종</th>
                    <th className="text-left py-2 px-2 font-medium hidden md:table-cell">소속</th>
                    <th className="text-left py-2 px-2 font-medium">운전자</th>
                    <th className="text-left py-2 px-2 font-medium hidden lg:table-cell">위반내역</th>
                    <th className="text-left py-2 px-2 font-medium hidden lg:table-cell">적발장소</th>
                    <th className="text-right py-2 px-2 font-medium">과태료</th>
                    <th className="text-left py-2 px-2 font-medium hidden lg:table-cell">수납처</th>
                    <th className="text-left py-2 px-2 font-medium hidden md:table-cell">납부요청일</th>
                    <th className="text-center py-2 px-2 font-medium">납부상태</th>
                    <th className="py-2 px-2"></th>
                  </tr>
                </thead>
                <tbody>
                  {filtered.map((fine) => (
                    <tr key={fine.id} className="border-b hover:bg-muted/30 transition-colors" data-testid={`row-fine-${fine.id}`}>
                      {/* PDF 썸네일 */}
                      <td className="py-1.5 px-2">
                        {(fine as any).thumbnailUrl ? (
                          <button
                            className="group relative"
                            onClick={() => setViewerSrc({ src: (fine as any).thumbnailUrl, pdfUrl: fine.pdfUrl })}
                            title="클릭하여 고지서 크게 보기"
                            data-testid={`thumb-fine-${fine.id}`}
                          >
                            <img
                              src={(fine as any).thumbnailUrl}
                              alt="고지서"
                              className="h-10 w-8 object-cover rounded border shadow-sm group-hover:scale-105 transition-transform"
                            />
                            <div className="absolute inset-0 flex items-center justify-center opacity-0 group-hover:opacity-100 bg-black/30 rounded transition-opacity">
                              <ZoomIn className="h-3 w-3 text-white" />
                            </div>
                          </button>
                        ) : (
                          <div className="h-10 w-8 bg-muted rounded border flex items-center justify-center">
                            <FileText className="h-3.5 w-3.5 text-muted-foreground" />
                          </div>
                        )}
                      </td>
                      <td className="py-2 px-2 whitespace-nowrap text-xs">{fine.violationDate || "-"}</td>
                      <td className="py-2 px-2 font-mono font-semibold whitespace-nowrap text-xs">{fine.licensePlate || "-"}</td>
                      <td className="py-2 px-2 hidden md:table-cell text-muted-foreground text-xs">{fine.vehicleType || "-"}</td>
                      <td className="py-2 px-2 hidden md:table-cell text-muted-foreground text-xs">{fine.department || "-"}</td>
                      <td className="py-2 px-2 whitespace-nowrap text-xs">{fine.driver || "-"}</td>
                      <td className="py-2 px-2 hidden lg:table-cell text-xs">{fine.violationType || "-"}</td>
                      <td className="py-2 px-2 hidden lg:table-cell text-muted-foreground text-xs max-w-[120px] truncate">{fine.violationLocation || "-"}</td>
                      <td className="py-2 px-2 text-right font-medium whitespace-nowrap text-xs">{fmt(fine.amount)}</td>
                      <td className="py-2 px-2 hidden lg:table-cell text-muted-foreground text-xs">{fine.paymentDestination || "-"}</td>
                      <td className="py-2 px-2 hidden md:table-cell whitespace-nowrap text-muted-foreground text-xs">{fine.requestDate || "-"}</td>
                      <td className="py-2 px-2 text-center relative">
                        <Badge
                          variant={fine.paymentStatus === "납부완료" ? "default" : "destructive"}
                          className="text-xs"
                          data-testid={`badge-status-${fine.id}`}
                        >
                          {fine.paymentStatus || "미납"}
                        </Badge>
                      </td>
                      <td className="py-2 px-2">
                        {isOwner(fine) && (
                          <div className="flex gap-1 justify-end">
                            <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => openEdit(fine)} data-testid={`button-edit-fine-${fine.id}`}>
                              <Pencil className="h-3.5 w-3.5" />
                            </Button>
                            <Button
                              variant="ghost" size="icon" className="h-7 w-7 text-destructive hover:text-destructive"
                              onClick={() => { if (confirm("삭제하시겠습니까?")) deleteMutation.mutate(fine.id); }}
                              data-testid={`button-delete-fine-${fine.id}`}
                            >
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
            <DialogDescription className="sr-only">과태료 정보를 입력하세요</DialogDescription>
          </DialogHeader>

          {/* PDF 썸네일 미리보기 */}
          {form.thumbnailUrl && (
            <div className="flex justify-center mb-2">
              <button
                type="button"
                className="group relative"
                onClick={() => setViewerSrc({ src: form.thumbnailUrl!, pdfUrl: form.pdfUrl })}
                title="클릭하여 크게 보기"
              >
                <img
                  src={form.thumbnailUrl}
                  alt="과태료 고지서"
                  className="max-h-48 max-w-full object-contain rounded-lg border shadow-md group-hover:opacity-90 transition-opacity"
                />
                <div className="absolute inset-0 flex items-center justify-center opacity-0 group-hover:opacity-100 bg-black/20 rounded-lg transition-opacity">
                  <ZoomIn className="h-8 w-8 text-white" />
                </div>
                <p className="text-xs text-muted-foreground text-center mt-1">클릭하여 크게 보기</p>
              </button>
            </div>
          )}

          <div className="grid grid-cols-2 gap-4">

            {/* 1. 납부요청일 */}
            <div className="space-y-1">
              <Label>
                납부요청일
                <span className="ml-1 text-xs text-muted-foreground font-normal">오늘 자동입력</span>
              </Label>
              <Input
                value={form.requestDate || ""}
                onChange={(e) => setField("requestDate", e.target.value)}
                placeholder="YYYY-MM-DD"
                data-testid="input-request-date"
              />
            </div>

            {/* 2. 위반일시 */}
            <div className="space-y-1">
              <Label>위반일시</Label>
              <Input
                value={form.violationDate || ""}
                onChange={(e) => setField("violationDate", e.target.value)}
                placeholder="예: 2026-03-04 14:30"
                data-testid="input-violation-date"
              />
            </div>

            {/* 3. 차량번호 */}
            <div className="space-y-1">
              <Label>
                차량번호
                <span className="ml-1 text-xs text-blue-500 font-normal">차량현황 DB 연동</span>
              </Label>
              <PlateAutocomplete
                value={form.licensePlate || ""}
                onChange={(v) => setField("licensePlate", v)}
                onVehicleSelect={handleVehicleSelect}
                vehicles={vehicles}
              />
            </div>

            {/* 4. 차종 */}
            <div className="space-y-1">
              <Label>
                차종
                <span className="ml-1 text-xs text-muted-foreground font-normal">자동입력</span>
              </Label>
              <Input
                value={form.vehicleType || ""}
                onChange={(e) => setField("vehicleType", e.target.value)}
                placeholder="차량번호 선택 시 자동입력"
                data-testid="input-vehicle-type"
              />
            </div>

            {/* 5. 소속 */}
            <div className="space-y-1">
              <Label>
                소속
                <span className="ml-1 text-xs text-muted-foreground font-normal">자동입력</span>
              </Label>
              <Input
                value={form.department || ""}
                onChange={(e) => setField("department", e.target.value)}
                placeholder="차량번호 선택 시 자동입력"
                data-testid="input-department"
              />
            </div>

            {/* 6. 운전자 */}
            <div className="space-y-1">
              <Label>운전자</Label>
              <Input
                value={form.driver || ""}
                onChange={(e) => setField("driver", e.target.value)}
                placeholder="운전자 이름"
                data-testid="input-driver"
              />
            </div>

            {/* 7. 위반내역 */}
            <div className="col-span-2 space-y-1">
              <Label>위반내역</Label>
              <Input
                value={form.violationType || ""}
                onChange={(e) => setField("violationType", e.target.value)}
                placeholder="예: 신호위반, 과속, 불법주정차"
                data-testid="input-violation-type"
              />
            </div>

            {/* 8. 적발장소 */}
            <div className="col-span-2 space-y-1">
              <Label>적발장소</Label>
              <Input
                value={form.violationLocation || ""}
                onChange={(e) => setField("violationLocation", e.target.value)}
                placeholder="적발 장소를 입력하세요"
                data-testid="input-violation-location"
              />
            </div>

            {/* 9. 과태료 금액 */}
            <div className="space-y-1">
              <Label>과태료 금액 (원)</Label>
              <Input
                type="number"
                value={form.amount ?? ""}
                onChange={(e) => setField("amount", e.target.value ? Number(e.target.value) : undefined)}
                placeholder="예: 70000"
                data-testid="input-amount"
              />
            </div>

            {/* 10. 수납처 */}
            <div className="space-y-1">
              <Label>
                수납처
                <span className="ml-1 text-xs text-muted-foreground font-normal">PDF 자동입력</span>
              </Label>
              <Input
                value={form.paymentDestination || ""}
                onChange={(e) => setField("paymentDestination", e.target.value)}
                placeholder="예: 대구지방경찰청"
                data-testid="input-payment-destination"
              />
            </div>

            {/* 11. 납부상태 */}
            <div className="space-y-1">
              <Label>납부상태</Label>
              <Select value={form.paymentStatus || "미납"} onValueChange={(v) => setField("paymentStatus", v)}>
                <SelectTrigger data-testid="select-payment-status">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="미납">미납</SelectItem>
                  <SelectItem value="납부완료">납부완료</SelectItem>
                </SelectContent>
              </Select>
            </div>

            {/* 12. 납부일자 (납부완료 선택 시 표시) */}
            {form.paymentStatus === "납부완료" ? (
              <div className="space-y-1">
                <Label>납부일자</Label>
                <Input
                  type="date"
                  value={form.paidAt || ""}
                  onChange={(e) => setField("paidAt", e.target.value)}
                  data-testid="input-paid-at"
                />
              </div>
            ) : (
              <div />
            )}

          </div>

          <DialogFooter className="mt-4">
            <Button variant="outline" onClick={() => setDialogOpen(false)}>취소</Button>
            <Button
              onClick={handleSave}
              disabled={createMutation.isPending || updateMutation.isPending}
              data-testid="button-save-fine"
            >
              {(createMutation.isPending || updateMutation.isPending) && (
                <Loader2 className="h-4 w-4 mr-1 animate-spin" />
              )}
              저장
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
