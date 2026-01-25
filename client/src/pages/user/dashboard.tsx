import { Link } from "wouter";
import { FlaskConical, Stethoscope, FileImage, ClipboardList } from "lucide-react";

export default function UserDashboard() {
  return (
    <div className="flex h-full flex-col">
      <div className="flex flex-1 flex-col items-center justify-center px-6">
        <div className="mb-16 text-center">
          <h1 className="mb-2 text-3xl font-light tracking-tight">Welcome to Perfusion</h1>
          <p className="text-muted-foreground">
            Connecting healthcare providers with diagnostic and specialist services
          </p>
        </div>

        <div className="grid w-full max-w-4xl grid-cols-1 gap-8 md:grid-cols-3">
          <Link href="/user/consultation">
            <div 
              className="group flex flex-col items-center gap-4 p-8 hover-elevate active-elevate-2 rounded-lg cursor-pointer border border-border/50"
              data-testid="button-consultation-module"
            >
              <div className="flex h-20 w-20 items-center justify-center rounded-full bg-primary/10 transition-colors group-hover:bg-primary/20">
                <Stethoscope className="h-10 w-10 text-primary" />
              </div>
              <div className="text-center">
                <span className="text-base font-medium tracking-wide">Super Speciality</span>
                <p className="text-sm text-muted-foreground mt-1">Consultation</p>
              </div>
              <p className="text-xs text-muted-foreground text-center">
                Video consultations with specialists across all super specialities
              </p>
            </div>
          </Link>

          <Link href="/user/labs">
            <div 
              className="group flex flex-col items-center gap-4 p-8 hover-elevate active-elevate-2 rounded-lg cursor-pointer border border-border/50"
              data-testid="button-labs-module"
            >
              <div className="flex h-20 w-20 items-center justify-center rounded-full bg-primary/10 transition-colors group-hover:bg-primary/20">
                <FlaskConical className="h-10 w-10 text-primary" />
              </div>
              <div className="text-center">
                <span className="text-base font-medium tracking-wide">Lab Tests</span>
                <p className="text-sm text-muted-foreground mt-1">Diagnostics</p>
              </div>
              <p className="text-xs text-muted-foreground text-center">
                Complete range of diagnostic tests with quick turnaround
              </p>
            </div>
          </Link>

          <Link href="/user/teleradiology">
            <div 
              className="group flex flex-col items-center gap-4 p-8 hover-elevate active-elevate-2 rounded-lg cursor-pointer border border-border/50"
              data-testid="button-teleradiology-module"
            >
              <div className="flex h-20 w-20 items-center justify-center rounded-full bg-primary/10 transition-colors group-hover:bg-primary/20">
                <FileImage className="h-10 w-10 text-primary" />
              </div>
              <div className="text-center">
                <span className="text-base font-medium tracking-wide">Teleradiology</span>
                <p className="text-sm text-muted-foreground mt-1">Reporting</p>
              </div>
              <p className="text-xs text-muted-foreground text-center">
                Expert radiology reporting for X-Ray, CT, MRI, and more
              </p>
            </div>
          </Link>
        </div>
      </div>

      <div className="border-t py-4">
        <div className="flex justify-center">
          <Link href="/user/orders">
            <div 
              className="flex items-center gap-2 text-muted-foreground hover:text-foreground transition-colors cursor-pointer"
              data-testid="button-view-orders"
            >
              <ClipboardList className="h-4 w-4" />
              <span className="text-sm">View My Orders</span>
            </div>
          </Link>
        </div>
      </div>
    </div>
  );
}
