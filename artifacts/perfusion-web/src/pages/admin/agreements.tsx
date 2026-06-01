import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { FileDown, Search, Shield, CheckCircle2 } from "lucide-react";

interface AgreementRecord {
  id: string;
  userId: string;
  agreementVersion: string;
  partyName: string;
  organizationName: string | null;
  email: string;
  phone: string | null;
  role: string;
  ipAddress: string | null;
  pdfUrl: string | null;
  signedAt: string;
  createdAt: string;
}

function roleLabel(role: string) {
  if (role === "care_seeker") return "Seeker";
  if (role === "provider") return "Provider";
  if (role === "admin") return "Admin";
  return role;
}

function roleBadgeClass(role: string) {
  if (role === "care_seeker") return "bg-blue-100 text-blue-700";
  if (role === "provider") return "bg-purple-100 text-purple-700";
  return "bg-gray-100 text-gray-700";
}

export default function AdminAgreementsPage() {
  const [search, setSearch] = useState("");

  const { data: agreements = [], isLoading } = useQuery<AgreementRecord[]>({
    queryKey: ["/api/admin/agreements"],
  });

  const filtered = agreements.filter((a) => {
    if (!search.trim()) return true;
    const q = search.toLowerCase();
    return (
      a.partyName.toLowerCase().includes(q) ||
      a.email.toLowerCase().includes(q) ||
      (a.organizationName || "").toLowerCase().includes(q) ||
      a.agreementVersion.toLowerCase().includes(q)
    );
  });

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <Shield className="w-6 h-6 text-red-700" />
          <div>
            <h1 className="text-2xl font-bold text-gray-900">Signed Agreements</h1>
            <p className="text-sm text-gray-500">Click-wrap Healthcare Partner Platform Services Agreements</p>
          </div>
        </div>
        <Badge className="bg-green-100 text-green-700 text-sm px-3 py-1">
          {agreements.length} signed
        </Badge>
      </div>

      <Card>
        <CardHeader className="pb-3">
          <div className="flex items-center gap-3">
            <div className="relative flex-1 max-w-sm">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
              <Input
                placeholder="Search by name, email, or organisation…"
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
                    <th className="text-left px-4 py-3 font-medium text-gray-600">Role</th>
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
                          {roleLabel(a.role)}
                        </span>
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
