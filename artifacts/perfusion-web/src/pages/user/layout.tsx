import { useEffect } from "react";
import { Link, useLocation } from "wouter";
import { useAuth } from "@/hooks/use-auth";
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
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { getListCallbackDeviceRemindersQueryKey, useListCallbackDeviceReminders } from "@workspace/api-client-react";
import {
  Home,
  FlaskConical,
  Stethoscope,
  ScanLine,
  ClipboardList,
  IndianRupee,
  LogOut,
  User,
  Phone,
  Bell,
} from "lucide-react";
import logoImage from "@assets/Perfusion_website_logo_1766464970393.png";

const menuItems = [
  { title: "Dashboard", url: "/user", icon: Home },
  { title: "Consultation", url: "/user/consultation", icon: Stethoscope },
  { title: "Labs", url: "/user/labs", icon: FlaskConical },
  { title: "Teleradiology", url: "/user/teleradiology", icon: ScanLine },
  { title: "My Orders", url: "/user/orders", icon: ClipboardList },
  { title: "Billing", url: "/user/billing", icon: IndianRupee },
  { title: "My Profile", url: "/user/profile", icon: User },
];

export default function UserLayout({ children }: { children: React.ReactNode }) {
  const { user, isLoading, isAuthenticated, logout } = useAuth();
  const [location, navigate] = useLocation();
  const { data: callbackReminders = [], isError: callbackRemindersError } = useListCallbackDeviceReminders({
    query: {
      queryKey: [...getListCallbackDeviceRemindersQueryKey(), user?.id],
      enabled: user?.role === "care_seeker",
      refetchInterval: 60000,
      refetchOnWindowFocus: true,
      staleTime: 15000,
    },
  });

  useEffect(() => {
    if (!isLoading && !isAuthenticated) {
      window.location.href = "/login";
    }
  }, [isLoading, isAuthenticated]);

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
    : user?.email?.[0]?.toUpperCase() || "U";

  const sidebarStyle = {
    "--sidebar-width": "16rem",
    "--sidebar-width-icon": "3.5rem",
  };

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
              <SidebarGroupLabel>Services</SidebarGroupLabel>
              <SidebarGroupContent>
                <SidebarMenu>
                  {menuItems.map((item) => (
                    <SidebarMenuItem key={item.title}>
                      <SidebarMenuButton
                        asChild
                        isActive={
                          item.url === "/user"
                            ? location === "/user"
                            : location.startsWith(item.url)
                        }
                      >
                        <Link href={item.url} data-testid={`nav-${item.title.toLowerCase().replace(/\s+/g, "-")}`}>
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
                  data-testid="button-logout"
                >
                  <Avatar className="h-6 w-6">
                    <AvatarImage src={user?.profileImageUrl || undefined} />
                    <AvatarFallback className="text-xs">
                      {userInitials}
                    </AvatarFallback>
                  </Avatar>
                  <span className="truncate text-sm flex-1">
                    {user?.firstName || user?.email || "User"}
                  </span>
                  <LogOut className="h-4 w-4" />
                </SidebarMenuButton>
              </SidebarMenuItem>
            </SidebarMenu>
          </SidebarFooter>
        </Sidebar>
        <div className="flex flex-1 flex-col overflow-hidden">
          <header className="flex h-14 items-center justify-between gap-4 border-b bg-background px-4">
            <SidebarTrigger data-testid="button-sidebar-toggle" />
            <div className="flex items-center gap-2">
              {user?.role === "care_seeker" && (
                <DropdownMenu>
                  <DropdownMenuTrigger asChild>
                    <Button variant="ghost" size="icon" className="relative" aria-label="Call-back reminders" data-testid="button-callback-reminders">
                      <Bell className="h-4 w-4" />
                      {callbackReminders.length > 0 && (
                        <span className="absolute -right-0.5 -top-0.5 flex h-4 min-w-4 items-center justify-center rounded-full bg-destructive px-1 text-[10px] font-semibold leading-none text-destructive-foreground" data-testid="badge-callback-reminders">
                          {callbackReminders.length > 9 ? "9+" : callbackReminders.length}
                        </span>
                      )}
                    </Button>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent align="end" className="w-80">
                    <DropdownMenuLabel>Call-back reminders</DropdownMenuLabel>
                    <DropdownMenuSeparator />
                    {callbackRemindersError ? (
                      <div role="alert" className="px-2 py-4 text-sm text-destructive">Could not load callback reminders. Please try again shortly.</div>
                    ) : callbackReminders.length ? callbackReminders.map((reminder) => (
                      <DropdownMenuItem key={reminder.bookingId} asChild>
                        <Link href={`/case-file/${encodeURIComponent(reminder.bookingId)}`} className="flex cursor-pointer flex-col items-start gap-1 py-2">
                          <span className="font-medium">{reminder.patientName} · {reminder.deviceName || "Device confirmation"}</span>
                          <span className="text-xs text-muted-foreground">
                            {reminder.dueAt ? `Confirmation due ${new Date(reminder.dueAt).toLocaleDateString()}` : "Device confirmation due"} · Open Case File
                          </span>
                        </Link>
                      </DropdownMenuItem>
                    )) : (
                      <div className="px-2 py-4 text-sm text-muted-foreground">No callback reminders.</div>
                    )}
                  </DropdownMenuContent>
                </DropdownMenu>
              )}
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
