import { useState, useRef, useEffect, useMemo } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { queryClient, apiRequest } from "@/lib/queryClient";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useToast } from "@/hooks/use-toast";
import { useAuth } from "@/hooks/use-auth";
import { 
  Shield, 
  ShieldOff,
  ShieldCheck,
  Users, 
  ArrowLeft, 
  Plus, 
  Trash2,
  Eye,
  EyeOff,
  Upload,
  FileSpreadsheet,
  Download,
  Building2,
  Settings,
  ChevronDown,
  ChevronUp,
  ChevronRight,
  Check,
  X,
  Save,
  KeyRound,
  Copy,
  AlertTriangle,
  Unlock,
  Lock,
  UserX,
  Clock,
  UserCheck,
  FolderOpen,
  Folder,
  User,
  ChevronsDownUp,
  ChevronsUpDown,
  Search,
  Pencil,
  Network,
  ArrowRightLeft,
  RefreshCw,
} from "lucide-react";
import { Link } from "wouter";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
  DialogFooter,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { getRoleLabel, getRoleVariant, PERMISSION_LABELS, PERMISSION_CATEGORIES } from "@/hooks/use-permissions";
import type { UserPermissions } from "@shared/models/auth";
import { ALL_PERMISSIONS, DEFAULT_PERMISSIONS } from "@shared/models/auth";

interface UserData {
  id: string;
  username: string;
  name: string | null;
  department: string | null;
  role: string;
  permissions: UserPermissions;
  createdAt: string | null;
  failedLoginAttempts?: number;
  lockedUntil?: string | null;
  isActive?: boolean;
  lastLoginAt?: string | null;
  resignedAt?: string | null;
  deactivationReason?: string | null;
  totpEnabled?: boolean;
}

interface RolePresets {
  user: UserPermissions | null;
  manager: UserPermissions | null;
  deptHead: UserPermissions | null;
}

export default function AdminUsers() {
  const { toast } = useToast();
  const { user: currentUser, isAuthenticated } = useAuth();
  const { data: roleData } = useQuery<{ role: string }>({
    queryKey: ["/api/auth/user-role"],
    enabled: isAuthenticated,
  });
  const isAdmin = roleData?.role === "admin";
  const [expandedUser, setExpandedUser] = useState<string | null>(null);
  const [presetTab, setPresetTab] = useState<"user" | "manager" | "deptHead">("user");
  const [mainTab, setMainTab] = useState<"users" | "permissions" | "dormant" | "orgchart">("users");
  const [expandedDepts, setExpandedDepts] = useState<Set<string>>(new Set());
  const [allExpanded, setAllExpanded] = useState(false);
  const [userSearch, setUserSearch] = useState("");
  const [resetPwTarget, setResetPwTarget] = useState<UserData | null>(null);
  // 부서 헤더 인라인 편집
  const [editingDept, setEditingDept] = useState<string | null>(null);
  const [editDeptValue, setEditDeptValue] = useState("");

  const { data: users, isLoading } = useQuery<UserData[]>({
    queryKey: ["/api/users"],
    enabled: isAdmin,
  });

  // 부서명 일괄 변경 (모든 관련 테이블 트랜잭션)
  const renameDeptMutation = useMutation({
    mutationFn: async ({ oldName, newName }: { oldName: string; newName: string }) => {
      return apiRequest("PUT", "/api/departments/rename", { oldName, newName });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/users"] });
      queryClient.invalidateQueries({ queryKey: ["/api/departments"] });
      setEditingDept(null);
      toast({ title: "부서명이 변경되었습니다" });
    },
    onError: (error: any) => {
      let msg = "부서명 변경에 실패했습니다";
      try { const p = JSON.parse((error.message || "").replace(/^\d+:\s*/, "")); msg = p.message || msg; } catch {}
      toast({ variant: "destructive", title: msg });
    },
  });

  const { data: presets } = useQuery<RolePresets>({
    queryKey: ["/api/settings/role-presets"],
    enabled: isAdmin,
  });

  const updateRoleMutation = useMutation({
    mutationFn: async ({ userId, role }: { userId: string; role: string }) => {
      return apiRequest("PUT", `/api/users/${userId}`, { role });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/users"] });
      toast({ title: "역할이 변경되었습니다." });
    },
    onError: () => {
      toast({ variant: "destructive", title: "역할 변경에 실패했습니다." });
    },
  });

  const updatePermissionsMutation = useMutation({
    mutationFn: async ({ userId, permissions }: { userId: string; permissions: UserPermissions }) => {
      return apiRequest("PUT", `/api/users/${userId}`, { permissions });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/users"] });
      queryClient.invalidateQueries({ queryKey: ["/api/auth/permissions"] });
      toast({ title: "권한이 변경되었습니다." });
    },
    onError: () => {
      toast({ variant: "destructive", title: "권한 변경에 실패했습니다." });
    },
  });

  const deleteUserMutation = useMutation({
    mutationFn: async (userId: string) => {
      return apiRequest("DELETE", `/api/users/${userId}`);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/users"] });
      toast({ title: "사용자가 삭제되었습니다." });
    },
    onError: () => {
      toast({ variant: "destructive", title: "사용자 삭제에 실패했습니다." });
    },
  });

  const unlockUserMutation = useMutation({
    mutationFn: async (userId: string) => {
      return apiRequest("POST", "/api/auth/unlock-user", { userId });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/users"] });
      toast({ title: "계정 잠금이 해제되었습니다." });
    },
    onError: () => {
      toast({ variant: "destructive", title: "계정 잠금 해제에 실패했습니다." });
    },
  });

  const resetTotpMutation = useMutation({
    mutationFn: async (userId: string) => {
      return apiRequest("POST", "/api/auth/reset-totp", { userId });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/users"] });
      toast({ title: "2차 인증이 초기화되었습니다." });
    },
    onError: () => {
      toast({ variant: "destructive", title: "2차 인증 초기화에 실패했습니다." });
    },
  });

  const toggleActiveMutation = useMutation({
    mutationFn: async ({ userId, isActive }: { userId: string; isActive: boolean }) => {
      return apiRequest("PUT", `/api/users/${userId}`, { isActive });
    },
    onSuccess: (_data, variables) => {
      queryClient.invalidateQueries({ queryKey: ["/api/users"] });
      toast({ title: variables.isActive ? "계정이 활성화되었습니다." : "계정이 비활성화되었습니다." });
    },
    onError: () => {
      toast({ variant: "destructive", title: "계정 상태 변경에 실패했습니다." });
    },
  });

  const resignMutation = useMutation({
    mutationFn: async ({ userId, reason }: { userId: string; reason?: string }) => {
      return apiRequest("POST", `/api/admin/users/${userId}/resign`, { reason });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/users"] });
      queryClient.invalidateQueries({ queryKey: ["/api/admin/dormant-accounts"] });
      toast({ title: "퇴사 처리되었습니다." });
    },
    onError: () => {
      toast({ variant: "destructive", title: "퇴사 처리에 실패했습니다." });
    },
  });

  const deactivateDormantMutation = useMutation({
    mutationFn: async () => {
      const res = await apiRequest("POST", "/api/admin/dormant-accounts/deactivate", { days: 90 });
      return res.json();
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ["/api/users"] });
      queryClient.invalidateQueries({ queryKey: ["/api/admin/dormant-accounts"] });
      toast({ title: `${data.count}개 휴면계정이 비활성화되었습니다.` });
    },
    onError: () => {
      toast({ variant: "destructive", title: "일괄 비활성화에 실패했습니다." });
    },
  });

  const { data: dormantUsers, isLoading: isDormantLoading } = useQuery<UserData[]>({
    queryKey: ["/api/admin/dormant-accounts"],
    enabled: isAdmin && mainTab === "dormant",
  });

  const isDormant = (user: UserData) => {
    if (!user.lastLoginAt) return false;
    const days = (Date.now() - new Date(user.lastLoginAt).getTime()) / (1000 * 60 * 60 * 24);
    return days >= 90;
  };

  const filteredUsers = useMemo(() => {
    if (!users) return [];
    const q = userSearch.trim().toLowerCase();
    if (!q) return users;
    return users.filter(u =>
      (u.name || "").toLowerCase().includes(q) ||
      (u.username || "").toLowerCase().includes(q) ||
      (u.department || "").toLowerCase().includes(q)
    );
  }, [users, userSearch]);

  const deptGroups = useMemo(() => {
    const map = new Map<string, UserData[]>();
    (filteredUsers || []).forEach(u => {
      const dept = u.department?.trim() || "(부서 미지정)";
      if (!map.has(dept)) map.set(dept, []);
      map.get(dept)!.push(u);
    });
    const sorted = Array.from(map.entries()).sort((a, b) => {
      if (a[0] === "(부서 미지정)") return 1;
      if (b[0] === "(부서 미지정)") return -1;
      return a[0].localeCompare(b[0], "ko");
    });
    return sorted;
  }, [filteredUsers]);

  const toggleDept = (dept: string) => {
    setExpandedDepts(prev => {
      const next = new Set(prev);
      if (next.has(dept)) next.delete(dept);
      else next.add(dept);
      return next;
    });
  };

  const toggleAllDepts = () => {
    if (allExpanded) {
      setExpandedDepts(new Set());
      setAllExpanded(false);
    } else {
      setExpandedDepts(new Set(deptGroups.map(([dept]) => dept)));
      setAllExpanded(true);
    }
  };

  const togglePermission = (user: UserData, permKey: keyof UserPermissions) => {
    const current = user.permissions || DEFAULT_PERMISSIONS;
    const updated = { ...DEFAULT_PERMISSIONS, ...current, [permKey]: !current[permKey] };
    updatePermissionsMutation.mutate({ userId: user.id, permissions: updated });
  };

  const setAllPermissions = (user: UserData, enabled: boolean) => {
    const perms = enabled ? ALL_PERMISSIONS : DEFAULT_PERMISSIONS;
    updatePermissionsMutation.mutate({ userId: user.id, permissions: perms });
  };

  const applyPresetToUser = (user: UserData) => {
    const preset =
      user.role === "manager" ? presets?.manager :
      user.role === "deptHead" ? presets?.deptHead :
      presets?.user;
    if (preset) {
      updatePermissionsMutation.mutate({ userId: user.id, permissions: preset });
    } else {
      toast({ variant: "destructive", title: `${getRoleLabel(user.role)} 프리셋이 아직 설정되지 않았습니다.` });
    }
  };

  if (!isAuthenticated) {
    return (
      <div className="flex items-center justify-center min-h-[60vh]">
        <Card className="w-full max-w-md">
          <CardContent className="p-6 text-center">
            <p className="text-muted-foreground mb-4">로그인이 필요합니다.</p>
          </CardContent>
        </Card>
      </div>
    );
  }

  if (!isAdmin) {
    return (
      <div className="flex items-center justify-center min-h-[60vh]">
        <Card className="w-full max-w-md">
          <CardContent className="p-6 text-center">
            <ShieldOff className="w-12 h-12 text-muted-foreground mx-auto mb-4" />
            <p className="text-muted-foreground">관리자 권한이 필요합니다.</p>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="container mx-auto px-4 py-6 max-w-4xl">
      {/* ─── 비밀번호 초기화 다이얼로그 (목록 외부 — 아코디언 언마운트 영향 없음) ─── */}
      <ResetPasswordDialog
        user={resetPwTarget}
        open={resetPwTarget !== null}
        onClose={() => {
          setResetPwTarget(null);
          setUserSearch("");  // 다이얼로그 닫힘 시 검색 필터 초기화 → 전체 목록 복원
        }}
      />
      <div className="mb-6">
        <Link href="/">
          <Button variant="ghost" size="sm" className="gap-2 mb-4" data-testid="button-back">
            <ArrowLeft className="w-4 h-4" />
            대시보드로 돌아가기
          </Button>
        </Link>
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-primary/10 flex items-center justify-center">
            <Users className="w-5 h-5 text-primary" />
          </div>
          <div>
            <h1 className="text-2xl font-bold">사용자 관리</h1>
            <p className="text-sm text-muted-foreground">사용자 계정 및 역할별 권한 프리셋을 관리합니다</p>
          </div>
        </div>
      </div>

      <Tabs value={mainTab} onValueChange={(v) => setMainTab(v as "users" | "permissions" | "dormant" | "orgchart")}>
        <TabsList className="mb-4">
          <TabsTrigger value="users" className="gap-2" data-testid="tab-users">
            <Users className="w-4 h-4" />
            사용자 목록
          </TabsTrigger>
          <TabsTrigger value="dormant" className="gap-2" data-testid="tab-dormant">
            <Clock className="w-4 h-4" />
            휴면/퇴사 계정
          </TabsTrigger>
          <TabsTrigger value="orgchart" className="gap-2" data-testid="tab-orgchart">
            <Network className="w-4 h-4" />
            조직도 관리
          </TabsTrigger>
          <TabsTrigger value="permissions" className="gap-2" data-testid="tab-permissions">
            <ShieldCheck className="w-4 h-4" />
            역할별 권한 설정
          </TabsTrigger>
        </TabsList>

        <TabsContent value="users">
          {/* 상단 툴바 */}
          <div className="flex items-center gap-2 mb-4 flex-wrap">
            <div className="relative flex-1 min-w-[200px]">
              <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-muted-foreground" />
              <input
                type="text"
                placeholder="이름, 아이디, 부서 검색..."
                value={userSearch}
                onChange={e => setUserSearch(e.target.value)}
                className="w-full h-9 pl-8 pr-3 text-sm border rounded-md bg-background focus:outline-none focus:ring-2 focus:ring-ring"
              />
            </div>
            <Button variant="outline" size="sm" className="gap-1.5 h-9 shrink-0" onClick={toggleAllDepts}>
              {allExpanded ? <ChevronsDownUp className="w-3.5 h-3.5" /> : <ChevronsUpDown className="w-3.5 h-3.5" />}
              {allExpanded ? "모두 접기" : "모두 펼치기"}
            </Button>
            <ExcelUploadDialog />
            <CreateUserDialog />
          </div>

          {/* 전체 인원 요약 */}
          <div className="flex items-center gap-2 mb-3 px-1">
            <Users className="w-4 h-4 text-muted-foreground" />
            <span className="text-sm text-muted-foreground">
              전체 <span className="font-semibold text-foreground">{users?.length || 0}</span>명
              {userSearch && filteredUsers.length !== users?.length && (
                <span className="ml-1">· 검색결과 <span className="font-semibold text-primary">{filteredUsers.length}</span>명</span>
              )}
              · <span className="font-semibold text-foreground">{deptGroups.length}</span>개 부서
            </span>
          </div>

          {isLoading ? (
            <div className="py-16 text-center text-muted-foreground">로딩 중...</div>
          ) : !users || users.length === 0 ? (
            <div className="py-16 text-center text-muted-foreground">등록된 사용자가 없습니다.</div>
          ) : (
            <div className="space-y-1.5">
              {deptGroups.map(([dept, deptUsers]) => {
                const isOpen = expandedDepts.has(dept);
                const isUnassigned = dept === "(부서 미지정)";
                return (
                  <div key={dept} className="rounded-xl border bg-card overflow-hidden">
                    {/* 부서 헤더 */}
                    {editingDept === dept ? (
                      /* 인라인 이름 편집 모드 */
                      <div className="flex items-center gap-2 px-3 py-2">
                        <div className="flex items-center justify-center w-6 h-6 rounded-md shrink-0 bg-blue-100 dark:bg-blue-900/40">
                          <FolderOpen className="w-3.5 h-3.5 text-blue-600 dark:text-blue-400" />
                        </div>
                        <input
                          autoFocus
                          value={editDeptValue}
                          onChange={e => setEditDeptValue(e.target.value)}
                          onKeyDown={e => {
                            if (e.key === "Enter" && editDeptValue.trim()) {
                              renameDeptMutation.mutate({ oldName: editingDept!, newName: editDeptValue.trim() });
                            }
                            if (e.key === "Escape") setEditingDept(null);
                          }}
                          className="flex-1 h-8 px-2 text-sm border rounded focus:outline-none focus:ring-2 focus:ring-ring bg-background"
                          placeholder="새 부서명 입력..."
                        />
                        <Button
                          type="button" size="sm" variant="default" className="h-7 px-2 gap-1"
                          onClick={() => editDeptValue.trim() && renameDeptMutation.mutate({ oldName: editingDept!, newName: editDeptValue.trim() })}
                          disabled={renameDeptMutation.isPending || !editDeptValue.trim()}
                        >
                          <Check className="w-3.5 h-3.5" />
                        </Button>
                        <Button type="button" size="sm" variant="ghost" className="h-7 px-2"
                          onClick={() => setEditingDept(null)} disabled={renameDeptMutation.isPending}>
                          <X className="w-3.5 h-3.5" />
                        </Button>
                      </div>
                    ) : (
                      /* 일반 모드: 아코디언 + 연필 버튼 */
                      <div className="flex items-center group">
                        <button
                          onClick={() => toggleDept(dept)}
                          className="flex-1 flex items-center gap-2.5 px-4 py-2.5 hover:bg-muted/50 transition-colors text-left"
                        >
                          <div className={`flex items-center justify-center w-6 h-6 rounded-md shrink-0 ${isUnassigned ? "bg-muted" : "bg-blue-100 dark:bg-blue-900/40"}`}>
                            {isOpen
                              ? <FolderOpen className={`w-3.5 h-3.5 ${isUnassigned ? "text-muted-foreground" : "text-blue-600 dark:text-blue-400"}`} />
                              : <Folder className={`w-3.5 h-3.5 ${isUnassigned ? "text-muted-foreground" : "text-blue-600 dark:text-blue-400"}`} />
                            }
                          </div>
                          <span className={`font-semibold text-sm flex-1 ${isUnassigned ? "text-muted-foreground italic" : ""}`}>{dept}</span>
                          <span className="text-xs font-medium text-muted-foreground bg-muted px-2 py-0.5 rounded-full shrink-0">{deptUsers.length}명</span>
                          <ChevronRight className={`w-3.5 h-3.5 text-muted-foreground transition-transform shrink-0 ${isOpen ? "rotate-90" : ""}`} />
                        </button>
                        {!isUnassigned && (
                          <button
                            type="button"
                            title="부서명 수정"
                            onClick={() => { setEditingDept(dept); setEditDeptValue(dept); }}
                            className="opacity-0 group-hover:opacity-100 transition-opacity mr-2 h-7 w-7 flex items-center justify-center rounded hover:bg-muted text-muted-foreground hover:text-foreground shrink-0"
                          >
                            <Pencil className="w-3 h-3" />
                          </button>
                        )}
                      </div>
                    )}

                    {/* 부서 소속 사용자 목록 */}
                    {isOpen && (
                      <div className="border-t divide-y">
                        {deptUsers.map((user) => {
                          const isExpanded = expandedUser === user.id;
                          const isCurrentUser = user.id === currentUser?.id;
                          const isUserAdmin = user.role === "admin";
                          const userPerms = user.permissions || DEFAULT_PERMISSIONS;
                          return (
                            <div key={user.id} className="bg-background" data-testid={`user-row-${user.id}`}>
                              <div className="flex items-center gap-3 px-4 py-2.5 pl-12">
                                {/* 트리 연결선 */}
                                <div className="absolute left-6 w-5 h-px bg-border" />
                                <Avatar className="h-8 w-8 shrink-0">
                                  <AvatarFallback className="bg-primary/10 text-primary text-xs font-semibold">
                                    {(user.name?.[0] || user.username?.[0] || "U").toUpperCase()}
                                  </AvatarFallback>
                                </Avatar>
                                <div className="flex-1 min-w-0">
                                  <div className="flex items-center gap-1.5 flex-wrap">
                                    <span className="font-medium text-sm">
                                      {user.name || user.username}
                                      {isCurrentUser && <span className="ml-1 text-xs text-muted-foreground">(나)</span>}
                                    </span>
                                    <Badge variant={getRoleVariant(user.role)} className="text-[10px] px-1.5 py-0 h-4 shrink-0">
                                      {getRoleLabel(user.role)}
                                    </Badge>
                                    {user.lockedUntil && new Date(user.lockedUntil) > new Date() && (
                                      <Badge variant="destructive" className="gap-0.5 text-[10px] px-1.5 py-0 h-4 shrink-0">
                                        <Lock className="w-2.5 h-2.5" />잠김
                                      </Badge>
                                    )}
                                    {user.isActive === false && (
                                      <Badge variant="secondary" className="text-[10px] px-1.5 py-0 h-4 shrink-0 text-muted-foreground">
                                        비활성
                                      </Badge>
                                    )}
                                    {isDormant(user) && (
                                      <Badge variant="outline" className="text-[10px] px-1.5 py-0 h-4 shrink-0 text-amber-600 border-amber-300">
                                        휴면
                                      </Badge>
                                    )}
                                  </div>
                                  <p className="text-[11px] text-muted-foreground mt-0.5">@{user.username}</p>
                                </div>
                                {/* 액션 버튼들 */}
                                {!isCurrentUser && (
                                  <div className="flex items-center gap-1 shrink-0 flex-wrap justify-end">
                                    <Select
                                      value={user.role}
                                      onValueChange={(newRole) => updateRoleMutation.mutate({ userId: user.id, role: newRole })}
                                      disabled={updateRoleMutation.isPending}
                                    >
                                      <SelectTrigger className="w-[90px] h-7 text-xs" data-testid={`select-role-${user.id}`}>
                                        <SelectValue />
                                      </SelectTrigger>
                                      <SelectContent>
                                        <SelectItem value="admin">관리자</SelectItem>
                                        <SelectItem value="deptHead">부서장</SelectItem>
                                        <SelectItem value="manager">담당자</SelectItem>
                                        <SelectItem value="user">일반사용자</SelectItem>
                                      </SelectContent>
                                    </Select>
                                    {!isUserAdmin && (
                                      <Button variant="outline" size="sm" className="gap-1 h-7 text-xs px-2"
                                        onClick={() => setExpandedUser(isExpanded ? null : user.id)}
                                        data-testid={`button-permissions-${user.id}`}>
                                        <Settings className="w-3 h-3" />
                                        권한
                                        {isExpanded ? <ChevronUp className="w-3 h-3" /> : <ChevronDown className="w-3 h-3" />}
                                      </Button>
                                    )}
                                    <Button
                                      variant="outline" size="icon" className="h-8 w-8" title="비밀번호 초기화"
                                      data-testid={`button-reset-pw-${user.id}`}
                                      onClick={() => setResetPwTarget(user)}
                                    >
                                      <KeyRound className="w-3.5 h-3.5" />
                                    </Button>
                                    {!isUserAdmin && (
                                      <div className="flex items-center gap-1 h-7 px-1.5 rounded-md border">
                                        <Switch
                                          checked={user.isActive !== false}
                                          onCheckedChange={(checked) => toggleActiveMutation.mutate({ userId: user.id, isActive: checked })}
                                          disabled={toggleActiveMutation.isPending}
                                          className="scale-75"
                                          data-testid={`switch-active-${user.id}`}
                                        />
                                        <span className="text-[10px] text-muted-foreground whitespace-nowrap">
                                          {user.isActive !== false ? "활성" : "비활성"}
                                        </span>
                                      </div>
                                    )}
                                    {user.lockedUntil && new Date(user.lockedUntil) > new Date() && (
                                      <Button variant="outline" size="icon" className="h-7 w-7 text-orange-600 border-orange-300 hover:bg-orange-50"
                                        onClick={() => unlockUserMutation.mutate(user.id)}
                                        disabled={unlockUserMutation.isPending} title="계정 잠금 해제"
                                        data-testid={`button-unlock-${user.id}`}>
                                        <Unlock className="w-3 h-3" />
                                      </Button>
                                    )}
                                    {user.totpEnabled && (
                                      <Button variant="outline" size="icon" className="h-7 w-7 text-blue-600 border-blue-300 hover:bg-blue-50"
                                        onClick={() => { if (confirm(`${user.name || user.username}의 2차 인증(PIN)을 초기화하시겠습니까?`)) resetTotpMutation.mutate(user.id); }}
                                        disabled={resetTotpMutation.isPending} title="2차 인증 초기화"
                                        data-testid={`button-reset-totp-${user.id}`}>
                                        <Shield className="w-3 h-3" />
                                      </Button>
                                    )}
                                    {!user.resignedAt && (
                                      <Button variant="outline" size="icon" className="h-7 w-7 text-orange-600 border-orange-300 hover:bg-orange-50"
                                        onClick={() => { const reason = prompt("퇴사 사유를 입력하세요 (선택사항):", "퇴사"); if (reason !== null) resignMutation.mutate({ userId: user.id, reason: reason || "퇴사 처리" }); }}
                                        disabled={resignMutation.isPending} title="퇴사 처리"
                                        data-testid={`button-resign-${user.id}`}>
                                        <UserX className="w-3 h-3" />
                                      </Button>
                                    )}
                                    <Button variant="ghost" size="icon" className="h-7 w-7 text-destructive hover:text-destructive hover:bg-destructive/10"
                                      onClick={() => { if (confirm("정말로 이 사용자를 삭제하시겠습니까?")) deleteUserMutation.mutate(user.id); }}
                                      disabled={deleteUserMutation.isPending}
                                      data-testid={`button-delete-${user.id}`}>
                                      <Trash2 className="w-3.5 h-3.5" />
                                    </Button>
                                  </div>
                                )}
                              </div>

                              {/* 권한 설정 패널 */}
                              {isExpanded && !isUserAdmin && (
                                <div className="border-t bg-muted/30 px-4 py-4 pl-12">
                                  <div className="flex items-center justify-between mb-3 flex-wrap gap-2">
                                    <h4 className="text-sm font-semibold flex items-center gap-2">
                                      <Shield className="w-4 h-4 text-primary" />
                                      기능별 권한 설정
                                    </h4>
                                    <div className="flex gap-2 flex-wrap">
                                      <Button variant="outline" size="sm" className="gap-1 text-xs"
                                        onClick={() => applyPresetToUser(user)} disabled={updatePermissionsMutation.isPending}
                                        data-testid={`button-apply-preset-${user.id}`}>
                                        <Shield className="w-3 h-3" />프리셋 적용
                                      </Button>
                                      <Button variant="outline" size="sm" className="gap-1 text-xs"
                                        onClick={() => setAllPermissions(user, true)} disabled={updatePermissionsMutation.isPending}>
                                        <Check className="w-3 h-3" />전체 허용
                                      </Button>
                                      <Button variant="outline" size="sm" className="gap-1 text-xs"
                                        onClick={() => setAllPermissions(user, false)} disabled={updatePermissionsMutation.isPending}>
                                        <X className="w-3 h-3" />전체 해제
                                      </Button>
                                    </div>
                                  </div>
                                  <div className="space-y-3">
                                    {PERMISSION_CATEGORIES.map((cat) => {
                                      const catEnabled = cat.keys.filter(k => !!userPerms[k]).length;
                                      return (
                                        <div key={cat.label} className="border rounded-lg overflow-hidden">
                                          <div className="flex items-center justify-between px-3 py-2 bg-muted/30">
                                            <span className="text-xs font-semibold text-muted-foreground">{cat.label} ({catEnabled}/{cat.keys.length})</span>
                                            <div className="flex gap-1">
                                              <Button variant="ghost" size="sm" className="h-6 text-[10px] px-2" onClick={() => { const updated = { ...userPerms }; cat.keys.forEach(k => { updated[k] = true; }); updatePermissionsMutation.mutate({ userId: user.id, permissions: updated }); }}>전체</Button>
                                              <Button variant="ghost" size="sm" className="h-6 text-[10px] px-2" onClick={() => { const updated = { ...userPerms }; cat.keys.forEach(k => { updated[k] = false; }); updatePermissionsMutation.mutate({ userId: user.id, permissions: updated }); }}>해제</Button>
                                            </div>
                                          </div>
                                          <div className="grid grid-cols-1 sm:grid-cols-2 gap-1 p-2">
                                            {cat.keys.map((permKey) => (
                                              <div key={permKey} className="flex items-center justify-between py-1.5 px-2.5 rounded bg-background border text-sm">
                                                <span className="text-xs">{PERMISSION_LABELS[permKey]}</span>
                                                <Switch checked={!!userPerms[permKey]} onCheckedChange={() => togglePermission(user, permKey)}
                                                  disabled={updatePermissionsMutation.isPending}
                                                  data-testid={`switch-perm-${permKey}-${user.id}`} />
                                              </div>
                                            ))}
                                          </div>
                                        </div>
                                      );
                                    })}
                                  </div>
                                </div>
                              )}
                            </div>
                          );
                        })}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </TabsContent>

        <TabsContent value="dormant">
          <div className="space-y-4">
            <Card>
              <CardHeader className="flex flex-row items-center justify-between gap-2 py-4">
                <div>
                  <CardTitle className="text-base flex items-center gap-2">
                    <Clock className="w-4 h-4 text-amber-500" />
                    휴면 계정 (90일 이상 미접속 활성 계정)
                  </CardTitle>
                  <p className="text-xs text-muted-foreground mt-0.5">마지막 접속 후 90일이 지난 활성 계정입니다. 일괄 비활성화하거나 퇴사 처리할 수 있습니다.</p>
                </div>
                <Button
                  variant="destructive"
                  size="sm"
                  className="gap-1.5 shrink-0"
                  onClick={() => {
                    if (confirm("90일 이상 미접속한 모든 계정을 비활성화하시겠습니까?")) {
                      deactivateDormantMutation.mutate();
                    }
                  }}
                  disabled={deactivateDormantMutation.isPending || !dormantUsers?.length}
                  data-testid="button-deactivate-all-dormant"
                >
                  <UserX className="w-3.5 h-3.5" />
                  일괄 비활성화
                </Button>
              </CardHeader>
              <CardContent>
                {isDormantLoading ? (
                  <div className="py-6 text-center text-muted-foreground text-sm">조회 중...</div>
                ) : !dormantUsers?.length ? (
                  <div className="py-6 text-center text-muted-foreground text-sm flex flex-col items-center gap-2">
                    <UserCheck className="w-8 h-8 text-green-500" />
                    90일 이상 미접속 계정이 없습니다
                  </div>
                ) : (
                  <div className="space-y-2">
                    {dormantUsers.map((u) => {
                      const daysSince = u.lastLoginAt
                        ? Math.floor((Date.now() - new Date(u.lastLoginAt).getTime()) / (1000 * 60 * 60 * 24))
                        : null;
                      return (
                        <div key={u.id} className="flex items-center gap-3 p-3 rounded-lg border bg-amber-50/50 dark:bg-amber-900/10">
                          <div className="flex-1 min-w-0">
                            <p className="font-medium text-sm">{u.name || u.username} <span className="text-xs text-muted-foreground">@{u.username}</span></p>
                            <p className="text-xs text-muted-foreground">
                              {u.department && <span>{u.department} · </span>}
                              {daysSince !== null ? `${daysSince}일 미접속` : "접속 기록 없음"}
                            </p>
                          </div>
                          <div className="flex gap-1.5 shrink-0">
                            <Button
                              variant="outline"
                              size="sm"
                              className="h-7 text-xs gap-1 text-orange-600 border-orange-300"
                              onClick={() => {
                                const reason = prompt("퇴사 사유:", "퇴사");
                                if (reason !== null) resignMutation.mutate({ userId: u.id, reason: reason || "퇴사 처리" });
                              }}
                              disabled={resignMutation.isPending}
                            >
                              <UserX className="w-3 h-3" />퇴사
                            </Button>
                            <Button
                              variant="outline"
                              size="sm"
                              className="h-7 text-xs gap-1"
                              onClick={() => toggleActiveMutation.mutate({ userId: u.id, isActive: false })}
                              disabled={toggleActiveMutation.isPending}
                            >
                              비활성화
                            </Button>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                )}
              </CardContent>
            </Card>

            <Card>
              <CardHeader className="py-4">
                <CardTitle className="text-base flex items-center gap-2">
                  <UserX className="w-4 h-4 text-red-500" />
                  퇴사 처리된 계정
                </CardTitle>
              </CardHeader>
              <CardContent>
                {!users ? (
                  <div className="py-4 text-center text-sm text-muted-foreground">로딩 중...</div>
                ) : users.filter(u => u.resignedAt).length === 0 ? (
                  <div className="py-4 text-center text-sm text-muted-foreground">퇴사 처리된 계정이 없습니다</div>
                ) : (
                  <div className="space-y-2">
                    {users.filter(u => u.resignedAt).map(u => (
                      <div key={u.id} className="flex items-center gap-3 p-3 rounded-lg border bg-muted/30">
                        <div className="flex-1 min-w-0">
                          <p className="font-medium text-sm text-muted-foreground line-through">{u.name || u.username}</p>
                          <p className="text-xs text-muted-foreground">
                            퇴사일: {u.resignedAt ? new Date(u.resignedAt).toLocaleDateString("ko-KR") : "-"}
                            {u.deactivationReason && ` · ${u.deactivationReason}`}
                          </p>
                        </div>
                        <Badge variant="secondary" className="text-xs shrink-0">퇴사</Badge>
                      </div>
                    ))}
                  </div>
                )}
              </CardContent>
            </Card>
          </div>
        </TabsContent>

        <TabsContent value="orgchart">
          <OrgChartTab />
        </TabsContent>

        <TabsContent value="permissions">
          <RolePresetManager
            presets={presets || { user: null, manager: null, deptHead: null }}
            activeTab={presetTab}
            onTabChange={setPresetTab}
          />
        </TabsContent>
      </Tabs>
    </div>
  );
}

function RolePresetManager({ 
  presets, 
  activeTab, 
  onTabChange 
}: { 
  presets: RolePresets; 
  activeTab: "user" | "manager" | "deptHead"; 
  onTabChange: (tab: "user" | "manager" | "deptHead") => void;
}) {
  const { toast } = useToast();
  const currentPreset = activeTab === "manager" ? presets.manager : activeTab === "deptHead" ? presets.deptHead : presets.user;
  const [localPerms, setLocalPerms] = useState<UserPermissions>(currentPreset || DEFAULT_PERMISSIONS);
  const [hasChanges, setHasChanges] = useState(false);

  useEffect(() => {
    const preset = activeTab === "manager" ? presets.manager : activeTab === "deptHead" ? presets.deptHead : presets.user;
    setLocalPerms(preset || DEFAULT_PERMISSIONS);
    setHasChanges(false);
  }, [presets.user, presets.manager, presets.deptHead, activeTab]);

  const handleTabChange = (tab: "user" | "manager" | "deptHead") => {
    onTabChange(tab);
  };

  const toggleLocalPerm = (key: keyof UserPermissions) => {
    setLocalPerms(prev => ({ ...prev, [key]: !prev[key] }));
    setHasChanges(true);
  };

  const setAllLocal = (enabled: boolean) => {
    setLocalPerms(enabled ? { ...ALL_PERMISSIONS } : { ...DEFAULT_PERMISSIONS });
    setHasChanges(true);
  };

  const savePresetMutation = useMutation({
    mutationFn: async ({ role, permissions }: { role: string; permissions: UserPermissions }) => {
      return apiRequest("POST", "/api/settings/role-presets", { role, permissions });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/settings/role-presets"] });
      setHasChanges(false);
      const label = activeTab === "manager" ? "담당자" : activeTab === "deptHead" ? "부서장" : "일반사용자";
      toast({ title: `${label} 권한 프리셋이 저장되었습니다.` });
    },
    onError: () => {
      toast({ variant: "destructive", title: "프리셋 저장에 실패했습니다." });
    },
  });

  const handleSave = () => {
    savePresetMutation.mutate({ role: activeTab, permissions: localPerms });
  };

  return (
    <Card className="mb-6">
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between flex-wrap gap-2">
          <CardTitle className="text-lg flex items-center gap-2">
            <Shield className="w-5 h-5 text-primary" />
            역할별 권한 프리셋
          </CardTitle>
          <p className="text-xs text-muted-foreground">
            사용자 추가 시 선택한 역할의 프리셋 권한이 자동 적용됩니다
          </p>
        </div>
      </CardHeader>
      <CardContent>
        <div className="flex gap-2 mb-4 flex-wrap">
          <Button
            variant={activeTab === "user" ? "default" : "outline"}
            size="sm"
            onClick={() => handleTabChange("user")}
            data-testid="button-preset-tab-user"
          >
            일반사용자 설정
            {presets.user && <Badge variant="secondary" className="ml-2 text-[10px]">저장됨</Badge>}
          </Button>
          <Button
            variant={activeTab === "deptHead" ? "default" : "outline"}
            size="sm"
            onClick={() => handleTabChange("deptHead")}
            data-testid="button-preset-tab-depthead"
          >
            부서장 설정
            {presets.deptHead && <Badge variant="secondary" className="ml-2 text-[10px]">저장됨</Badge>}
          </Button>
          <Button
            variant={activeTab === "manager" ? "default" : "outline"}
            size="sm"
            onClick={() => handleTabChange("manager")}
            data-testid="button-preset-tab-manager"
          >
            담당자 설정
            {presets.manager && <Badge variant="secondary" className="ml-2 text-[10px]">저장됨</Badge>}
          </Button>
        </div>

        <div className="flex items-center justify-between mb-3 flex-wrap gap-2">
          <p className="text-sm text-muted-foreground">
            {activeTab === "manager" ? "담당자" : activeTab === "deptHead" ? "부서장" : "일반사용자"}로 등록되는 사용자에게 기본 적용될 권한을 설정합니다
          </p>
          <div className="flex gap-2">
            <Button
              variant="outline"
              size="sm"
              className="gap-1 text-xs"
              onClick={() => setAllLocal(true)}
            >
              <Check className="w-3 h-3" />
              전체 허용
            </Button>
            <Button
              variant="outline"
              size="sm"
              className="gap-1 text-xs"
              onClick={() => setAllLocal(false)}
            >
              <X className="w-3 h-3" />
              전체 해제
            </Button>
          </div>
        </div>

        <div className="space-y-3 mb-4">
          {PERMISSION_CATEGORIES.map((cat) => {
            const catEnabled = cat.keys.filter(k => !!localPerms[k]).length;
            return (
              <div key={cat.label} className="border rounded-lg overflow-hidden">
                <div className="flex items-center justify-between px-3 py-2 bg-muted/30">
                  <span className="text-xs font-semibold text-muted-foreground">{cat.label} ({catEnabled}/{cat.keys.length})</span>
                  <div className="flex gap-1">
                    <Button variant="ghost" size="sm" className="h-6 text-[10px] px-2"
                      onClick={() => {
                        const updated = { ...localPerms };
                        cat.keys.forEach(k => { updated[k] = true; });
                        setLocalPerms(updated);
                        setHasChanges(true);
                      }}
                    >전체</Button>
                    <Button variant="ghost" size="sm" className="h-6 text-[10px] px-2"
                      onClick={() => {
                        const updated = { ...localPerms };
                        cat.keys.forEach(k => { updated[k] = false; });
                        setLocalPerms(updated);
                        setHasChanges(true);
                      }}
                    >해제</Button>
                  </div>
                </div>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-1 p-2">
                  {cat.keys.map((permKey) => (
                    <div key={permKey} className="flex items-center justify-between py-1.5 px-2.5 rounded bg-muted/50 border text-sm">
                      <span className="text-xs">{PERMISSION_LABELS[permKey]}</span>
                      <Switch
                        checked={!!localPerms[permKey]}
                        onCheckedChange={() => toggleLocalPerm(permKey)}
                        data-testid={`switch-preset-${permKey}-${activeTab}`}
                      />
                    </div>
                  ))}
                </div>
              </div>
            );
          })}
        </div>

        <Button
          className="w-full gap-2"
          onClick={handleSave}
          disabled={savePresetMutation.isPending || !hasChanges}
          data-testid="button-save-preset"
        >
          <Save className="w-4 h-4" />
          {savePresetMutation.isPending ? "저장 중..." : `${activeTab === "user" ? "일반사용자" : "담당자"} 프리셋 저장`}
        </Button>
      </CardContent>
    </Card>
  );
}

function ExcelUploadDialog() {
  const [open, setOpen] = useState(false);
  const [uploading, setUploading] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const { toast } = useToast();

  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setUploading(true);
    const formData = new FormData();
    formData.append("file", file);

    try {
      const res = await fetch("/api/users/bulk-upload", {
        method: "POST",
        body: formData,
        credentials: "include",
      });

      const data = await res.json();

      if (!res.ok) {
        throw new Error(data.message || "업로드 실패");
      }

      queryClient.invalidateQueries({ queryKey: ["/api/users"] });
      toast({ 
        title: "일괄 등록 완료", 
        description: `${data.successCount}명의 사용자가 등록되었습니다.${data.skipCount ? ` (${data.skipCount}명 건너뜀)` : ""}` 
      });
      setOpen(false);
    } catch (error: any) {
      toast({ 
        variant: "destructive", 
        title: "업로드 실패", 
        description: error.message 
      });
    } finally {
      setUploading(false);
      if (fileInputRef.current) {
        fileInputRef.current.value = "";
      }
    }
  };

  const downloadTemplate = () => {
    const csvContent = "부서명,이름,아이디,비밀번호,직위\n네트워크팀,홍길동,hong123,password123,대리\n안전관리팀,김철수,kim456,password456,과장";
    const blob = new Blob(["\uFEFF" + csvContent], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = "사용자_등록_양식.csv";
    link.click();
    URL.revokeObjectURL(url);
  };

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button variant="outline" className="gap-2" data-testid="button-bulk-upload">
          <Upload className="w-4 h-4" />
          엑셀 일괄등록
        </Button>
      </DialogTrigger>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>엑셀로 사용자 일괄 등록</DialogTitle>
        </DialogHeader>
        <div className="space-y-4">
          <div className="p-4 bg-muted/50 rounded-lg space-y-3">
            <div className="flex items-center gap-2 text-sm font-medium">
              <FileSpreadsheet className="w-4 h-4 text-primary" />
              엑셀 파일 형식
            </div>
            <div className="text-sm text-muted-foreground space-y-1">
              <p>첫 번째 행: 헤더 (부서명, 이름, 아이디, 비밀번호)</p>
              <p>두 번째 행부터: 사용자 데이터</p>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full text-xs border rounded">
                <thead className="bg-muted">
                  <tr>
                    <th className="border p-1.5 text-left">부서명</th>
                    <th className="border p-1.5 text-left">이름</th>
                    <th className="border p-1.5 text-left">아이디</th>
                    <th className="border p-1.5 text-left">비밀번호</th>
                  </tr>
                </thead>
                <tbody>
                  <tr>
                    <td className="border p-1.5">네트워크팀</td>
                    <td className="border p-1.5">홍길동</td>
                    <td className="border p-1.5">hong123</td>
                    <td className="border p-1.5">password123</td>
                  </tr>
                  <tr>
                    <td className="border p-1.5">안전관리팀</td>
                    <td className="border p-1.5">김철수</td>
                    <td className="border p-1.5">kim456</td>
                    <td className="border p-1.5">password456</td>
                  </tr>
                </tbody>
              </table>
            </div>
            <Button variant="outline" size="sm" className="w-full gap-2" onClick={downloadTemplate}>
              <Download className="w-4 h-4" />
              양식 다운로드 (CSV)
            </Button>
          </div>

          <div className="space-y-2">
            <input
              ref={fileInputRef}
              type="file"
              accept=".xlsx,.xls,.csv"
              onChange={handleFileUpload}
              className="hidden"
              data-testid="input-excel-file"
            />
            <Button 
              className="w-full gap-2" 
              onClick={() => fileInputRef.current?.click()}
              disabled={uploading}
            >
              <Upload className="w-4 h-4" />
              {uploading ? "업로드 중..." : "엑셀 파일 선택"}
            </Button>
            <p className="text-xs text-center text-muted-foreground">
              .xlsx, .xls, .csv 파일 지원
            </p>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}

function CreateUserDialog() {
  const [open, setOpen] = useState(false);
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [name, setName] = useState("");
  const [department, setDepartment] = useState("");
  const [position, setPosition] = useState("");
  const [role, setRole] = useState("user");
  const [showPassword, setShowPassword] = useState(false);
  const [successInfo, setSuccessInfo] = useState<{ username: string; password: string; name: string } | null>(null);
  const { toast } = useToast();

  const { data: presets } = useQuery<RolePresets>({
    queryKey: ["/api/settings/role-presets"],
  });

  const getPresetStatus = (r: string) => {
    if (r === "admin") return null;
    const preset = r === "manager" ? presets?.manager : r === "deptHead" ? presets?.deptHead : presets?.user;
    if (!preset) return "미설정";
    const enabledCount = Object.values(preset).filter(Boolean).length;
    const totalCount = Object.keys(PERMISSION_LABELS).length;
    return `${enabledCount}/${totalCount}개 권한`;
  };

  const createUserMutation = useMutation({
    mutationFn: async (data: { username: string; password: string; name: string; department: string; role: string; position?: string }) => {
      return apiRequest("POST", "/api/users", data);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/users"] });
      setSuccessInfo({ username, password, name: name || username });
      setOpen(false);
    },
    onError: (error: any) => {
      toast({ 
        variant: "destructive", 
        title: "사용자 생성 실패", 
        description: error.message || "오류가 발생했습니다." 
      });
    },
  });

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!username || !password) {
      toast({ variant: "destructive", title: "아이디와 비밀번호는 필수입니다." });
      return;
    }
    createUserMutation.mutate({ username, password, name: name || username, department, role, position: position || undefined });
  };

  const handleCopyCredentials = () => {
    if (!successInfo) return;
    const text = `아이디: ${successInfo.username}\n초기 비밀번호: ${successInfo.password}`;
    navigator.clipboard.writeText(text);
    toast({ title: "복사되었습니다" });
  };

  const handleCloseSuccess = () => {
    setSuccessInfo(null);
    setUsername("");
    setPassword("");
    setName("");
    setDepartment("");
    setPosition("");
    setRole("user");
  };

  return (
    <>
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogTrigger asChild>
          <Button className="gap-2" data-testid="button-create-user">
            <Plus className="w-4 h-4" />
            사용자 추가
          </Button>
        </DialogTrigger>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>새 사용자 추가</DialogTitle>
            <DialogDescription>
              사용자에게 초기 비밀번호를 전달해주세요. 첫 로그인 시 비밀번호 변경이 필요합니다.
            </DialogDescription>
          </DialogHeader>
          <form onSubmit={handleSubmit} className="space-y-4">
            <div className="space-y-2">
              <label className="text-sm font-medium">부서명</label>
              <Input
                value={department}
                onChange={(e) => setDepartment(e.target.value)}
                placeholder="소속 부서"
                data-testid="input-new-department"
              />
            </div>
            <div className="space-y-2">
              <label className="text-sm font-medium">직위</label>
              <Input
                value={position}
                onChange={(e) => setPosition(e.target.value)}
                placeholder="직위 (예: 대리, 과장)"
                data-testid="input-new-position"
              />
            </div>
            <div className="space-y-2">
              <label className="text-sm font-medium">이름</label>
              <Input
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="사용자 이름"
                data-testid="input-new-name"
              />
            </div>
            <div className="space-y-2">
              <label className="text-sm font-medium">아이디 (ID)</label>
              <Input
                value={username}
                onChange={(e) => setUsername(e.target.value)}
                placeholder="로그인 아이디"
                data-testid="input-new-username"
              />
            </div>
            <div className="space-y-2">
              <label className="text-sm font-medium">초기 비밀번호 (PW)</label>
              <div className="relative">
                <Input
                  type={showPassword ? "text" : "password"}
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="초기 비밀번호"
                  className="pr-10"
                  data-testid="input-new-password"
                />
                <Button
                  type="button"
                  variant="ghost"
                  size="icon"
                  className="absolute right-0 top-0 h-full px-3"
                  onClick={() => setShowPassword(!showPassword)}
                >
                  {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                </Button>
              </div>
              <p className="text-xs text-amber-600 flex items-center gap-1">
                <AlertTriangle className="w-3 h-3" />
                사용자에게 이 비밀번호를 전달해주세요 (첫 로그인 시 변경 필수)
              </p>
            </div>
            <div className="space-y-2">
              <label className="text-sm font-medium">역할</label>
              <Select value={role} onValueChange={setRole}>
                <SelectTrigger data-testid="select-new-role">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="admin">관리자</SelectItem>
                  <SelectItem value="deptHead">부서장</SelectItem>
                  <SelectItem value="manager">담당자</SelectItem>
                  <SelectItem value="user">일반 사용자</SelectItem>
                </SelectContent>
              </Select>
              {role !== "admin" && (
                <div className="flex items-center gap-2 text-xs text-muted-foreground bg-muted/50 rounded-md px-3 py-2">
                  <Shield className="w-3.5 h-3.5" />
                  <span>
                    {role === "manager" ? "담당자" : role === "deptHead" ? "부서장" : "일반사용자"} 프리셋 권한 적용: {getPresetStatus(role) || ""}
                  </span>
                </div>
              )}
            </div>
            <Button 
              type="submit" 
              className="w-full" 
              disabled={createUserMutation.isPending}
              data-testid="button-submit-user"
            >
              {createUserMutation.isPending ? "생성 중..." : "사용자 생성"}
            </Button>
          </form>
        </DialogContent>
      </Dialog>

      <Dialog open={!!successInfo} onOpenChange={(open) => { if (!open) handleCloseSuccess(); }}>
        <DialogContent className="sm:max-w-sm">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Check className="w-5 h-5 text-green-600" />
              사용자 생성 완료
            </DialogTitle>
            <DialogDescription>
              아래 정보를 사용자에게 전달해주세요
            </DialogDescription>
          </DialogHeader>
          {successInfo && (
            <div className="space-y-3">
              <div className="rounded-lg border bg-muted/50 p-4 space-y-2">
                <div className="flex items-center justify-between">
                  <span className="text-sm text-muted-foreground">이름</span>
                  <span className="text-sm font-medium" data-testid="text-created-name">{successInfo.name}</span>
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-sm text-muted-foreground">아이디</span>
                  <span className="text-sm font-medium font-mono" data-testid="text-created-username">{successInfo.username}</span>
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-sm text-muted-foreground">초기 비밀번호</span>
                  <span className="text-sm font-medium font-mono" data-testid="text-created-password">{successInfo.password}</span>
                </div>
              </div>
              <p className="text-xs text-amber-600 flex items-center gap-1">
                <AlertTriangle className="w-3 h-3 shrink-0" />
                첫 로그인 시 비밀번호를 반드시 변경해야 합니다
              </p>
            </div>
          )}
          <DialogFooter className="gap-2">
            <Button variant="outline" size="sm" className="gap-1.5" onClick={handleCopyCredentials} data-testid="button-copy-credentials">
              <Copy className="w-3.5 h-3.5" />
              복사
            </Button>
            <Button size="sm" onClick={handleCloseSuccess} data-testid="button-close-success">
              확인
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}

function ResetPasswordDialog({ user, open, onClose }: { user: UserData | null; open: boolean; onClose: () => void }) {
  // 닫힘 애니메이션 중에도 콘텐츠 유지 — 즉시 null 반환 시 Radix 포커스 복원이 깨짐
  const lastUserRef = useRef<UserData | null>(null);
  if (user) lastUserRef.current = user;
  const displayUser = lastUserRef.current;

  const [newPassword, setNewPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [resetSuccess, setResetSuccess] = useState<string | null>(null);
  const { toast } = useToast();

  const resetMutation = useMutation({
    mutationFn: async ({ userId, newPassword }: { userId: string; newPassword: string }) => {
      return apiRequest("POST", "/api/auth/admin-reset-password", { userId, newPassword });
    },
    onSuccess: () => {
      setResetSuccess(newPassword);
    },
    onError: (error: any) => {
      // throwIfResNotOk가 "400: {"message":"..."}" 형태로 throw하므로 파싱
      let description = "오류가 발생했습니다.";
      try {
        const raw = error.message || "";
        const jsonPart = raw.replace(/^\d+:\s*/, "");
        const parsed = JSON.parse(jsonPart);
        description = parsed.message || description;
      } catch {
        description = error.message || description;
      }
      toast({ variant: "destructive", title: "비밀번호 초기화 실패", description });
    },
  });

  const validatePassword = (pw: string): string | null => {
    if (!pw) return "새 비밀번호를 입력해주세요";
    if (pw.length < 8) return "비밀번호는 8자 이상이어야 합니다";
    if (!/[A-Za-z]/.test(pw)) return "영문자가 포함되어야 합니다";
    if (!/[0-9]/.test(pw)) return "숫자가 포함되어야 합니다";
    if (!/[!@#$%^&*()_+\-=\[\]{};':"\\|,.<>\/?]/.test(pw)) return "특수문자가 포함되어야 합니다";
    return null;
  };

  const handleReset = () => {
    if (!displayUser) return;
    const err = validatePassword(newPassword);
    if (err) {
      toast({ variant: "destructive", title: err });
      return;
    }
    resetMutation.mutate({ userId: displayUser.id, newPassword });
  };

  const handleCopy = () => {
    if (!resetSuccess || !displayUser) return;
    navigator.clipboard.writeText(`아이디: ${displayUser.username}\n초기화된 비밀번호: ${resetSuccess}`);
    toast({ title: "복사되었습니다" });
  };

  const handleClose = () => {
    setNewPassword("");
    setShowPassword(false);
    setResetSuccess(null);
    onClose();
  };

  // user=null이어도 Dialog는 유지 — Radix가 닫힘 애니메이션·포커스 복원을 완료한 뒤 언마운트됨
  return (
    <Dialog open={open} onOpenChange={(o) => { if (!o) handleClose(); }}>
      <DialogContent className="sm:max-w-sm">
        {displayUser && (<>
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <KeyRound className="w-5 h-5 text-primary" />
            비밀번호 초기화
          </DialogTitle>
          <DialogDescription>
            {displayUser.name || displayUser.username}님의 비밀번호를 초기화합니다
          </DialogDescription>
        </DialogHeader>
        {resetSuccess ? (
          <div className="space-y-3">
            <div className="rounded-lg border bg-muted/50 p-4 space-y-2">
              <div className="flex items-center justify-between">
                <span className="text-sm text-muted-foreground">아이디</span>
                <span className="text-sm font-medium font-mono">{displayUser.username}</span>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-sm text-muted-foreground">초기화된 비밀번호</span>
                <span className="text-sm font-medium font-mono" data-testid="text-reset-password">{resetSuccess}</span>
              </div>
            </div>
            <p className="text-xs text-amber-600 flex items-center gap-1">
              <AlertTriangle className="w-3 h-3 shrink-0" />
              사용자에게 이 비밀번호를 전달해주세요 (로그인 시 변경 필수)
            </p>
            <DialogFooter className="gap-2">
              <Button variant="outline" size="sm" className="gap-1.5" onClick={handleCopy}>
                <Copy className="w-3.5 h-3.5" />
                복사
              </Button>
              <Button size="sm" onClick={handleClose}>확인</Button>
            </DialogFooter>
          </div>
        ) : (
          <div className="space-y-4">
            <div className="space-y-2">
              <label className="text-sm font-medium">새 비밀번호</label>
              <div className="relative">
                <Input
                  type={showPassword ? "text" : "password"}
                  value={newPassword}
                  onChange={(e) => setNewPassword(e.target.value)}
                  onKeyDown={(e) => { if (e.key === "Enter") handleReset(); }}
                  placeholder="새 비밀번호"
                  className="pr-10"
                  data-testid="input-reset-password"
                />
                <Button
                  type="button"
                  variant="ghost"
                  size="icon"
                  className="absolute right-0 top-0 h-full px-3"
                  onClick={() => setShowPassword(!showPassword)}
                >
                  {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                </Button>
              </div>
              {/* 비밀번호 강도 요건 표시 */}
              <div className="grid grid-cols-2 gap-x-3 gap-y-0.5">
                {[
                  { label: "8자 이상", ok: newPassword.length >= 8 },
                  { label: "영문 포함", ok: /[A-Za-z]/.test(newPassword) },
                  { label: "숫자 포함", ok: /[0-9]/.test(newPassword) },
                  { label: "특수문자 포함", ok: /[!@#$%^&*()_+\-=\[\]{};':"\\|,.<>\/?]/.test(newPassword) },
                ].map(({ label, ok }) => (
                  <p key={label} className={`text-xs flex items-center gap-1 ${ok ? "text-green-600 dark:text-green-400" : "text-muted-foreground"}`}>
                    <span>{ok ? "✓" : "○"}</span> {label}
                  </p>
                ))}
              </div>
              <p className="text-xs text-amber-600 dark:text-amber-400">
                사용자는 다음 로그인 시 비밀번호를 변경해야 합니다
              </p>
            </div>
            <DialogFooter className="gap-2">
              <Button variant="outline" onClick={handleClose}>취소</Button>
              <Button onClick={handleReset} disabled={resetMutation.isPending} data-testid="button-confirm-reset">
                {resetMutation.isPending ? "처리 중..." : "초기화"}
              </Button>
            </DialogFooter>
          </div>
        )}
        </>)}
      </DialogContent>
    </Dialog>
  );
}

// ===========================================================
// 조직도 관리 탭
// ===========================================================
interface DeptInfo { name: string; count: number; }

function OrgChartTab() {
  const { toast } = useToast();

  // 부서 목록
  const { data: depts, isLoading, refetch } = useQuery<DeptInfo[]>({
    queryKey: ["/api/departments"],
    staleTime: 0,
  });

  // 전체 사용자 (이동 대상 드롭다운에서 모든 부서 표시)
  const { data: allUsers } = useQuery<UserData[]>({ queryKey: ["/api/users"] });
  const allDeptNames = Array.from(new Set((allUsers || []).filter(u => !u.resignedAt && u.department).map(u => u.department!)));

  // 인라인 편집 상태
  const [editingName, setEditingName] = useState<string | null>(null);
  const [editValue, setEditValue] = useState("");

  // 삭제/이전 다이얼로그 상태
  const [deleteTarget, setDeleteTarget] = useState<DeptInfo | null>(null);
  const [moveTo, setMoveTo] = useState("");

  // 일괄 이동 다이얼로그 상태
  const [moveDialog, setMoveDialog] = useState<{ source: string; count: number } | null>(null);
  const [moveTarget, setMoveTarget] = useState("");

  // 새 부서 추가 상태
  const [showAddForm, setShowAddForm] = useState(false);
  const [newDeptName, setNewDeptName] = useState("");

  // 이름 변경 뮤테이션
  const renameMutation = useMutation({
    mutationFn: async ({ oldName, newName }: { oldName: string; newName: string }) => {
      return apiRequest("PUT", "/api/departments/rename", { oldName, newName });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/users"] });
      queryClient.invalidateQueries({ queryKey: ["/api/departments"] });
      setEditingName(null);
      toast({ title: "부서명이 변경되었습니다" });
    },
    onError: (error: any) => {
      let msg = "부서명 변경에 실패했습니다";
      try { const p = JSON.parse((error.message || "").replace(/^\d+:\s*/, "")); msg = p.message || msg; } catch {}
      toast({ variant: "destructive", title: msg });
    },
  });

  // 삭제/이전 뮤테이션
  const deleteMutation = useMutation({
    mutationFn: async ({ name, moveTo }: { name: string; moveTo?: string }) => {
      return apiRequest("DELETE", "/api/departments", { name, moveTo });
    },
    onSuccess: (_, vars) => {
      queryClient.invalidateQueries({ queryKey: ["/api/users"] });
      queryClient.invalidateQueries({ queryKey: ["/api/departments"] });
      setDeleteTarget(null);
      setMoveTo("");
      toast({ title: vars.moveTo ? "이전 및 삭제가 완료됐습니다" : "부서가 삭제됐습니다" });
    },
    onError: (error: any) => {
      let msg = "부서 삭제에 실패했습니다";
      try { const p = JSON.parse((error.message || "").replace(/^\d+:\s*/, "")); msg = p.message || msg; } catch {}
      toast({ variant: "destructive", title: msg });
    },
  });

  // 일괄 이동 (source → target, source 부서 삭제)
  const moveMutation = useMutation({
    mutationFn: async ({ source, target }: { source: string; target: string }) => {
      return apiRequest("DELETE", "/api/departments", { name: source, moveTo: target });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/users"] });
      queryClient.invalidateQueries({ queryKey: ["/api/departments"] });
      setMoveDialog(null);
      setMoveTarget("");
      toast({ title: "일괄 이동이 완료됐습니다" });
    },
    onError: (error: any) => {
      let msg = "이동에 실패했습니다";
      try { const p = JSON.parse((error.message || "").replace(/^\d+:\s*/, "")); msg = p.message || msg; } catch {}
      toast({ variant: "destructive", title: msg });
    },
  });

  const confirmRename = () => {
    if (editingName && editValue.trim() && editValue.trim() !== editingName) {
      renameMutation.mutate({ oldName: editingName, newName: editValue.trim() });
    } else {
      setEditingName(null);
    }
  };

  const handleDelete = () => {
    if (!deleteTarget) return;
    if (deleteTarget.count > 0 && !moveTo) {
      toast({ variant: "destructive", title: "이전 부서를 선택해주세요" });
      return;
    }
    deleteMutation.mutate({ name: deleteTarget.name, moveTo: moveTo || undefined });
  };

  return (
    <div className="space-y-4">
      {/* 헤더 */}
      <div className="flex items-center justify-between gap-2 flex-wrap">
        <div className="flex items-center gap-2">
          <div className="w-9 h-9 rounded-lg bg-blue-100 dark:bg-blue-900/40 flex items-center justify-center">
            <Network className="w-4 h-4 text-blue-600 dark:text-blue-400" />
          </div>
          <div>
            <h2 className="text-base font-semibold">조직도 관리</h2>
            <p className="text-xs text-muted-foreground">부서명 변경, 인원 이동, 부서 삭제를 일괄 처리합니다</p>
          </div>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" size="sm" className="gap-1.5" onClick={() => refetch()} disabled={isLoading}>
            <RefreshCw className={`w-3.5 h-3.5 ${isLoading ? "animate-spin" : ""}`} />
            새로고침
          </Button>
          <Button size="sm" className="gap-1.5" onClick={() => { setShowAddForm(true); setNewDeptName(""); }}>
            <FolderOpen className="w-3.5 h-3.5" />
            새 부서 추가
          </Button>
        </div>
      </div>

      {/* 새 부서 추가 폼 */}
      {showAddForm && (
        <Card className="border-dashed border-blue-300 dark:border-blue-700">
          <CardContent className="py-4">
            <p className="text-xs text-muted-foreground mb-3 flex items-center gap-1">
              <Network className="w-3 h-3" />
              새 부서명을 입력한 뒤, 기존 부서의 "일괄 이동" 으로 인원을 배정할 수 있습니다.
            </p>
            <div className="flex gap-2">
              <input
                autoFocus
                value={newDeptName}
                onChange={e => setNewDeptName(e.target.value)}
                onKeyDown={e => {
                  if (e.key === "Escape") { setShowAddForm(false); setNewDeptName(""); }
                  if (e.key === "Enter" && newDeptName.trim()) {
                    // 새 부서는 기존 부서 이름 변경으로 구현 (빈 부서는 별도 저장 불필요)
                    // 사용자에게 안내만 제공
                    toast({ title: `"${newDeptName.trim()}" 부서가 등록 준비됐습니다`, description: "이제 기존 부서에서 일괄 이동으로 인원을 배정하세요." });
                    setShowAddForm(false);
                    setNewDeptName("");
                  }
                }}
                className="flex-1 h-9 px-3 text-sm border rounded focus:outline-none focus:ring-2 focus:ring-ring bg-background"
                placeholder="새 부서명 (예: 신규팀)"
              />
              <Button size="sm" className="gap-1"
                onClick={() => {
                  if (!newDeptName.trim()) return;
                  toast({ title: `"${newDeptName.trim()}" 부서가 등록 준비됐습니다`, description: "이제 기존 부서에서 일괄 이동으로 인원을 배정하세요." });
                  setShowAddForm(false);
                  setNewDeptName("");
                }}>
                <Check className="w-3.5 h-3.5" />확인
              </Button>
              <Button variant="ghost" size="sm" onClick={() => { setShowAddForm(false); setNewDeptName(""); }}>
                <X className="w-3.5 h-3.5" />
              </Button>
            </div>
          </CardContent>
        </Card>
      )}

      {/* 부서 목록 */}
      {isLoading ? (
        <div className="py-12 text-center text-muted-foreground text-sm">로딩 중...</div>
      ) : !depts?.length ? (
        <div className="py-12 text-center text-muted-foreground text-sm">
          <Network className="w-8 h-8 mx-auto mb-2 opacity-30" />
          등록된 부서가 없습니다
        </div>
      ) : (
        <div className="space-y-1.5">
          {depts.map((dept) => (
            <Card key={dept.name} className="overflow-hidden">
              <div className="flex items-center gap-3 px-4 py-3 group">
                {/* 아이콘 */}
                <div className="flex items-center justify-center w-8 h-8 rounded-lg bg-blue-100 dark:bg-blue-900/40 shrink-0">
                  <Folder className="w-4 h-4 text-blue-600 dark:text-blue-400" />
                </div>

                {/* 이름 (인라인 편집 모드) */}
                {editingName === dept.name ? (
                  <div className="flex-1 flex items-center gap-2 min-w-0">
                    <input
                      autoFocus
                      value={editValue}
                      onChange={e => setEditValue(e.target.value)}
                      onKeyDown={e => {
                        if (e.key === "Enter") confirmRename();
                        if (e.key === "Escape") setEditingName(null);
                      }}
                      className="flex-1 h-8 px-2 text-sm border rounded focus:outline-none focus:ring-2 focus:ring-ring bg-background min-w-0"
                    />
                    <Button type="button" size="sm" variant="default" className="h-7 px-2 shrink-0"
                      onClick={confirmRename} disabled={renameMutation.isPending}>
                      <Check className="w-3.5 h-3.5" />
                    </Button>
                    <Button type="button" size="sm" variant="ghost" className="h-7 px-2 shrink-0"
                      onClick={() => setEditingName(null)} disabled={renameMutation.isPending}>
                      <X className="w-3.5 h-3.5" />
                    </Button>
                  </div>
                ) : (
                  <div className="flex-1 min-w-0">
                    <p className="font-semibold text-sm truncate">{dept.name}</p>
                    <p className="text-xs text-muted-foreground">{dept.count}명 소속</p>
                  </div>
                )}

                {/* 액션 버튼 (편집 중이 아닐 때만 표시) */}
                {editingName !== dept.name && (
                  <div className="flex items-center gap-1.5 shrink-0">
                    {/* 이름 변경 */}
                    <Button variant="outline" size="sm" className="h-7 px-2 gap-1 text-xs"
                      onClick={() => { setEditingName(dept.name); setEditValue(dept.name); }}
                      title="부서명 변경">
                      <Pencil className="w-3 h-3" />
                      이름변경
                    </Button>
                    {/* 일괄 이동 */}
                    <Button variant="outline" size="sm" className="h-7 px-2 gap-1 text-xs"
                      onClick={() => { setMoveDialog({ source: dept.name, count: dept.count }); setMoveTarget(""); }}
                      title="인원 일괄 이동"
                      disabled={dept.count === 0}>
                      <ArrowRightLeft className="w-3 h-3" />
                      일괄이동
                    </Button>
                    {/* 삭제 */}
                    <Button variant="outline" size="sm"
                      className="h-7 px-2 gap-1 text-xs text-destructive border-destructive/30 hover:bg-destructive/10"
                      onClick={() => { setDeleteTarget(dept); setMoveTo(""); }}
                      title="부서 삭제">
                      <Trash2 className="w-3 h-3" />
                      삭제
                    </Button>
                  </div>
                )}
              </div>
            </Card>
          ))}
        </div>
      )}

      {/* 부서 삭제 다이얼로그 */}
      <Dialog open={!!deleteTarget} onOpenChange={(o) => { if (!o) { setDeleteTarget(null); setMoveTo(""); } }}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Trash2 className="w-4 h-4 text-destructive" />
              부서 삭제
            </DialogTitle>
            <DialogDescription>
              {deleteTarget && deleteTarget.count > 0 ? (
                <>
                  <span className="font-semibold text-foreground">"{deleteTarget.name}"</span> 부서에{" "}
                  <span className="font-semibold text-destructive">{deleteTarget.count}명</span>이 소속돼 있습니다.
                  삭제 전 이전 부서를 선택해주세요.
                </>
              ) : (
                <>
                  <span className="font-semibold text-foreground">"{deleteTarget?.name}"</span> 부서를 삭제합니다. 이 작업은 되돌릴 수 없습니다.
                </>
              )}
            </DialogDescription>
          </DialogHeader>
          {deleteTarget && deleteTarget.count > 0 && (
            <div className="space-y-2 mt-2">
              <label className="text-sm font-medium">이전 부서 선택</label>
              <select
                value={moveTo}
                onChange={e => setMoveTo(e.target.value)}
                className="w-full h-9 px-3 text-sm border rounded focus:outline-none focus:ring-2 focus:ring-ring bg-background"
              >
                <option value="">-- 부서 선택 --</option>
                {(depts || []).filter(d => d.name !== deleteTarget.name).map(d => (
                  <option key={d.name} value={d.name}>{d.name} ({d.count}명)</option>
                ))}
              </select>
            </div>
          )}
          <DialogFooter className="gap-2 mt-2">
            <Button variant="outline" size="sm" onClick={() => { setDeleteTarget(null); setMoveTo(""); }}
              disabled={deleteMutation.isPending}>
              취소
            </Button>
            <Button variant="destructive" size="sm"
              onClick={handleDelete}
              disabled={deleteMutation.isPending || (!!deleteTarget && deleteTarget.count > 0 && !moveTo)}>
              {deleteMutation.isPending ? "처리 중..." : deleteTarget?.count && deleteTarget.count > 0 ? "이전 후 삭제" : "삭제"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* 일괄 이동 다이얼로그 */}
      <Dialog open={!!moveDialog} onOpenChange={(o) => { if (!o) { setMoveDialog(null); setMoveTarget(""); } }}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <ArrowRightLeft className="w-4 h-4 text-blue-600" />
              인원 일괄 이동
            </DialogTitle>
            <DialogDescription>
              {moveDialog && (
                <>
                  <span className="font-semibold text-foreground">"{moveDialog.source}"</span> 부서{" "}
                  <span className="font-semibold text-primary">{moveDialog.count}명</span> 전원을
                  다른 부서로 이동합니다.
                  <br />
                  <span className="text-amber-600 text-xs">※ 이동 후 원래 부서는 자동으로 삭제됩니다.</span>
                </>
              )}
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-2 mt-2">
            <label className="text-sm font-medium">이동 대상 부서</label>
            <select
              value={moveTarget}
              onChange={e => setMoveTarget(e.target.value)}
              className="w-full h-9 px-3 text-sm border rounded focus:outline-none focus:ring-2 focus:ring-ring bg-background"
            >
              <option value="">-- 부서 선택 --</option>
              {(depts || []).filter(d => d.name !== moveDialog?.source).map(d => (
                <option key={d.name} value={d.name}>{d.name} ({d.count}명)</option>
              ))}
              {/* 새 부서 이름을 직접 입력하려면 텍스트 입력 옵션 표시 */}
            </select>
            <p className="text-xs text-muted-foreground">목록에 없으면 직접 입력도 가능합니다:</p>
            <input
              value={moveTarget}
              onChange={e => setMoveTarget(e.target.value)}
              className="w-full h-9 px-3 text-sm border rounded focus:outline-none focus:ring-2 focus:ring-ring bg-background"
              placeholder="부서명 직접 입력..."
            />
          </div>
          <DialogFooter className="gap-2 mt-2">
            <Button variant="outline" size="sm" onClick={() => { setMoveDialog(null); setMoveTarget(""); }}
              disabled={moveMutation.isPending}>
              취소
            </Button>
            <Button size="sm"
              onClick={() => moveDialog && moveTarget.trim() && moveMutation.mutate({ source: moveDialog.source, target: moveTarget.trim() })}
              disabled={moveMutation.isPending || !moveTarget.trim()}>
              {moveMutation.isPending ? "이동 중..." : "일괄 이동"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
