import { ReactNode } from "react";
import { Link, useLocation } from "wouter";
import { useAuth } from "@/hooks/use-auth";
import { Button } from "@/components/ui/button";
import { ThemeToggle } from "@/components/theme-toggle";
import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarHeader,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarProvider,
  SidebarTrigger,
} from "@/components/ui/sidebar";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { LayoutDashboard, Building, Users, LogOut, Shield, Stethoscope, FlaskConical, FileImage, ClipboardList, UserCheck, IndianRupee, BarChart3, ActivitySquare, Phone, FileSignature } from "lucide-react";
import { Loader2 } from "lucide-react";

interface AdminLayoutProps {
  children: ReactNode;
}

export default function AdminLayout({ children }: AdminLayoutProps) {
  const [location] = useLocation();
  const { user, isLoading, isAuthenticated, logout } = useAuth();

  if (isLoading) {
    return (
      <div className="flex h-screen items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin" />
      </div>
    );
  }

  if (!isAuthenticated) {
    window.location.href = "/login";
    return null;
  }

  if (user?.role !== "admin") {
    window.location.href = "/";
    return null;
  }

  const menuItems = [
    { href: "/admin", icon: LayoutDashboard, label: "Dashboard" },
    { href: "/admin/billing", icon: IndianRupee, label: "Billing" },
    { href: "/admin/analytics", icon: BarChart3, label: "Analytics" },
    { href: "/admin/bookings", icon: ClipboardList, label: "All Bookings" },
    { href: "/admin/consultants", icon: Stethoscope, label: "Consultants" },
    { href: "/admin/lab-tests", icon: FlaskConical, label: "Lab Tests" },
    { href: "/admin/radiology", icon: FileImage, label: "Radiology Modalities" },
    { href: "/admin/approvals", icon: UserCheck, label: "Approvals" },
    { href: "/admin/suggestions", icon: ClipboardList, label: "Provider Suggestions" },
    { href: "/admin/providers", icon: Building, label: "Provider Management" },
    { href: "/admin/users", icon: Users, label: "User Management" },
    { href: "/admin/agreements", icon: FileSignature, label: "Signed Agreements" },
    { href: "/admin/diagnostics", icon: ActivitySquare, label: "Diagnostics" },
  ];

  const userInitials = user
    ? `${user.firstName?.[0] || ""}${user.lastName?.[0] || ""}`.toUpperCase()
    : "AD";

  return (
    <SidebarProvider>
      <div className="flex h-screen w-full">
        <Sidebar>
          <SidebarHeader className="border-b p-4">
            <Link href="/admin" className="flex items-center gap-2">
              <Shield className="h-6 w-6 text-primary" />
              <span className="font-bold text-lg">Admin Panel</span>
            </Link>
          </SidebarHeader>
          <SidebarContent className="p-2">
            <SidebarMenu>
              {menuItems.map((item) => (
                <SidebarMenuItem key={item.href}>
                  <SidebarMenuButton asChild isActive={location === item.href}>
                    <Link href={item.href} data-testid={`link-${item.label.toLowerCase().replace(' ', '-')}`}>
                      <item.icon className="h-4 w-4" />
                      <span>{item.label}</span>
                    </Link>
                  </SidebarMenuButton>
                </SidebarMenuItem>
              ))}
            </SidebarMenu>
          </SidebarContent>
          <SidebarFooter className="border-t p-2">
            <SidebarMenu>
              <SidebarMenuItem>
                <DropdownMenu>
                  <DropdownMenuTrigger asChild>
                    <SidebarMenuButton className="w-full" data-testid="button-admin-profile">
                      <Avatar className="h-6 w-6">
                        <AvatarFallback className="text-xs">{userInitials}</AvatarFallback>
                      </Avatar>
                      <span className="truncate">{user?.firstName} {user?.lastName}</span>
                    </SidebarMenuButton>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent side="top" align="start" className="w-48">
                    <DropdownMenuItem
                      onClick={() => logout()}
                      data-testid="button-admin-logout"
                    >
                      <LogOut className="mr-2 h-4 w-4" />
                      Logout
                    </DropdownMenuItem>
                  </DropdownMenuContent>
                </DropdownMenu>
              </SidebarMenuItem>
            </SidebarMenu>
          </SidebarFooter>
        </Sidebar>
        <div className="flex flex-1 flex-col overflow-hidden">
          <header className="flex h-14 items-center justify-between gap-4 border-b bg-background px-4">
            <SidebarTrigger data-testid="button-admin-sidebar-toggle" />
            <div className="flex items-center gap-2">
              <a
                href="tel:6268564602"
                className="flex items-center gap-1.5 rounded-md px-2 py-1.5 text-sm text-muted-foreground hover:text-foreground hover:bg-muted transition-colors"
                title="Customer care"
              >
                <Phone className="h-3.5 w-3.5 text-primary" />
                <span className="hidden sm:inline font-medium">62685 64602</span>
              </a>
              <ThemeToggle />
              <Button
                variant="ghost"
                size="sm"
                onClick={() => logout()}
                data-testid="button-header-logout"
              >
                <LogOut className="mr-2 h-4 w-4" />
                Logout
              </Button>
            </div>
          </header>
          <main className="flex-1 overflow-auto p-6">{children}</main>
        </div>
      </div>
    </SidebarProvider>
  );
}
