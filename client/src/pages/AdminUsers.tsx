import { useState, useRef, useEffect } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { queryClient, apiRequest } from "@/lib/queryClient";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import { useToast } from "@/hooks/use-toast";
import { useAuth } from "@/hooks/use-auth";
import { 
  Shield, 
  ShieldOff, 
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
  Check,
  X,
  Save,
  KeyRound,
  Copy,
  AlertTriangle
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
import { getRoleLabel, getRoleVariant, PERMISSION_LABELS } from "@/hooks/use-permissions";
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
}

interface RolePresets {
  user: UserPermissions | null;
  manager: UserPermissions | null;
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
  const [presetTab, setPresetTab] = useState<"user" | "manager">("user");
  const [showPresetSection, setShowPresetSection] = useState(false);

  const { data: users, isLoading } = useQuery<UserData[]>({
    queryKey: ["/api/users"],
    enabled: isAdmin,
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
    const preset = user.role === "manager" ? presets?.manager : presets?.user;
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
      <div className="mb-6">
        <Link href="/">
          <Button variant="ghost" size="sm" className="gap-2 mb-4" data-testid="button-back">
            <ArrowLeft className="w-4 h-4" />
            대시보드로 돌아가기
          </Button>
        </Link>
        <div className="flex items-center justify-between flex-wrap gap-3">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-primary/10 flex items-center justify-center">
              <Users className="w-5 h-5 text-primary" />
            </div>
            <div>
              <h1 className="text-2xl font-bold">사용자 관리</h1>
              <p className="text-sm text-muted-foreground">사용자 계정 및 기능별 권한을 관리합니다</p>
            </div>
          </div>
          <div className="flex gap-2 flex-wrap">
            <Button 
              variant="outline" 
              className="gap-2" 
              onClick={() => setShowPresetSection(!showPresetSection)}
              data-testid="button-toggle-presets"
            >
              <Shield className="w-4 h-4" />
              권한 프리셋 설정
              {showPresetSection ? <ChevronUp className="w-3.5 h-3.5" /> : <ChevronDown className="w-3.5 h-3.5" />}
            </Button>
            <ExcelUploadDialog />
            <CreateUserDialog />
          </div>
        </div>
      </div>

      {showPresetSection && (
        <RolePresetManager
          presets={presets || { user: null, manager: null }}
          activeTab={presetTab}
          onTabChange={setPresetTab}
        />
      )}

      <Card>
        <CardHeader className="flex flex-row items-center justify-between gap-2">
          <CardTitle className="text-lg">등록된 사용자 ({users?.length || 0}명)</CardTitle>
        </CardHeader>
        <CardContent>
          {isLoading ? (
            <div className="py-8 text-center text-muted-foreground">로딩 중...</div>
          ) : !users || users.length === 0 ? (
            <div className="py-8 text-center text-muted-foreground">등록된 사용자가 없습니다.</div>
          ) : (
            <div className="space-y-2">
              {users.map((user) => {
                const isExpanded = expandedUser === user.id;
                const isCurrentUser = user.id === currentUser?.id;
                const isUserAdmin = user.role === "admin";
                const userPerms = user.permissions || DEFAULT_PERMISSIONS;

                return (
                  <div
                    key={user.id}
                    className="rounded-lg border bg-card overflow-visible"
                    data-testid={`user-row-${user.id}`}
                  >
                    <div className="flex items-center justify-between p-4">
                      <div className="flex items-center gap-3">
                        <Avatar className="h-10 w-10">
                          <AvatarFallback className="bg-primary/10 text-primary">
                            {(user.name?.[0] || user.username?.[0] || "U").toUpperCase()}
                          </AvatarFallback>
                        </Avatar>
                        <div>
                          <p className="font-medium">
                            {user.name || user.username}
                            {isCurrentUser && (
                              <span className="ml-2 text-xs text-muted-foreground">(나)</span>
                            )}
                          </p>
                          <div className="flex items-center gap-2 text-sm text-muted-foreground flex-wrap">
                            <span>@{user.username}</span>
                            {user.department && (
                              <span className="flex items-center gap-1">
                                <Building2 className="w-3 h-3" />
                                {user.department}
                              </span>
                            )}
                          </div>
                        </div>
                      </div>
                      <div className="flex items-center gap-2 flex-wrap justify-end">
                        <Badge variant={getRoleVariant(user.role)}>
                          {getRoleLabel(user.role)}
                        </Badge>
                        {!isCurrentUser && (
                          <>
                            <Select
                              value={user.role}
                              onValueChange={(newRole) =>
                                updateRoleMutation.mutate({ userId: user.id, role: newRole })
                              }
                              disabled={updateRoleMutation.isPending}
                            >
                              <SelectTrigger className="w-[120px] h-8" data-testid={`select-role-${user.id}`}>
                                <SelectValue />
                              </SelectTrigger>
                              <SelectContent>
                                <SelectItem value="admin">관리자</SelectItem>
                                <SelectItem value="manager">담당자</SelectItem>
                                <SelectItem value="user">일반 사용자</SelectItem>
                              </SelectContent>
                            </Select>
                            {!isUserAdmin && (
                              <Button
                                variant="outline"
                                size="sm"
                                className="gap-1.5"
                                onClick={() => setExpandedUser(isExpanded ? null : user.id)}
                                data-testid={`button-permissions-${user.id}`}
                              >
                                <Settings className="w-3.5 h-3.5" />
                                <span className="hidden sm:inline">권한설정</span>
                                {isExpanded ? <ChevronUp className="w-3.5 h-3.5" /> : <ChevronDown className="w-3.5 h-3.5" />}
                              </Button>
                            )}
                            <ResetPasswordDialog user={user} />
                            <Button
                              variant="ghost"
                              size="icon"
                              className="text-destructive hover:text-destructive"
                              onClick={() => {
                                if (confirm("정말로 이 사용자를 삭제하시겠습니까?")) {
                                  deleteUserMutation.mutate(user.id);
                                }
                              }}
                              disabled={deleteUserMutation.isPending}
                              data-testid={`button-delete-${user.id}`}
                            >
                              <Trash2 className="w-4 h-4" />
                            </Button>
                          </>
                        )}
                      </div>
                    </div>

                    {isExpanded && !isUserAdmin && (
                      <div className="border-t bg-muted/30 p-4">
                        <div className="flex items-center justify-between mb-3 flex-wrap gap-2">
                          <h4 className="text-sm font-semibold flex items-center gap-2">
                            <Shield className="w-4 h-4 text-primary" />
                            기능별 권한 설정
                          </h4>
                          <div className="flex gap-2 flex-wrap">
                            <Button
                              variant="outline"
                              size="sm"
                              className="gap-1 text-xs"
                              onClick={() => applyPresetToUser(user)}
                              disabled={updatePermissionsMutation.isPending}
                              data-testid={`button-apply-preset-${user.id}`}
                            >
                              <Shield className="w-3 h-3" />
                              프리셋 적용
                            </Button>
                            <Button
                              variant="outline"
                              size="sm"
                              className="gap-1 text-xs"
                              onClick={() => setAllPermissions(user, true)}
                              disabled={updatePermissionsMutation.isPending}
                            >
                              <Check className="w-3 h-3" />
                              전체 허용
                            </Button>
                            <Button
                              variant="outline"
                              size="sm"
                              className="gap-1 text-xs"
                              onClick={() => setAllPermissions(user, false)}
                              disabled={updatePermissionsMutation.isPending}
                            >
                              <X className="w-3 h-3" />
                              전체 해제
                            </Button>
                          </div>
                        </div>
                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                          {(Object.keys(PERMISSION_LABELS) as Array<keyof UserPermissions>).map((permKey) => (
                            <div
                              key={permKey}
                              className="flex items-center justify-between py-2 px-3 rounded-md bg-background border"
                            >
                              <span className="text-sm">{PERMISSION_LABELS[permKey]}</span>
                              <Switch
                                checked={!!userPerms[permKey]}
                                onCheckedChange={() => togglePermission(user, permKey)}
                                disabled={updatePermissionsMutation.isPending}
                                data-testid={`switch-perm-${permKey}-${user.id}`}
                              />
                            </div>
                          ))}
                        </div>
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

function RolePresetManager({ 
  presets, 
  activeTab, 
  onTabChange 
}: { 
  presets: RolePresets; 
  activeTab: "user" | "manager"; 
  onTabChange: (tab: "user" | "manager") => void;
}) {
  const { toast } = useToast();
  const currentPreset = activeTab === "user" ? presets.user : presets.manager;
  const [localPerms, setLocalPerms] = useState<UserPermissions>(currentPreset || DEFAULT_PERMISSIONS);
  const [hasChanges, setHasChanges] = useState(false);

  useEffect(() => {
    const preset = activeTab === "user" ? presets.user : presets.manager;
    setLocalPerms(preset || DEFAULT_PERMISSIONS);
    setHasChanges(false);
  }, [presets.user, presets.manager, activeTab]);

  const handleTabChange = (tab: "user" | "manager") => {
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
      toast({ title: `${activeTab === "user" ? "일반사용자" : "담당자"} 권한 프리셋이 저장되었습니다.` });
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
        <div className="flex gap-2 mb-4">
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
            {activeTab === "user" ? "일반사용자" : "담당자"}로 등록되는 사용자에게 기본 적용될 권한을 설정합니다
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

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 mb-4">
          {(Object.keys(PERMISSION_LABELS) as Array<keyof UserPermissions>).map((permKey) => (
            <div
              key={permKey}
              className="flex items-center justify-between py-2 px-3 rounded-md bg-muted/50 border"
            >
              <span className="text-sm">{PERMISSION_LABELS[permKey]}</span>
              <Switch
                checked={!!localPerms[permKey]}
                onCheckedChange={() => toggleLocalPerm(permKey)}
                data-testid={`switch-preset-${permKey}-${activeTab}`}
              />
            </div>
          ))}
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
    const csvContent = "부서명,이름,아이디,비밀번호\n네트워크팀,홍길동,hong123,password123\n안전관리팀,김철수,kim456,password456";
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
  const [role, setRole] = useState("user");
  const [showPassword, setShowPassword] = useState(false);
  const [successInfo, setSuccessInfo] = useState<{ username: string; password: string; name: string } | null>(null);
  const { toast } = useToast();

  const { data: presets } = useQuery<RolePresets>({
    queryKey: ["/api/settings/role-presets"],
  });

  const getPresetStatus = (r: string) => {
    if (r === "admin") return null;
    const preset = r === "manager" ? presets?.manager : presets?.user;
    if (!preset) return "미설정";
    const enabledCount = Object.values(preset).filter(Boolean).length;
    const totalCount = Object.keys(PERMISSION_LABELS).length;
    return `${enabledCount}/${totalCount}개 권한`;
  };

  const createUserMutation = useMutation({
    mutationFn: async (data: { username: string; password: string; name: string; department: string; role: string }) => {
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
    createUserMutation.mutate({ username, password, name: name || username, department, role });
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
                  <SelectItem value="manager">담당자</SelectItem>
                  <SelectItem value="user">일반 사용자</SelectItem>
                </SelectContent>
              </Select>
              {role !== "admin" && (
                <div className="flex items-center gap-2 text-xs text-muted-foreground bg-muted/50 rounded-md px-3 py-2">
                  <Shield className="w-3.5 h-3.5" />
                  <span>
                    {role === "manager" ? "담당자" : "일반사용자"} 프리셋 권한 적용: {getPresetStatus(role) || ""}
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

function ResetPasswordDialog({ user }: { user: UserData }) {
  const [open, setOpen] = useState(false);
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
      toast({ variant: "destructive", title: "비밀번호 초기화 실패", description: error.message || "오류가 발생했습니다." });
    },
  });

  const handleReset = () => {
    if (!newPassword) {
      toast({ variant: "destructive", title: "새 비밀번호를 입력해주세요" });
      return;
    }
    if (newPassword.length < 4) {
      toast({ variant: "destructive", title: "비밀번호는 4자 이상이어야 합니다" });
      return;
    }
    resetMutation.mutate({ userId: user.id, newPassword });
  };

  const handleCopy = () => {
    if (!resetSuccess) return;
    navigator.clipboard.writeText(`아이디: ${user.username}\n초기화된 비밀번호: ${resetSuccess}`);
    toast({ title: "복사되었습니다" });
  };

  const handleClose = () => {
    setOpen(false);
    setNewPassword("");
    setShowPassword(false);
    setResetSuccess(null);
  };

  return (
    <Dialog open={open} onOpenChange={(o) => { if (!o) handleClose(); else setOpen(true); }}>
      <DialogTrigger asChild>
        <Button variant="outline" size="icon" className="h-8 w-8" title="비밀번호 초기화" data-testid={`button-reset-pw-${user.id}`}>
          <KeyRound className="w-3.5 h-3.5" />
        </Button>
      </DialogTrigger>
      <DialogContent className="sm:max-w-sm">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <KeyRound className="w-5 h-5 text-primary" />
            비밀번호 초기화
          </DialogTitle>
          <DialogDescription>
            {user.name || user.username}님의 비밀번호를 초기화합니다
          </DialogDescription>
        </DialogHeader>
        {resetSuccess ? (
          <div className="space-y-3">
            <div className="rounded-lg border bg-muted/50 p-4 space-y-2">
              <div className="flex items-center justify-between">
                <span className="text-sm text-muted-foreground">아이디</span>
                <span className="text-sm font-medium font-mono">{user.username}</span>
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
                  placeholder="새 비밀번호 (4자 이상)"
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
              <p className="text-xs text-muted-foreground">
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
      </DialogContent>
    </Dialog>
  );
}
