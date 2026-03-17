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
  CloudRain,
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
          { label: "보호구 현황", href: "/equipment/status", icon: ShieldCheck, permissionKey: "canViewEquipmentStatus" },
          { label: "안전용품 신청", href: "/equipment", icon: ShoppingCart, permissionKey: "canViewEquipment" },
          { label: "안전교육 자료", href: "/education", icon: GraduationCap, permissionKey: "canViewEducation" },
          { label: "교육일지", href: "/education-logs", icon: FileText, permissionKey: "canViewEducationLogs" },
          { label: "안전점검", href: "/inspections", icon: ClipboardCheck, permissionKey: "canViewInspections" },
          { label: "위험성평가", href: "/risk-assessment", icon: ShieldAlert, permissionKey: "canViewRiskAssessment" },
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
          { label: "날씨 안전메시지", href: "/weather-safety", icon: CloudRain, permissionKey: "canRegisterNotices" },
        ],
      },
    ],
  },
  {
    entries: [
      { label: "출입신청", href: "/access", icon: DoorOpen, permissionKey: "canViewAccess" },
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
              "flex items-center gap-2.5 px-3 py-2 rounded-lg transition-all duration-200 text-sm w-full font-medium",
              childActive
                ? "text-primary bg-primary/5"
                : "text-muted-foreground hover:bg-muted hover:text-foreground"
            )}
            data-testid={`button-nav-group-${entry.label}`}
          >
            <entry.icon className="w-4 h-4 shrink-0" />
            <span className="flex-1 text-left">{entry.label}</span>
            <ChevronDown
              className={cn(
                "w-3.5 h-3.5 transition-transform duration-200 opacity-60",
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
            <div className="ml-3.5 pl-3 border-l-2 border-border/50 flex flex-col gap-0.5 mt-0.5 pb-1">
              {entry.children.map((child) => (
                <Link
                  key={child.href}
                  href={child.href}
                  className={cn(
                    "flex items-center gap-2.5 px-3 py-2 rounded-lg transition-all duration-200 text-[13px] font-medium",
                    location === child.href
                      ? "bg-primary text-primary-foreground shadow-sm"
                      : "text-muted-foreground hover:bg-muted hover:text-foreground"
                  )}
                  data-testid={`link-nav-${child.href.replace("/", "")}`}
                >
                  <child.icon className="w-3.5 h-3.5 shrink-0" />
                  <span>{child.label}</span>
                </Link>
              ))}
            </div>
          </div>
        </div>
      );
    }
    return (
      <Link
        key={entry.href}
        href={entry.href}
        className={cn(
          "flex items-center gap-2.5 px-3 py-2 rounded-lg transition-all duration-200 text-sm font-medium",
          location === entry.href
            ? "bg-primary text-primary-foreground shadow-sm"
            : "text-muted-foreground hover:bg-muted hover:text-foreground"
        )}
        data-testid={`link-nav-${entry.href.replace("/", "") || "dashboard"}`}
      >
        <entry.icon className="w-4 h-4 shrink-0" />
        <span>{entry.label}</span>
      </Link>
    );
  };

  return (
    <aside className="hidden md:flex flex-col w-56 border-r bg-card/60 backdrop-blur-xl h-screen sticky top-0 z-30 shrink-0">
      <Link href="/" className="block p-4 border-b border-border/60 cursor-pointer" data-testid="link-sidebar-logo">
        <div className="flex items-center gap-2.5">
          <div className="w-8 h-8 rounded-lg bg-[#0066CC] flex flex-col items-center justify-center text-white shadow-md shrink-0">
            <span className="text-[9px] font-bold leading-none tracking-tight">kt</span>
            <span className="text-[7px] font-semibold leading-none tracking-tight">MOS</span>
          </div>
          <div className="min-w-0">
            <h1 className="font-display font-bold text-[13px] leading-tight truncate">종합안전포털시스템</h1>
            <p className="text-[10px] text-muted-foreground">Safety Portal System</p>
          </div>
        </div>
      </Link>

      <div className="flex-1 overflow-y-auto px-2 py-3 space-y-4">
        {NAV_SECTIONS.map((section, si) => {
          const filteredEntries = filterEntries(section.entries);
          if (filteredEntries.length === 0) return null;
          return (
            <div key={si}>
              {section.sectionLabel && (
                <p className="px-3 mb-1 text-[10px] font-bold text-muted-foreground/70 uppercase tracking-widest">
                  {section.sectionLabel}
                </p>
              )}
              <div className="flex flex-col gap-0.5">
                {filteredEntries.map(renderEntry)}
              </div>
            </div>
          );
        })}
      </div>

      <div className="p-3 border-t border-border/60 text-[11px] text-center text-muted-foreground/60">
        v3.0.0
      </div>
    </aside>
  );
}
