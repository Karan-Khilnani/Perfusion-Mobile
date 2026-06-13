import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { FileDown, Search, Shield, CheckCircle2, Pause, Play, AlertTriangle } from "lucide-react";
import { apiRequest } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";

interface AgreementRecord {
  id: string;
  userId: string;
  uniqueRef: string | null;
  agreementVersion: string;
  partyName: string;
  organizationName: string | null;
  email: string;
  phone: string | null;
  role: string;
  roleLabel: string;
  ipAddress: string | null;
  pdfUrl: string | null;
  signedAt: string;
  createdAt: string;
}

interface EnforcementStatus {
  enabled: boolean;
}

function roleBadgeClass(role: string) {
  if (role === "care_seeker") return "bg-blue-100 text-blue-700";
  if (role === "provider") return "bg-purple-100 text-purple-700";
  return "bg-gray-100 text-gray-700";
}

export default function AdminAgreementsPage() {
  const [search, setSearch] = useState("");
  const { toast } = useToast();
  const qc = useQueryClient();

  const { data: agreements = [], isLoading } = useQuery<AgreementRecord[]>({
    queryKey: ["/api/admin/agreements"],
  });

  const { data: enforcement, isLoading: enforcementLoading } = useQuery<EnforcementStatus>({
    queryKey: ["/api/admin/agreements/enforcement"],
  });

  const toggleMutation = useMutation({
    mutationFn: async (enabled: boolean) => {
      const res = await apiRequest("POST", "/api/admin/agreements/enforcement", { enabled });
      return res.json() as Promise<EnforcementStatus>;
    },
    onSuccess: (data) => {
      qc.setQueryData(["/api/admin/agreements/enforcement"], data);
      toast({
        title: data.enabled ? "Agreement collection resumed" : "Agreement collection paused",
        description: data.enabled
          ? "All unsigned approved users will be prompted to sign on next login."
          : "Users will not be asked to sign. Existing signed agreements are preserved.",
      });
    },
    onError: () => {
      toast({ title: "Failed to update", description: "Could not change agreement enforcement status.", variant: "destructive" });
    },
  });

  const isEnabled = enforcement?.enabled ?? true;

  const filtered = agreements.filter((a) => {
    if (!search.trim()) return true;
    const q = search.toLowerCase();
    return (
      a.partyName.toLowerCase().includes(q) ||
      a.email.toLowerCase().includes(q) ||
      (a.organizationName || "").toLowerCase().includes(q) ||
      (a.uniqueRef || "").toLowerCase().includes(q) ||
      a.agreementVersion.toLowerCase().includes(q)
    );
  });

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <Shield className="w-6 h-6 text-red-700" />
          <div>
            <h1 className="text-2xl font-bold text-gray-900">Agreements</h1>
            <p className="text-sm text-gray-500">Healthcare Partner Platform Services Agreements</p>
          </div>
        </div>
        <Badge className="bg-green-100 text-green-700 text-sm px-3 py-1">
          {agreements.length} signed
        </Badge>
      </div>

      {/* Enforcement toggle card */}
      <Card className={`border-2 ${isEnabled ? "border-green-200 bg-green-50" : "border-amber-200 bg-amber-50"}`}>
        <CardContent className="py-4">
          <div className="flex items-center justify-between gap-4">
            <div className="flex items-start gap-3">
              {isEnabled ? (
                <Play className="w-5 h-5 text-green-600 mt-0.5 shrink-0" />
              ) : (
                <Pause className="w-5 h-5 text-amber-600 mt-0.5 shrink-0" />
              )}
              <div>
                <p className={`font-semibold text-sm ${isEnabled ? "text-green-800" : "text-amber-800"}`}>
                  Agreement collection is currently{" "}
                  <span className="uppercase">{isEnabled ? "active" : "paused"}</span>
                </p>
                <p className={`text-xs mt-0.5 ${isEnabled ? "text-green-700" : "text-amber-700"}`}>
                  {isEnabled
                    ? "All approved users (seekers, providers, labs, consultants) who haven't signed will be prompted on next login."
                    : "No users will be asked to sign. All previously collected agreements remain saved and are not affected."}
                </p>
              </div>
            </div>
            <Button
              variant="outline"
              size="sm"
              disabled={enforcementLoading || toggleMutation.isPending}
              onClick={() => toggleMutation.mutate(!isEnabled)}
              className={`shrink-0 font-medium ${
                isEnabled
                  ? "border-amber-300 text-amber-700 hover:bg-amber-100"
                  : "border-green-300 text-green-700 hover:bg-green-100"
              }`}
            >
              {toggleMutation.isPending ? (
                "Updating…"
              ) : isEnabled ? (
                <><Pause className="w-3.5 h-3.5 mr-1.5" />Pause</>
              ) : (
                <><Play className="w-3.5 h-3.5 mr-1.5" />Resume</>
              )}
            </Button>
          </div>

          {!isEnabled && (
            <div className="mt-3 flex items-start gap-2 text-xs text-amber-700 border-t border-amber-200 pt-3">
              <AlertTriangle className="w-3.5 h-3.5 shrink-0 mt-0.5" />
              <span>
                When you resume, every approved user without a saved agreement for the current version will be asked to sign before they can access the platform.
              </span>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Signed agreements table */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base">Saved Agreements</CardTitle>
          <div className="flex items-center gap-3 mt-2">
            <div className="relative flex-1 max-w-sm">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
              <Input
                placeholder="Search by name, email, reference or organisation…"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                className="pl-9"
              />
            </div>
          </div>
        </CardHeader>
        <CardContent className="p-0">
          {isLoading ? (
            <div className="py-12 text-center text-gray-500 text-sm">Loading agreements…</div>
          ) : filtered.length === 0 ? (
            <div className="py-12 text-center text-gray-500 text-sm">
              {search ? "No agreements match your search." : "No signed agreements yet."}
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b bg-gray-50">
                    <th className="text-left px-4 py-3 font-medium text-gray-600">Partner</th>
                    <th className="text-left px-4 py-3 font-medium text-gray-600">Organisation</th>
                    <th className="text-left px-4 py-3 font-medium text-gray-600">Partner Type</th>
                    <th className="text-left px-4 py-3 font-medium text-gray-600">Reference</th>
                    <th className="text-left px-4 py-3 font-medium text-gray-600">Version</th>
                    <th className="text-left px-4 py-3 font-medium text-gray-600">Signed At (IST)</th>
                    <th className="text-left px-4 py-3 font-medium text-gray-600">IP Address</th>
                    <th className="text-left px-4 py-3 font-medium text-gray-600">PDF</th>
                  </tr>
                </thead>
                <tbody>
                  {filtered.map((a) => (
                    <tr key={a.id} className="border-b hover:bg-gray-50 transition-colors">
                      <td className="px-4 py-3">
                        <div className="font-medium text-gray-900">{a.partyName}</div>
                        <div className="text-xs text-gray-500">{a.email}</div>
                        {a.phone && <div className="text-xs text-gray-400">{a.phone}</div>}
                      </td>
                      <td className="px-4 py-3 text-gray-700">
                        {a.organizationName || <span className="text-gray-400">—</span>}
                      </td>
                      <td className="px-4 py-3">
                        <span className={`text-xs font-medium px-2 py-0.5 rounded-full ${roleBadgeClass(a.role)}`}>
                          {a.roleLabel}
                        </span>
                      </td>
                      <td className="px-4 py-3 text-gray-500 text-xs font-mono">
                        {a.uniqueRef || "—"}
                      </td>
                      <td className="px-4 py-3">
                        <Badge variant="outline" className="text-xs">{a.agreementVersion}</Badge>
                      </td>
                      <td className="px-4 py-3 text-gray-700 whitespace-nowrap">
                        {new Date(a.signedAt).toLocaleString("en-IN", {
                          dateStyle: "medium",
                          timeStyle: "short",
                          timeZone: "Asia/Kolkata",
                        })}
                      </td>
                      <td className="px-4 py-3 text-gray-500 text-xs font-mono">
                        {a.ipAddress || "—"}
                      </td>
                      <td className="px-4 py-3">
                        {a.pdfUrl ? (
                          <Button
                            variant="outline"
                            size="sm"
                            asChild
                            className="h-7 px-2 text-xs gap-1"
                          >
                            <a href={a.pdfUrl} target="_blank" rel="noopener noreferrer">
                              <FileDown className="w-3.5 h-3.5" />
                              PDF
                            </a>
                          </Button>
                        ) : (
                          <span className="text-xs text-gray-400 flex items-center gap-1">
                            <CheckCircle2 className="w-3.5 h-3.5 text-green-500" />
                            Signed
                          </span>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
