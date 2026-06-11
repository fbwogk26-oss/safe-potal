import { useState, useEffect, useRef } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { apiRequest } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { usePermissions } from "@/hooks/use-permissions";
import { useAuth } from "@/hooks/use-auth";
import { useHeadquarters } from "@/contexts/HeadquartersContext";
import { Link } from "wouter";
import { motion, AnimatePresence } from "framer-motion";
import { PackagePlus, ChevronLeft, Trash2, Send, ImagePlus, Link2, X, ExternalLink, Clock, CheckCircle2, XCircle, AlertCircle, ChevronDown, ChevronUp, Truck, Package, PackageCheck, ShoppingCart, Lock } from "lucide-react";
import { format } from "date-fns";

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Skeleton } from "@/components/ui/skeleton";

import type { NewEquipmentRequest } from "@shared/schema";

const STATUS_CONFIG: Record<string, { label: string; icon: any; className: string }> = {
  "대기": { label: "대기", icon: Clock, className: "bg-gray-100 text-gray-700 dark:bg-gray-800 dark:text-gray-300 border-gray-200" },
  "검토중": { label: "검토중", icon: AlertCircle, className: "bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400 border-blue-200" },
  "승인": { label: "승인", icon: CheckCircle2, className: "bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400 border-green-200" },
  "반려": { label: "반려", icon: XCircle, className: "bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400 border-red-200" },
};

const DELIVERY_STATUS_CONFIG: Record<string, { label: string; icon: any; className: string }> = {
  "주문예정": { label: "주문예정", icon: ShoppingCart, className: "bg-gray-100 text-gray-600 dark:bg-gray-800 dark:text-gray-400 border-gray-200" },
  "주문완료": { label: "주문완료", icon: Package, className: "bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400 border-blue-200" },
  "배송중": { label: "배송중", icon: Truck, className: "bg-orange-100 text-orange-700 dark:bg-orange-900/30 dark:text-orange-400 border-orange-200" },
  "배송완료": { label: "배송완료", icon: PackageCheck, className: "bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400 border-green-200" },
};

const URGENCY_CONFIG: Record<string, { className: string }> = {
  "보통": { className: "bg-gray-100 text-gray-600 border-gray-200" },
  "긴급": { className: "bg-orange-100 text-orange-700 border-orange-200" },
  "매우긴급": { className: "bg-red-100 text-red-700 border-red-200" },
};

function StatusBadge({ status }: { status: string }) {
  const cfg = STATUS_CONFIG[status] || STATUS_CONFIG["대기"];
  const Icon = cfg.icon;
  return (
    <span className={`inline-flex items-center gap-1 text-xs font-semibold px-2 py-0.5 rounded-full border ${cfg.className}`}>
      <Icon className="w-3 h-3" />{cfg.label}
    </span>
  );
}

function DeliveryStatusBadge({ status }: { status: string | null }) {
  const s = status || "주문예정";
  const cfg = DELIVERY_STATUS_CONFIG[s] || DELIVERY_STATUS_CONFIG["주문예정"];
  const Icon = cfg.icon;
  return (
    <span className={`inline-flex items-center gap-1 text-xs font-semibold px-2 py-0.5 rounded-full border ${cfg.className}`}>
      <Icon className="w-3 h-3" />{cfg.label}
    </span>
  );
}

export default function NewEquipmentRequestPage() {
  const { headquarters } = useHeadquarters();
  const { user } = useAuth();
  const { canManageEquipmentRequests } = usePermissions();
  const queryClient = useQueryClient();
  const { toast } = useToast();
  const fileInputRef = useRef<HTMLInputElement>(null);

  const [itemName, setItemName] = useState("");
  const [category, setCategory] = useState("보호구");
  const [reason, setReason] = useState("");
  const [quantity, setQuantity] = useState(1);
  const [urgency, setUrgency] = useState("보통");
  const [department, setDepartment] = useState("");
  const [requestedBy, setRequestedBy] = useState("");
  const [imageUrl, setImageUrl] = useState("");
  const [referenceUrl, setReferenceUrl] = useState("");
  const [isUploading, setIsUploading] = useState(false);
  const [previewImage, setPreviewImage] = useState<string | null>(null);

  const [adminDialogOpen, setAdminDialogOpen] = useState(false);
  const [adminTarget, setAdminTarget] = useState<NewEquipmentRequest | null>(null);
  const [adminStatus, setAdminStatus] = useState("대기");
  const [adminDeliveryStatus, setAdminDeliveryStatus] = useState("주문예정");
  const [adminNote, setAdminNote] = useState("");
  const [expandedId, setExpandedId] = useState<number | null>(null);

  useEffect(() => {
    if (user) {
      setRequestedBy(user.name || user.username || "");
      setDepartment(user.department || "");
    }
  }, [user]);

  const { data: requests, isLoading } = useQuery<NewEquipmentRequest[]>({
    queryKey: ["/api/new-equipment-requests", headquarters],
    queryFn: () => fetch(`/api/new-equipment-requests?headquarters=${encodeURIComponent(headquarters)}`, { credentials: "include" }).then(r => r.json()),
  });

  const markReadMutation = useMutation({
    mutationFn: () => apiRequest("POST", "/api/new-equipment-requests/mark-all-read", {}),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/new-equipment-requests/unread-count"] });
    },
  });

  useEffect(() => {
    if (canManageEquipmentRequests) {
      markReadMutation.mutate();
    }
  }, [canManageEquipmentRequests]);

  const createMutation = useMutation({
    mutationFn: async (body: {
      itemName: string; category: string; reason: string;
      quantity: number; urgency: string; department: string;
      requestedBy: string; imageUrl?: string; referenceUrl?: string;
    }) => apiRequest("POST", "/api/new-equipment-requests", { ...body, headquarters }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/new-equipment-requests"] });
      toast({ title: "요청 등록 완료", description: "신규 상품 요청이 등록되었습니다." });
      setItemName(""); setReason(""); setQuantity(1); setUrgency("보통");
      setCategory("보호구"); setImageUrl(""); setReferenceUrl(""); setPreviewImage(null);
    },
  });

  const updateMutation = useMutation({
    mutationFn: async ({ id, ...body }: { id: number; status: string; deliveryStatus: string; adminNote: string }) =>
      apiRequest("PUT", `/api/new-equipment-requests/${id}`, { ...body, isReadByAdmin: true }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/new-equipment-requests"] });
      toast({ title: "상태 변경 완료" });
      setAdminDialogOpen(false); setAdminTarget(null);
    },
    onError: (err: any) => {
      toast({ variant: "destructive", title: "수정 실패", description: err?.message || "배송완료 항목은 수정할 수 없습니다." });
    },
  });

  const deleteMutation = useMutation({
    mutationFn: async (id: number) => apiRequest("DELETE", `/api/new-equipment-requests/${id}`),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/new-equipment-requests"] });
      toast({ title: "삭제 완료" });
    },
    onError: (err: any) => {
      toast({ variant: "destructive", title: "삭제 실패", description: err?.message || "배송완료 항목은 삭제할 수 없습니다." });
    },
  });

  const handleImageUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setIsUploading(true);
    try {
      const urlRes = await fetch('/api/uploads/request-url', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: file.name, size: file.size, contentType: file.type }),
      });
      const { uploadURL, objectPath } = await urlRes.json();
      await fetch(uploadURL, { method: 'PUT', body: file, headers: { 'Content-Type': file.type } });
      setImageUrl(objectPath);
      setPreviewImage(URL.createObjectURL(file));
      toast({ title: "이미지 업로드 완료" });
    } catch {
      toast({ variant: "destructive", title: "업로드 실패" });
    } finally {
      setIsUploading(false);
      if (fileInputRef.current) fileInputRef.current.value = "";
    }
  };

  const handleSubmit = () => {
    if (!itemName.trim() || !reason.trim()) {
      toast({ variant: "destructive", title: "상품명과 요청사유를 입력해주세요." }); return;
    }
    createMutation.mutate({
      itemName: itemName.trim(), category, reason: reason.trim(),
      quantity, urgency, department, requestedBy,
      imageUrl: imageUrl || undefined,
      referenceUrl: referenceUrl.trim() || undefined,
    });
  };

  const openAdminDialog = (req: NewEquipmentRequest) => {
    setAdminTarget(req);
    setAdminStatus(req.status);
    setAdminDeliveryStatus(req.deliveryStatus || "주문예정");
    setAdminNote(req.adminNote || "");
    setAdminDialogOpen(true);
  };

  const handleDelete = (id: number) => {
    if (confirm("이 요청을 삭제하시겠습니까?")) deleteMutation.mutate(id);
  };

  const getImageSrc = (url: string) => {
    if (!url) return null;
    if (url.startsWith('http')) return url;
    return `/api/objects/${url}`;
  };

  return (
    <div className="max-w-4xl mx-auto space-y-6">
      {/* Header */}
      <div className="flex items-center gap-3">
        <Link href="/equipment">
          <Button variant="ghost" size="icon" className="shrink-0" data-testid="button-back-equipment">
            <ChevronLeft className="w-5 h-5" />
          </Button>
        </Link>
        <div className="flex items-center gap-3">
          <div className="bg-gradient-to-br from-teal-100 to-cyan-100 dark:from-teal-900/40 dark:to-cyan-900/40 p-2.5 rounded-xl shadow-sm">
            <PackagePlus className="w-7 h-7 text-teal-600 dark:text-teal-400" />
          </div>
          <div>
            <h2 className="text-2xl font-display font-bold text-foreground">신규 상품 요청</h2>
            <p className="text-sm text-muted-foreground">현재 목록에 없는 안전용품을 요청합니다.</p>
          </div>
        </div>
      </div>

      {/* Request Form */}
      <Card className="border-teal-200/60 dark:border-teal-900/40 shadow-sm overflow-hidden">
        <CardHeader className="bg-gradient-to-r from-teal-50 to-cyan-50 dark:from-teal-900/20 dark:to-cyan-900/20 border-b pb-4">
          <CardTitle className="text-base flex items-center gap-2 text-teal-700 dark:text-teal-400">
            <Send className="w-4 h-4" />
            요청서 작성
          </CardTitle>
        </CardHeader>
        <CardContent className="p-5 space-y-5">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div className="space-y-1.5">
              <Label className="text-sm font-semibold">상품명 <span className="text-destructive">*</span></Label>
              <Input
                placeholder="요청할 상품명을 입력하세요"
                value={itemName}
                onChange={(e) => setItemName(e.target.value)}
                data-testid="input-item-name"
                className="h-10"
              />
            </div>
            <div className="space-y-1.5">
              <Label className="text-sm font-semibold">분류</Label>
              <Select value={category} onValueChange={setCategory}>
                <SelectTrigger data-testid="select-category" className="h-10">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="보호구">보호구</SelectItem>
                  <SelectItem value="안전용품">안전용품</SelectItem>
                  <SelectItem value="기타품목">기타품목</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>

          <div className="grid grid-cols-2 sm:grid-cols-3 gap-4">
            <div className="space-y-1.5">
              <Label className="text-sm font-semibold">수량</Label>
              <Input
                type="number" min={1} value={quantity}
                onChange={(e) => setQuantity(Math.max(1, parseInt(e.target.value) || 1))}
                data-testid="input-quantity" className="h-10"
              />
            </div>
            <div className="space-y-1.5">
              <Label className="text-sm font-semibold">긴급도</Label>
              <Select value={urgency} onValueChange={setUrgency}>
                <SelectTrigger data-testid="select-urgency" className="h-10">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="보통">보통</SelectItem>
                  <SelectItem value="긴급">긴급</SelectItem>
                  <SelectItem value="매우긴급">매우긴급</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5 col-span-2 sm:col-span-1">
              <Label className="text-sm font-semibold">부서</Label>
              <Input value={department} onChange={(e) => setDepartment(e.target.value)} data-testid="input-department" className="h-10" />
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div className="space-y-1.5">
              <Label className="text-sm font-semibold">요청자</Label>
              <Input value={requestedBy} onChange={(e) => setRequestedBy(e.target.value)} data-testid="input-requested-by" className="h-10" />
            </div>
            <div className="space-y-1.5">
              <Label className="text-sm font-semibold flex items-center gap-1.5">
                <Link2 className="w-3.5 h-3.5 text-teal-600" />
                참고 URL (사이트/제품 링크)
              </Label>
              <Input
                placeholder="https://..."
                value={referenceUrl}
                onChange={(e) => setReferenceUrl(e.target.value)}
                data-testid="input-reference-url"
                className="h-10"
              />
            </div>
          </div>

          <div className="space-y-1.5">
            <Label className="text-sm font-semibold">요청사유 <span className="text-destructive">*</span></Label>
            <Textarea
              placeholder="요청 사유를 상세히 입력해주세요. (예: 기존 제품 단종으로 대체품 필요)"
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              rows={3}
              data-testid="input-reason"
            />
          </div>

          {/* Image Upload */}
          <div className="space-y-2">
            <Label className="text-sm font-semibold flex items-center gap-1.5">
              <ImagePlus className="w-3.5 h-3.5 text-teal-600" />
              사진 첨부 <span className="text-xs font-normal text-muted-foreground">(제품 사진, 카탈로그 등)</span>
            </Label>
            <input ref={fileInputRef} type="file" accept="image/*" className="hidden" onChange={handleImageUpload} />
            {previewImage || imageUrl ? (
              <div className="relative inline-block">
                <img
                  src={previewImage || getImageSrc(imageUrl) || ""}
                  alt="첨부 이미지"
                  className="h-32 w-auto rounded-lg border object-cover shadow-sm"
                />
                <Button
                  type="button" variant="destructive" size="icon"
                  className="absolute -top-2 -right-2 h-6 w-6"
                  onClick={() => { setImageUrl(""); setPreviewImage(null); }}
                >
                  <X className="w-3 h-3" />
                </Button>
              </div>
            ) : (
              <Button
                type="button" variant="outline"
                onClick={() => fileInputRef.current?.click()}
                disabled={isUploading}
                className="gap-2 border-dashed h-20 w-full flex-col text-muted-foreground hover:text-foreground hover:border-teal-400"
                data-testid="button-upload-image"
              >
                <ImagePlus className="w-6 h-6" />
                <span className="text-xs">{isUploading ? "업로드 중..." : "사진 선택"}</span>
              </Button>
            )}
          </div>

          <div className="flex justify-end pt-1">
            <Button
              onClick={handleSubmit}
              disabled={createMutation.isPending}
              className="gap-2 bg-teal-600 hover:bg-teal-700 text-white px-6"
              data-testid="button-submit-request"
            >
              <Send className="w-4 h-4" />
              {createMutation.isPending ? "등록 중..." : "요청 등록"}
            </Button>
          </div>
        </CardContent>
      </Card>

      {/* Request List */}
      <div className="space-y-3">
        <div className="flex items-center justify-between">
          <h3 className="text-lg font-bold flex items-center gap-2">
            요청 목록
            {requests && requests.length > 0 && (
              <Badge variant="secondary" className="text-xs">{requests.length}건</Badge>
            )}
          </h3>
        </div>

        {isLoading ? (
          <div className="space-y-3">
            {[1, 2, 3].map((i) => <Skeleton key={i} className="h-24 w-full rounded-xl" />)}
          </div>
        ) : !requests || requests.length === 0 ? (
          <Card>
            <CardContent className="p-12 text-center text-muted-foreground">
              <PackagePlus className="w-10 h-10 mx-auto mb-3 opacity-30" />
              <p>등록된 요청이 없습니다.</p>
            </CardContent>
          </Card>
        ) : (
          <AnimatePresence>
            {requests.map((req) => {
              const isExpanded = expandedId === req.id;
              const urgencyCfg = URGENCY_CONFIG[req.urgency] || URGENCY_CONFIG["보통"];
              const imgSrc = req.imageUrl ? getImageSrc(req.imageUrl) : null;
              const isDelivered = req.deliveryStatus === "배송완료";
              return (
                <motion.div
                  key={req.id}
                  initial={{ opacity: 0, y: 8 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, y: -8 }}
                >
                  <Card
                    className={`overflow-hidden border-border/60 hover:border-border hover:shadow-sm transition-all ${isDelivered ? "opacity-75" : ""}`}
                    data-testid={`card-request-${req.id}`}
                  >
                    <div
                      className="flex items-center gap-3 px-4 py-3 cursor-pointer"
                      onClick={() => setExpandedId(isExpanded ? null : req.id)}
                    >
                      {/* Status pills */}
                      <div className="flex flex-col gap-1 shrink-0">
                        <StatusBadge status={req.status} />
                        <DeliveryStatusBadge status={req.deliveryStatus} />
                      </div>

                      {/* Title & meta */}
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 flex-wrap">
                          <span className="font-bold text-sm truncate" data-testid={`text-item-name-${req.id}`}>{req.itemName}</span>
                          <Badge variant="outline" className="text-[10px] h-4 px-1.5">{req.category}</Badge>
                          <span className={`inline-flex items-center text-[10px] font-semibold px-1.5 py-0.5 rounded-full border ${urgencyCfg.className}`}>
                            {req.urgency}
                          </span>
                          {isDelivered && <Lock className="w-3 h-3 text-muted-foreground" />}
                        </div>
                        <p className="text-xs text-muted-foreground mt-0.5 truncate">
                          {req.requestedBy} · {req.department} · {req.createdAt ? format(new Date(req.createdAt), "yyyy-MM-dd") : ""}
                        </p>
                      </div>

                      {/* Actions */}
                      <div className="flex items-center gap-1 shrink-0">
                        {canManageEquipmentRequests && !isDelivered && (
                          <Button
                            variant="outline" size="sm"
                            onClick={(e) => { e.stopPropagation(); openAdminDialog(req); }}
                            className="h-7 text-xs"
                            data-testid={`button-admin-edit-${req.id}`}
                          >
                            상태변경
                          </Button>
                        )}
                        {isDelivered && canManageEquipmentRequests && (
                          <span className="text-xs text-muted-foreground flex items-center gap-1 px-2">
                            <Lock className="w-3 h-3" />수정불가
                          </span>
                        )}
                        {(user?.role === "admin" || user?.username === req.requestedBy) && !isDelivered && (
                          <Button
                            variant="ghost" size="icon"
                            className="h-7 w-7"
                            onClick={(e) => { e.stopPropagation(); handleDelete(req.id); }}
                            data-testid={`button-delete-${req.id}`}
                          >
                            <Trash2 className="w-3.5 h-3.5 text-destructive" />
                          </Button>
                        )}
                        {isExpanded ? <ChevronUp className="w-4 h-4 text-muted-foreground ml-1" /> : <ChevronDown className="w-4 h-4 text-muted-foreground ml-1" />}
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
                          <div className="px-4 pb-4 pt-2 border-t bg-muted/20 space-y-3">
                            <div>
                              <p className="text-xs font-semibold text-muted-foreground mb-1">요청사유</p>
                              <p className="text-sm" data-testid={`text-reason-${req.id}`}>{req.reason}</p>
                            </div>
                            <div className="flex flex-wrap gap-x-6 gap-y-1 text-xs text-muted-foreground">
                              <span>수량: <strong>{req.quantity}</strong></span>
                              {req.department && <span>부서: <strong>{req.department}</strong></span>}
                              {req.requestedBy && <span>요청자: <strong>{req.requestedBy}</strong></span>}
                            </div>
                            {req.referenceUrl && (
                              <a
                                href={req.referenceUrl}
                                target="_blank"
                                rel="noopener noreferrer"
                                className="inline-flex items-center gap-1.5 text-xs text-blue-600 hover:underline"
                                onClick={(e) => e.stopPropagation()}
                              >
                                <ExternalLink className="w-3.5 h-3.5" />
                                참고 링크 보기
                              </a>
                            )}
                            {imgSrc && (
                              <div>
                                <p className="text-xs font-semibold text-muted-foreground mb-1.5">첨부 이미지</p>
                                <img
                                  src={imgSrc}
                                  alt="첨부 이미지"
                                  className="h-40 w-auto rounded-lg border object-cover shadow-sm cursor-pointer"
                                  onClick={(e) => { e.stopPropagation(); window.open(imgSrc, "_blank"); }}
                                />
                              </div>
                            )}
                            {req.adminNote && (
                              <div className="p-3 bg-blue-50 dark:bg-blue-950/30 rounded-lg border border-blue-100 dark:border-blue-900/40">
                                <p className="text-xs font-semibold text-blue-700 dark:text-blue-400 mb-0.5">관리자 메모</p>
                                <p className="text-sm text-blue-800 dark:text-blue-300">{req.adminNote}</p>
                              </div>
                            )}
                          </div>
                        </motion.div>
                      )}
                    </AnimatePresence>
                  </Card>
                </motion.div>
              );
            })}
          </AnimatePresence>
        )}
      </div>

      {/* Admin Dialog */}
      <Dialog open={adminDialogOpen} onOpenChange={setAdminDialogOpen}>
        <DialogContent className="sm:max-w-sm">
          <DialogHeader>
            <DialogTitle>요청 상태 변경</DialogTitle>
          </DialogHeader>
          {adminTarget && (
            <div className="space-y-4 pt-1">
              <div className="p-3 bg-muted/50 rounded-lg text-sm">
                <span className="font-semibold">{adminTarget.itemName}</span>
                <span className="text-muted-foreground ml-2">({adminTarget.category})</span>
              </div>
              <div className="space-y-1.5">
                <Label>검토 상태</Label>
                <Select value={adminStatus} onValueChange={setAdminStatus}>
                  <SelectTrigger data-testid="select-admin-status">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="대기">대기</SelectItem>
                    <SelectItem value="검토중">검토중</SelectItem>
                    <SelectItem value="승인">승인</SelectItem>
                    <SelectItem value="반려">반려</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1.5">
                <Label>배송 현황</Label>
                <Select value={adminDeliveryStatus} onValueChange={setAdminDeliveryStatus}>
                  <SelectTrigger data-testid="select-admin-delivery-status">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="주문예정">주문예정</SelectItem>
                    <SelectItem value="주문완료">주문완료</SelectItem>
                    <SelectItem value="배송중">배송중</SelectItem>
                    <SelectItem value="배송완료">배송완료</SelectItem>
                  </SelectContent>
                </Select>
                {adminDeliveryStatus === "배송완료" && (
                  <p className="text-xs text-orange-600 dark:text-orange-400 flex items-center gap-1 mt-1">
                    <Lock className="w-3 h-3" />
                    배송완료로 변경하면 이후 수정이 불가합니다.
                  </p>
                )}
              </div>
              <div className="space-y-1.5">
                <Label>관리자 메모</Label>
                <Textarea
                  value={adminNote}
                  onChange={(e) => setAdminNote(e.target.value)}
                  placeholder="처리 결과 또는 메모를 입력하세요"
                  rows={3}
                  data-testid="input-admin-note"
                />
              </div>
            </div>
          )}
          <DialogFooter>
            <Button variant="outline" onClick={() => setAdminDialogOpen(false)} data-testid="button-admin-cancel">취소</Button>
            <Button
              onClick={() => {
                if (adminTarget) updateMutation.mutate({
                  id: adminTarget.id,
                  status: adminStatus,
                  deliveryStatus: adminDeliveryStatus,
                  adminNote,
                });
              }}
              disabled={updateMutation.isPending}
              data-testid="button-admin-save"
              className="bg-teal-600 hover:bg-teal-700 text-white"
            >
              {updateMutation.isPending ? "저장 중..." : "저장"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
