import { Suspense, lazy } from "react";
import { Switch, Route } from "wouter";
import { queryClient } from "./lib/queryClient";
import { QueryClientProvider } from "@tanstack/react-query";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";
import { ThemeProvider } from "@/components/theme-provider";
import NotFound from "@/pages/not-found";

const Landing = lazy(() => import("@/pages/landing"));
const Dashboard = lazy(() => import("@/pages/dashboard"));
const TimeTracking = lazy(() => import("@/pages/time-tracking"));
const Reports = lazy(() => import("@/pages/reports"));
const CaseReports = lazy(() => import("@/pages/case-reports"));
const Users = lazy(() => import("@/pages/users"));
const Profile = lazy(() => import("@/pages/profile"));
const CMS = lazy(() => import("@/pages/cms"));
const CMSPageLegacy = lazy(() =>
  import("@/pages/cms").then((module) => ({ default: module.CMSPageLegacy })),
);
const Vendors = lazy(() => import("@/pages/vendors"));
const Contact = lazy(() => import("@/pages/contact"));
const Privacy = lazy(() => import("@/pages/privacy"));
const Terms = lazy(() => import("@/pages/terms"));
const AdminCaseReviews = lazy(() => import("@/pages/admin-case-reviews"));
const ApiDocs = lazy(() => import("@/pages/api-docs"));
const VendorApiAdmin = lazy(() => import("@/pages/vendor-api-admin"));
const AccessRequests = lazy(() => import("@/pages/access-requests"));
const WhyTidum = lazy(() => import("@/pages/why-tidum"));
const InteractiveGuide = lazy(() => import("@/pages/interactive-guide"));

function RouteLoadingFallback() {
  return (
    <main className="min-h-screen bg-[radial-gradient(circle_at_12%_8%,rgba(78,154,111,0.12),transparent_30%),radial-gradient(circle_at_88%_2%,rgba(31,107,115,0.12),transparent_34%),#eef3f1] p-6">
      <div className="mx-auto flex min-h-[70vh] w-full max-w-[1100px] items-center justify-center rounded-2xl border border-[#d6e2de] bg-white/80 shadow-[0_12px_30px_rgba(20,58,65,0.07)]">
        <div className="inline-flex items-center gap-3 text-sm font-medium text-[#2e535c]">
          <span className="h-2.5 w-2.5 animate-pulse rounded-full bg-[#1F6B73]" />
          Laster side...
        </div>
      </div>
    </main>
  );
}

function Router() {
  return (
    <Suspense fallback={<RouteLoadingFallback />}>
      <Switch>
        <Route path="/" component={Landing} />
        <Route path="/dashboard" component={Dashboard} />
        <Route path="/time" component={TimeTracking} />
        <Route path="/reports" component={Reports} />
        <Route path="/case-reports" component={CaseReports} />
        <Route path="/admin/case-reviews" component={AdminCaseReviews} />
        <Route path="/users" component={Users} />
        <Route path="/profile" component={Profile} />
        <Route path="/invites" component={Users} />
        <Route path="/cases" component={CaseReports} />
        <Route path="/settings" component={Profile} />
        <Route path="/vendors" component={Vendors} />
        <Route path="/cms" component={CMS} />
        <Route path="/cms-legacy" component={CMSPageLegacy} />
        <Route path="/kontakt" component={Contact} />
        <Route path="/personvern" component={Privacy} />
        <Route path="/vilkar" component={Terms} />
        <Route path="/api-docs" component={ApiDocs} />
        <Route path="/vendor/api" component={VendorApiAdmin} />
        <Route path="/admin/access-requests" component={AccessRequests} />
        <Route path="/hvorfor" component={WhyTidum} />
        <Route path="/guide" component={InteractiveGuide} />
        <Route component={NotFound} />
      </Switch>
    </Suspense>
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
