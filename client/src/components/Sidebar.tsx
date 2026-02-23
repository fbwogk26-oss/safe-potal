import { Link, useLocation } from "wouter";
import { 
  LayoutDashboard, 
  Bell, 
  ShieldCheck, 
  Shield,
  HeartPulse,
  Car,
  GraduationCap, 
  FileText,
  ClipboardCheck,
  ShoppingCart,
  AlertTriangle,
  ShieldAlert,
  FlaskConical,
  BookOpen,
  DoorOpen,
  MonitorPlay,
  ChevronDown
} from "lucide-react";
import { cn } from "@/lib/utils";
import { useState } from "react";

type NavItem = {
  label: string;
  href: string;
  icon: any;
};

type NavGroup = {
  label: string;
  icon: any;
  children: NavItem[];
};

type NavEntry = NavItem | NavGroup;

function isGroup(entry: NavEntry): entry is NavGroup {
  return "children" in entry;
}

const NAV_ITEMS: NavEntry[] = [
  { label: "대시보드", href: "/", icon: LayoutDashboard },
  { label: "공지/알림", href: "/notices", icon: Bell },
  { label: "안전수칙", href: "/rules", icon: ShieldCheck },
  {
    label: "안전관리",
    icon: Shield,
    children: [
      { label: "사고보고/통계", href: "/accidents", icon: AlertTriangle },
      { label: "안전보호구 현황", href: "/equipment/status", icon: ShieldCheck },
      { label: "안전교육 자료", href: "/education", icon: GraduationCap },
      { label: "교육일지", href: "/education-logs", icon: FileText },
      { label: "안전점검", href: "/inspections", icon: ClipboardCheck },
      { label: "안전용품 신청", href: "/equipment", icon: ShoppingCart },
      { label: "위험성평가", href: "/risk-assessment", icon: ShieldAlert },
    ],
  },
  {
    label: "보건관리",
    icon: HeartPulse,
    children: [
      { label: "MSDS검색", href: "/msds", icon: FlaskConical },
    ],
  },
  {
    label: "차량관리",
    icon: Car,
    children: [
      { label: "차량관리 현황", href: "/vehicle", icon: Car },
      { label: "차량운행일지", href: "/vehicle-logs", icon: BookOpen },
    ],
  },
  { label: "출입신청", href: "/access", icon: DoorOpen },
  { label: "전자게시판", href: "/digital-board", icon: MonitorPlay },
];

export function Sidebar() {
  const [location] = useLocation();
  const [openGroups, setOpenGroups] = useState<Record<string, boolean>>({});

  const toggleGroup = (label: string) => {
    setOpenGroups((prev) => ({ ...prev, [label]: !prev[label] }));
  };

  const isChildActive = (group: NavGroup) =>
    group.children.some((child) => location === child.href);

  const isGroupOpen = (group: NavGroup) => {
    if (openGroups[group.label] !== undefined) return openGroups[group.label];
    return isChildActive(group);
  };

  return (
    <aside className="hidden md:flex flex-col w-60 border-r bg-card/50 backdrop-blur-xl h-screen sticky top-0 z-30">
      <Link href="/" className="block p-4 border-b border-border/50 hover-elevate transition-colors cursor-pointer" data-testid="link-sidebar-logo">
        <div className="flex items-center gap-3">
          <div className="w-9 h-9 rounded-xl bg-[#0066CC] flex flex-col items-center justify-center text-white shadow-lg">
            <span className="text-[10px] font-bold leading-none tracking-tight">kt</span>
            <span className="text-[7px] font-semibold leading-none tracking-tight">MOS</span>
          </div>
          <div>
            <h1 className="font-display font-bold text-base leading-tight">종합안전포털시스템</h1>
            <p className="text-xs text-muted-foreground">Safety Portal System</p>
          </div>
        </div>
      </Link>
      <div className="flex-1 overflow-y-auto px-3 py-2">
        <div className="flex flex-col gap-0.5">
          {NAV_ITEMS.map((entry) => {
            if (isGroup(entry)) {
              const open = isGroupOpen(entry);
              const childActive = isChildActive(entry);
              return (
                <div key={entry.label}>
                  <button
                    onClick={() => toggleGroup(entry.label)}
                    className={cn(
                      "flex items-center gap-3 px-3 py-2.5 rounded-lg transition-all duration-200 font-medium text-sm w-full",
                      childActive
                        ? "text-primary"
                        : "text-muted-foreground hover:bg-muted hover:text-foreground"
                    )}
                    data-testid={`button-nav-group-${entry.label}`}
                  >
                    <entry.icon className="w-4 h-4" />
                    <span className="flex-1 text-left">{entry.label}</span>
                    <ChevronDown
                      className={cn(
                        "w-3.5 h-3.5 transition-transform duration-200",
                        open && "rotate-180"
                      )}
                    />
                  </button>
                  <div
                    className={cn(
                      "overflow-hidden transition-all duration-200",
                      open ? "max-h-96 opacity-100" : "max-h-0 opacity-0"
                    )}
                  >
                    <div className="ml-4 pl-3 border-l border-border/40 flex flex-col gap-0.5 mt-0.5 pb-1">
                      {entry.children.map((child) => (
                        <Link
                          key={child.href}
                          href={child.href}
                          className={cn(
                            "flex items-center gap-3 px-3 py-2 rounded-lg transition-all duration-200 font-medium text-[13px]",
                            location === child.href
                              ? "bg-primary text-primary-foreground shadow-md"
                              : "text-muted-foreground hover:bg-muted hover:text-foreground"
                          )}
                          data-testid={`link-nav-${child.href.replace("/", "")}`}
                        >
                          <child.icon className="w-3.5 h-3.5" />
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
                  "flex items-center gap-3 px-3 py-2.5 rounded-lg transition-all duration-200 font-medium text-sm",
                  location === entry.href
                    ? "bg-primary text-primary-foreground shadow-md"
                    : "text-muted-foreground hover:bg-muted hover:text-foreground"
                )}
                data-testid={`link-nav-${entry.href.replace("/", "") || "dashboard"}`}
              >
                <entry.icon className="w-4 h-4" />
                <span>{entry.label}</span>
              </Link>
            );
          })}
        </div>
      </div>
      <div className="p-3 border-t border-border/50 text-xs text-center text-muted-foreground">
        v3.0.0
      </div>
    </aside>
  );
}
