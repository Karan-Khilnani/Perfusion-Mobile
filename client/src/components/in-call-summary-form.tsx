import { useState, useEffect, useRef } from "react";
import { useMutation } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { ShieldCheck, Loader2, Lock, CheckCircle2, Download, ClipboardList } from "lucide-react";
import type { Booking } from "@shared/schema";

interface Props {
  booking: Booking;
}

export function InCallSummaryForm({ booking }: Props) {
  const { toast } = useToast();
  const isApproved = !!(booking as any).prescriptionApprovedAt;

  const [diagnosis, setDiagnosis] = useState((booking as any).prescriptionDiagnosis || "");
  const [physicianNotes, setPhysicianNotes] = useState((booking as any).prescriptionPhysicianNotes || "");
  const [medications, setMedications] = useState((booking as any).prescriptionMedications || "");
  const [followUp, setFollowUp] = useState((booking as any).prescriptionFollowUp || "");
  const [autoStatus, setAutoStatus] = useState<"idle" | "saving" | "saved">("idle");
  const autoSaveTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const saveMutation = useMutation({
    mutationFn: async () => {
      const res = await apiRequest("PATCH", `/api/bookings/${booking.id}/prescription`, {
        diagnosis, medications, advice: "", followUp, physicianNotes,
      });
      return res.json();
    },
    onMutate: () => setAutoStatus("saving"),
    onSuccess: () => {
      setAutoStatus("saved");
      queryClient.invalidateQueries({ queryKey: ["/api/bookings/room", booking.videoRoomId] });
      queryClient.invalidateQueries({ queryKey: ["/api/provider/bookings"] });
      setTimeout(() => setAutoStatus("idle"), 2000);
    },
    onError: () => {
      setAutoStatus("idle");
      toast({ title: "Auto-save failed", variant: "destructive" });
    },
  });

  const confirmMutation = useMutation({
    mutationFn: async () => {
      const res = await apiRequest("POST", `/api/bookings/${booking.id}/prescription/confirm`, {
        diagnosis, medications, physicianNotes, followUp,
      });
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/bookings/room", booking.videoRoomId] });
      queryClient.invalidateQueries({ queryKey: ["/api/provider/bookings"] });
      toast({
        title: "Consultation Summary Confirmed & Signed",
        description: "Locked with medicolegal audit trail.",
      });
    },
    onError: (e: any) => {
      toast({ title: "Confirmation failed", description: e?.message, variant: "destructive" });
    },
  });

  // Debounced auto-save — fires 1.5s after last keystroke
  useEffect(() => {
    if (isApproved || !diagnosis.trim()) return;
    if (autoSaveTimerRef.current) clearTimeout(autoSaveTimerRef.current);
    autoSaveTimerRef.current = setTimeout(() => saveMutation.mutate(), 1500);
    return () => { if (autoSaveTimerRef.current) clearTimeout(autoSaveTimerRef.current); };
  }, [diagnosis, physicianNotes, medications, followUp]);

  // ── Locked view ─────────────────────────────────────────────────────────────
  if (isApproved) {
    const approvedAt = new Date((booking as any).prescriptionApprovedAt).toLocaleString("en-IN", {
      dateStyle: "long", timeStyle: "medium", timeZone: "Asia/Kolkata",
    });
    return (
      <div className="p-4 space-y-4">
        <div className="rounded-lg border border-green-200 bg-green-50 dark:bg-green-900/20 dark:border-green-800 p-4 space-y-3">
          <div className="flex items-center gap-2 text-green-700 dark:text-green-400 font-medium">
            <ShieldCheck className="h-4 w-4" />
            Confirmed & Locked
          </div>
          <p className="text-sm text-muted-foreground">Confirmed on: <span className="font-medium">{approvedAt}</span></p>
          {(booking as any).prescriptionDiagnosis && (
            <div className="text-sm">
              <p className="text-xs text-muted-foreground">Diagnosis</p>
              <p className="font-medium mt-0.5">{(booking as any).prescriptionDiagnosis}</p>
            </div>
          )}
          {(booking as any).prescriptionMedications && (
            <div className="text-sm">
              <p className="text-xs text-muted-foreground">Treatment Plan</p>
              <p className="font-medium mt-0.5 whitespace-pre-wrap">{(booking as any).prescriptionMedications}</p>
            </div>
          )}
          {(booking as any).prescriptionPdfUrl && (
            <a
              href={(booking as any).prescriptionPdfUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-2 rounded-lg border border-green-300 bg-white dark:bg-transparent px-3 py-2 text-sm font-medium text-green-700 dark:text-green-400 hover:bg-green-50 transition-colors"
            >
              <Download className="h-4 w-4" />
              Download Signed PDF
            </a>
          )}
        </div>
      </div>
    );
  }

  // ── Editable form ─────────────────────────────────────────────────────────────
  return (
    <div className="p-4 space-y-4">
      {/* Auto-save status */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2 text-xs text-muted-foreground">
          <ClipboardList className="h-3.5 w-3.5" />
          <span>Consultation Summary</span>
        </div>
        {autoStatus === "saving" && (
          <span className="flex items-center gap-1 text-xs text-muted-foreground">
            <Loader2 className="h-3 w-3 animate-spin" /> Saving…
          </span>
        )}
        {autoStatus === "saved" && (
          <span className="flex items-center gap-1 text-xs text-green-600">
            <CheckCircle2 className="h-3 w-3" /> Saved
          </span>
        )}
      </div>

      <div className="rounded-lg bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-800 p-3 text-xs text-amber-800 dark:text-amber-300">
        Fields auto-save as you type. Use <strong>Confirm &amp; Sign</strong> to permanently lock.
      </div>

      <div className="space-y-2">
        <Label className="text-sm">Diagnosis <span className="text-destructive">*</span></Label>
        <Textarea
          placeholder="Enter diagnosis details…"
          value={diagnosis}
          onChange={(e) => setDiagnosis(e.target.value)}
          rows={3}
          data-testid="input-incall-diagnosis"
        />
      </div>

      <div className="space-y-2">
        <Label className="text-sm">Physician Notes</Label>
        <Textarea
          placeholder="Clinical observations, recommendations, special instructions…"
          value={physicianNotes}
          onChange={(e) => setPhysicianNotes(e.target.value)}
          rows={3}
          data-testid="input-incall-physician-notes"
        />
      </div>

      <div className="space-y-2">
        <Label className="text-sm">Suggested Treatment Plan</Label>
        <Textarea
          placeholder={"List medications, procedures, therapy…\ne.g., Tab. Paracetamol 500mg – twice daily after meals"}
          value={medications}
          onChange={(e) => setMedications(e.target.value)}
          rows={4}
          data-testid="input-incall-medications"
        />
      </div>

      <div className="space-y-2">
        <Label className="text-sm">Follow-up</Label>
        <Input
          placeholder="e.g., Review after 1 week, or if symptoms persist"
          value={followUp}
          onChange={(e) => setFollowUp(e.target.value)}
          data-testid="input-incall-followup"
        />
      </div>

      {/* Action buttons */}
      <div className="flex gap-2 pt-2 pb-4">
        <Button
          variant="secondary"
          size="sm"
          className="flex-1"
          onClick={() => saveMutation.mutate()}
          disabled={!diagnosis.trim() || saveMutation.isPending || confirmMutation.isPending}
          data-testid="button-incall-save-draft"
        >
          {saveMutation.isPending
            ? <><Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" />Saving…</>
            : "Save Draft"
          }
        </Button>
        <Button
          size="sm"
          className="flex-1 bg-green-700 hover:bg-green-800 text-white"
          onClick={() => confirmMutation.mutate()}
          disabled={!diagnosis.trim() || saveMutation.isPending || confirmMutation.isPending}
          data-testid="button-incall-confirm-sign"
        >
          {confirmMutation.isPending
            ? <><Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" />Confirming…</>
            : <><ShieldCheck className="mr-1.5 h-3.5 w-3.5" />Confirm &amp; Sign</>
          }
        </Button>
      </div>
    </div>
  );
}
