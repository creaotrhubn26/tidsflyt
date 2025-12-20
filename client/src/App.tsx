import { Switch, Route } from "wouter";
import { queryClient } from "./lib/queryClient";
import { QueryClientProvider } from "@tanstack/react-query";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";
import { ThemeProvider } from "@/components/theme-provider";
import NotFound from "@/pages/not-found";
import Landing from "@/pages/landing";
import Dashboard from "@/pages/dashboard";
import TimeTracking from "@/pages/time-tracking";
import Reports from "@/pages/reports";
import CaseReports from "@/pages/case-reports";
import Users from "@/pages/users";
import Profile from "@/pages/profile";
import CMS from "@/pages/cms";
import Vendors from "@/pages/vendors";

function Router() {
  return (
    <Switch>
      <Route path="/" component={Landing} />
      <Route path="/dashboard" component={Dashboard} />
      <Route path="/time" component={TimeTracking} />
      <Route path="/reports" component={Reports} />
      <Route path="/case-reports" component={CaseReports} />
      <Route path="/users" component={Users} />
      <Route path="/profile" component={Profile} />
      <Route path="/invites" component={Users} />
      <Route path="/cases" component={Dashboard} />
      <Route path="/settings" component={Profile} />
      <Route path="/vendors" component={Vendors} />
      <Route path="/cms" component={CMS} />
      <Route component={NotFound} />
    </Switch>
  );
}

function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <ThemeProvider defaultTheme="system" storageKey="smart-timing-theme">
        <TooltipProvider>
          <Toaster />
          <Router />
        </TooltipProvider>
      </ThemeProvider>
    </QueryClientProvider>
  );
}

export default App;
