import { Switch, Route } from "wouter";
import { queryClient } from "./lib/queryClient";
import { QueryClientProvider } from "@tanstack/react-query";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";
import { Sidebar } from "@/components/Sidebar";
import { Topbar } from "@/components/Topbar";
import Dashboard from "@/pages/Dashboard";
import Rules from "@/pages/Rules";
import Notices from "@/pages/Notices";
import Education from "@/pages/Education";
import EducationLogs from "@/pages/EducationLogs";
import VehicleManagement from "@/pages/VehicleManagement";
import SafetyEquipment from "@/pages/SafetyEquipment";
import EquipmentStatus from "@/pages/EquipmentStatus";
import EquipmentRequest from "@/pages/EquipmentRequest";
import AccessRequest from "@/pages/AccessRequest";
import DigitalBoard from "@/pages/DigitalBoard";
import SafetyInspections from "@/pages/SafetyInspections";
import VehicleLogs from "@/pages/VehicleLogs";
import AdminUsers from "@/pages/AdminUsers";
import MsdsSearch from "@/pages/MsdsSearch";
import RiskAssessment from "@/pages/RiskAssessment";
import AccidentReports from "@/pages/AccidentReports";
import NewEquipmentRequest from "@/pages/NewEquipmentRequest";
import Login from "@/pages/Login";
import NotFound from "@/pages/NotFound";
import { useAuth } from "@/hooks/use-auth";
import { ChatBot } from "@/components/ChatBot";

function MainLayout() {
  return (
    <div className="flex min-h-screen bg-background text-foreground font-body">
      <Sidebar />
      <main className="flex-1 flex flex-col min-w-0 bg-background/50 relative overflow-x-hidden">
        <div className="fixed top-0 left-0 w-full h-96 bg-primary/5 blur-3xl pointer-events-none -z-10" />
        
        <Topbar />
        
        <div className="flex-1 px-3 sm:px-4 md:px-8 pb-6 md:pb-8 max-w-[1600px] mx-auto w-full animate-in fade-in duration-500">
          <Switch>
            <Route path="/" component={Dashboard} />
            <Route path="/rules" component={Rules} />
            <Route path="/notices" component={Notices} />
            <Route path="/education" component={Education} />
            <Route path="/education-logs" component={EducationLogs} />
            <Route path="/inspections" component={SafetyInspections} />
            <Route path="/vehicle">{() => <VehicleManagement />}</Route>
            <Route path="/equipment">{() => <SafetyEquipment />}</Route>
            <Route path="/equipment/status">{() => <EquipmentStatus />}</Route>
            <Route path="/equipment/request" component={EquipmentRequest} />
            <Route path="/equipment/new-request" component={NewEquipmentRequest} />
            <Route path="/access" component={AccessRequest} />
            <Route path="/vehicle-logs" component={VehicleLogs} />
            <Route path="/msds" component={MsdsSearch} />
            <Route path="/risk-assessment" component={RiskAssessment} />
            <Route path="/accidents" component={AccidentReports} />
            <Route path="/digital-board" component={DigitalBoard} />
            <Route path="/admin/users" component={AdminUsers} />
            <Route component={NotFound} />
          </Switch>
        </div>
      </main>
      <ChatBot />
    </div>
  );
}

function AppContent() {
  const { isAuthenticated, isLoading } = useAuth();

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
