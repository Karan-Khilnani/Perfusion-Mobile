import { Switch, Route, Router as WouterRouter } from "wouter";
import { queryClient } from "./lib/queryClient";
import { QueryClientProvider } from "@tanstack/react-query";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";
import { ThemeProvider } from "@/components/theme-provider";
import NotFound from "@/pages/not-found";
import { CallProvider } from "@/components/call-provider";

import Home from "@/pages/home";
import LandingPage from "@/pages/landing";
import LoginPage from "@/pages/login";
import RegisterPage from "@/pages/register";
import SelectRolePage from "@/pages/select-role";
import CompleteProfilePage from "@/pages/complete-profile";
import VerifyEmailPage from "@/pages/verify-email";
import VerifyPrescriptionPage from "@/pages/verify-prescription";
import PendingApprovalPage from "@/pages/pending-approval";
import UserLayout from "@/pages/user/layout";
import UserDashboard from "@/pages/user/dashboard";
import LabsPage from "@/pages/user/labs";
import LabBookingPage from "@/pages/user/lab-booking";
import ConsultationPage from "@/pages/user/consultation";
import ConsultationBookingPage from "@/pages/user/consultation-booking";
import TeleradiologyPage from "@/pages/user/teleradiology";
import OrdersPage from "@/pages/user/orders";
import UserBillingPage from "@/pages/user/billing";
import VideoRoomPage from "@/pages/video-room";
import PublicConsultantsPage from "@/pages/public/consultants";
import PublicLabTestsPage from "@/pages/public/lab-tests";

import ProfilePage from "@/pages/profile";

import ProviderLayout from "@/pages/provider/layout";
import ProviderDashboard from "@/pages/provider/dashboard";
import ProviderBookingsPage from "@/pages/provider/bookings";
import ProviderServicesPage from "@/pages/provider/services";
import ProviderOnboardingPage from "@/pages/provider/onboarding";
import ProviderBillingPage from "@/pages/provider/billing";

import AdminLayout from "@/pages/admin/layout";
import AdminDashboard from "@/pages/admin/dashboard";
import AdminBookingsPage from "@/pages/admin/bookings";
import AdminProvidersPage from "@/pages/admin/providers";
import AdminUsersPage from "@/pages/admin/users";
import AdminConsultantsPage from "@/pages/admin/consultants";
import AdminLabTestsPage from "@/pages/admin/lab-tests";
import AdminRadiologyPage from "@/pages/admin/radiology";
import AdminSuggestionsPage from "@/pages/admin/suggestions";
import AdminApprovalsPage from "@/pages/admin/approvals";
import AdminBillingPage from "@/pages/admin/billing";
import AdminAnalyticsPage from "@/pages/admin/analytics";
import AdminDiagnosticsPage from "@/pages/admin/diagnostics";

function withUserLayout(Component: React.ComponentType) {
  return function WrappedComponent() {
    return (
      <UserLayout>
        <Component />
      </UserLayout>
    );
  };
}

function withProviderLayout(Component: React.ComponentType) {
  return function WrappedComponent() {
    return (
      <ProviderLayout>
        <Component />
      </ProviderLayout>
    );
  };
}

function withAdminLayout(Component: React.ComponentType) {
  return function WrappedComponent() {
    return (
      <AdminLayout>
        <Component />
      </AdminLayout>
    );
  };
}

function Router() {
  return (
    <Switch>
      <Route path="/" component={LandingPage} />
      <Route path="/home" component={Home} />
      <Route path="/login" component={LoginPage} />
      <Route path="/register" component={RegisterPage} />
      <Route path="/select-role" component={SelectRolePage} />
      <Route path="/complete-profile" component={CompleteProfilePage} />
      <Route path="/verify-email" component={VerifyEmailPage} />
      <Route path="/verify/prescription/:bookingId" component={VerifyPrescriptionPage} />
      <Route path="/pending-approval" component={PendingApprovalPage} />
      <Route path="/consultants" component={PublicConsultantsPage} />
      <Route path="/lab-tests" component={PublicLabTestsPage} />
      <Route path="/provider/onboarding" component={ProviderOnboardingPage} />
      
      <Route path="/user" component={withUserLayout(UserDashboard)} />
      <Route path="/user/labs" component={withUserLayout(LabsPage)} />
      <Route path="/user/labs/:id/book" component={withUserLayout(LabBookingPage)} />
      <Route path="/user/consultation" component={withUserLayout(ConsultationPage)} />
      <Route path="/user/consultation/:id/book" component={withUserLayout(ConsultationBookingPage)} />
      <Route path="/user/teleradiology" component={withUserLayout(TeleradiologyPage)} />
      <Route path="/user/orders" component={withUserLayout(OrdersPage)} />
      <Route path="/user/billing" component={withUserLayout(UserBillingPage)} />
      <Route path="/user/profile" component={withUserLayout(ProfilePage)} />
      <Route path="/video/:roomId" component={VideoRoomPage} />
      
      <Route path="/provider" component={withProviderLayout(ProviderDashboard)} />
      <Route path="/provider/bookings" component={withProviderLayout(ProviderBookingsPage)} />
      <Route path="/provider/services" component={withProviderLayout(ProviderServicesPage)} />
      <Route path="/provider/billing" component={withProviderLayout(ProviderBillingPage)} />
      <Route path="/provider/profile" component={withProviderLayout(ProfilePage)} />
      
      <Route path="/admin" component={withAdminLayout(AdminDashboard)} />
      <Route path="/admin/bookings" component={withAdminLayout(AdminBookingsPage)} />
      <Route path="/admin/consultants" component={withAdminLayout(AdminConsultantsPage)} />
      <Route path="/admin/lab-tests" component={withAdminLayout(AdminLabTestsPage)} />
      <Route path="/admin/radiology" component={withAdminLayout(AdminRadiologyPage)} />
      <Route path="/admin/suggestions" component={withAdminLayout(AdminSuggestionsPage)} />
      <Route path="/admin/approvals" component={withAdminLayout(AdminApprovalsPage)} />
      <Route path="/admin/providers" component={withAdminLayout(AdminProvidersPage)} />
      <Route path="/admin/billing" component={withAdminLayout(AdminBillingPage)} />
      <Route path="/admin/analytics" component={withAdminLayout(AdminAnalyticsPage)} />
      <Route path="/admin/users" component={withAdminLayout(AdminUsersPage)} />
      <Route path="/admin/diagnostics" component={withAdminLayout(AdminDiagnosticsPage)} />
      
      <Route component={NotFound} />
    </Switch>
  );
}

function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <ThemeProvider defaultTheme="light" storageKey="perfusion-theme">
        <TooltipProvider>
          <WouterRouter base={import.meta.env.BASE_URL.replace(/\/$/, "")}>
            <CallProvider>
              <Router />
              <Toaster />
            </CallProvider>
          </WouterRouter>
        </TooltipProvider>
      </ThemeProvider>
    </QueryClientProvider>
  );
}

export default App;
