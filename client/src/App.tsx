import { Suspense, lazy } from "react";
import { Switch, Route } from "wouter";
import { queryClient } from "./lib/queryClient";
import { QueryClientProvider } from "@tanstack/react-query";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";
import { ThemeProvider } from "@/components/theme-provider";
import { AuthGuard } from "@/components/auth-guard";
import { ErrorBoundary } from "@/components/error-boundary";
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
const BuilderPage = lazy(() => import("@/pages/builder-page"));
const Blog = lazy(() => import("@/pages/blog"));
const BlogPostPage = lazy(() => import("@/pages/blog-post"));

function RouteLoadingFallback() {
  return (
    <main className="min-h-screen flex items-center justify-center bg-background">
      <div className="inline-flex items-center gap-3 text-sm font-medium text-muted-foreground">
        <span className="h-2.5 w-2.5 animate-pulse rounded-full bg-primary" />
        Laster side...
      </div>
    </main>
  );
}

function Router() {
  return (
    <Suspense fallback={<RouteLoadingFallback />}>
      <Switch>
        {/* Public routes */}
        <Route path="/" component={Landing} />
        <Route path="/kontakt" component={Contact} />
        <Route path="/personvern" component={Privacy} />
        <Route path="/vilkar" component={Terms} />
        <Route path="/hvorfor" component={WhyTidum} />
        <Route path="/guide" component={InteractiveGuide} />
        <Route path="/blog" component={Blog} />
        <Route path="/blog/:slug" component={BlogPostPage} />
        <Route path="/p/:slug" component={BuilderPage} />

        {/* Protected routes */}
        <Route path="/dashboard">{() => <AuthGuard><Dashboard /></AuthGuard>}</Route>
        <Route path="/time">{() => <AuthGuard><TimeTracking /></AuthGuard>}</Route>
        <Route path="/reports">{() => <AuthGuard><Reports /></AuthGuard>}</Route>
        <Route path="/case-reports">{() => <AuthGuard><CaseReports /></AuthGuard>}</Route>
        <Route path="/cases">{() => <AuthGuard><CaseReports /></AuthGuard>}</Route>
        <Route path="/profile">{() => <AuthGuard><Profile /></AuthGuard>}</Route>
        <Route path="/settings">{() => <AuthGuard><Profile /></AuthGuard>}</Route>
        <Route path="/invites">{() => <AuthGuard><Users /></AuthGuard>}</Route>

        {/* Admin routes */}
        <Route path="/admin/case-reviews">{() => <AuthGuard requiredRoles={["admin", "super_admin"]}><AdminCaseReviews /></AuthGuard>}</Route>
        <Route path="/users">{() => <AuthGuard requiredRoles={["admin", "super_admin"]}><Users /></AuthGuard>}</Route>
        <Route path="/vendors">{() => <AuthGuard requiredRoles={["admin", "super_admin"]}><Vendors /></AuthGuard>}</Route>
        <Route path="/cms">{() => <AuthGuard requiredRoles={["admin", "super_admin"]}><CMS /></AuthGuard>}</Route>
        <Route path="/cms-legacy">{() => <AuthGuard requiredRoles={["admin", "super_admin"]}><CMSPageLegacy /></AuthGuard>}</Route>
        <Route path="/api-docs">{() => <AuthGuard requiredRoles={["admin", "super_admin"]}><ApiDocs /></AuthGuard>}</Route>
        <Route path="/vendor/api">{() => <AuthGuard requiredRoles={["admin", "super_admin"]}><VendorApiAdmin /></AuthGuard>}</Route>
        <Route path="/admin/access-requests">{() => <AuthGuard requiredRoles={["admin", "super_admin"]}><AccessRequests /></AuthGuard>}</Route>

        <Route component={NotFound} />
      </Switch>
    </Suspense>
  );
}

function App() {
  return (
    <ErrorBoundary>
      <QueryClientProvider client={queryClient}>
        <ThemeProvider defaultTheme="system" storageKey="smart-timing-theme">
          <TooltipProvider>
            <Toaster />
            <main id="main-content">
              <Router />
            </main>
          </TooltipProvider>
        </ThemeProvider>
      </QueryClientProvider>
    </ErrorBoundary>
  );
}

export default App;
