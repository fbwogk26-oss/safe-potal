import { useQuery } from "@tanstack/react-query";
import { useAuth } from "./use-auth";
import type { UserPermissions } from "@shared/models/auth";

export type { UserPermissions };

export interface Permissions {
  isAdmin: boolean;
  role: string | null;
  canManageUsers: boolean;
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
  canManageAccessRequests: boolean;
  canEditAccidents: boolean;
  canEditRiskAssessment: boolean;
  canEditMsds: boolean;
  canEditMusculoskeletal: boolean;
  canUploadDashboardData: boolean;
  canUploadEducationPhotos: boolean;
  canUploadInspectionPhotos: boolean;
  canUploadAccidentPhotos: boolean;
  canDownloadEducationExcel: boolean;
  canDownloadInspectionExcel: boolean;
  canDownloadAccidentReport: boolean;
  canDownloadVehicleExcel: boolean;
  canDownloadVehicleLogExcel: boolean;
  canDownloadAccessExcel: boolean;
  canDownloadEquipmentExcel: boolean;
  canDownloadMsdsPdf: boolean;
  canDownloadRulesFiles: boolean;
  canDownloadEducationFiles: boolean;
  canDownloadRiskAssessmentExcel: boolean;
  canViewDashboard: boolean;
  canViewNotices: boolean;
  canViewDigitalBoard: boolean;
  canViewRules: boolean;
  canViewAccidents: boolean;
  canViewEquipmentStatus: boolean;
  canViewEquipment: boolean;
  canViewEducation: boolean;
  canViewEducationLogs: boolean;
  canViewInspections: boolean;
  canViewRiskAssessment: boolean;
  canViewMsds: boolean;
  canViewMusculoskeletal: boolean;
  canViewVehicle: boolean;
  canViewVehicleLogs: boolean;
  canViewAccess: boolean;
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
    canManageAccessRequests: isAdmin || !!perms?.manageAccessRequests,
    canEditAccidents: isAdmin || !!perms?.editAccidents,
    canEditRiskAssessment: isAdmin || !!perms?.editRiskAssessment,
    canEditMsds: isAdmin || !!perms?.editMsds,
    canEditMusculoskeletal: isAdmin || !!perms?.editMusculoskeletal,
    canUploadDashboardData: isAdmin || !!perms?.uploadDashboardData,
    canUploadEducationPhotos: isAdmin || !!perms?.uploadEducationPhotos,
    canUploadInspectionPhotos: isAdmin || !!perms?.uploadInspectionPhotos,
    canUploadAccidentPhotos: isAdmin || !!perms?.uploadAccidentPhotos,
    canDownloadEducationExcel: isAdmin || !!perms?.downloadEducationExcel,
    canDownloadInspectionExcel: isAdmin || !!perms?.downloadInspectionExcel,
    canDownloadAccidentReport: isAdmin || !!perms?.downloadAccidentReport,
    canDownloadVehicleExcel: isAdmin || !!perms?.downloadVehicleExcel,
    canDownloadVehicleLogExcel: isAdmin || !!perms?.downloadVehicleLogExcel,
    canDownloadAccessExcel: isAdmin || !!perms?.downloadAccessExcel,
    canDownloadEquipmentExcel: isAdmin || !!perms?.downloadEquipmentExcel,
    canDownloadMsdsPdf: isAdmin || !!perms?.downloadMsdsPdf,
    canDownloadRulesFiles: isAdmin || !!perms?.downloadRulesFiles,
    canDownloadEducationFiles: isAdmin || !!perms?.downloadEducationFiles,
    canDownloadRiskAssessmentExcel: isAdmin || !!perms?.downloadRiskAssessmentExcel,
    canViewDashboard: isAdmin || !!perms?.viewDashboard,
    canViewNotices: isAdmin || !!perms?.viewNotices,
    canViewDigitalBoard: isAdmin || !!perms?.viewDigitalBoard,
    canViewRules: isAdmin || !!perms?.viewRules,
    canViewAccidents: isAdmin || !!perms?.viewAccidents,
    canViewEquipmentStatus: isAdmin || !!perms?.viewEquipmentStatus,
    canViewEquipment: isAdmin || !!perms?.viewEquipment,
    canViewEducation: isAdmin || !!perms?.viewEducation,
    canViewEducationLogs: isAdmin || !!perms?.viewEducationLogs,
    canViewInspections: isAdmin || !!perms?.viewInspections,
    canViewRiskAssessment: isAdmin || !!perms?.viewRiskAssessment,
    canViewMsds: isAdmin || !!perms?.viewMsds,
    canViewMusculoskeletal: isAdmin || !!perms?.viewMusculoskeletal,
    canViewVehicle: isAdmin || !!perms?.viewVehicle,
    canViewVehicleLogs: isAdmin || !!perms?.viewVehicleLogs,
    canViewAccess: isAdmin || !!perms?.viewAccess,
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
  manageAccessRequests: "출입신청 관리",
  editAccidents: "사고보고 등록/수정",
  editRiskAssessment: "위험성평가 편집",
  editMsds: "MSDS 편집",
  editMusculoskeletal: "근골격계질환 편집",
  uploadDashboardData: "대시보드 데이터 업로드",
  uploadEducationPhotos: "교육 사진 업로드",
  uploadInspectionPhotos: "점검 사진 업로드",
  uploadAccidentPhotos: "사고 사진 업로드",
  downloadEducationExcel: "교육일지 엑셀 다운로드",
  downloadInspectionExcel: "안전점검 엑셀 다운로드",
  downloadAccidentReport: "사고경위서 다운로드",
  downloadVehicleExcel: "차량관리 엑셀 다운로드",
  downloadVehicleLogExcel: "차량운행일지 엑셀 다운로드",
  downloadAccessExcel: "출입신청 엑셀 다운로드",
  downloadEquipmentExcel: "안전보호구 엑셀 다운로드",
  downloadMsdsPdf: "MSDS PDF 다운로드",
  downloadRulesFiles: "안전수칙 파일 다운로드",
  downloadEducationFiles: "교육자료 파일 다운로드",
  downloadRiskAssessmentExcel: "위험성평가 엑셀 다운로드",
  viewDashboard: "대시보드",
  viewNotices: "공지/알림",
  viewDigitalBoard: "전자게시판",
  viewRules: "안전수칙",
  viewAccidents: "사고보고/통계",
  viewEquipmentStatus: "안전보호구 현황",
  viewEquipment: "안전용품 신청",
  viewEducation: "안전교육 자료",
  viewEducationLogs: "교육일지",
  viewInspections: "안전점검",
  viewRiskAssessment: "위험성평가",
  viewMsds: "MSDS검색",
  viewMusculoskeletal: "근골격계질환",
  viewVehicle: "차량관리",
  viewVehicleLogs: "차량운행일지",
  viewAccess: "출입신청",
};

export const PERMISSION_CATEGORIES: { label: string; keys: (keyof UserPermissions)[] }[] = [
  {
    label: "메뉴 표시",
    keys: [
      "viewDashboard", "viewNotices", "viewDigitalBoard", "viewRules",
      "viewAccidents", "viewEquipmentStatus", "viewEquipment", "viewEducation",
      "viewEducationLogs", "viewInspections", "viewRiskAssessment", "viewMsds",
      "viewMusculoskeletal", "viewVehicle", "viewVehicleLogs", "viewAccess",
    ],
  },
  {
    label: "등록/수정 권한",
    keys: [
      "editDashboard", "editSafetyScores", "registerNotices", "editDigitalBoard",
      "registerRules", "editAccidents", "editEquipmentStatus", "manageEquipmentRequests",
      "addEquipmentMaterials", "registerEducation", "editEducationLogs", "editInspections",
      "editRiskAssessment", "editMsds", "editMusculoskeletal", "editVehicles",
      "editVehicleLogs", "manageAccessRequests",
    ],
  },
  {
    label: "업로드 권한",
    keys: [
      "uploadDashboardData", "uploadEducationPhotos", "uploadInspectionPhotos", "uploadAccidentPhotos",
    ],
  },
  {
    label: "다운로드 권한",
    keys: [
      "downloadEducationExcel", "downloadInspectionExcel", "downloadAccidentReport",
      "downloadVehicleExcel", "downloadVehicleLogExcel", "downloadAccessExcel",
      "downloadEquipmentExcel", "downloadMsdsPdf", "downloadRulesFiles", "downloadEducationFiles",
      "downloadRiskAssessmentExcel",
    ],
  },
];

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
