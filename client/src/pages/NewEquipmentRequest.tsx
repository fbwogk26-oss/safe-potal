import { useState, useEffect } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { apiRequest } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { usePermissions } from "@/hooks/use-permissions";
import { useAuth } from "@/hooks/use-auth";
import { Link } from "wouter";
import { motion, AnimatePresence } from "framer-motion";
import { PackagePlus, ChevronLeft, Trash2, Send } from "lucide-react";
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

function getStatusBadgeClass(status: string) {
  switch (status) {
    case "대기": return "bg-gray-100 text-gray-700 dark:bg-gray-800 dark:text-gray-300";
    case "검토중": return "bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400";
    case "승인": return "bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400";
    case "반려": return "bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400";
    default: return "bg-gray-100 text-gray-700 dark:bg-gray-800 dark:text-gray-300";
  }
}

function getUrgencyBadgeClass(urgency: string) {
  switch (urgency) {
    case "매우긴급": return "bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400";
    case "긴급": return "bg-orange-100 text-orange-700 dark:bg-orange-900/30 dark:text-orange-400";
    default: return "bg-gray-100 text-gray-600 dark:bg-gray-800 dark:text-gray-400";
  }
}

export default function NewEquipmentRequestPage() {
  const { user } = useAuth();
  const { canManageEquipmentRequests } = usePermissions();
  const queryClient = useQueryClient();
  const { toast } = useToast();

  const [itemName, setItemName] = useState("");
  const [category, setCategory] = useState("보호구");
  const [reason, setReason] = useState("");
  const [quantity, setQuantity] = useState(1);
  const [urgency, setUrgency] = useState("보통");
  const [department, setDepartment] = useState("");
  const [requestedBy, setRequestedBy] = useState("");

  const [adminDialogOpen, setAdminDialogOpen] = useState(false);
  const [adminTarget, setAdminTarget] = useState<NewEquipmentRequest | null>(null);
  const [adminStatus, setAdminStatus] = useState("대기");
  const [adminNote, setAdminNote] = useState("");

  useEffect(() => {
    if (user) {
      setRequestedBy(user.name || user.username || "");
      setDepartment(user.department || "");
    }
  }, [user]);

  const { data: requests, isLoading } = useQuery<NewEquipmentRequest[]>({
    queryKey: ["/api/new-equipment-requests"],
  });

  const createMutation = useMutation({
    mutationFn: async (body: {
      itemName: string;
      category: string;
      reason: string;
      quantity: number;
      urgency: string;
      department: string;
      requestedBy: string;
    }) => {
      return apiRequest("POST", "/api/new-equipment-requests", body);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/new-equipment-requests"] });
      toast({ title: "요청 등록 완료", description: "신규 상품 요청이 등록되었습니다." });
      setItemName("");
      setReason("");
      setQuantity(1);
      setUrgency("보통");
      setCategory("보호구");
    },
  });

  const updateMutation = useMutation({
    mutationFn: async ({ id, ...body }: { id: number; status: string; adminNote: string }) => {
      return apiRequest("PUT", `/api/new-equipment-requests/${id}`, body);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/new-equipment-requests"] });
      toast({ title: "상태 변경 완료" });
      setAdminDialogOpen(false);
      setAdminTarget(null);
    },
  });

  const deleteMutation = useMutation({
    mutationFn: async (id: number) => {
      return apiRequest("DELETE", `/api/new-equipment-requests/${id}`);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/new-equipment-requests"] });
      toast({ title: "삭제 완료" });
    },
  });

  const handleSubmit = () => {
    if (!itemName.trim() || !reason.trim()) {
      toast({ variant: "destructive", title: "상품명과 요청사유를 입력해주세요." });
      return;
    }
    createMutation.mutate({
      itemName: itemName.trim(),
      category,
      reason: reason.trim(),
      quantity,
      urgency,
      department,
      requestedBy,
    });
  };

  const handleDelete = (id: number) => {
    if (confirm("이 요청을 삭제하시겠습니까?")) {
      deleteMutation.mutate(id);
    }
  };

  const openAdminDialog = (req: NewEquipmentRequest) => {
    setAdminTarget(req);
    setAdminStatus(req.status);
    setAdminNote(req.adminNote || "");
    setAdminDialogOpen(true);
  };

  const handleAdminSave = () => {
    if (!adminTarget) return;
    updateMutation.mutate({
      id: adminTarget.id,
      status: adminStatus,
      adminNote,
    });
  };

  return (
    <div className="max-w-5xl mx-auto space-y-8">
      <div className="flex items-center gap-4">
        <Link href="/equipment">
          <Button variant="ghost" size="icon" className="shrink-0" data-testid="button-back-equipment">
            <ChevronLeft className="w-5 h-5" />
          </Button>
        </Link>
        <div>
          <h2 className="text-3xl font-display font-bold text-foreground flex items-center gap-3">
            <div className="bg-teal-100 p-2 rounded-xl text-teal-600 dark:bg-teal-900/30 dark:text-teal-400">
              <PackagePlus className="w-8 h-8" />
            </div>
            신규 상품 요청
          </h2>
          <p className="text-muted-foreground mt-2">현재 목록에 없는 안전용품을 요청합니다.</p>
        </div>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-lg flex items-center gap-2">
            <Send className="w-5 h-5 text-teal-600" />
            요청서 작성
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label htmlFor="itemName">상품명</Label>
              <Input
                id="itemName"
                placeholder="요청할 상품명을 입력하세요"
                value={itemName}
                onChange={(e) => setItemName(e.target.value)}
                data-testid="input-item-name"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="category">분류</Label>
              <Select value={category} onValueChange={setCategory}>
                <SelectTrigger data-testid="select-category">
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

          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <div className="space-y-2">
              <Label htmlFor="quantity">수량</Label>
              <Input
                id="quantity"
                type="number"
                min={1}
                value={quantity}
                onChange={(e) => setQuantity(Math.max(1, parseInt(e.target.value) || 1))}
                data-testid="input-quantity"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="urgency">긴급도</Label>
              <Select value={urgency} onValueChange={setUrgency}>
                <SelectTrigger data-testid="select-urgency">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="보통">보통</SelectItem>
                  <SelectItem value="긴급">긴급</SelectItem>
                  <SelectItem value="매우긴급">매우긴급</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label htmlFor="department">부서</Label>
              <Input
                id="department"
                value={department}
                onChange={(e) => setDepartment(e.target.value)}
                data-testid="input-department"
              />
            </div>
          </div>

          <div className="space-y-2">
            <Label htmlFor="requestedBy">요청자</Label>
            <Input
              id="requestedBy"
              value={requestedBy}
              onChange={(e) => setRequestedBy(e.target.value)}
              data-testid="input-requested-by"
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="reason">요청사유</Label>
            <Textarea
              id="reason"
              placeholder="요청 사유를 상세히 입력해주세요"
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              rows={3}
              data-testid="input-reason"
            />
          </div>

          <div className="flex justify-end">
            <Button
              onClick={handleSubmit}
              disabled={createMutation.isPending}
              className="gap-2"
              data-testid="button-submit-request"
            >
              <Send className="w-4 h-4" />
              {createMutation.isPending ? "등록 중..." : "요청 등록"}
            </Button>
          </div>
        </CardContent>
      </Card>

      <div className="space-y-4">
        <h3 className="text-xl font-bold">요청 목록</h3>

        {isLoading ? (
          <div className="space-y-4">
            {[1, 2, 3].map((i) => (
              <Skeleton key={i} className="h-40 w-full rounded-lg" />
            ))}
          </div>
        ) : !requests || requests.length === 0 ? (
          <Card>
            <CardContent className="p-8 text-center text-muted-foreground">
              등록된 요청이 없습니다.
            </CardContent>
          </Card>
        ) : (
          <AnimatePresence>
            {requests.map((req) => (
              <motion.div
                key={req.id}
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -10 }}
              >
                <Card className="relative" data-testid={`card-request-${req.id}`}>
                  <CardContent className="p-5">
                    <div className="flex flex-wrap items-start justify-between gap-3">
                      <div className="space-y-2 flex-1 min-w-0">
                        <div className="flex flex-wrap items-center gap-2">
                          <h4 className="font-bold text-lg" data-testid={`text-item-name-${req.id}`}>
                            {req.itemName}
                          </h4>
                          <Badge variant="outline">{req.category}</Badge>
                          <Badge className={`${getUrgencyBadgeClass(req.urgency)} no-default-hover-elevate no-default-active-elevate`}>
                            {req.urgency}
                          </Badge>
                          <Badge className={`${getStatusBadgeClass(req.status)} no-default-hover-elevate no-default-active-elevate`} data-testid={`badge-status-${req.id}`}>
                            {req.status}
                          </Badge>
                        </div>

                        <p className="text-sm text-muted-foreground" data-testid={`text-reason-${req.id}`}>
                          {req.reason}
                        </p>

                        <div className="flex flex-wrap gap-x-4 gap-y-1 text-xs text-muted-foreground">
                          <span>수량: {req.quantity}</span>
                          {req.department && <span>부서: {req.department}</span>}
                          {req.requestedBy && <span>요청자: {req.requestedBy}</span>}
                          {req.createdAt && (
                            <span>요청일: {format(new Date(req.createdAt), "yyyy-MM-dd")}</span>
                          )}
                        </div>

                        {req.adminNote && (
                          <div className="mt-2 p-2 bg-muted/50 rounded-md text-sm">
                            <span className="font-medium">관리자 메모:</span> {req.adminNote}
                          </div>
                        )}
                      </div>

                      {canManageEquipmentRequests && (
                        <div className="flex gap-1 shrink-0">
                          <Button
                            variant="outline"
                            size="sm"
                            onClick={() => openAdminDialog(req)}
                            data-testid={`button-admin-edit-${req.id}`}
                          >
                            상태변경
                          </Button>
                          {(!req.requestedBy || user?.role === "admin" || user?.username === req.requestedBy) && (
                            <Button
                              variant="ghost"
                              size="icon"
                              onClick={() => handleDelete(req.id)}
                              data-testid={`button-delete-${req.id}`}
                            >
                              <Trash2 className="w-4 h-4 text-destructive" />
                            </Button>
                          )}
                        </div>
                      )}
                    </div>
                  </CardContent>
                </Card>
              </motion.div>
            ))}
          </AnimatePresence>
        )}
      </div>

      <Dialog open={adminDialogOpen} onOpenChange={setAdminDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>요청 상태 변경</DialogTitle>
          </DialogHeader>
          {adminTarget && (
            <div className="space-y-4">
              <div className="text-sm">
                <span className="font-medium">상품명:</span> {adminTarget.itemName}
              </div>
              <div className="space-y-2">
                <Label>상태</Label>
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
              <div className="space-y-2">
                <Label>관리자 메모</Label>
                <Textarea
                  value={adminNote}
                  onChange={(e) => setAdminNote(e.target.value)}
                  placeholder="메모를 입력하세요"
                  rows={3}
                  data-testid="input-admin-note"
                />
              </div>
            </div>
          )}
          <DialogFooter>
            <Button variant="outline" onClick={() => setAdminDialogOpen(false)} data-testid="button-admin-cancel">
              취소
            </Button>
            <Button
              onClick={handleAdminSave}
              disabled={updateMutation.isPending}
              data-testid="button-admin-save"
            >
              {updateMutation.isPending ? "저장 중..." : "저장"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
