import { Link } from "wouter";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { ThemeToggle } from "@/components/theme-toggle";
import { Activity, Building2, Users, ArrowRight } from "lucide-react";
import { useAuth } from "@/hooks/use-auth";

export default function Home() {
  const { user, isLoading } = useAuth();

  return (
    <div className="min-h-screen bg-background">
      <header className="border-b bg-card">
        <div className="container mx-auto max-w-6xl px-4 py-4">
          <div className="flex items-center justify-between gap-4">
            <div className="flex items-center gap-3">
              <div className="flex h-10 w-10 items-center justify-center rounded-md bg-primary">
                <Activity className="h-6 w-6 text-primary-foreground" />
              </div>
              <span className="text-xl font-semibold tracking-tight">Perfusion</span>
            </div>
            <div className="flex items-center gap-2">
              {!isLoading && user && (
                <span className="text-sm text-muted-foreground">
                  Welcome, {user.firstName || user.email}
                </span>
              )}
              <ThemeToggle />
            </div>
          </div>
        </div>
      </header>

      <main className="container mx-auto max-w-6xl px-4 py-12">
        <div className="mb-12 text-center">
          <h1 className="mb-4 text-3xl font-semibold tracking-tight md:text-4xl">
            Connecting Healthcare Across Boundaries
          </h1>
          <p className="mx-auto max-w-2xl text-lg text-muted-foreground">
            Perfusion bridges the gap between resource-limited hospitals and specialized healthcare services. 
            Access diagnostic labs, specialist consultations, and critical care support from anywhere.
          </p>
        </div>

        <div className="grid gap-6 md:grid-cols-2">
          <Card className="group relative overflow-visible transition-all">
            <CardHeader className="pb-4">
              <div className="mb-4 flex h-14 w-14 items-center justify-center rounded-lg bg-primary/10">
                <Users className="h-7 w-7 text-primary" />
              </div>
              <CardTitle className="text-xl">User Portal</CardTitle>
              <CardDescription className="text-base">
                For healthcare facilities seeking diagnostic, consultation, and critical care services
              </CardDescription>
            </CardHeader>
            <CardContent>
              <ul className="mb-6 space-y-2 text-sm text-muted-foreground">
                <li className="flex items-center gap-2">
                  <span className="h-1.5 w-1.5 rounded-full bg-primary" />
                  Search and book lab tests
                </li>
                <li className="flex items-center gap-2">
                  <span className="h-1.5 w-1.5 rounded-full bg-primary" />
                  Connect with specialist consultants
                </li>
                <li className="flex items-center gap-2">
                  <span className="h-1.5 w-1.5 rounded-full bg-primary" />
                  Access critical care support
                </li>
                <li className="flex items-center gap-2">
                  <span className="h-1.5 w-1.5 rounded-full bg-primary" />
                  Track orders and appointments
                </li>
              </ul>
              <Link href="/user">
                <Button className="w-full" data-testid="button-user-portal">
                  Enter User Portal
                  <ArrowRight className="ml-2 h-4 w-4" />
                </Button>
              </Link>
            </CardContent>
          </Card>

          <Card className="group relative overflow-visible transition-all">
            <CardHeader className="pb-4">
              <div className="mb-4 flex h-14 w-14 items-center justify-center rounded-lg bg-primary/10">
                <Building2 className="h-7 w-7 text-primary" />
              </div>
              <CardTitle className="text-xl">Service Provider Portal</CardTitle>
              <CardDescription className="text-base">
                For diagnostic labs, consultants, and hospitals offering healthcare services
              </CardDescription>
            </CardHeader>
            <CardContent>
              <ul className="mb-6 space-y-2 text-sm text-muted-foreground">
                <li className="flex items-center gap-2">
                  <span className="h-1.5 w-1.5 rounded-full bg-primary" />
                  Manage service listings
                </li>
                <li className="flex items-center gap-2">
                  <span className="h-1.5 w-1.5 rounded-full bg-primary" />
                  Handle booking requests
                </li>
                <li className="flex items-center gap-2">
                  <span className="h-1.5 w-1.5 rounded-full bg-primary" />
                  Update pricing and availability
                </li>
                <li className="flex items-center gap-2">
                  <span className="h-1.5 w-1.5 rounded-full bg-primary" />
                  Track completed services
                </li>
              </ul>
              <Link href="/provider">
                <Button variant="outline" className="w-full" data-testid="button-provider-portal">
                  Enter Provider Portal
                  <ArrowRight className="ml-2 h-4 w-4" />
                </Button>
              </Link>
            </CardContent>
          </Card>
        </div>
      </main>

      <footer className="border-t bg-card py-6">
        <div className="container mx-auto max-w-6xl px-4 text-center text-sm text-muted-foreground">
          Perfusion Healthcare Platform
        </div>
      </footer>
    </div>
  );
}
