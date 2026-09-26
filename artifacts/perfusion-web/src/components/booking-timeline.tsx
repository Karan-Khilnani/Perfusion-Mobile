import { Check, Circle, Clock } from "lucide-react";
import type { BookingStatus, BookingType } from "@shared/schema";

interface BookingTimelineProps {
  status: BookingStatus;
  bookingType: BookingType;
}

const labSteps = [
  { key: "booked", label: "Booked" },
  { key: "sample_collected", label: "Sample Collected" },
  { key: "processing", label: "Processing" },
  { key: "report_ready", label: "Report Ready" },
  { key: "completed", label: "Completed" },
];

const consultationSteps = [
  { key: "booked", label: "Appointment Booked" },
  { key: "scheduled", label: "Scheduled" },
  { key: "ongoing", label: "Ongoing" },
  { key: "paused", label: "Paused" },
  { key: "completed", label: "Completed" },
];

const criticalCareSteps = [
  { key: "booked", label: "Request Submitted" },
  { key: "processing", label: "Team Assigned" },
  { key: "completed", label: "Case Closed" },
];

export function BookingTimeline({ status, bookingType }: BookingTimelineProps) {
  const steps = bookingType === "lab" 
    ? labSteps 
    : bookingType === "consultation" 
      ? consultationSteps 
      : criticalCareSteps;

  const currentIndex = steps.findIndex(s => s.key === status);
  const isCancelled = status === "cancelled";

  return (
    <div className="flex flex-col gap-2">
      {steps.map((step, index) => {
        const isCompleted = !isCancelled && index < currentIndex;
        const isCurrent = !isCancelled && index === currentIndex;
        const isPending = !isCancelled && index > currentIndex;

        return (
          <div key={step.key} className="flex items-center gap-3">
            <div className="flex flex-col items-center">
              <div
                className={`flex h-8 w-8 items-center justify-center rounded-full border-2 ${
                  isCompleted
                    ? "border-primary bg-primary text-primary-foreground"
                    : isCurrent
                      ? "border-primary bg-background text-primary"
                      : "border-muted bg-background text-muted-foreground"
                }`}
              >
                {isCompleted ? (
                  <Check className="h-4 w-4" />
                ) : isCurrent ? (
                  <Clock className="h-4 w-4" />
                ) : (
                  <Circle className="h-4 w-4" />
                )}
              </div>
              {index < steps.length - 1 && (
                <div
                  className={`h-6 w-0.5 ${
                    isCompleted ? "bg-primary" : "bg-muted"
                  }`}
                />
              )}
            </div>
            <span
              className={`text-sm font-medium ${
                isCompleted || isCurrent
                  ? "text-foreground"
                  : "text-muted-foreground"
              }`}
            >
              {step.label}
            </span>
          </div>
        );
      })}
      {isCancelled && (
        <div className="flex items-center gap-3">
          <div className="flex h-8 w-8 items-center justify-center rounded-full border-2 border-destructive bg-destructive text-destructive-foreground">
            <span className="text-xs font-bold">X</span>
          </div>
          <span className="text-sm font-medium text-destructive">Cancelled</span>
        </div>
      )}
    </div>
  );
}
