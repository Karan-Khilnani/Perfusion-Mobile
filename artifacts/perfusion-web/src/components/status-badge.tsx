import { Badge } from "@/components/ui/badge";
import type { BookingStatus } from "@shared/schema";

const statusConfig: Record<BookingStatus, { label: string; variant: "default" | "secondary" | "destructive" | "outline" }> = {
  booked: { label: "Booked", variant: "default" },
  scheduled: { label: "Scheduled", variant: "outline" },
  ongoing: { label: "Ongoing", variant: "secondary" },
  paused: { label: "Paused", variant: "outline" },
  sample_collected: { label: "Sample Collected", variant: "secondary" },
  processing: { label: "Processing", variant: "secondary" },
  report_ready: { label: "Report Ready", variant: "default" },
  completed: { label: "Completed", variant: "default" },
  cancelled: { label: "Cancelled", variant: "destructive" },
  in_transit: { label: "In Transit", variant: "secondary" },
  arrived: { label: "Arrived", variant: "default" },
};

interface StatusBadgeProps {
  status: BookingStatus;
}

export function StatusBadge({ status }: StatusBadgeProps) {
  const config = statusConfig[status] || { label: status, variant: "outline" as const };

  return (
    <Badge variant={config.variant} className="capitalize">
      {config.label}
    </Badge>
  );
}
