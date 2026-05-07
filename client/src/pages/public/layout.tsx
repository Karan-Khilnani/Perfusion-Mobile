import { Link } from "wouter";
import { Button } from "@/components/ui/button";
import { ThemeToggle } from "@/components/theme-toggle";
import { useAuth } from "@/hooks/use-auth";
import logoImage from "@assets/Pitchdeck_logo_1769590061051.png";
import { LayoutDashboard } from "lucide-react";

export default function PublicLayout({ children }: { children: React.ReactNode }) {
  const { user } = useAuth();
  const dashboardHref = user?.role === "admin" ? "/admin" : user?.role === "provider" ? "/provider" : "/user";

  return (
    <div className="min-h-screen bg-background">
      <header className="sticky top-0 z-40 border-b bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/60">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 h-16 flex items-center justify-between gap-4">
          <Link href="/" className="shrink-0">
            <img src={logoImage} alt="Perfusion" className="h-8 object-contain" data-testid="img-public-logo" />
          </Link>

          <nav className="hidden md:flex items-center gap-6 text-sm font-medium">
            <Link href="/consultants" className="text-foreground/70 hover:text-foreground transition-colors" data-testid="link-public-consultants">
              Browse Doctors
            </Link>
            <Link href="/lab-tests" className="text-foreground/70 hover:text-foreground transition-colors" data-testid="link-public-lab-tests">
              Lab Tests
            </Link>
          </nav>

          <div className="flex items-center gap-2">
            <ThemeToggle />
            {user ? (
              <Link href={dashboardHref}>
                <Button size="sm" data-testid="button-go-to-dashboard">
                  <LayoutDashboard className="mr-2 h-4 w-4" />
                  Dashboard
                </Button>
              </Link>
            ) : (
              <>
                <Link href="/login">
                  <Button variant="ghost" size="sm" data-testid="button-nav-login">Log in</Button>
                </Link>
                <Link href="/register">
                  <Button size="sm" data-testid="button-nav-signup">Sign Up Free</Button>
                </Link>
              </>
            )}
          </div>
        </div>
      </header>

      <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        {children}
      </main>
    </div>
  );
}
