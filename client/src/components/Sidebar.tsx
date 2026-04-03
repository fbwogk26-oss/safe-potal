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
} from "lucide-react";
import { cn } from "@/lib/utils";
import { useState } from "react";
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
  children: NavItem[];
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
          { label: "안전점수", href: "/safety-scores", icon: LayoutDashboard, permissionKey: "canViewDashboard" },
          { label: "사고보고/통계", href: "/accidents", icon: AlertTriangle, permissionKey: "canViewAccidents" },
          { label: "과태료 현황", href: "/traffic-fines", icon: ReceiptText },
          { label: "위험성평가", href: "/risk-assessment", icon: ShieldAlert, permissionKey: "canViewRiskAssessment" },
          { label: "안전점검", href: "/inspections", icon: ClipboardCheck, permissionKey: "canViewInspections" },
          { label: "교육 관리", href: "/education-logs", icon: GraduationCap, permissionKey: "canViewEducationOrLogs" },
          { label: "보호구 현황", href: "/equipment/status", icon: ShieldCheck, permissionKey: "canViewEquipmentStatus" },
          { label: "안전용품 신청", href: "/equipment", icon: ShoppingCart, permissionKey: "canViewEquipment" },
          { label: "출입신청", href: "/access", icon: DoorOpen, permissionKey: "canViewAccess" },
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
          { label: "작업계획", href: "/work-plan", icon: CalendarCheck },
        ],
      },
    ],
  },
  {
    entries: [
      {
        label: "시스템 관리",
        icon: Shield,
        adminOnly: true,
        children: [
          { label: "사용자 관리", href: "/admin/users", icon: Users },
          { label: "보안 감사 로그", href: "/admin/security", icon: ScrollText },
          { label: "음악 관리", href: "/admin/music", icon: Music2 },
          { label: "유류비 현황", href: "/admin/fuel-costs", icon: Fuel },
          { label: "서명 관리", href: "/admin/signatures", icon: FileSignature },
        ],
      },
    ],
  },
];

export function Sidebar() {
  const [location] = useLocation();
  const [openGroups, setOpenGroups] = useState<Record<string, boolean>>({});
  const { user } = useAuth();
  const permissions = usePermissions();
  const isAdmin = permissions.isAdmin;

  const hasItemPermission = (item: NavItem): boolean => {
    if (isAdmin) return true;
    if (!item.permissionKey) return true;
    return !!permissions[item.permissionKey];
  };

  const filterEntries = (entries: NavEntry[]): NavEntry[] => {
    return entries.reduce<NavEntry[]>((acc, entry) => {
      if (entry.adminOnly && !isAdmin) return acc;
      if (isGroup(entry)) {
        const visibleChildren = entry.children.filter(hasItemPermission);
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

  const isChildActive = (group: NavGroup) =>
    group.children.some((child) => location === child.href);

  const isGroupOpen = (group: NavGroup) => {
    if (openGroups[group.label] !== undefined) return openGroups[group.label];
    return isChildActive(group);
  };

  const renderEntry = (entry: NavEntry) => {
    if (isGroup(entry)) {
      const open = isGroupOpen(entry);
      const childActive = isChildActive(entry);
      return (
        <div key={entry.label}>
          <button
            onClick={() => toggleGroup(entry.label)}
            className={cn(
              "flex items-center gap-2.5 px-3 py-2 rounded-lg transition-all duration-150 text-sm w-full font-medium",
              childActive
                ? "text-primary bg-primary/8"
                : "text-muted-foreground hover:bg-muted/70 hover:text-foreground"
            )}
            data-testid={`button-nav-group-${entry.label}`}
          >
            <entry.icon className={cn("w-4 h-4 shrink-0 transition-colors", childActive ? "text-primary" : "opacity-70")} />
            <span className="flex-1 text-left">{entry.label}</span>
            <ChevronDown
              className={cn(
                "w-3.5 h-3.5 transition-transform duration-200 opacity-50",
                open && "rotate-180"
              )}
            />
          </button>
          <div
            className={cn(
              "overflow-hidden transition-all duration-200",
              open ? "max-h-[500px] opacity-100" : "max-h-0 opacity-0"
            )}
          >
            <div className="ml-4 pl-3 border-l-2 border-border/40 flex flex-col gap-0.5 mt-0.5 pb-1">
              {entry.children.map((child) => {
                const isActive = location === child.href;
                return (
                  <Link
                    key={child.href}
                    href={child.href}
                    className={cn(
                      "flex items-center gap-2 px-2.5 py-1.5 rounded-md transition-all duration-150 text-[13px] font-medium",
                      isActive
                        ? "bg-primary/10 text-primary font-semibold"
                        : "text-muted-foreground hover:bg-muted/60 hover:text-foreground"
                    )}
                    data-testid={`link-nav-${child.href.replace("/", "")}`}
                  >
                    <child.icon className={cn("w-3.5 h-3.5 shrink-0", isActive ? "text-primary" : "opacity-60")} />
                    <span>{child.label}</span>
                    {isActive && <span className="ml-auto w-1.5 h-1.5 rounded-full bg-primary" />}
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
        className={cn(
          "flex items-center gap-2.5 px-3 py-2 rounded-lg transition-all duration-150 text-sm font-medium",
          isActive
            ? "bg-primary/10 text-primary font-semibold"
            : "text-muted-foreground hover:bg-muted/70 hover:text-foreground"
        )}
        data-testid={`link-nav-${entry.href.replace("/", "") || "dashboard"}`}
      >
        <entry.icon className={cn("w-4 h-4 shrink-0", isActive ? "text-primary" : "opacity-70")} />
        <span>{entry.label}</span>
        {isActive && <span className="ml-auto w-1.5 h-1.5 rounded-full bg-primary" />}
      </Link>
    );
  };

  return (
    <aside className="hidden md:flex flex-col w-56 border-r border-border/50 bg-card/90 backdrop-blur-xl h-screen sticky top-0 z-30 shrink-0">
      <Link href="/" className="block px-4 py-3.5 border-b border-border/50 cursor-pointer hover:bg-muted/30 transition-colors" data-testid="link-sidebar-logo">
        <div className="flex items-center gap-2.5">
          <div className="w-8 h-8 rounded-xl bg-[#0066CC] flex flex-col items-center justify-center text-white shadow-lg shrink-0">
            <span className="text-[9px] font-bold leading-none tracking-tight">kt</span>
            <span className="text-[7px] font-semibold leading-none tracking-tight">MOS</span>
          </div>
          <div className="min-w-0">
            <h1 className="font-display font-bold text-[13px] leading-tight truncate">종합안전포털시스템</h1>
            <p className="text-[10px] text-muted-foreground">Safety Portal System</p>
          </div>
        </div>
      </Link>

      <div className="flex-1 overflow-y-auto px-2 py-3 flex flex-col gap-1">
        {NAV_SECTIONS.map((section, si) => {
          const filteredEntries = filterEntries(section.entries);
          if (filteredEntries.length === 0) return null;
          return (
            <div key={si} className={cn("flex flex-col gap-0.5", si > 0 && "pt-1 mt-1 border-t border-border/30")}>
              {section.sectionLabel && (
                <p className="px-3 mb-1 text-[10px] font-bold text-muted-foreground/60 uppercase tracking-widest">
                  {section.sectionLabel}
                </p>
              )}
              {filteredEntries.map(renderEntry)}
            </div>
          );
        })}
      </div>

      <div className="px-4 py-2.5 border-t border-border/50 text-[10px] text-muted-foreground/50 font-medium">
        v3.0.0
      </div>
    </aside>
  );
}
