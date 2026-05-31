import { useEffect } from "react";
import { Link, useLocation } from "wouter";
import { useAuth } from "@/hooks/use-auth";
import { useQuery } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { ThemeToggle } from "@/components/theme-toggle";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Sidebar,
  SidebarContent,
  SidebarHeader,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarProvider,
  SidebarTrigger,
  SidebarFooter,
  SidebarGroup,
  SidebarGroupLabel,
  SidebarGroupContent,
} from "@/components/ui/sidebar";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import {
  LayoutDashboard,
  ClipboardList,
  Settings,
  IndianRupee,
  LogOut,
  User,
  Phone,
} from "lucide-react";
import logoImage from "@assets/Perfusion_website_logo_1766464970393.png";

function getMenuItems(providerType: string | null | undefined) {
  const items = [
    { title: "Dashboard", url: "/provider", icon: LayoutDashboard },
    { title: "Bookings", url: "/provider/bookings", icon: ClipboardList },
  ];
  if (!["consultant", "teleradiology"].includes(providerType ?? "")) {
    items.push({ title: "Services", url: "/provider/services", icon: Settings });
  }
  items.push({ title: "Billing", url: "/provider/billing", icon: IndianRupee });
  items.push({ title: "My Profile", url: "/provider/profile", icon: User });
  return items;
}

export default function ProviderLayout({ children }: { children: React.ReactNode }) {
  const { user, isLoading, isAuthenticated, logout } = useAuth();
  const [location, navigate] = useLocation();

  const { data: provider } = useQuery<any>({
    queryKey: ["/api/providers/me"],
    enabled: isAuthenticated && !isLoading,
    retry: false,
  });

  useEffect(() => {
    if (!isLoading && !isAuthenticated) {
      window.location.href = "/login";
    }
  }, [isLoading, isAuthenticated]);

  useEffect(() => {
    if (
      provider?.type &&
      ["consultant", "teleradiology"].includes(provider.type) &&
      location.startsWith("/provider/services")
    ) {
      navigate("/provider");
    }
  }, [provider?.type, location, navigate]);

  if (isLoading) {
    return (
      <div className="flex h-screen items-center justify-center">
        <div className="space-y-4 text-center">
          <Skeleton className="mx-auto h-12 w-12 rounded-full" />
          <Skeleton className="h-4 w-32" />
        </div>
      </div>
    );
  }

  if (!isAuthenticated) {
    return null;
  }

  const userInitials = user?.firstName && user?.lastName
    ? `${user.firstName[0]}${user.lastName[0]}`
    : user?.email?.[0]?.toUpperCase() || "P";

  const sidebarStyle = {
    "--sidebar-width": "16rem",
    "--sidebar-width-icon": "3.5rem",
  };

  const menuItems = getMenuItems(provider?.type);

  return (
    <SidebarProvider style={sidebarStyle as React.CSSProperties}>
      <div className="flex h-screen w-full">
        <Sidebar>
          <SidebarHeader className="border-b px-3 py-3">
            <Link href="/" className="flex items-center">
              <img src={logoImage} alt="Perfusion" className="h-10 w-auto" />
            </Link>
          </SidebarHeader>
          <SidebarContent>
            <SidebarGroup>
              <SidebarGroupLabel>Management</SidebarGroupLabel>
              <SidebarGroupContent>
                <SidebarMenu>
                  {menuItems.map((item) => (
                    <SidebarMenuItem key={item.title}>
                      <SidebarMenuButton
                        asChild
                        isActive={
                          item.url === "/provider"
                            ? location === "/provider"
                            : location.startsWith(item.url)
                        }
                      >
                        <Link href={item.url} data-testid={`provider-nav-${item.title.toLowerCase().replace(" ", "-")}`}>
                          <item.icon className="h-4 w-4" />
                          <span>{item.title}</span>
                        </Link>
                      </SidebarMenuButton>
                    </SidebarMenuItem>
                  ))}
                </SidebarMenu>
              </SidebarGroupContent>
            </SidebarGroup>
          </SidebarContent>
          <SidebarFooter className="border-t p-2">
            <SidebarMenu>
              <SidebarMenuItem>
                <SidebarMenuButton
                  className="w-full"
                  onClick={() => logout()}
                  data-testid="button-provider-logout"
                >
                  <Avatar className="h-6 w-6">
                    <AvatarImage src={user?.profileImageUrl || undefined} />
                    <AvatarFallback className="text-xs">
                      {userInitials}
                    </AvatarFallback>
                  </Avatar>
                  <span className="truncate text-sm flex-1">
                    {user?.firstName || user?.email || "Provider"}
                  </span>
                  <LogOut className="h-4 w-4" />
                </SidebarMenuButton>
              </SidebarMenuItem>
            </SidebarMenu>
          </SidebarFooter>
        </Sidebar>
        <div className="flex flex-1 flex-col overflow-hidden">
          <header className="flex h-14 items-center justify-between gap-4 border-b bg-background px-4">
            <SidebarTrigger data-testid="button-provider-sidebar-toggle" />
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
