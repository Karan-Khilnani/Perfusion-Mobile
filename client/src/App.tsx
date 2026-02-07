import { Switch, Route } from "wouter";
import { queryClient } from "./lib/queryClient";
import { QueryClientProvider } from "@tanstack/react-query";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";
import { ThemeProvider } from "@/components/theme-provider";
import NotFound from "@/pages/not-found";

import Home from "@/pages/home";
import LandingPage from "@/pages/landing";
import LoginPage from "@/pages/login";
import RegisterPage from "@/pages/register";
import SelectRolePage from "@/pages/select-role";
import CompleteProfilePage from "@/pages/complete-profile";
import VerifyEmailPage from "@/pages/verify-email";
import UserLayout from "@/pages/user/layout";
import UserDashboard from "@/pages/user/dashboard";
import LabsPage from "@/pages/user/labs";
import LabBookingPage from "@/pages/user/lab-booking";
import ConsultationPage from "@/pages/user/consultation";
import ConsultationBookingPage from "@/pages/user/consultation-booking";
import TeleradiologyPage from "@/pages/user/teleradiology";
import OrdersPage from "@/pages/user/orders";
import VideoRoomPage from "@/pages/video-room";

import ProviderLayout from "@/pages/provider/layout";
import ProviderDashboard from "@/pages/provider/dashboard";
import ProviderBookingsPage from "@/pages/provider/bookings";
import ProviderServicesPage from "@/pages/provider/services";
import ProviderOnboardingPage from "@/pages/provider/onboarding";

import AdminLayout from "@/pages/admin/layout";
import AdminDashboard from "@/pages/admin/dashboard";
import AdminBookingsPage from "@/pages/admin/bookings";
import AdminProvidersPage from "@/pages/admin/providers";
import AdminUsersPage from "@/pages/admin/users";
import AdminConsultantsPage from "@/pages/admin/consultants";
import AdminLabTestsPage from "@/pages/admin/lab-tests";
import AdminRadiologyPage from "@/pages/admin/radiology";
import AdminSuggestionsPage from "@/pages/admin/suggestions";

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
      <Route path="/provider/onboarding" component={ProviderOnboardingPage} />
      
      <Route path="/user" component={withUserLayout(UserDashboard)} />
      <Route path="/user/labs" component={withUserLayout(LabsPage)} />
      <Route path="/user/labs/:id/book" component={withUserLayout(LabBookingPage)} />
      <Route path="/user/consultation" component={withUserLayout(ConsultationPage)} />
      <Route path="/user/consultation/:id/book" component={withUserLayout(ConsultationBookingPage)} />
      <Route path="/user/teleradiology" component={withUserLayout(TeleradiologyPage)} />
      <Route path="/user/orders" component={withUserLayout(OrdersPage)} />
      <Route path="/video/:roomId" component={VideoRoomPage} />
      
      <Route path="/provider" component={withProviderLayout(ProviderDashboard)} />
      <Route path="/provider/bookings" component={withProviderLayout(ProviderBookingsPage)} />
      <Route path="/provider/services" component={withProviderLayout(ProviderServicesPage)} />
      
      <Route path="/admin" component={withAdminLayout(AdminDashboard)} />
      <Route path="/admin/bookings" component={withAdminLayout(AdminBookingsPage)} />
      <Route path="/admin/consultants" component={withAdminLayout(AdminConsultantsPage)} />
      <Route path="/admin/lab-tests" component={withAdminLayout(AdminLabTestsPage)} />
      <Route path="/admin/radiology" component={withAdminLayout(AdminRadiologyPage)} />
      <Route path="/admin/suggestions" component={withAdminLayout(AdminSuggestionsPage)} />
      <Route path="/admin/providers" component={withAdminLayout(AdminProvidersPage)} />
      <Route path="/admin/users" component={withAdminLayout(AdminUsersPage)} />
      
      <Route component={NotFound} />
    </Switch>
  );
}

function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <ThemeProvider defaultTheme="light" storageKey="perfusion-theme">
        <TooltipProvider>
          <Router />
          <Toaster />
        </TooltipProvider>
      </ThemeProvider>
    </QueryClientProvider>
  );
}

export default App;
