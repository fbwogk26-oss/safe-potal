import { useState } from "react";
import { Switch, Route, useLocation } from "wouter";
import { queryClient } from "./lib/queryClient";
import { QueryClientProvider } from "@tanstack/react-query";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";
import { Sidebar } from "@/components/Sidebar";
import { Topbar } from "@/components/Topbar";
import { ThemeProvider } from "@/hooks/use-theme";
import PublicSign from "@/pages/PublicSign";
import PublicEquipSign from "@/pages/PublicEquipSign";
import PublicTaskSign from "@/pages/PublicTaskSign";
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
import OtherSafetyInspections from "@/pages/OtherSafetyInspections";
import AdminUsers from "@/pages/AdminUsers";
import SecurityLogs from "@/pages/SecurityLogs";
import ApiLogs from "@/pages/ApiLogs";
import SignatureAdmin from "@/pages/SignatureAdmin";
import AdminBackup from "@/pages/AdminBackup";
import CardNewsAdmin from "@/pages/CardNewsAdmin";
import MsdsSearch from "@/pages/MsdsSearch";
import RiskAssessment from "@/pages/RiskAssessment";
import AccidentReports from "@/pages/AccidentReports";
import NearMiss from "@/pages/NearMiss";
import PublicNearMiss from "@/pages/PublicNearMiss";
import MusculoskeletalDisease from "@/pages/MusculoskeletalDisease";
import NewEquipmentRequest from "@/pages/NewEquipmentRequest";
import SafetySupplySurvey from "@/pages/SafetySupplySurvey";
import TrafficFines from "@/pages/TrafficFines";
import WorkPlan from "@/pages/WorkPlan";
import SafetyCommittee from "@/pages/SafetyCommittee";
import JointInspection from "@/pages/JointInspection";
import AttendanceManagement from "@/pages/AttendanceManagement";
import EducationTasksPage from "@/pages/EducationTasksPage";
import WeatherSafetyMessage from "@/pages/WeatherSafetyMessage";
import MusicManager from "@/pages/MusicManager";
import FuelCosts from "@/pages/FuelCosts";
import SafetyManagerReports from "@/pages/SafetyManagerReports";
import HealthManagerReports from "@/pages/HealthManagerReports";
import HeatWaveChecklist from "@/pages/HeatWaveChecklist";
import AisSafetyRate from "@/pages/AisSafetyRate";
import SafetyCostBudget from "@/pages/SafetyCostBudget";
import DrillTraining from "@/pages/DrillTraining";
import Login from "@/pages/Login";
import NotFound from "@/pages/NotFound";
import UiMockupPreview from "@/pages/UiMockupPreview";
import { useAuth } from "@/hooks/use-auth";
import { usePermissions } from "@/hooks/use-permissions";
import { ForcePasswordChange } from "@/components/ForcePasswordChange";
import { MusicPlayer } from "@/components/MusicPlayer";
import { useRealtime } from "@/hooks/use-realtime";
import { ShieldOff } from "lucide-react";
import { HeadquartersProvider } from "@/contexts/HeadquartersContext";

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
    canViewEducationOrLogs,
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
      <Route path="/education">{() => <G canAccess={canViewEducationOrLogs} component={EducationLogs} />}</Route>
      <Route path="/inspections">{() => <G canAccess={canViewInspections} component={SafetyInspections} />}</Route>
      <Route path="/inspections/other">{() => <G canAccess={canViewInspections} component={OtherSafetyInspections} />}</Route>
      <Route path="/equipment">{() => <G canAccess={canViewEquipment} component={SafetyEquipment} />}</Route>
      <Route path="/equipment/status">{() => <G canAccess={canViewEquipmentStatus} component={EquipmentStatus} />}</Route>
      <Route path="/equipment/request">{() => <G canAccess={canViewEquipment} component={EquipmentRequest} />}</Route>
      <Route path="/equipment/new-request">{() => <G canAccess={canViewEquipment} component={NewEquipmentRequest} />}</Route>
      <Route path="/equipment/supply-survey">{() => <G canAccess={canViewEquipment} component={SafetySupplySurvey} />}</Route>
      <Route path="/access">{() => <G canAccess={canViewAccess} component={AccessRequest} />}</Route>
      <Route path="/msds">{() => <G canAccess={canViewMsds} component={MsdsSearch} />}</Route>
      <Route path="/risk-assessment">{() => <G canAccess={canViewRiskAssessment} component={RiskAssessment} />}</Route>
      <Route path="/accidents">{() => <G canAccess={canViewAccidents} component={AccidentReports} />}</Route>
      <Route path="/near-miss">{() => <G canAccess={canViewAccidents} component={NearMiss} />}</Route>
      <Route path="/musculoskeletal">{() => <G canAccess={canViewMusculoskeletal} component={MusculoskeletalDisease} />}</Route>
      <Route path="/traffic-fines">{() => <TrafficFines />}</Route>
      <Route path="/work-plan">{() => <WorkPlan />}</Route>
      <Route path="/safety-committee">{() => <SafetyCommittee />}</Route>
      <Route path="/joint-inspection">{() => <JointInspection />}</Route>
      <Route path="/attendance">{() => <AttendanceManagement />}</Route>
      <Route path="/education-management">{() => <EducationTasksPage />}</Route>
      <Route path="/digital-board">{() => <G canAccess={canViewDigitalBoard} component={DigitalBoard} />}</Route>
      <Route path="/admin/users">{() => <G canAccess={canManageUsers} component={AdminUsers} />}</Route>
      <Route path="/admin/security">{() => <G canAccess={canManageUsers} component={SecurityLogs} />}</Route>
      <Route path="/admin/api-logs">{() => <G canAccess={isAdmin} component={ApiLogs} />}</Route>
      <Route path="/admin/music">{() => <G canAccess={isAdmin} component={MusicManager} />}</Route>
      <Route path="/admin/fuel-costs">{() => <G canAccess={isAdmin} component={FuelCosts} />}</Route>
      <Route path="/admin/signatures">{() => <G canAccess={isAdmin} component={SignatureAdmin} />}</Route>
      <Route path="/admin/backup">{() => <G canAccess={isAdmin} component={AdminBackup} />}</Route>
      <Route path="/admin/card-news">{() => <G canAccess={isAdmin} component={CardNewsAdmin} />}</Route>
      <Route path="/safety-manager-reports">{() => <G canAccess={canViewInspections} component={SafetyManagerReports} />}</Route>
      <Route path="/health-manager-reports">{() => <G canAccess={canViewInspections} component={HealthManagerReports} />}</Route>
      <Route path="/heat-wave-checklist">{() => <G canAccess={canViewMusculoskeletal} component={HeatWaveChecklist} />}</Route>
      <Route path="/safety-cost-budget">{() => <G canAccess={canViewInspections} component={SafetyCostBudget} />}</Route>
      <Route path="/ais-safety-rate">{() => <AisSafetyRate />}</Route>
      <Route path="/drill-training">{() => <G canAccess={canViewAccidents} component={DrillTraining} />}</Route>
      <Route path="/weather-safety" component={WeatherSafetyMessage} />
      <Route path="/ui-mockup-preview" component={UiMockupPreview} />
      <Route component={NotFound} />
    </Switch>
  );
}

function MainLayout() {
  useRealtime();
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  return (
    <div className="flex min-h-screen bg-background text-foreground font-body">
      <Sidebar mobileOpen={mobileMenuOpen} onMobileClose={() => setMobileMenuOpen(false)} />
      <main className="flex-1 flex flex-col min-w-0 bg-background/50 relative overflow-x-hidden">
        <div className="fixed top-0 left-0 w-full h-96 bg-primary/5 blur-3xl pointer-events-none -z-10" />
        <Topbar onMenuClick={() => setMobileMenuOpen(true)} />
        <div className="flex-1 px-3 sm:px-5 md:px-8 pt-4 pb-24 max-w-[1600px] mx-auto w-full animate-in fade-in duration-500">
          <RouterContent />
        </div>
      </main>
      <MusicPlayer />
    </div>
  );
}

function AppContent() {
  const { isAuthenticated, isLoading, mustChangePassword } = useAuth();
  const [location] = useLocation();

  if (location.startsWith("/near-miss/submit")) {
    return <Switch><Route path="/near-miss/submit" component={PublicNearMiss} /></Switch>;
  }
  if (location.startsWith("/sign/equip/")) {
    return <Switch><Route path="/sign/equip/:id" component={PublicEquipSign} /></Switch>;
  }
  if (location.startsWith("/sign/task/")) {
    return <Switch><Route path="/sign/task/:id" component={PublicTaskSign} /></Switch>;
  }
  if (location.startsWith("/sign/")) {
    return <Switch><Route path="/sign/:id" component={PublicSign} /></Switch>;
  }

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
    <ThemeProvider>
      <HeadquartersProvider>
        <QueryClientProvider client={queryClient}>
          <TooltipProvider>
            <AppContent />
            <Toaster />
          </TooltipProvider>
        </QueryClientProvider>
      </HeadquartersProvider>
    </ThemeProvider>
  );
}

export default App;
