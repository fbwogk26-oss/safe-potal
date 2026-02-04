import { Link, useLocation } from "wouter";
import { 
  LayoutDashboard, 
  ShieldCheck, 
  Bell, 
  GraduationCap, 
  DoorOpen,
  ShoppingCart,
  MonitorPlay,
  ClipboardCheck
} from "lucide-react";
import { cn } from "@/lib/utils";

const NAV_ITEMS = [
  { label: "대시보드", href: "/", icon: LayoutDashboard },
  { label: "안전수칙", href: "/rules", icon: ShieldCheck },
  { label: "공지/알림", href: "/notices", icon: Bell },
  { label: "안전교육", href: "/education", icon: GraduationCap },
  { label: "안전점검", href: "/inspections", icon: ClipboardCheck },
  { label: "안전용품신청", href: "/equipment", icon: ShoppingCart },
  { label: "출입신청", href: "/access", icon: DoorOpen },
  { label: "전자게시판", href: "/digital-board", icon: MonitorPlay },
];

export function Sidebar() {
  const [location] = useLocation();

  return (
    <aside className="hidden md:flex flex-col w-60 border-r bg-card/50 backdrop-blur-xl h-screen sticky top-0 z-30">
      <Link href="/" className="block p-4 border-b border-border/50 hover-elevate transition-colors cursor-pointer" data-testid="link-sidebar-logo">
        <div className="flex items-center gap-3">
          <div className="w-9 h-9 rounded-xl bg-gradient-to-tr from-primary to-blue-600 flex items-center justify-center text-white shadow-lg shadow-primary/30">
            <ShieldCheck className="w-5 h-5" />
          </div>
          <div>
            <h1 className="font-display font-bold text-base leading-tight">종합안전</h1>
            <p className="text-xs text-muted-foreground">포털시스템</p>
          </div>
        </div>
      </Link>
      <div className="flex-1 px-3 py-2">
        <div className="flex flex-col gap-1">
          {NAV_ITEMS.map((item) => (
            <Link 
              key={item.href} 
              href={item.href}
              className={cn(
                "flex items-center gap-3 px-3 py-2.5 rounded-lg transition-all duration-200 font-medium text-sm",
                location === item.href 
                  ? "bg-primary text-primary-foreground shadow-md" 
                  : "text-muted-foreground hover:bg-muted hover:text-foreground"
              )}
            >
              <item.icon className="w-4 h-4" />
              <span>{item.label}</span>
            </Link>
          ))}
        </div>
      </div>
      <div className="p-3 border-t border-border/50 text-xs text-center text-muted-foreground">
        v3.0.0
      </div>
    </aside>
  );
}
