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
import AccessRequest from "@/pages/AccessRequest";
import NotFound from "@/pages/NotFound";
import { useLocation } from "wouter";

function Router() {
  const [location] = useLocation();
  
  return (
    <div className="flex min-h-screen bg-background text-foreground font-body">
      <Sidebar />
      <main className="flex-1 flex flex-col min-w-0 bg-background/50 relative">
        {/* Background gradient orb */}
        <div className="fixed top-0 left-0 w-full h-96 bg-primary/5 blur-3xl pointer-events-none -z-10" />
        
        <Topbar />
        
        <div className="flex-1 px-4 md:px-8 pb-8 max-w-[1600px] mx-auto w-full animate-in fade-in duration-500">
          <Switch>
            <Route path="/" component={Dashboard} />
            <Route path="/rules" component={Rules} />
            <Route path="/notices" component={Notices} />
            <Route path="/education" component={Education} />
            <Route path="/access" component={AccessRequest} />
            <Route component={NotFound} />
          </Switch>
        </div>
      </main>
    </div>
  );
}

function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <TooltipProvider>
        <Router />
        <Toaster />
      </TooltipProvider>
    </QueryClientProvider>
  );
}

export default App;
