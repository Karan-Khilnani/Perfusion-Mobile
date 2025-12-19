import { Link } from "wouter";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { FlaskConical, Stethoscope, HeartPulse, ArrowRight, ClipboardList } from "lucide-react";

export default function UserDashboard() {
  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Welcome to Perfusion</h1>
        <p className="text-muted-foreground">
          Access healthcare services for your facility. Choose a service category below.
        </p>
      </div>

      <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-3">
        <Card className="overflow-visible">
          <CardHeader className="pb-4">
            <div className="mb-3 flex h-12 w-12 items-center justify-center rounded-lg bg-blue-500/10 dark:bg-blue-400/10">
              <FlaskConical className="h-6 w-6 text-blue-600 dark:text-blue-400" />
            </div>
            <CardTitle className="text-lg">Lab Services</CardTitle>
            <CardDescription>
              Search diagnostic labs, compare tests, and book sample collections
            </CardDescription>
          </CardHeader>
          <CardContent>
            <Link href="/user/labs">
              <Button className="w-full" data-testid="button-labs-module">
                Search Labs
                <ArrowRight className="ml-2 h-4 w-4" />
              </Button>
            </Link>
          </CardContent>
        </Card>

        <Card className="overflow-visible">
          <CardHeader className="pb-4">
            <div className="mb-3 flex h-12 w-12 items-center justify-center rounded-lg bg-green-500/10 dark:bg-green-400/10">
              <Stethoscope className="h-6 w-6 text-green-600 dark:text-green-400" />
            </div>
            <CardTitle className="text-lg">Consultation</CardTitle>
            <CardDescription>
              Connect with specialists for expert opinions and patient consultations
            </CardDescription>
          </CardHeader>
          <CardContent>
            <Link href="/user/consultation">
              <Button className="w-full" data-testid="button-consultation-module">
                Find Consultants
                <ArrowRight className="ml-2 h-4 w-4" />
              </Button>
            </Link>
          </CardContent>
        </Card>

        <Card className="overflow-visible">
          <CardHeader className="pb-4">
            <div className="mb-3 flex h-12 w-12 items-center justify-center rounded-lg bg-red-500/10 dark:bg-red-400/10">
              <HeartPulse className="h-6 w-6 text-red-600 dark:text-red-400" />
            </div>
            <CardTitle className="text-lg">Critical Care</CardTitle>
            <CardDescription>
              Emergency decision support and escalation to specialized hospitals
            </CardDescription>
          </CardHeader>
          <CardContent>
            <Link href="/user/critical-care">
              <Button className="w-full" data-testid="button-critical-care-module">
                Get Support
                <ArrowRight className="ml-2 h-4 w-4" />
              </Button>
            </Link>
          </CardContent>
        </Card>
      </div>

      <Card className="overflow-visible">
        <CardHeader className="flex flex-row items-center justify-between gap-4 pb-4">
          <div className="flex items-center gap-4">
            <div className="flex h-12 w-12 items-center justify-center rounded-lg bg-primary/10">
              <ClipboardList className="h-6 w-6 text-primary" />
            </div>
            <div>
              <CardTitle className="text-lg">Your Orders</CardTitle>
              <CardDescription>
                Track all your bookings and appointments in one place
              </CardDescription>
            </div>
          </div>
          <Link href="/user/orders">
            <Button variant="outline" data-testid="button-view-orders">
              View All Orders
              <ArrowRight className="ml-2 h-4 w-4" />
            </Button>
          </Link>
        </CardHeader>
      </Card>
    </div>
  );
}
