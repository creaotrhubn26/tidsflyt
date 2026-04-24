import { Suspense, lazy, useMemo } from "react";
import { Switch, Route, Redirect, useLocation } from "wouter";
import { PortalLayout } from "@/components/portal/portal-layout";
import { queryClient } from "./lib/queryClient";
import { QueryClientProvider } from "@tanstack/react-query";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";
import { OfflineIndicator } from "@/components/offline-indicator";
import { ThemeProvider } from "@/components/theme-provider";
import { ThemeBootstrap } from "@/components/theme-bootstrap";
import "@/lib/i18n"; // initialise i18next (side-effect import)
import { LanguageBootstrap } from "@/components/language-bootstrap";
import { AuthGuard } from "@/components/auth-guard";
import { ErrorBoundary } from "@/components/error-boundary";
import { AnalyticsRuntime } from "@/components/analytics-runtime";
import NotFound from "@/pages/not-found";
import { RolePreviewProvider } from "@/hooks/use-role-preview";
import { ComposeProvider } from "@/components/email/compose-context";
import { ComposeModal } from "@/components/email/compose-modal";
import { TesterFeedbackButton } from "@/components/tester/tester-feedback-button";

const Landing = lazy(() => import("@/pages/landing"));
const Dashboard = lazy(() => import("@/pages/dashboard"));
const TimeTracking = lazy(() => import("@/pages/time-tracking"));
const Reports = lazy(() => import("@/pages/reports"));
const Cases = lazy(() => import("@/pages/cases"));
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
const Tilgjengelighet = lazy(() => import("@/pages/tilgjengelighet"));
const AvvikPage = lazy(() => import("@/pages/avvik"));
const AdminCaseReviews = lazy(() => import("@/pages/admin-case-reviews"));
const ApiDocs = lazy(() => import("@/pages/api-docs"));
const VendorApiAdmin = lazy(() => import("@/pages/vendor-api-admin"));
const AccessRequests = lazy(() => import("@/pages/access-requests"));
const LeavePage = lazy(() => import("@/pages/leave"));
const InvoicesPage = lazy(() => import("@/pages/invoices"));
const OvertimePage = lazy(() => import("@/pages/overtime"));
const RecurringPage = lazy(() => import("@/pages/recurring"));
const TimesheetsPage = lazy(() => import("@/pages/timesheets"));
const ForwardPage = lazy(() => import("@/pages/forward"));
const EmailComposerPage = lazy(() => import("@/pages/email-composer"));
const WhyTidum = lazy(() => import("@/pages/why-tidum"));
const InteractiveGuide = lazy(() => import("@/pages/interactive-guide"));
const BuilderPage = lazy(() => import("@/pages/builder-page"));
const Blog = lazy(() => import("@/pages/blog"));
const BlogPostPage = lazy(() => import("@/pages/blog-post"));
const RapportListePage = lazy(() => import("@/pages/rapporter/RapportListePage"));
const RapportSkrivePage = lazy(() => import("@/pages/rapporter/RapportSkrivePage"));
const TiltakslederPage = lazy(() => import("@/pages/rapporter/TiltakslederPage"));
const AdminTemplatePage = lazy(() => import("@/pages/rapporter/AdminTemplatePage"));
const AdminTesterFeedback = lazy(() => import("@/pages/admin-tester-feedback"));
const InstitutionsPage = lazy(() => import("@/pages/institutions"));
const AdminRapportTemplatesPage = lazy(() => import("@/pages/admin-rapport-templates"));
const AdminRapportTemplateEditPage = lazy(() => import("@/pages/admin-rapport-template-edit"));
const TiltakslederDashboardPage = lazy(() => import("@/pages/tiltaksleder-dashboard"));
const InviteAcceptPage = lazy(() => import("@/pages/invite-accept"));

function RouteLoadingFallback() {
  return (
    <div className="flex items-center justify-center py-12">
      <div className="inline-flex items-center gap-3 text-sm font-medium text-muted-foreground">
        <span className="h-2.5 w-2.5 animate-pulse rounded-full bg-primary" />
        Laster…
      </div>
    </div>
  );
}

function FullscreenLoadingFallback() {
  return (
    <main className="min-h-screen flex items-center justify-center bg-background">
      <div className="inline-flex items-center gap-3 text-sm font-medium text-muted-foreground">
        <span className="h-2.5 w-2.5 animate-pulse rounded-full bg-primary" />
        Laster side...
      </div>
    </main>
  );
}

// Paths that should render inside PortalLayout (with sidebar navigation).
// Checked with prefix-match; put longer/specific paths first if overlapping.
const PROTECTED_LAYOUT_PREFIXES = [
  "/dashboard", "/time", "/time-tracking", "/reports", "/case-reports", "/cases",
  "/profile", "/settings", "/invites", "/users", "/leave", "/invoices", "/overtime",
  "/recurring", "/timesheets", "/forward", "/email", "/rapporter", "/admin",
  "/vendors", "/cms", "/cms-legacy", "/api-docs", "/vendor", "/institusjoner",
  "/tiltaksleder",
];

function isProtectedLayoutPath(pathname: string): boolean {
  return PROTECTED_LAYOUT_PREFIXES.some(p => pathname === p || pathname.startsWith(p + "/") || pathname.startsWith(p + "?"));
}

function Router() {
  const [location] = useLocation();
  const withLayout = useMemo(() => isProtectedLayoutPath(location), [location]);

  const switchElement = (
    <Switch>
        {/* Public routes */}
        <Route path="/" component={Landing} />
        <Route path="/kontakt" component={Contact} />
        <Route path="/privacy" component={Privacy} />
        <Route path="/personvern" component={Privacy} />
        <Route path="/privacy-policy" component={Privacy} />
        <Route path="/tilgjengelighet" component={Tilgjengelighet} />
        <Route path="/accessibility" component={Tilgjengelighet} />
        <Route path="/avvik" component={AvvikPage} />
        <Route path="/terms" component={Terms} />
        <Route path="/vilkar" component={Terms} />
        <Route path="/terms-and-conditions" component={Terms} />
        <Route path="/hvorfor" component={WhyTidum} />
        <Route path="/guide" component={InteractiveGuide} />
        <Route path="/blog" component={Blog} />
        <Route path="/blog/:slug" component={BlogPostPage} />
        <Route path="/p/:slug" component={BuilderPage} />
        <Route path="/invite/:token" component={InviteAcceptPage} />

        {/* Protected routes */}
        <Route path="/dashboard">{() => <AuthGuard><Dashboard /></AuthGuard>}</Route>
        <Route path="/time-tracking">{() => <AuthGuard><TimeTracking /></AuthGuard>}</Route>
        <Route path="/time">{() => <AuthGuard><TimeTracking /></AuthGuard>}</Route>
        <Route path="/reports">{() => <AuthGuard><Redirect to="/rapporter/godkjenning" /></AuthGuard>}</Route>
        <Route path="/case-reports">{() => <AuthGuard><CaseReports /></AuthGuard>}</Route>
        <Route path="/cases">{() => <AuthGuard requiredRoles={["tiltaksleder"]}><Cases /></AuthGuard>}</Route>
        <Route path="/illustration-mock">{() => <AuthGuard requiredRoles={["hovedadmin", "admin", "super_admin"]}><Redirect to="/cms?tool=illustration-mock" /></AuthGuard>}</Route>
        <Route path="/profile">{() => <AuthGuard><Profile /></AuthGuard>}</Route>
        <Route path="/settings">{() => <AuthGuard><Profile /></AuthGuard>}</Route>
        <Route path="/invites">{() => <AuthGuard requiredRoles={["tiltaksleder"]}><Users /></AuthGuard>}</Route>
        <Route path="/users">{() => <AuthGuard requiredRoles={["tiltaksleder"]}><Redirect to="/invites" /></AuthGuard>}</Route>
        <Route path="/leave">{() => <AuthGuard><LeavePage /></AuthGuard>}</Route>
        <Route path="/invoices">{() => <AuthGuard requiredRoles={["tiltaksleder"]}><InvoicesPage /></AuthGuard>}</Route>
        <Route path="/overtime">{() => <AuthGuard><OvertimePage /></AuthGuard>}</Route>
        <Route path="/recurring">{() => <AuthGuard><RecurringPage /></AuthGuard>}</Route>
        <Route path="/timesheets">{() => <AuthGuard requiredRoles={["miljoarbeider", "tiltaksleder", "teamleder", "hovedadmin", "admin", "super_admin"]}><TimesheetsPage /></AuthGuard>}</Route>
        <Route path="/forward">{() => <AuthGuard requiredRoles={["tiltaksleder", "teamleder", "hovedadmin", "admin", "super_admin"]}><ForwardPage /></AuthGuard>}</Route>
        <Route path="/email">{() => <AuthGuard requiredRoles={["tiltaksleder", "teamleder", "hovedadmin", "admin", "super_admin"]}><EmailComposerPage /></AuthGuard>}</Route>

        {/* Institusjoner */}
        <Route path="/institusjoner">{() => <AuthGuard><InstitutionsPage /></AuthGuard>}</Route>

        {/* Tiltaksleder dashboard */}
        <Route path="/tiltaksleder">{() => <AuthGuard requiredRoles={["tiltaksleder", "teamleder", "vendor_admin", "hovedadmin", "admin", "super_admin"]}><TiltakslederDashboardPage /></AuthGuard>}</Route>

        {/* Rapport routes */}
        <Route path="/rapporter">{() => <AuthGuard><RapportListePage /></AuthGuard>}</Route>
        <Route path="/rapporter/ny">{() => <AuthGuard><RapportSkrivePage /></AuthGuard>}</Route>
        <Route path="/rapporter/godkjenning">{() => <AuthGuard requiredRoles={["tiltaksleder", "vendor_admin", "hovedadmin", "admin", "super_admin"]}><TiltakslederPage /></AuthGuard>}</Route>
        <Route path="/rapporter/:id">{() => <AuthGuard><RapportSkrivePage /></AuthGuard>}</Route>
        <Route path="/admin/rapportmal">{() => <AuthGuard requiredRoles={["vendor_admin", "hovedadmin", "admin", "super_admin"]}><AdminTemplatePage /></AuthGuard>}</Route>

        {/* Admin routes */}
        <Route path="/admin/case-reviews">{() => <AuthGuard requiredRoles={["tiltaksleder", "teamleder", "hovedadmin", "admin", "super_admin"]}><AdminCaseReviews /></AuthGuard>}</Route>
        <Route path="/admin/tester-feedback">{() => <AuthGuard requiredRoles={["super_admin", "hovedadmin", "admin"]}><AdminTesterFeedback /></AuthGuard>}</Route>
        <Route path="/admin/rapport-maler">{() => <AuthGuard requiredRoles={["vendor_admin", "hovedadmin", "admin", "super_admin"]}><AdminRapportTemplatesPage /></AuthGuard>}</Route>
        <Route path="/admin/rapport-maler/:id">{() => <AuthGuard requiredRoles={["vendor_admin", "hovedadmin", "admin", "super_admin"]}><AdminRapportTemplateEditPage /></AuthGuard>}</Route>
        <Route path="/vendors">{() => <AuthGuard requiredRoles={["hovedadmin", "admin", "super_admin"]}><Vendors /></AuthGuard>}</Route>
        <Route path="/cms">{() => <AuthGuard requiredRoles={["hovedadmin", "admin", "super_admin"]}><CMS /></AuthGuard>}</Route>
        <Route path="/cms-legacy">{() => <AuthGuard requiredRoles={["hovedadmin", "admin", "super_admin"]}><CMSPageLegacy /></AuthGuard>}</Route>
        <Route path="/api-docs">{() => <AuthGuard requiredRoles={["tiltaksleder", "teamleder", "hovedadmin", "admin", "super_admin"]}><ApiDocs /></AuthGuard>}</Route>
        <Route path="/vendor/api">{() => <AuthGuard requiredRoles={["vendor_admin", "hovedadmin", "admin", "super_admin"]}><VendorApiAdmin /></AuthGuard>}</Route>
        <Route path="/admin/access-requests">{() => <AuthGuard requiredRoles={["hovedadmin", "admin", "super_admin"]}><AccessRequests /></AuthGuard>}</Route>

        <Route component={NotFound} />
      </Switch>
  );

  if (withLayout) {
    return (
      <PortalLayout>
        <Suspense fallback={<RouteLoadingFallback />}>
          {switchElement}
        </Suspense>
      </PortalLayout>
    );
  }

  return (
    <Suspense fallback={<FullscreenLoadingFallback />}>
      {switchElement}
    </Suspense>
  );
}

function App() {
  return (
    <ErrorBoundary>
      <QueryClientProvider client={queryClient}>
        <ThemeProvider defaultTheme="system" storageKey="smart-timing-theme">
          <ThemeBootstrap />
          <LanguageBootstrap />
          <TooltipProvider>
            <Toaster />
            <AnalyticsRuntime />
            <OfflineIndicator />
            <RolePreviewProvider>
              <ComposeProvider>
                <main id="main-content">
                  <Router />
                </main>
                <ComposeModal />
                <TesterFeedbackButton />
              </ComposeProvider>
            </RolePreviewProvider>
          </TooltipProvider>
        </ThemeProvider>
      </QueryClientProvider>
    </ErrorBoundary>
  );
}

export default App;
