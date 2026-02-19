import { useQuery } from "@tanstack/react-query";
import { useAuth } from "./use-auth";
import type { UserPermissions } from "@shared/models/auth";

export type { UserPermissions };

export interface Permissions {
  canEditDashboard: boolean;
  canEditSafetyScores: boolean;
  canEditVehicles: boolean;
  canEditEquipmentStatus: boolean;
  canRegisterRules: boolean;
  canRegisterNotices: boolean;
  canRegisterEducation: boolean;
  canEditEducationLogs: boolean;
  canEditInspections: boolean;
  canManageEquipmentRequests: boolean;
  canAddEquipmentMaterials: boolean;
  canEditDigitalBoard: boolean;
  canEditVehicleLogs: boolean;
  canManageUsers: boolean;
  isAdmin: boolean;
  role: string | null;
}

interface PermissionsResponse {
  role: string;
  permissions: UserPermissions;
}

export function usePermissions(): Permissions & { isLoading: boolean } {
  const { isAuthenticated } = useAuth();
  const { data, isLoading } = useQuery<PermissionsResponse>({
    queryKey: ["/api/auth/permissions"],
    enabled: isAuthenticated,
  });

  const role = data?.role || null;
  const isAdmin = role === "admin";
  const perms = data?.permissions;

  return {
    isLoading,
    role,
    isAdmin,
    canManageUsers: isAdmin,
    canEditDashboard: isAdmin || !!perms?.editDashboard,
    canEditSafetyScores: isAdmin || !!perms?.editSafetyScores,
    canEditVehicles: isAdmin || !!perms?.editVehicles,
    canEditEquipmentStatus: isAdmin || !!perms?.editEquipmentStatus,
    canRegisterRules: isAdmin || !!perms?.registerRules,
    canRegisterNotices: isAdmin || !!perms?.registerNotices,
    canRegisterEducation: isAdmin || !!perms?.registerEducation,
    canEditEducationLogs: isAdmin || !!perms?.editEducationLogs,
    canEditInspections: isAdmin || !!perms?.editInspections,
    canManageEquipmentRequests: isAdmin || !!perms?.manageEquipmentRequests,
    canAddEquipmentMaterials: isAdmin || !!perms?.addEquipmentMaterials,
    canEditDigitalBoard: isAdmin || !!perms?.editDigitalBoard,
    canEditVehicleLogs: isAdmin || !!perms?.editVehicleLogs,
  };
}

export const PERMISSION_LABELS: Record<keyof UserPermissions, string> = {
  editDashboard: "대시보드 편집",
  editSafetyScores: "안전점수 편집",
  editVehicles: "차량관리 편집",
  editEquipmentStatus: "안전용품현황 편집",
  registerRules: "안전수칙 등록",
  registerNotices: "공지/알림 등록",
  registerEducation: "안전교육 등록",
  editEducationLogs: "교육일지 수정",
  editInspections: "안전점검 편집",
  manageEquipmentRequests: "안전용품신청 관리",
  addEquipmentMaterials: "안전용품 추가",
  editDigitalBoard: "전자게시판 편집",
  editVehicleLogs: "차량운행일지 편집",
};

export function getRoleLabel(role: string): string {
  switch (role) {
    case "admin":
      return "관리자";
    case "manager":
      return "담당자";
    case "user":
    default:
      return "일반 사용자";
  }
}

export function getRoleVariant(role: string): "default" | "secondary" | "outline" {
  switch (role) {
    case "admin":
      return "default";
    case "manager":
      return "secondary";
    case "user":
    default:
      return "outline";
  }
}
