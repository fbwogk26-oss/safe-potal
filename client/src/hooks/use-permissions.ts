import { useQuery } from "@tanstack/react-query";
import { useAuth } from "./use-auth";

export type UserRole = "admin" | "manager" | "user";

export interface Permissions {
  canEditDashboard: boolean;
  canEditSafetyScores: boolean;
  canEditVehicles: boolean;
  canEditEquipmentStatus: boolean;
  canRegisterRules: boolean;
  canRegisterNotices: boolean;
  canRegisterEducation: boolean;
  canEditInspections: boolean;
  canManageEquipmentRequests: boolean;
  canAddEquipmentMaterials: boolean;
  canEditDigitalBoard: boolean;
  canManageUsers: boolean;
  isAdmin: boolean;
  isManager: boolean;
  role: UserRole | null;
}

export function usePermissions(): Permissions & { isLoading: boolean } {
  const { isAuthenticated } = useAuth();
  const { data: roleData, isLoading } = useQuery<{ role: string }>({
    queryKey: ["/api/auth/user-role"],
    enabled: isAuthenticated,
  });

  const role = (roleData?.role as UserRole) || null;
  const isAdmin = role === "admin";
  const isManager = role === "manager";
  const canEdit = isAdmin || isManager;

  return {
    isLoading,
    role,
    isAdmin,
    isManager,
    // Admin only permissions
    canManageUsers: isAdmin,
    // Admin and Manager permissions
    canEditDashboard: canEdit,
    canEditSafetyScores: canEdit,
    canEditVehicles: canEdit,
    canEditEquipmentStatus: canEdit,
    canRegisterRules: canEdit,
    canRegisterNotices: canEdit,
    canRegisterEducation: canEdit,
    canEditInspections: canEdit,
    canManageEquipmentRequests: canEdit,
    canAddEquipmentMaterials: canEdit,
    canEditDigitalBoard: canEdit,
  };
}

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
