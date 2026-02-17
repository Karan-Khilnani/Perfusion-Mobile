import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import { IndianRupee, Calendar, FileText, AlertTriangle, CheckCircle, Clock } from "lucide-react";
import type { Booking } from "@shared/schema";

function getPaymentBadge(status: string | null) {
  switch (status) {
    case "paid": return <Badge className="bg-green-600" data-testid="badge-paid">Paid</Badge>;
    case "partial": return <Badge className="bg-yellow-600" data-testid="badge-partial">Partial</Badge>;
    case "overdue": return <Badge variant="destructive" data-testid="badge-overdue">Overdue</Badge>;
    default: return <Badge variant="outline" data-testid="badge-pending">Pending</Badge>;
  }
}

export default function UserBillingPage() {
  const [startDate, setStartDate] = useState("");
  const [endDate, setEndDate] = useState("");
  const [statusFilter, setStatusFilter] = useState("all");

  const queryParams = new URLSearchParams();
  if (startDate) queryParams.set("startDate", new Date(startDate).toISOString());
  if (endDate) queryParams.set("endDate", new Date(endDate).toISOString());
  if (statusFilter && statusFilter !== "all") queryParams.set("status", statusFilter);

  const { data: invoices, isLoading } = useQuery<Booking[]>({
    queryKey: ["/api/billing/my-invoices", startDate, endDate, statusFilter],
    queryFn: async () => {
      const res = await fetch(`/api/billing/my-invoices?${queryParams.toString()}`);
      if (!res.ok) throw new Error("Failed to fetch");
      return res.json();
    },
  });

  const totalAmount = invoices?.reduce((sum, b) => sum + parseFloat(b.amount || "0"), 0) || 0;
  const totalPaid = invoices?.reduce((sum, b) => sum + parseFloat(b.amountPaid || "0"), 0) || 0;
  const totalOutstanding = totalAmount - totalPaid;
  const overdueCount = invoices?.filter(b => b.paymentStatus === "overdue" || (b.dueDate && new Date(b.dueDate) < new Date() && b.paymentStatus !== "paid")).length || 0;

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold" data-testid="text-billing-title">Billing</h1>
        <p className="text-muted-foreground">View your invoices and payment status</p>
      </div>

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <Card data-testid="card-total-billed">
          <CardContent className="p-4">
            <div className="flex items-center gap-3">
              <div className="rounded-lg bg-blue-500/10 p-2"><IndianRupee className="h-5 w-5 text-blue-500" /></div>
              <div>
                <p className="text-sm text-muted-foreground">Total Billed</p>
                <p className="text-xl font-bold">₹{totalAmount.toFixed(2)}</p>
              </div>
            </div>
          </CardContent>
        </Card>
        <Card data-testid="card-total-paid">
          <CardContent className="p-4">
            <div className="flex items-center gap-3">
              <div className="rounded-lg bg-green-500/10 p-2"><CheckCircle className="h-5 w-5 text-green-500" /></div>
              <div>
                <p className="text-sm text-muted-foreground">Total Paid</p>
                <p className="text-xl font-bold">₹{totalPaid.toFixed(2)}</p>
              </div>
            </div>
          </CardContent>
        </Card>
        <Card data-testid="card-outstanding">
          <CardContent className="p-4">
            <div className="flex items-center gap-3">
              <div className="rounded-lg bg-orange-500/10 p-2"><Clock className="h-5 w-5 text-orange-500" /></div>
              <div>
                <p className="text-sm text-muted-foreground">Outstanding</p>
                <p className="text-xl font-bold">₹{totalOutstanding.toFixed(2)}</p>
              </div>
            </div>
          </CardContent>
        </Card>
        <Card data-testid="card-overdue">
          <CardContent className="p-4">
            <div className="flex items-center gap-3">
              <div className="rounded-lg bg-red-500/10 p-2"><AlertTriangle className="h-5 w-5 text-red-500" /></div>
              <div>
                <p className="text-sm text-muted-foreground">Overdue</p>
                <p className="text-xl font-bold">{overdueCount}</p>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardContent className="p-4">
          <div className="flex flex-wrap items-center gap-4">
            <div className="flex items-center gap-2">
              <label className="text-sm text-muted-foreground">From</label>
              <Input type="date" value={startDate} onChange={(e) => setStartDate(e.target.value)} className="w-40" data-testid="input-start-date" />
            </div>
            <div className="flex items-center gap-2">
              <label className="text-sm text-muted-foreground">To</label>
              <Input type="date" value={endDate} onChange={(e) => setEndDate(e.target.value)} className="w-40" data-testid="input-end-date" />
            </div>
            <Select value={statusFilter} onValueChange={setStatusFilter}>
              <SelectTrigger className="w-40" data-testid="select-status-filter">
                <SelectValue placeholder="All Status" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Status</SelectItem>
                <SelectItem value="pending">Pending</SelectItem>
                <SelectItem value="partial">Partial</SelectItem>
                <SelectItem value="paid">Paid</SelectItem>
                <SelectItem value="overdue">Overdue</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </CardContent>
      </Card>

      {isLoading ? (
        <div className="space-y-4">
          {[1,2,3].map(i => <Skeleton key={i} className="h-24 w-full" />)}
        </div>
      ) : !invoices?.length ? (
        <Card>
          <CardContent className="p-8 text-center">
            <FileText className="mx-auto h-12 w-12 text-muted-foreground/50" />
            <p className="mt-2 text-muted-foreground">No invoices found</p>
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-3">
          {invoices.map((invoice) => (
            <Card key={invoice.id} data-testid={`card-invoice-${invoice.id}`}>
              <CardContent className="p-4">
                <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                  <div className="space-y-1">
                    <div className="flex items-center gap-2">
                      <span className="font-medium" data-testid={`text-service-${invoice.id}`}>{invoice.serviceName}</span>
                      <Badge variant="outline" className="text-xs">{invoice.bookingType}</Badge>
                      {getPaymentBadge(invoice.paymentStatus)}
                    </div>
                    <div className="flex items-center gap-4 text-sm text-muted-foreground">
                      <span>Patient: {invoice.patientName}</span>
                      {invoice.providerName && <span>Provider: {invoice.providerName}</span>}
                    </div>
                    <div className="flex items-center gap-4 text-xs text-muted-foreground">
                      <span><Calendar className="mr-1 inline h-3 w-3" />{invoice.createdAt ? new Date(invoice.createdAt).toLocaleDateString() : "N/A"}</span>
                      {invoice.dueDate && <span>Due: {new Date(invoice.dueDate).toLocaleDateString()}</span>}
                    </div>
                  </div>
                  <div className="text-right space-y-1">
                    <div className="text-lg font-bold" data-testid={`text-amount-${invoice.id}`}>₹{parseFloat(invoice.amount || "0").toFixed(2)}</div>
                    {invoice.amountPaid && parseFloat(invoice.amountPaid) > 0 && (
                      <div className="text-sm text-green-600">Paid: ₹{parseFloat(invoice.amountPaid).toFixed(2)}</div>
                    )}
                    {parseFloat(invoice.amount || "0") - parseFloat(invoice.amountPaid || "0") > 0 && invoice.paymentStatus !== "paid" && (
                      <div className="text-sm text-orange-600">Due: ₹{(parseFloat(invoice.amount || "0") - parseFloat(invoice.amountPaid || "0")).toFixed(2)}</div>
                    )}
                  </div>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}
