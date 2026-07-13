import { Link, useLocation } from "wouter";
import { 
  LayoutDashboard, 
  Bell, 
  ShieldCheck, 
  Shield,
  HeartPulse,
  GraduationCap, 
  FileText,
  ClipboardCheck,
  ShoppingCart,
  AlertTriangle,
  ShieldAlert,
  FlaskConical,
  DoorOpen,
  MonitorPlay,
  ChevronDown,
  Users,
  ScrollText,
  Bone,
  Home,
  ReceiptText,
  Briefcase,
  CalendarCheck,
  Music2,
  Fuel,
  FileSignature,
  Car,
  HardHat,
  Stethoscope,
  HardDrive,
  X,
  ClipboardList,
  Receipt,
  Newspaper,
  UserCheck,
  Activity,
  Siren,
  Sun,
  BarChart2,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { useState, useEffect } from "react";
import { useAuth } from "@/hooks/use-auth";
import { usePermissions, type Permissions } from "@/hooks/use-permissions";

type NavItem = {
  label: string;
  href: string;
  icon: any;
  adminOnly?: boolean;
  permissionKey?: keyof Permissions;
};

type NavGroup = {
  label: string;
  icon: any;
  children: (NavItem | NavGroup)[];
  adminOnly?: boolean;
};

type NavEntry = NavItem | NavGroup;

function isGroup(entry: NavEntry): entry is NavGroup {
  return "children" in entry;
}

type NavSection = {
  sectionLabel?: string;
  entries: NavEntry[];
};

const NAV_SECTIONS: NavSection[] = [
  {
    entries: [
      { label: "홈", href: "/", icon: Home },
      { label: "공지/알림", href: "/notices", icon: Bell, permissionKey: "canViewNotices" },
      { label: "전자게시판", href: "/digital-board", icon: MonitorPlay, permissionKey: "canViewDigitalBoard" },
      { label: "안전수칙", href: "/rules", icon: ShieldCheck, permissionKey: "canViewRules" },
    ],
  },
  {
    entries: [
      {
        label: "안전관리",
        icon: Shield,
        children: [
          { label: "안전성평가제", href: "/safety-scores", icon: LayoutDashboard, permissionKey: "canViewDashboard" },
          { label: "사고보고/통계", href: "/accidents", icon: AlertTriangle, permissionKey: "canViewAccidents" },
          { label: "아차사고 관리", href: "/near-miss", icon: AlertTriangle, permissionKey: "canViewNearMiss" },
          { label: "위험성평가", href: "/risk-assessment", icon: ShieldAlert, permissionKey: "canViewRiskAssessment" },
          { label: "안전점검", href: "/inspections", icon: ClipboardCheck, permissionKey: "canViewInspections" as const },
          { label: "교육업무 관리", href: "/education-management", icon: ClipboardList, permissionKey: "canViewEducationOrLogs" },
          { label: "보호구 현황", href: "/equipment/status", icon: ShieldCheck, permissionKey: "canViewEquipmentStatus" },
          { label: "안전용품 신청", href: "/equipment", icon: ShoppingCart, permissionKey: "canViewEquipment" },
          { label: "안전관리자 보고서", href: "/safety-manager-reports", icon: HardHat, permissionKey: "canViewSafetyManagerReports" },
          { label: "산업안전보건관리비", href: "/safety-cost-budget", icon: Receipt, permissionKey: "canViewSafetyCostBudget" },
          { label: "AIS 안전이행률", href: "/ais-safety-rate", icon: BarChart2, permissionKey: "canViewAisSafetyRate" },
          { label: "비상사태 발생 시 대응훈련", href: "/drill-training", icon: Siren, permissionKey: "canViewDrillTraining" },
        ],
      },
    ],
  },
  {
    entries: [
      {
        label: "보건관리",
        icon: HeartPulse,
        children: [
          { label: "MSDS검색", href: "/msds", icon: FlaskConical, permissionKey: "canViewMsds" },
          { label: "근골격계질환", href: "/musculoskeletal", icon: Bone, permissionKey: "canViewMusculoskeletal" },
          { label: "보건관리자 보고서", href: "/health-manager-reports", icon: Stethoscope, permissionKey: "canViewHealthManagerReports" },
          { label: "폭염 일일 체크리스트", href: "/heat-wave-checklist", icon: Sun, permissionKey: "canViewHeatWaveChecklist" },
        ],
      },
    ],
  },
  {
    entries: [
      {
        label: "하도급관리",
        icon: Briefcase,
        children: [
          { label: "작업계획", href: "/work-plan", icon: CalendarCheck, permissionKey: "canViewWorkPlan" },
          { label: "산업안전보건협의체", href: "/safety-committee", icon: Users, permissionKey: "canViewSafetyCommittee" },
          { label: "합동안전보건점검", href: "/joint-inspection", icon: ClipboardCheck, permissionKey: "canViewJointInspection" },
          { label: "입회 관리", href: "/attendance", icon: UserCheck, permissionKey: "canViewAttendance" },
        ],
      },
    ],
  },
  {
    entries: [
      {
        label: "차량관리",
        icon: Car,
        children: [
          { label: "차량 관리", href: "/admin/fuel-costs", icon: Fuel, permissionKey: "canViewVehicle" },
          { label: "과태료 현황", href: "/traffic-fines", icon: ReceiptText, permissionKey: "canViewTrafficFines" },
        ],
      },
    ],
  },
  {
    entries: [
      {
        label: "시스템 관리",
        icon: Shield,
        children: [
          { label: "사용자 관리", href: "/admin/users", icon: Users, adminOnly: true },
          { label: "보안 감사 로그", href: "/admin/security", icon: ScrollText, adminOnly: true },
          { label: "API 호출 내역", href: "/admin/api-logs", icon: Activity, adminOnly: true },
          { label: "음악 관리", href: "/admin/music", icon: Music2, adminOnly: true },
          { label: "서명 관리 로그", href: "/admin/signatures", icon: FileSignature, adminOnly: true },
          { label: "출입신청", href: "/access", icon: DoorOpen, permissionKey: "canViewAccess" },
          { label: "안전점수 평가항목 관리", href: "/safety-score-items", icon: ClipboardList, permissionKey: "canEditSafetyScores" },
          { label: "데이터 백업", href: "/admin/backup", icon: HardDrive, adminOnly: true },
          { label: "음주운전 카드뉴스", href: "/admin/card-news", icon: Newspaper, adminOnly: true },
        ],
      },
    ],
  },
];

interface SidebarProps {
  mobileOpen?: boolean;
  onMobileClose?: () => void;
}

export function Sidebar({ mobileOpen = false, onMobileClose }: SidebarProps) {
  const [location] = useLocation();
  const [openGroups, setOpenGroups] = useState<Record<string, boolean>>({});
  const { user } = useAuth();
  const permissions = usePermissions();
  const isAdmin = permissions.isAdmin;

  useEffect(() => {
    if (mobileOpen) {
      document.body.style.overflow = "hidden";
    } else {
      document.body.style.overflow = "";
    }
    return () => { document.body.style.overflow = ""; };
  }, [mobileOpen]);

  useEffect(() => {
    onMobileClose?.();
  }, [location]);

  const hasItemPermission = (item: NavItem): boolean => {
    if (isAdmin) return true;
    if (item.adminOnly) return false;
    if (!item.permissionKey) return true;
    return !!permissions[item.permissionKey];
  };

  const filterChildren = (children: (NavItem | NavGroup)[]): (NavItem | NavGroup)[] => {
    return children.reduce<(NavItem | NavGroup)[]>((acc, child) => {
      if (isGroup(child)) {
        const visibleGrand = filterChildren(child.children);
        if (visibleGrand.length > 0) acc.push({ ...child, children: visibleGrand });
      } else {
        if (hasItemPermission(child)) acc.push(child);
      }
      return acc;
    }, []);
  };

  const filterEntries = (entries: NavEntry[]): NavEntry[] => {
    return entries.reduce<NavEntry[]>((acc, entry) => {
      if (entry.adminOnly && !isAdmin) return acc;
      if (isGroup(entry)) {
        const visibleChildren = filterChildren(entry.children);
        if (visibleChildren.length > 0) {
          acc.push({ ...entry, children: visibleChildren });
        }
      } else {
        if (hasItemPermission(entry)) {
          acc.push(entry);
        }
      }
      return acc;
    }, []);
  };

  const toggleGroup = (label: string) => {
    setOpenGroups((prev) => ({ ...prev, [label]: !prev[label] }));
  };

  const isChildActive = (group: NavGroup): boolean =>
    group.children.some((child) =>
      isGroup(child) ? isChildActive(child) : location === child.href
    );

  const isGroupOpen = (group: NavGroup) => {
    if (openGroups[group.label] !== undefined) return openGroups[group.label];
    return isChildActive(group);
  };

  const renderEntry = (entry: NavEntry, isMobile: boolean) => {
    if (isGroup(entry)) {
      const open = isGroupOpen(entry);
      const childActive = isChildActive(entry);
      return (
        <div key={entry.label}>
          <button
            onClick={() => toggleGroup(entry.label)}
            title={entry.label}
            className={cn(
              "flex items-center gap-2.5 rounded-lg transition-all duration-150 text-sm w-full font-medium",
              isMobile ? "px-3 py-3" : "px-2.5 py-2",
              childActive
                ? "text-primary dark:text-blue-400 bg-primary/[0.08] dark:bg-blue-500/15"
                : "text-slate-500 dark:text-gray-400 hover:bg-slate-50 dark:hover:bg-gray-800/70 hover:text-slate-700 dark:hover:text-gray-200"
            )}
            data-testid={`button-nav-group-${entry.label}`}
          >
            <entry.icon className={cn("shrink-0 transition-colors", isMobile ? "w-5 h-5" : "w-4 h-4", childActive ? "text-primary dark:text-blue-400" : "text-slate-400 dark:text-gray-500")} />
            <span className={cn("flex-1 text-left whitespace-nowrap", isMobile ? "block text-base" : "hidden md:block")}>{entry.label}</span>
            <ChevronDown
              className={cn(
                "transition-transform duration-200",
                isMobile ? "w-4 h-4 block" : "w-3.5 h-3.5 hidden md:block",
                childActive ? "text-primary/50 dark:text-blue-400/50" : "text-slate-300 dark:text-gray-600",
                open && "rotate-180"
              )}
            />
          </button>
          <div
            className={cn(
              "overflow-hidden transition-all duration-200",
              open ? "max-h-[600px] opacity-100" : "max-h-0 opacity-0"
            )}
          >
            <div className={cn(
              "border-l-2 border-slate-200 dark:border-gray-700 flex flex-col gap-0.5 mt-0.5 pb-1",
              isMobile ? "ml-4 pl-3" : "ml-2 md:ml-4 pl-2 md:pl-3"
            )}>
              {entry.children.map((child) => {
                if (isGroup(child)) {
                  const subOpen = isGroupOpen(child);
                  const subActive = isChildActive(child);
                  return (
                    <div key={child.label}>
                      <button
                        onClick={() => toggleGroup(child.label)}
                        className={cn(
                          "flex items-center gap-2 rounded-md transition-all duration-150 font-medium w-full",
                          isMobile ? "px-3 py-3 text-sm" : "px-2 py-1.5 text-[13px]",
                          subActive
                            ? "bg-primary/[0.08] dark:bg-blue-500/15 text-primary dark:text-blue-400"
                            : "text-slate-500 dark:text-gray-400 hover:bg-slate-50 dark:hover:bg-gray-800/70 hover:text-slate-700 dark:hover:text-gray-200"
                        )}
                        data-testid={`button-nav-subgroup-${child.label}`}
                      >
                        <child.icon className={cn("shrink-0", isMobile ? "w-4 h-4" : "w-3.5 h-3.5", subActive ? "text-primary dark:text-blue-400" : "text-slate-400 dark:text-gray-500")} />
                        <span className={cn("flex-1 text-left whitespace-nowrap", isMobile ? "block" : "hidden md:inline")}>{child.label}</span>
                        <ChevronDown className={cn("transition-transform duration-200", isMobile ? "w-3 h-3 block" : "w-3 h-3 hidden md:block", subActive ? "text-primary/50 dark:text-blue-400/50" : "text-slate-300 dark:text-gray-600", subOpen && "rotate-180")} />
                      </button>
                      <div className={cn("overflow-hidden transition-all duration-200", subOpen ? "max-h-[300px] opacity-100" : "max-h-0 opacity-0")}>
                        <div className={cn("border-l-2 border-slate-100 dark:border-gray-700/60 flex flex-col gap-0.5 mt-0.5", isMobile ? "ml-3 pl-3" : "ml-2 pl-2")}>
                          {child.children.map((grandchild) => {
                            const gc = grandchild as NavItem;
                            const gcActive = location === gc.href;
                            return (
                              <Link
                                key={gc.href}
                                href={gc.href}
                                title={gc.label}
                                className={cn(
                                  "flex items-center gap-2 rounded-md transition-all duration-150 font-medium",
                                  isMobile ? "px-3 py-2.5 text-sm" : "px-2 py-1.5 text-[12px]",
                                  gcActive
                                    ? "bg-primary/[0.08] dark:bg-blue-500/15 text-primary dark:text-blue-400 font-semibold"
                                    : "text-slate-500 dark:text-gray-400 hover:bg-slate-50 dark:hover:bg-gray-800/70 hover:text-slate-700 dark:hover:text-gray-200"
                                )}
                                data-testid={`link-nav-${gc.href.replace(/\//g, "-").replace(/^-/, "")}`}
                              >
                                <gc.icon className={cn("shrink-0", isMobile ? "w-3.5 h-3.5" : "w-3 h-3", gcActive ? "text-primary dark:text-blue-400" : "text-slate-400 dark:text-gray-500")} />
                                <span className={cn("whitespace-nowrap", isMobile ? "block" : "hidden md:inline")}>{gc.label}</span>
                                {gcActive && <span className="ml-auto w-1.5 h-1.5 rounded-full bg-primary/80 dark:bg-blue-400/80" />}
                              </Link>
                            );
                          })}
                        </div>
                      </div>
                    </div>
                  );
                }
                const item = child as NavItem;
                const isActive = location === item.href;
                return (
                  <Link
                    key={item.href}
                    href={item.href}
                    title={item.label}
                    className={cn(
                      "flex items-center gap-2 rounded-md transition-all duration-150 font-medium",
                      isMobile ? "px-3 py-3 text-sm" : "px-2 py-1.5 text-[13px]",
                      isActive
                        ? "bg-primary/[0.08] dark:bg-blue-500/15 text-primary dark:text-blue-400 font-semibold"
                        : "text-slate-500 dark:text-gray-400 hover:bg-slate-50 dark:hover:bg-gray-800/70 hover:text-slate-700 dark:hover:text-gray-200"
                    )}
                    data-testid={`link-nav-${item.href.replace("/", "")}`}
                  >
                    <item.icon className={cn("shrink-0", isMobile ? "w-4 h-4" : "w-3.5 h-3.5", isActive ? "text-primary dark:text-blue-400" : "text-slate-400 dark:text-gray-500")} />
                    <span className={cn("whitespace-nowrap", isMobile ? "block" : "hidden md:inline")}>{item.label}</span>
                    {isActive && <span className="ml-auto w-1.5 h-1.5 rounded-full bg-primary/80 dark:bg-blue-400/80" />}
                  </Link>
                );
              })}
            </div>
          </div>
        </div>
      );
    }
    const isActive = location === entry.href;
    return (
      <Link
        key={entry.href}
        href={entry.href}
        title={entry.label}
        className={cn(
          "flex items-center gap-2.5 rounded-lg transition-all duration-150 font-medium",
          isMobile ? "px-3 py-3 text-base" : "px-2.5 py-2 text-sm",
          isActive
            ? "text-primary dark:text-blue-400 bg-primary/[0.08] dark:bg-blue-500/15"
            : "text-slate-500 dark:text-gray-400 hover:bg-slate-50 dark:hover:bg-gray-800/70 hover:text-slate-700 dark:hover:text-gray-200"
        )}
        data-testid={`link-nav-${entry.href.replace("/", "") || "dashboard"}`}
      >
        <entry.icon className={cn("shrink-0", isMobile ? "w-5 h-5" : "w-4 h-4", isActive ? "text-primary dark:text-blue-400" : "text-slate-400 dark:text-gray-500")} />
        <span className={cn("whitespace-nowrap", isMobile ? "block" : "hidden md:inline")}>{entry.label}</span>
        {isActive && <span className="ml-auto w-1.5 h-1.5 rounded-full bg-primary/80 dark:bg-blue-400/80" />}
      </Link>
    );
  };

  const navContent = (isMobile: boolean) => (
    <>
      {NAV_SECTIONS.map((section, si) => {
        const filteredEntries = filterEntries(section.entries);
        if (filteredEntries.length === 0) return null;
        return (
          <div key={si} className={cn("flex flex-col gap-0.5", si > 0 && "pt-1 mt-1 border-t border-slate-100 dark:border-gray-700/60")}>
            {section.sectionLabel && (
              <p className="px-2.5 mb-1 text-[10px] font-bold text-slate-300 dark:text-gray-600 uppercase tracking-widest">
                {section.sectionLabel}
              </p>
            )}
            {filteredEntries.map((entry) => renderEntry(entry, isMobile))}
          </div>
        );
      })}
    </>
  );

  return (
    <>
      {/* ── 데스크톱 사이드바 ── */}
      <aside className="hidden md:flex flex-col w-56 border-r border-slate-100 dark:border-gray-700/60 bg-white dark:bg-[#1A2235] h-screen sticky top-0 z-30 shrink-0">
        <Link href="/" className="block px-4 py-3.5 border-b border-slate-100 dark:border-gray-700/60 cursor-pointer hover:bg-slate-50 dark:hover:bg-gray-800/50 transition-colors" data-testid="link-sidebar-logo">
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-xl bg-[#0066CC] flex flex-col items-center justify-center text-white shrink-0">
              <span className="text-[9px] font-bold leading-none tracking-tight">kt</span>
              <span className="text-[7px] font-semibold leading-none tracking-tight">MOS</span>
            </div>
            <div className="min-w-0">
              <h1 className="font-display font-bold text-[13px] leading-tight truncate text-slate-900 dark:text-white">종합안전포털시스템</h1>
              <p className="text-[10px] text-slate-400 dark:text-gray-500">Safety Portal System</p>
            </div>
          </div>
        </Link>
        <div className="flex-1 overflow-y-auto px-2 py-3 flex flex-col gap-1">
          {navContent(false)}
        </div>
        <div className="px-4 py-2.5 border-t border-slate-100 dark:border-gray-700/60 text-[10px] text-slate-300 dark:text-gray-600 font-medium">
          v3.0.0
        </div>
      </aside>

      {/* ── 모바일 드로어 오버레이 ── */}
      <div
        className={cn(
          "fixed inset-0 z-40 bg-black/50 backdrop-blur-sm transition-opacity duration-300 md:hidden",
          mobileOpen ? "opacity-100 pointer-events-auto" : "opacity-0 pointer-events-none"
        )}
        onClick={onMobileClose}
        aria-hidden="true"
      />

      {/* 드로어 패널 */}
      <div
        className={cn(
          "fixed top-0 left-0 h-full z-50 flex flex-col bg-white dark:bg-[#1A2235] shadow-2xl transition-transform duration-300 ease-in-out md:hidden",
          "w-72",
          mobileOpen ? "translate-x-0" : "-translate-x-full"
        )}
      >
        <div className="flex items-center justify-between px-4 py-4 border-b border-slate-100 dark:border-gray-700/60 shrink-0">
          <div className="flex items-center gap-2.5">
            <div className="w-9 h-9 rounded-xl bg-[#0066CC] flex flex-col items-center justify-center text-white shrink-0">
              <span className="text-[10px] font-bold leading-none tracking-tight">kt</span>
              <span className="text-[8px] font-semibold leading-none tracking-tight">MOS</span>
            </div>
            <div>
              <h1 className="font-bold text-sm leading-tight text-slate-900 dark:text-white">종합안전포털시스템</h1>
              <p className="text-[11px] text-slate-400 dark:text-gray-500">Safety Portal System</p>
            </div>
          </div>
          <button
            onClick={onMobileClose}
            className="w-9 h-9 rounded-lg flex items-center justify-center text-slate-400 dark:text-gray-400 hover:bg-slate-100 dark:hover:bg-gray-700 hover:text-slate-700 dark:hover:text-white transition-colors"
            data-testid="button-close-mobile-menu"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto px-2 py-3 flex flex-col gap-1">
          {navContent(true)}
        </div>

        <div className="px-4 py-3 border-t border-slate-100 dark:border-gray-700/60 text-[11px] text-slate-300 dark:text-gray-600 font-medium shrink-0">
          v3.0.0
        </div>
      </div>
    </>
  );
}
