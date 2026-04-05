import { useParams } from "wouter";
import { useQuery } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { ShieldCheck, ShieldX, Download, Stethoscope, User, Building2, Calendar, FileText } from "lucide-react";

interface PrescriptionVerification {
  prescriptionId: string;
  patientName: string;
  referringFacility: string | null;
  consultantName: string;
  consultantSpecialization: string | null;
  consultantQualification: string | null;
  consultantRegistrationNo: string | null;
  consultantYearsExperience: number | null;
  consultantAffiliation: string | null;
  confirmedAt: string;
  prescriptionPdfUrl: string | null;
  isVerified: boolean;
}

export default function VerifyPrescriptionPage() {
  const { bookingId } = useParams<{ bookingId: string }>();

  const { data, isLoading, isError, error } = useQuery<PrescriptionVerification, { status: number; message: string }>({
    queryKey: ["/api/verify/prescription", bookingId],
    queryFn: async () => {
      const res = await fetch(`/api/verify/prescription/${bookingId}`);
      const body = await res.json().catch(() => ({ message: "Server error" }));
      if (!res.ok) {
        const err: any = new Error(body.message || "Not found");
        err.status = res.status;
        throw err;
      }
      return body;
    },
    retry: false,
  });

  const isNotFound = isError && (error as any)?.status === 404;

  const confirmedDate = data?.confirmedAt ? new Date(data.confirmedAt) : null;

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-50 to-slate-100 dark:from-slate-900 dark:to-slate-800 flex items-start justify-center p-4 py-12">
      <div className="w-full max-w-lg space-y-4">
        <div className="text-center mb-6">
          <div className="inline-flex h-16 w-16 items-center justify-center rounded-full bg-primary/10 mb-3">
            <ShieldCheck className="h-8 w-8 text-primary" />
          </div>
          <h1 className="text-2xl font-bold">Consultation Summary Verification</h1>
          <p className="text-muted-foreground text-sm mt-1">
            Perfusion Health — Digital Super Speciality Consultation Platform
          </p>
        </div>

        {isLoading && (
          <Card>
            <CardHeader>
              <Skeleton className="h-6 w-48" />
            </CardHeader>
            <CardContent className="space-y-3">
              <Skeleton className="h-4 w-full" />
              <Skeleton className="h-4 w-3/4" />
              <Skeleton className="h-4 w-2/3" />
            </CardContent>
          </Card>
        )}

        {isError && (
          <Card className="border-red-200 dark:border-red-800">
            <CardContent className="pt-6">
              <div className="flex flex-col items-center gap-3 text-center py-4">
                <div className="flex h-14 w-14 items-center justify-center rounded-full bg-red-100 dark:bg-red-900/30">
                  <ShieldX className="h-7 w-7 text-red-600 dark:text-red-400" />
                </div>
                <div>
                  <p className="font-semibold text-red-700 dark:text-red-400">
                    {isNotFound ? "Consultation Summary Not Found" : "Verification Failed"}
                  </p>
                  <p className="text-sm text-muted-foreground mt-1">
                    {isNotFound
                      ? "No consultation summary record was found for this ID. The QR code may be invalid or the record may not exist."
                      : "This consultation summary could not be verified. It may not have been digitally confirmed yet."}
                  </p>
                </div>
              </div>
            </CardContent>
          </Card>
        )}

        {data && (
          <>
            <Card className="border-green-200 dark:border-green-800">
              <CardHeader className="pb-3">
                <div className="flex items-center justify-between">
                  <CardTitle className="text-base">Verification Status</CardTitle>
                  <Badge className="bg-green-100 text-green-700 hover:bg-green-100 dark:bg-green-900/30 dark:text-green-400 border-green-300">
                    <ShieldCheck className="mr-1 h-3.5 w-3.5" />
                    Verified
                  </Badge>
                </div>
              </CardHeader>
              <CardContent className="space-y-2 text-sm">
                <div className="flex items-start gap-3 rounded-lg bg-green-50 dark:bg-green-900/20 p-3">
                  <ShieldCheck className="h-5 w-5 text-green-600 mt-0.5 shrink-0" />
                  <div>
                    <p className="font-medium text-green-800 dark:text-green-300">
                      This is a genuine, digitally confirmed consultation summary
                    </p>
                    <p className="text-green-700 dark:text-green-400 mt-0.5">
                      Summary ID: <span className="font-mono font-medium">{data.prescriptionId}</span>
                    </p>
                  </div>
                </div>
                <div className="flex items-center gap-2 text-muted-foreground pt-1">
                  <Calendar className="h-4 w-4 shrink-0" />
                  <span>
                    Confirmed on:{" "}
                    <span className="font-medium text-foreground">
                      {confirmedDate
                        ? confirmedDate.toLocaleString("en-IN", { dateStyle: "long", timeStyle: "medium", timeZone: "Asia/Kolkata" })
                        : "—"}
                    </span>
                  </span>
                </div>
              </CardContent>
            </Card>

            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-base flex items-center gap-2">
                  <User className="h-4 w-4 text-muted-foreground" />
                  Patient
                </CardTitle>
              </CardHeader>
              <CardContent className="text-sm space-y-1.5">
                <p className="font-medium">{data.patientName}</p>
                {data.referringFacility && (
                  <div className="flex items-center gap-2 text-muted-foreground">
                    <Building2 className="h-3.5 w-3.5" />
                    Referring Facility: <span className="font-medium text-foreground">{data.referringFacility}</span>
                  </div>
                )}
              </CardContent>
            </Card>

            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-base flex items-center gap-2">
                  <Stethoscope className="h-4 w-4 text-muted-foreground" />
                  Consulting Super Specialist
                </CardTitle>
              </CardHeader>
              <CardContent className="text-sm space-y-2">
                <p className="font-semibold text-base">Dr. {data.consultantName}</p>
                {data.consultantSpecialization && (
                  <div className="flex gap-2">
                    <span className="text-muted-foreground w-32 shrink-0">Speciality</span>
                    <span className="font-medium">{data.consultantSpecialization}</span>
                  </div>
                )}
                {data.consultantQualification && (
                  <div className="flex gap-2">
                    <span className="text-muted-foreground w-32 shrink-0">Qualification</span>
                    <span className="font-medium">{data.consultantQualification}</span>
                  </div>
                )}
                {data.consultantRegistrationNo && (
                  <div className="flex gap-2">
                    <span className="text-muted-foreground w-32 shrink-0">Medical Council Reg.</span>
                    <span className="font-mono font-medium">{data.consultantRegistrationNo}</span>
                  </div>
                )}
                {data.consultantYearsExperience && (
                  <div className="flex gap-2">
                    <span className="text-muted-foreground w-32 shrink-0">Experience</span>
                    <span className="font-medium">{data.consultantYearsExperience} years</span>
                  </div>
                )}
                {data.consultantAffiliation && (
                  <div className="flex gap-2">
                    <span className="text-muted-foreground w-32 shrink-0">Affiliation</span>
                    <span className="font-medium">{data.consultantAffiliation}</span>
                  </div>
                )}
              </CardContent>
            </Card>

            {data.prescriptionPdfUrl && (
              <a
                href={data.prescriptionPdfUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="block"
                data-testid="link-download-verified-pdf"
              >
                <Button className="w-full gap-2" variant="outline">
                  <Download className="h-4 w-4" />
                  Download Signed Summary PDF
                </Button>
              </a>
            )}

            <Card className="bg-muted/50">
              <CardContent className="pt-4">
                <p className="text-xs text-muted-foreground text-center flex items-start gap-1.5">
                  <FileText className="h-3.5 w-3.5 mt-0.5 shrink-0" />
                  This verification is provided by Perfusion Health Pvt Ltd. The QR code on the consultation summary links to this page for authenticity confirmation. For queries, contact your healthcare provider.
                </p>
              </CardContent>
            </Card>
          </>
        )}
      </div>
    </div>
  );
}
