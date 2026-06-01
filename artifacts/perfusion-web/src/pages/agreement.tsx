import { useState, useRef } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useLocation } from "wouter";
import { apiRequest } from "@/lib/queryClient";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Badge } from "@/components/ui/badge";
import { Shield, FileText, CheckCircle2, Loader2 } from "lucide-react";

interface CurrentAgreement {
  version: string;
  text: string;
  fields: {
    partyName: string;
    organizationName: string;
    email: string;
    phone: string;
    role: string;
    roleLabel: string;
  };
}

export default function AgreementPage() {
  const [, setLocation] = useLocation();
  const [accepted, setAccepted] = useState(false);
  const [hasScrolled, setHasScrolled] = useState(false);
  const [done, setDone] = useState(false);
  const scrollRef = useRef<HTMLDivElement>(null);
  const qc = useQueryClient();

  const { data: agreement, isLoading } = useQuery<CurrentAgreement>({
    queryKey: ["/api/agreements/current"],
    retry: false,
  });

  const signMutation = useMutation({
    mutationFn: async () => {
      const res = await apiRequest("POST", "/api/agreements/sign", {
        version: agreement?.version,
      });
      return res.json();
    },
    onSuccess: () => {
      setDone(true);
      setTimeout(() => {
        qc.invalidateQueries({ queryKey: ["/api/auth/user"] });
        qc.invalidateQueries({ queryKey: ["/api/agreements/check"] });
        const role = agreement?.fields.role;
        if (role === "provider") setLocation("/provider");
        else if (role === "care_seeker") setLocation("/user");
        else setLocation("/home");
      }, 1600);
    },
  });

  const handleScroll = () => {
    const el = scrollRef.current;
    if (!el) return;
    if (el.scrollTop + el.clientHeight >= el.scrollHeight - 40) {
      setHasScrolled(true);
    }
  };

  const handleSign = () => {
    if (!accepted || !hasScrolled || signMutation.isPending) return;
    signMutation.mutate();
  };

  if (isLoading || !agreement) {
    return (
      <div className="fixed inset-0 z-50 bg-white flex flex-col items-center justify-center gap-3">
        <Loader2 className="w-8 h-8 text-red-700 animate-spin" />
        <p className="text-sm text-gray-500">Loading agreement…</p>
      </div>
    );
  }

  if (done) {
    return (
      <div className="fixed inset-0 z-50 bg-white flex flex-col items-center justify-center gap-4">
        <CheckCircle2 className="w-16 h-16 text-green-600" />
        <h2 className="text-2xl font-bold text-gray-900">Agreement Signed</h2>
        <p className="text-gray-600 text-center max-w-md">
          Your acceptance has been recorded. A PDF copy is being generated and stored for your records.
        </p>
        <p className="text-sm text-gray-400">Taking you to your dashboard…</p>
      </div>
    );
  }

  const { partyName, organizationName, email, roleLabel } = agreement.fields;

  return (
    <div className="fixed inset-0 z-50 bg-black/60 flex items-center justify-center p-4">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-3xl max-h-[96vh] flex flex-col overflow-hidden">
        {/* Header */}
        <div className="bg-red-700 text-white px-6 py-4 flex items-center gap-3 flex-shrink-0">
          <Shield className="w-6 h-6" />
          <div className="flex-1">
            <h2 className="font-bold text-lg leading-tight">Healthcare Partner Platform Services Agreement</h2>
            <p className="text-red-200 text-xs mt-0.5">Please read the full agreement before proceeding</p>
          </div>
          <Badge variant="outline" className="border-red-300 text-red-100 text-xs">{agreement.version}</Badge>
        </div>

        {/* Pre-populated details */}
        <div className="px-6 py-3 bg-gray-50 border-b flex-shrink-0">
          <p className="text-xs text-gray-500 mb-2 font-medium uppercase tracking-wide">Your Details (Pre-populated)</p>
          <div className="grid grid-cols-2 gap-x-6 gap-y-1 text-sm">
            <div><span className="text-gray-500">Name:</span> <span className="font-medium">{partyName}</span></div>
            <div><span className="text-gray-500">Email:</span> <span className="font-medium">{email}</span></div>
            {organizationName && <div><span className="text-gray-500">Organisation:</span> <span className="font-medium">{organizationName}</span></div>}
            <div><span className="text-gray-500">Partner Type:</span> <span className="font-medium">{roleLabel}</span></div>
          </div>
        </div>

        {/* Agreement text scroll area */}
        <div
          ref={scrollRef}
          onScroll={handleScroll}
          className="flex-1 overflow-y-auto px-6 py-4 text-gray-700 whitespace-pre-wrap bg-white min-h-0"
          style={{ fontFamily: "Georgia, serif", fontSize: "13px", lineHeight: "1.7" }}
        >
          {agreement.text}
        </div>

        {/* Scroll prompt */}
        {!hasScrolled && (
          <div className="px-6 py-1.5 bg-amber-50 border-t border-amber-200 flex-shrink-0">
            <p className="text-xs text-amber-700 flex items-center gap-1">
              <FileText className="w-3.5 h-3.5" />
              Please scroll to the bottom to read the full agreement before accepting.
            </p>
          </div>
        )}

        {/* Footer */}
        <div className="px-6 py-4 border-t bg-gray-50 flex-shrink-0 space-y-3">
          <div className="flex items-start gap-3">
            <Checkbox
              id="accept-checkbox"
              checked={accepted}
              onCheckedChange={(v) => setAccepted(!!v)}
              disabled={!hasScrolled}
              className="mt-0.5"
            />
            <label
              htmlFor="accept-checkbox"
              className={`text-sm leading-snug cursor-pointer select-none ${!hasScrolled ? "text-gray-400" : "text-gray-700"}`}
            >
              I, <strong>{partyName}</strong>, confirm that I have read and understood this Agreement in its entirety, that I am duly authorised to accept this Agreement on behalf of <strong>{organizationName || partyName}</strong>, and I agree to be fully bound by all its terms with effect from today.
            </label>
          </div>

          <div className="flex items-center gap-3">
            <Button
              onClick={handleSign}
              disabled={!accepted || !hasScrolled || signMutation.isPending}
              className="bg-red-700 hover:bg-red-800 text-white font-bold px-8 py-2.5 flex-1"
            >
              {signMutation.isPending ? "Recording Acceptance…" : "I ACCEPT — Proceed to Platform"}
            </Button>
            <p className="text-xs text-gray-400 max-w-xs">
              This constitutes a legally binding electronic signature under the IT Act, 2000.
            </p>
          </div>

          {signMutation.isError && (
            <p className="text-sm text-red-600">
              Failed to record your acceptance. Please try again.
            </p>
          )}
        </div>
      </div>
    </div>
  );
}
