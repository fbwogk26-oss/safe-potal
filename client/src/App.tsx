import { Switch, Route } from "wouter";
import { queryClient } from "./lib/queryClient";
import { QueryClientProvider } from "@tanstack/react-query";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";
import { Sidebar } from "@/components/Sidebar";
import { Topbar } from "@/components/Topbar";
import Dashboard from "@/pages/Dashboard";
import HomePage from "@/pages/HomePage";
import Rules from "@/pages/Rules";
import Notices from "@/pages/Notices";
import Education from "@/pages/Education";
import EducationLogs from "@/pages/EducationLogs";
import SafetyEquipment from "@/pages/SafetyEquipment";
import EquipmentStatus from "@/pages/EquipmentStatus";
import EquipmentRequest from "@/pages/EquipmentRequest";
import AccessRequest from "@/pages/AccessRequest";
import DigitalBoard from "@/pages/DigitalBoard";
import SafetyInspections from "@/pages/SafetyInspections";
import AdminUsers from "@/pages/AdminUsers";
import SecurityLogs from "@/pages/SecurityLogs";
import MsdsSearch from "@/pages/MsdsSearch";
import RiskAssessment from "@/pages/RiskAssessment";
import AccidentReports from "@/pages/AccidentReports";
import MusculoskeletalDisease from "@/pages/MusculoskeletalDisease";
import NewEquipmentRequest from "@/pages/NewEquipmentRequest";
import TrafficFines from "@/pages/TrafficFines";
import WeatherSafetyMessage from "@/pages/WeatherSafetyMessage";
import Login from "@/pages/Login";
import NotFound from "@/pages/NotFound";
import { useAuth } from "@/hooks/use-auth";
import { usePermissions } from "@/hooks/use-permissions";
import { ChatBot } from "@/components/ChatBot";
import { ForcePasswordChange } from "@/components/ForcePasswordChange";
import { ShieldOff } from "lucide-react";

function AccessDenied() {
  return (
    <div className="flex flex-col items-center justify-center h-[60vh] gap-4 text-center">
      <div className="w-16 h-16 rounded-full bg-red-50 dark:bg-red-950/40 flex items-center justify-center">
        <ShieldOff className="w-8 h-8 text-red-500" />
      </div>
      <div>
        <h2 className="text-lg font-bold text-foreground">접근 권한이 없습니다</h2>
        <p className="text-sm text-muted-foreground mt-1">이 페이지에 접근할 권한이 없습니다.<br />관리자에게 문의하세요.</p>
      </div>
    </div>
  );
}

function G({ canAccess, component: C }: { canAccess: boolean; component: React.ComponentType }) {
  return canAccess ? <C /> : <AccessDenied />;
}

function RouterContent() {
  const {
    isAdmin,
    isLoading,
    canViewDashboard,
    canViewRules,
    canViewNotices,
    canViewEducation,
    canViewEducationLogs,
    canViewInspections,
    canViewEquipment,
    canViewEquipmentStatus,
    canViewAccess,
    canViewMsds,
    canViewRiskAssessment,
    canViewAccidents,
    canViewMusculoskeletal,
    canViewVehicle,
    canViewVehicleLogs,
    canViewDigitalBoard,
    canManageUsers,
  } = usePermissions();

  if (isLoading) return null;

  return (
    <Switch>
      <Route path="/" component={HomePage} />
      <Route path="/safety-scores">{() => <G canAccess={canViewDashboard} component={Dashboard} />}</Route>
      <Route path="/rules">{() => <G canAccess={canViewRules} component={Rules} />}</Route>
      <Route path="/notices">{() => <G canAccess={canViewNotices} component={Notices} />}</Route>
      <Route path="/education">{() => <G canAccess={canViewEducation} component={Education} />}</Route>
      <Route path="/education-logs">{() => <G canAccess={canViewEducationLogs} component={EducationLogs} />}</Route>
      <Route path="/inspections">{() => <G canAccess={canViewInspections} component={SafetyInspections} />}</Route>
      <Route path="/equipment">{() => <G canAccess={canViewEquipment} component={SafetyEquipment} />}</Route>
      <Route path="/equipment/status">{() => <G canAccess={canViewEquipmentStatus} component={EquipmentStatus} />}</Route>
      <Route path="/equipment/request">{() => <G canAccess={canViewEquipment} component={EquipmentRequest} />}</Route>
      <Route path="/equipment/new-request">{() => <G canAccess={canViewEquipment} component={NewEquipmentRequest} />}</Route>
      <Route path="/access">{() => <G canAccess={canViewAccess} component={AccessRequest} />}</Route>
      <Route path="/msds">{() => <G canAccess={canViewMsds} component={MsdsSearch} />}</Route>
      <Route path="/risk-assessment">{() => <G canAccess={canViewRiskAssessment} component={RiskAssessment} />}</Route>
      <Route path="/accidents">{() => <G canAccess={canViewAccidents} component={AccidentReports} />}</Route>
      <Route path="/musculoskeletal">{() => <G canAccess={canViewMusculoskeletal} component={MusculoskeletalDisease} />}</Route>
      <Route path="/traffic-fines">{() => <TrafficFines />}</Route>
      <Route path="/digital-board">{() => <G canAccess={canViewDigitalBoard} component={DigitalBoard} />}</Route>
      <Route path="/admin/users">{() => <G canAccess={canManageUsers} component={AdminUsers} />}</Route>
      <Route path="/admin/security">{() => <G canAccess={canManageUsers} component={SecurityLogs} />}</Route>
      <Route path="/weather-safety" component={WeatherSafetyMessage} />
      <Route component={NotFound} />
    </Switch>
  );
}

function MainLayout() {
  return (
    <div className="flex min-h-screen bg-background text-foreground font-body">
      <Sidebar />
      <main className="flex-1 flex flex-col min-w-0 bg-background/50 relative overflow-x-hidden">
        <div className="fixed top-0 left-0 w-full h-96 bg-primary/5 blur-3xl pointer-events-none -z-10" />
        <Topbar />
        <div className="flex-1 px-3 sm:px-5 md:px-8 pt-4 pb-6 md:pb-10 max-w-[1600px] mx-auto w-full animate-in fade-in duration-500">
          <RouterContent />
        </div>
      </main>
      <ChatBot />
    </div>
  );
}

function AppContent() {
  const { isAuthenticated, isLoading, mustChangePassword } = useAuth();

  if (isLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary"></div>
      </div>
    );
  }

  if (!isAuthenticated) {
    return <Login />;
  }

  if (mustChangePassword) {
    return <ForcePasswordChange />;
  }

  return <MainLayout />;
}

function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <TooltipProvider>
        <AppContent />
        <Toaster />
      </TooltipProvider>
    </QueryClientProvider>
  );
}

export default App;
