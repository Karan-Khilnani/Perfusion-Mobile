import { Link } from "wouter";
import { FlaskConical, Stethoscope, HeartPulse, ClipboardList } from "lucide-react";

export default function UserDashboard() {
  return (
    <div className="flex h-full flex-col items-center justify-center px-6">
      <div className="mb-16 text-center">
        <h1 className="mb-2 text-3xl font-light tracking-tight">Welcome to Perfusion</h1>
        <p className="text-muted-foreground">
          Select a service to get started
        </p>
      </div>

      <div className="grid w-full max-w-3xl grid-cols-2 gap-8 md:grid-cols-4">
        <Link href="/user/labs">
          <div 
            className="group flex flex-col items-center gap-4 p-6 hover-elevate active-elevate-2 rounded-lg cursor-pointer"
            data-testid="button-labs-module"
          >
            <div className="flex h-16 w-16 items-center justify-center rounded-full bg-primary/10 transition-colors group-hover:bg-primary/20">
              <FlaskConical className="h-8 w-8 text-primary" />
            </div>
            <span className="text-sm font-medium tracking-wide">Labs</span>
          </div>
        </Link>

        <Link href="/user/consultation">
          <div 
            className="group flex flex-col items-center gap-4 p-6 hover-elevate active-elevate-2 rounded-lg cursor-pointer"
            data-testid="button-consultation-module"
          >
            <div className="flex h-16 w-16 items-center justify-center rounded-full bg-primary/10 transition-colors group-hover:bg-primary/20">
              <Stethoscope className="h-8 w-8 text-primary" />
            </div>
            <span className="text-sm font-medium tracking-wide">Consultation</span>
          </div>
        </Link>

        <Link href="/user/critical-care">
          <div 
            className="group flex flex-col items-center gap-4 p-6 hover-elevate active-elevate-2 rounded-lg cursor-pointer"
            data-testid="button-critical-care-module"
          >
            <div className="flex h-16 w-16 items-center justify-center rounded-full bg-primary/10 transition-colors group-hover:bg-primary/20">
              <HeartPulse className="h-8 w-8 text-primary" />
            </div>
            <span className="text-sm font-medium tracking-wide">Critical Care</span>
          </div>
        </Link>

        <Link href="/user/orders">
          <div 
            className="group flex flex-col items-center gap-4 p-6 hover-elevate active-elevate-2 rounded-lg cursor-pointer"
            data-testid="button-view-orders"
          >
            <div className="flex h-16 w-16 items-center justify-center rounded-full bg-muted transition-colors group-hover:bg-muted/80">
              <ClipboardList className="h-8 w-8 text-muted-foreground" />
            </div>
            <span className="text-sm font-medium tracking-wide">My Orders</span>
          </div>
        </Link>
      </div>
    </div>
  );
}
