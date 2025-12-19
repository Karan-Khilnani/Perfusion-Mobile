import { Switch, Route } from "wouter";
import { queryClient } from "./lib/queryClient";
import { QueryClientProvider } from "@tanstack/react-query";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";
import { ThemeProvider } from "@/components/theme-provider";
import NotFound from "@/pages/not-found";

import Home from "@/pages/home";
import UserLayout from "@/pages/user/layout";
import UserDashboard from "@/pages/user/dashboard";
import LabsPage from "@/pages/user/labs";
import LabBookingPage from "@/pages/user/lab-booking";
import ConsultationPage from "@/pages/user/consultation";
import ConsultationBookingPage from "@/pages/user/consultation-booking";
import CriticalCarePage from "@/pages/user/critical-care";
import CriticalCareBookingPage from "@/pages/user/critical-care-booking";
import OrdersPage from "@/pages/user/orders";

import ProviderLayout from "@/pages/provider/layout";
import ProviderDashboard from "@/pages/provider/dashboard";
import ProviderBookingsPage from "@/pages/provider/bookings";
import ProviderServicesPage from "@/pages/provider/services";

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

function Router() {
  return (
    <Switch>
      <Route path="/" component={Home} />
      
      <Route path="/user" component={withUserLayout(UserDashboard)} />
      <Route path="/user/labs" component={withUserLayout(LabsPage)} />
      <Route path="/user/labs/:id/book" component={withUserLayout(LabBookingPage)} />
      <Route path="/user/consultation" component={withUserLayout(ConsultationPage)} />
      <Route path="/user/consultation/:id/book" component={withUserLayout(ConsultationBookingPage)} />
      <Route path="/user/critical-care" component={withUserLayout(CriticalCarePage)} />
      <Route path="/user/critical-care/:type/:id/book" component={withUserLayout(CriticalCareBookingPage)} />
      <Route path="/user/orders" component={withUserLayout(OrdersPage)} />
      
      <Route path="/provider" component={withProviderLayout(ProviderDashboard)} />
      <Route path="/provider/bookings" component={withProviderLayout(ProviderBookingsPage)} />
      <Route path="/provider/services" component={withProviderLayout(ProviderServicesPage)} />
      
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
