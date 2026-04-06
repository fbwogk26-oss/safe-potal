import { useState, useEffect } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { queryClient, apiRequest } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
import {
  Shield, ShieldCheck, Users, Save, Check, X, RefreshCw, AlertTriangle, Info
} from "lucide-react";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription
} from "@/components/ui/dialog";
import { PERMISSION_LABELS, PERMISSION_CATEGORIES } from "@/hooks/use-permissions";
import type { UserPermissions } from "@shared/models/auth";
import { DEFAULT_PERMISSIONS, ALL_PERMISSIONS } from "@shared/models/auth";

type RoleKey = "user" | "manager" | "deptHead";

interface RolePresets {
  user: UserPermissions | null;
  manager: UserPermissions | null;
  deptHead: UserPermissions | null;
}

const ROLES: { key: RoleKey; label: string; color: string; bg: string; description: string }[] = [
  {
    key: "user",
    label: "일반사용자",
    color: "text-slate-600",
    bg: "bg-slate-100 dark:bg-slate-800",
    description: "기본 조회 권한을 가진 일반 사용자",
  },
  {
    key: "manager",
    label: "담당자",
    color: "text-blue-600",
    bg: "bg-blue-50 dark:bg-blue-950",
    description: "담당 업무의 등록·수정 권한을 가진 담당자",
  },
  {
    key: "deptHead",
    label: "부서장",
    color: "text-violet-600",
    bg: "bg-violet-50 dark:bg-violet-950",
    description: "부서 전반의 관리 권한을 가진 부서장",
  },
];

export default function PermissionManagement() {
  const { toast } = useToast();
  const [activeRole, setActiveRole] = useState<RoleKey>("user");
  const [localPerms, setLocalPerms] = useState<UserPermissions>({ ...DEFAULT_PERMISSIONS });
  const [hasChanges, setHasChanges] = useState(false);
  const [applyConfirmOpen, setApplyConfirmOpen] = useState(false);

  const { data: presets, isLoading: presetsLoading } = useQuery<RolePresets>({
    queryKey: ["/api/settings/role-presets"],
  });

  const { data: userCounts } = useQuery<Record<string, number>>({
    queryKey: ["/api/settings/role-user-counts"],
  });

  useEffect(() => {
    if (!presets) return;
    const preset = presets[activeRole];
    setLocalPerms(preset ? { ...DEFAULT_PERMISSIONS, ...preset } : { ...DEFAULT_PERMISSIONS });
    setHasChanges(false);
  }, [presets, activeRole]);

  const savePresetMutation = useMutation({
    mutationFn: async () => {
      return apiRequest("POST", "/api/settings/role-presets", {
        role: activeRole,
        permissions: localPerms,
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/settings/role-presets"] });
      setHasChanges(false);
      const label = ROLES.find(r => r.key === activeRole)?.label || activeRole;
      toast({ title: `${label} 권한 프리셋이 저장되었습니다.` });
    },
    onError: () => {
      toast({ variant: "destructive", title: "저장에 실패했습니다." });
    },
  });

  const applyAllMutation = useMutation({
    mutationFn: async () => {
      return apiRequest("POST", "/api/settings/role-presets/apply-all", { role: activeRole });
    },
    onSuccess: (data: any) => {
      queryClient.invalidateQueries({ queryKey: ["/api/users"] });
      queryClient.invalidateQueries({ queryKey: ["/api/auth/permissions"] });
      setApplyConfirmOpen(false);
      const label = ROLES.find(r => r.key === activeRole)?.label || activeRole;
      toast({
        title: "일괄 적용 완료",
        description: `${data.appliedCount}명의 ${label} 사용자에게 권한이 적용되었습니다.`,
      });
    },
    onError: (err: any) => {
      setApplyConfirmOpen(false);
      toast({ variant: "destructive", title: "일괄 적용 실패", description: err.message });
    },
  });

  const togglePerm = (key: keyof UserPermissions) => {
    setLocalPerms(prev => ({ ...prev, [key]: !prev[key] }));
    setHasChanges(true);
  };

  const setAllPerms = (enabled: boolean) => {
    setLocalPerms(enabled ? { ...ALL_PERMISSIONS } : { ...DEFAULT_PERMISSIONS });
    setHasChanges(true);
  };

  const setCategoryPerms = (keys: (keyof UserPermissions)[], enabled: boolean) => {
    setLocalPerms(prev => {
      const next = { ...prev };
      keys.forEach(k => { next[k] = enabled; });
      return next;
    });
    setHasChanges(true);
  };

  const activeRoleInfo = ROLES.find(r => r.key === activeRole)!;
  const savedPreset = presets?.[activeRole];
  const enabledCount = Object.values(localPerms).filter(Boolean).length;
  const totalCount = Object.keys(DEFAULT_PERMISSIONS).length;

  return (
    <div className="flex flex-col gap-6 p-6 max-w-5xl mx-auto">
      {/* 헤더 */}
      <div className="flex items-start gap-3">
        <div className="p-2 rounded-lg bg-primary/10 shrink-0">
          <Shield className="w-6 h-6 text-primary" />
        </div>
        <div className="flex-1">
          <h1 className="text-xl font-bold text-foreground">메뉴 권한 관리</h1>
          <p className="text-sm text-muted-foreground mt-0.5">
            역할별 기본 권한(프리셋)을 설정하고, 해당 역할의 전체 사용자에 일괄 적용할 수 있습니다.
          </p>
        </div>
      </div>

      {/* 역할 탭 */}
      <div className="grid grid-cols-1 sm:grid-cols-4 gap-3">
        {/* 관리자 카드 (읽기 전용) */}
        <button
          className={`rounded-xl border-2 p-4 text-left transition-all cursor-default opacity-70`}
          disabled
        >
          <div className="flex items-center gap-2 mb-1">
            <ShieldCheck className="w-4 h-4 text-amber-600" />
            <span className="font-semibold text-sm text-amber-700 dark:text-amber-400">관리자</span>
          </div>
          <p className="text-[11px] text-muted-foreground">전체 권한 고정</p>
          <div className="mt-2 flex items-center gap-1.5">
            <Badge variant="outline" className="text-[10px] px-1.5 py-0">
              {userCounts?.admin ?? "-"}명
            </Badge>
          </div>
        </button>

        {ROLES.map(role => {
          const isActive = activeRole === role.key;
          const hasPreset = !!presets?.[role.key];
          return (
            <button
              key={role.key}
              onClick={() => {
                if (hasChanges && !confirm("저장하지 않은 변경이 있습니다. 계속하시겠습니까?")) return;
                setActiveRole(role.key);
              }}
              className={`rounded-xl border-2 p-4 text-left transition-all ${
                isActive
                  ? "border-primary bg-primary/5 shadow-sm"
                  : "border-border hover:border-primary/40 hover:bg-muted/30"
              }`}
              data-testid={`tab-role-${role.key}`}
            >
              <div className="flex items-center gap-2 mb-1">
                <Users className={`w-4 h-4 ${isActive ? "text-primary" : "text-muted-foreground"}`} />
                <span className={`font-semibold text-sm ${isActive ? "text-primary" : "text-foreground"}`}>
                  {role.label}
                </span>
              </div>
              <p className="text-[11px] text-muted-foreground line-clamp-1">{role.description}</p>
              <div className="mt-2 flex items-center gap-1.5 flex-wrap">
                <Badge variant="outline" className="text-[10px] px-1.5 py-0">
                  {userCounts?.[role.key] ?? "-"}명
                </Badge>
                {hasPreset && (
                  <Badge className="text-[10px] px-1.5 py-0 bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400 border-0">
                    설정됨
                  </Badge>
                )}
              </div>
            </button>
          );
        })}
      </div>

      {/* 권한 설정 영역 */}
      <Card>
        <CardHeader className="pb-3">
          <div className="flex items-center justify-between flex-wrap gap-3">
            <div className="flex items-center gap-2">
              <div className={`w-8 h-8 rounded-lg ${activeRoleInfo.bg} flex items-center justify-center`}>
                <Users className={`w-4 h-4 ${activeRoleInfo.color}`} />
              </div>
              <div>
                <CardTitle className="text-base">{activeRoleInfo.label} 권한 설정</CardTitle>
                <p className="text-xs text-muted-foreground mt-0.5">
                  {enabledCount} / {totalCount}개 권한 활성화
                  {hasChanges && <span className="ml-2 text-orange-500 font-medium">· 미저장</span>}
                </p>
              </div>
            </div>
            <div className="flex gap-2 flex-wrap">
              <Button
                variant="outline"
                size="sm"
                className="gap-1.5 text-xs h-8"
                onClick={() => setAllPerms(true)}
              >
                <Check className="w-3 h-3" />
                전체 허용
              </Button>
              <Button
                variant="outline"
                size="sm"
                className="gap-1.5 text-xs h-8"
                onClick={() => setAllPerms(false)}
              >
                <X className="w-3 h-3" />
                전체 해제
              </Button>
            </div>
          </div>
        </CardHeader>
        <CardContent className="flex flex-col gap-4">
          {presetsLoading ? (
            <div className="py-12 text-center text-muted-foreground text-sm">불러오는 중...</div>
          ) : (
            PERMISSION_CATEGORIES.map((cat) => {
              const catEnabled = cat.keys.filter(k => !!localPerms[k]).length;
              const catTotal = cat.keys.length;
              const allOn = catEnabled === catTotal;
              const allOff = catEnabled === 0;
              return (
                <div key={cat.label} className="border rounded-xl overflow-hidden">
                  <div className="flex items-center justify-between px-4 py-2.5 bg-muted/40 border-b">
                    <div className="flex items-center gap-2">
                      <span className="text-sm font-semibold">{cat.label}</span>
                      <Badge variant="outline" className="text-[10px] px-1.5 py-0">
                        {catEnabled}/{catTotal}
                      </Badge>
                    </div>
                    <div className="flex gap-1">
                      <Button
                        variant="ghost"
                        size="sm"
                        className={`h-6 text-[10px] px-2 ${allOn ? "text-primary font-semibold" : ""}`}
                        onClick={() => setCategoryPerms(cat.keys, true)}
                      >
                        전체
                      </Button>
                      <Button
                        variant="ghost"
                        size="sm"
                        className={`h-6 text-[10px] px-2 ${allOff ? "text-muted-foreground font-semibold" : ""}`}
                        onClick={() => setCategoryPerms(cat.keys, false)}
                      >
                        해제
                      </Button>
                    </div>
                  </div>
                  <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-1 p-2">
                    {cat.keys.map((permKey) => {
                      const isOn = !!localPerms[permKey];
                      return (
                        <div
                          key={permKey}
                          className={`flex items-center justify-between py-2 px-3 rounded-lg border text-sm transition-colors cursor-pointer ${
                            isOn
                              ? "bg-primary/5 border-primary/20"
                              : "bg-background border-border hover:bg-muted/30"
                          }`}
                          onClick={() => togglePerm(permKey)}
                          data-testid={`perm-${permKey}`}
                        >
                          <span className={`text-xs ${isOn ? "text-foreground font-medium" : "text-muted-foreground"}`}>
                            {PERMISSION_LABELS[permKey]}
                          </span>
                          <Switch
                            checked={isOn}
                            onCheckedChange={() => togglePerm(permKey)}
                            className="ml-2 pointer-events-none"
                            data-testid={`switch-${permKey}`}
                          />
                        </div>
                      );
                    })}
                  </div>
                </div>
              );
            })
          )}

          {/* 저장 + 일괄 적용 */}
          <div className="flex flex-col sm:flex-row gap-3 pt-2 border-t">
            <Button
              className="flex-1 gap-2 bg-primary hover:bg-primary/90"
              onClick={() => savePresetMutation.mutate()}
              disabled={savePresetMutation.isPending || !hasChanges}
              data-testid="button-save-preset"
            >
              <Save className="w-4 h-4" />
              {savePresetMutation.isPending
                ? "저장 중..."
                : hasChanges
                  ? `${activeRoleInfo.label} 프리셋 저장`
                  : "저장됨"}
            </Button>
            <Button
              variant="outline"
              className="flex-1 gap-2 border-orange-300 text-orange-700 hover:bg-orange-50 dark:border-orange-700 dark:text-orange-400 dark:hover:bg-orange-950/30"
              onClick={() => setApplyConfirmOpen(true)}
              disabled={!savedPreset || applyAllMutation.isPending}
              data-testid="button-apply-all"
            >
              <RefreshCw className="w-4 h-4" />
              {activeRoleInfo.label} 전체 사용자에 일괄 적용
              {userCounts?.[activeRole] !== undefined && (
                <Badge variant="outline" className="ml-1 text-[10px] px-1.5">
                  {userCounts[activeRole]}명
                </Badge>
              )}
            </Button>
          </div>

          {!savedPreset && (
            <div className="flex items-start gap-2 rounded-lg border border-blue-200 dark:border-blue-800 bg-blue-50 dark:bg-blue-950/30 px-4 py-3">
              <Info className="w-4 h-4 text-blue-500 mt-0.5 shrink-0" />
              <p className="text-xs text-blue-700 dark:text-blue-300">
                아직 저장된 프리셋이 없습니다. 권한을 설정한 후 먼저 저장하면, 일괄 적용 버튼이 활성화됩니다.
              </p>
            </div>
          )}
        </CardContent>
      </Card>

      {/* 안내 카드 */}
      <Card className="bg-muted/30 border-dashed">
        <CardContent className="py-4 px-5">
          <div className="flex items-start gap-2">
            <Info className="w-4 h-4 text-muted-foreground mt-0.5 shrink-0" />
            <div className="text-xs text-muted-foreground space-y-1">
              <p><strong className="text-foreground">프리셋 저장</strong>: 신규 사용자 생성 시 해당 역할에 자동 적용됩니다.</p>
              <p><strong className="text-foreground">일괄 적용</strong>: 현재 저장된 프리셋을 해당 역할의 기존 사용자 전체에 즉시 반영합니다.</p>
              <p><strong className="text-foreground">개별 권한</strong>: 사용자 관리 페이지에서 사용자별로 추가 세부 조정이 가능합니다.</p>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* 일괄 적용 확인 다이얼로그 */}
      <Dialog open={applyConfirmOpen} onOpenChange={setApplyConfirmOpen}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <AlertTriangle className="w-5 h-5 text-orange-500" />
              일괄 적용 확인
            </DialogTitle>
            <DialogDescription>
              현재 저장된 <strong>{activeRoleInfo.label}</strong> 프리셋을 해당 역할의{" "}
              <strong>모든 사용자({userCounts?.[activeRole] ?? 0}명)</strong>에게 적용합니다.
              <br /><br />
              기존 개별 권한 설정이 덮어씌워집니다. 계속하시겠습니까?
            </DialogDescription>
          </DialogHeader>
          <DialogFooter className="gap-2">
            <Button variant="outline" onClick={() => setApplyConfirmOpen(false)}>취소</Button>
            <Button
              className="bg-orange-600 hover:bg-orange-700 text-white"
              onClick={() => applyAllMutation.mutate()}
              disabled={applyAllMutation.isPending}
              data-testid="button-confirm-apply-all"
            >
              {applyAllMutation.isPending ? "적용 중..." : "일괄 적용"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
