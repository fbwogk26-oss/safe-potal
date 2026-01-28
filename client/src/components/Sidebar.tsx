import { Link, useLocation } from "wouter";
import { 
  LayoutDashboard, 
  ShieldCheck, 
  Bell, 
  GraduationCap, 
  Menu,
  X
} from "lucide-react";
import { useState } from "react";
import { Sheet, SheetContent, SheetTrigger } from "@/components/ui/sheet";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

const NAV_ITEMS = [
  { label: "Dashboard", href: "/", icon: LayoutDashboard },
  { label: "Safety Rules", href: "/rules", icon: ShieldCheck },
  { label: "Notices", href: "/notices", icon: Bell },
  { label: "Education", href: "/education", icon: GraduationCap },
];

export function Sidebar() {
  const [location] = useLocation();

  const NavLinks = ({ onClick }: { onClick?: () => void }) => (
    <div className="flex flex-col gap-2 py-4">
      {NAV_ITEMS.map((item) => (
        <Link 
          key={item.href} 
          href={item.href}
          onClick={onClick}
          className={cn(
            "flex items-center gap-3 px-4 py-3 rounded-xl transition-all duration-200 font-medium",
            location === item.href 
              ? "bg-primary text-primary-foreground shadow-lg shadow-primary/25" 
              : "text-muted-foreground hover:bg-muted hover:text-foreground"
          )}
        >
          <item.icon className="w-5 h-5" />
          <span>{item.label}</span>
        </Link>
      ))}
    </div>
  );

  return (
    <>
      {/* Desktop Sidebar */}
      <aside className="hidden md:flex flex-col w-64 border-r bg-card/50 backdrop-blur-xl h-screen sticky top-0 z-30">
        <div className="p-6 border-b border-border/50">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-gradient-to-tr from-primary to-blue-600 flex items-center justify-center text-white shadow-lg shadow-primary/30">
              <ShieldCheck className="w-6 h-6" />
            </div>
            <div>
              <h1 className="font-display font-bold text-lg leading-tight">SafeBoard</h1>
              <p className="text-xs text-muted-foreground">Portal System</p>
            </div>
          </div>
        </div>
        <div className="flex-1 px-4 py-2">
          <NavLinks />
        </div>
        <div className="p-4 border-t border-border/50 text-xs text-center text-muted-foreground">
          v3.0.0 Enterprise Edition
        </div>
      </aside>

      {/* Mobile Sidebar */}
      <div className="md:hidden">
        <Sheet>
          <SheetTrigger asChild>
            <Button variant="ghost" size="icon" className="md:hidden">
              <Menu className="w-6 h-6" />
            </Button>
          </SheetTrigger>
          <SheetContent side="left" className="w-72 p-0">
            <div className="p-6 border-b">
              <div className="flex items-center gap-3">
                <div className="w-8 h-8 rounded-lg bg-primary flex items-center justify-center text-white">
                  <ShieldCheck className="w-5 h-5" />
                </div>
                <h2 className="font-bold text-lg">SafeBoard</h2>
              </div>
            </div>
            <div className="px-4">
              <NavLinks />
            </div>
          </SheetContent>
        </Sheet>
      </div>
    </>
  );
}
