import { useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { ClipboardList, ExternalLink, Upload, Loader2, FileText, Image, AlertTriangle, CheckCircle2 } from "lucide-react";
import type { Booking } from "@shared/schema";

function useIsMobile() {
  return typeof window !== "undefined" && window.innerWidth < 768;
}

interface InCallDoc {
  url: string;
  name: string;
}

interface ClinicalPanelProps {
  booking: Booking;
  isProvider: boolean;
  inCallDocs: InCallDoc[];
  onDocUploaded: (url: string, name: string) => void;
}

function getFileExt(url: string): string {
  return (url.split(".").pop() ?? "").toLowerCase().split("?")[0];
}

function isImageFile(url: string): boolean {
  return ["jpg", "jpeg", "png", "webp", "gif", "bmp"].includes(getFileExt(url));
}

function getFileName(url: string): string {
  try {
    const parts = url.split("/");
    const raw = decodeURIComponent(parts[parts.length - 1] ?? url);
    return raw.split("?")[0];
  } catch {
    return url;
  }
}

function InlineDocument({ url, label }: { url: string; label: string }) {
  const image = isImageFile(url);
  const isMobile = useIsMobile();

  return (
    <div className="mb-4 last:mb-0">
      {/* Row: icon + name + open button */}
      <div className="flex items-center justify-between mb-1.5 gap-2">
        <div className="flex items-center gap-1.5 min-w-0">
          {image
            ? <Image className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
            : <FileText className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
          }
          <span className="text-xs text-muted-foreground truncate">{label}</span>
        </div>
        <a
          href={url}
          target="_blank"
          rel="noreferrer"
          className="shrink-0 text-muted-foreground hover:text-primary transition-colors"
          title="Open in new tab"
        >
          <ExternalLink className="h-3.5 w-3.5" />
        </a>
      </div>

      {/* Content — images display as <img>, everything else (PDF, etc.) as an inline iframe */}
      {image ? (
        <img
          src={url}
          alt={label}
          className="w-full rounded border object-contain max-h-[600px] bg-muted"
          data-testid={`img-clinical-doc-${label}`}
        />
      ) : (
        <iframe
          src={url}
          title={label}
          className="w-full rounded border bg-white"
          style={{ height: isMobile ? 380 : 500 }}
          data-testid={`iframe-clinical-doc-${label}`}
        />
      )}
    </div>
  );
}

function SectionHeading({ children }: { children: React.ReactNode }) {
  return (
    <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground mb-3">
      {children}
    </p>
  );
}

function InfoRow({ label, value }: { label: string; value: string | number | null | undefined }) {
  if (value === null || value === undefined || value === "") return null;
  return (
    <div className="min-w-0">
      <p className="text-[10px] text-muted-foreground leading-none mb-0.5">{label}</p>
      <p className="text-sm font-medium leading-snug break-words">{value}</p>
    </div>
  );
}

export function ClinicalPanel({ booking, isProvider, inCallDocs, onDocUploaded }: ClinicalPanelProps) {
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [uploading, setUploading] = useState(false);
  const [uploadError, setUploadError] = useState<string | null>(null);

  const preCallDocs = [
    ...(booking.documentUrls ?? []),
    ...(booking.treatmentChartUrls ?? []),
  ].filter(Boolean) as string[];

  async function handleUpload(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    setUploading(true);
    setUploadError(null);
    try {
      const form = new FormData();
      form.append("file", file);
      const res = await fetch(`/api/bookings/${booking.id}/call-document`, {
        method: "POST",
        body: form,
        credentials: "include",
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({ message: "Upload failed" }));
        throw new Error(err.message || "Upload failed");
      }
      const { url, fileName } = await res.json();
      onDocUploaded(url, fileName);
    } catch (err: any) {
      setUploadError(err.message || "Upload failed");
    } finally {
      setUploading(false);
      if (fileInputRef.current) fileInputRef.current.value = "";
    }
  }

  const hasAllergies = booking.patientAllergies && booking.patientAllergies.trim();
  const noAllergies = booking.patientAllergyNotSpecified;

  return (
    <div
      className="w-[400px] shrink-0 flex flex-col border-l bg-background overflow-hidden"
      data-testid="clinical-panel"
    >
      {/* Panel header */}
      <div className="px-4 py-3 border-b flex items-center gap-2 bg-muted/30">
        <ClipboardList className="h-4 w-4 text-primary shrink-0" />
        <span className="text-sm font-semibold">Patient File</span>
        <Badge variant="outline" className="ml-auto text-[10px] py-0">
          {booking.bookingNumber || booking.id.slice(0, 8)}
        </Badge>
      </div>

      {/* Scrollable body */}
      <div className="flex-1 overflow-y-auto">

        {/* ── Patient Info ─────────────────────────────────────── */}
        <div className="px-4 pt-4 pb-4 border-b">
          <SectionHeading>Patient Info</SectionHeading>
          <div className="grid grid-cols-2 gap-x-4 gap-y-3">
            <InfoRow label="Name" value={booking.patientName} />
            <InfoRow label="Age" value={booking.patientAge ? `${booking.patientAge} yrs` : null} />
            <InfoRow label="Gender" value={booking.patientGender} />
            <InfoRow label="Weight" value={booking.patientWeight ? `${booking.patientWeight} kg` : null} />
            <InfoRow label="Contact" value={booking.patientContact} />
            <InfoRow label="UHID / IP No." value={booking.uhidIpNumber} />
            <InfoRow label="IPD Number" value={booking.ipdNumber} />
            <InfoRow label="Bed Number" value={booking.bedNumber} />
          </div>

          {/* Allergies */}
          <div className="mt-3">
            {hasAllergies ? (
              <div className="flex items-start gap-2 rounded bg-amber-50 dark:bg-amber-950/30 border border-amber-200 dark:border-amber-800 px-3 py-2">
                <AlertTriangle className="h-3.5 w-3.5 text-amber-600 mt-0.5 shrink-0" />
                <div>
                  <p className="text-[10px] font-semibold uppercase text-amber-700 dark:text-amber-400">Allergies</p>
                  <p className="text-sm text-amber-800 dark:text-amber-200">{booking.patientAllergies}</p>
                </div>
              </div>
            ) : noAllergies ? (
              <div className="flex items-center gap-2 text-green-700 dark:text-green-400">
                <CheckCircle2 className="h-3.5 w-3.5 shrink-0" />
                <p className="text-xs">No known allergies</p>
              </div>
            ) : null}
          </div>
        </div>

        {/* ── Clinical Info ────────────────────────────────────── */}
        <div className="px-4 pt-4 pb-4 border-b space-y-3">
          <SectionHeading>Clinical Information</SectionHeading>
          {booking.appointmentSlot && (
            <InfoRow label="Appointment Slot" value={booking.appointmentSlot} />
          )}
          {(booking.onCallDoctorName) && (
            <InfoRow
              label="On-call Doctor"
              value={[booking.onCallDoctorName, booking.onCallDoctorDesignation].filter(Boolean).join(" · ")}
            />
          )}
          {booking.clinicalSummary && (
            <div>
              <p className="text-[10px] text-muted-foreground mb-1">Clinical Summary</p>
              <div className="rounded bg-muted/50 border px-3 py-2 text-sm whitespace-pre-wrap leading-relaxed">
                {booking.clinicalSummary}
              </div>
            </div>
          )}
          {booking.provisionalDiagnosis && (
            <div>
              <p className="text-[10px] text-muted-foreground mb-1">Provisional Diagnosis</p>
              <div className="rounded bg-muted/50 border px-3 py-2 text-sm whitespace-pre-wrap leading-relaxed">
                {booking.provisionalDiagnosis}
              </div>
            </div>
          )}
          {booking.examination && (
            <div>
              <p className="text-[10px] text-muted-foreground mb-1">Examination</p>
              <div className="rounded bg-muted/50 border px-3 py-2 text-sm whitespace-pre-wrap leading-relaxed">
                {booking.examination}
              </div>
            </div>
          )}
          {booking.investigations && (
            <div>
              <p className="text-[10px] text-muted-foreground mb-1">Investigations</p>
              <div className="rounded bg-muted/50 border px-3 py-2 text-sm whitespace-pre-wrap leading-relaxed">
                {booking.investigations}
              </div>
            </div>
          )}
          {!booking.clinicalSummary && !booking.provisionalDiagnosis && !booking.examination && !booking.investigations && !booking.appointmentSlot && !booking.onCallDoctorName && (
            <p className="text-xs text-muted-foreground italic">No clinical information recorded.</p>
          )}
        </div>

        {/* ── Pre-call Documents ───────────────────────────────── */}
        <div className="px-4 pt-4 pb-4 border-b">
          <SectionHeading>
            Pre-call Documents{preCallDocs.length > 0 ? ` (${preCallDocs.length})` : ""}
          </SectionHeading>
          {preCallDocs.length === 0 ? (
            <p className="text-xs text-muted-foreground italic">No documents uploaded before this call.</p>
          ) : (
            preCallDocs.map((url, i) => (
              <InlineDocument key={url + i} url={url} label={getFileName(url)} />
            ))
          )}
        </div>

        {/* ── In-call Documents ────────────────────────────────── */}
        <div className="px-4 pt-4 pb-6">
          <div className="flex items-center justify-between mb-3">
            <SectionHeading>
              In-call Documents{inCallDocs.length > 0 ? ` (${inCallDocs.length})` : ""}
            </SectionHeading>
            {!isProvider && (
              <>
                <input
                  ref={fileInputRef}
                  type="file"
                  className="hidden"
                  accept="*/*"
                  onChange={handleUpload}
                  data-testid="input-incall-file"
                />
                <Button
                  size="sm"
                  variant="outline"
                  className="h-7 text-xs gap-1.5 mb-3"
                  onClick={() => fileInputRef.current?.click()}
                  disabled={uploading}
                  data-testid="button-upload-incall-doc"
                >
                  {uploading
                    ? <Loader2 className="h-3 w-3 animate-spin" />
                    : <Upload className="h-3 w-3" />
                  }
                  {uploading ? "Uploading…" : "Upload Document"}
                </Button>
              </>
            )}
          </div>

          {uploadError && (
            <p className="text-xs text-destructive mb-3">{uploadError}</p>
          )}

          {inCallDocs.length === 0 ? (
            isProvider
              ? <p className="text-xs text-muted-foreground italic">Waiting for seeker to share documents…</p>
              : <p className="text-xs text-muted-foreground italic">Documents you upload during the call will appear here.</p>
          ) : (
            inCallDocs.map((doc, i) => (
              <InlineDocument key={doc.url + i} url={doc.url} label={doc.name} />
            ))
          )}
        </div>

      </div>
    </div>
  );
}
