import { useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription } from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Skeleton } from "@/components/ui/skeleton";
import { useToast } from "@/hooks/use-toast";
import { apiRequest, queryClient } from "@/lib/queryClient";
import {
  IndianRupee, Calendar, AlertTriangle, CheckCircle, Clock, Settings,
  CreditCard, CalendarPlus, Percent, FileText
} from "lucide-react";
import type { Booking } from "@shared/schema";

function getPaymentBadge(status: string | null) {
  switch (status) {
    case "paid": return <Badge className="bg-green-600">Paid</Badge>;
    case "partial": return <Badge className="bg-yellow-600">Partial</Badge>;
    case "overdue": return <Badge variant="destructive">Overdue</Badge>;
    default: return <Badge variant="outline">Pending</Badge>;
  }
}

export default function AdminBillingPage() {
  const { toast } = useToast();
  const [startDate, setStartDate] = useState("");
  const [endDate, setEndDate] = useState("");
  const [statusFilter, setStatusFilter] = useState("all");
  
  const [paymentDialog, setPaymentDialog] = useState<{ open: boolean; booking: Booking | null }>({ open: false, booking: null });
  const [dueDateDialog, setDueDateDialog] = useState<{ open: boolean; booking: Booking | null }>({ open: false, booking: null });
  const [marginDialog, setMarginDialog] = useState(false);
  const [paymentAmount, setPaymentAmount] = useState("");
  const [paymentMethodInput, setPaymentMethodInput] = useState("bank_transfer");
  const [newDueDate, setNewDueDate] = useState("");
  const [newMargin, setNewMargin] = useState("");

  const queryParams = new URLSearchParams();
  if (startDate) queryParams.set("startDate", new Date(startDate).toISOString());
  if (endDate) queryParams.set("endDate", new Date(endDate).toISOString());
  if (statusFilter && statusFilter !== "all") queryParams.set("status", statusFilter);

  const { data: invoices, isLoading } = useQuery<Booking[]>({
    queryKey: ["/api/admin/billing/invoices", startDate, endDate, statusFilter],
    queryFn: async () => {
      const res = await fetch(`/api/admin/billing/invoices?${queryParams.toString()}`);
      if (!res.ok) throw new Error("Failed");
      return res.json();
    },
  });

  const { data: marginSetting } = useQuery<{ marginPercent: string }>({
    queryKey: ["/api/settings/margin"],
  });

  const totalRevenue = invoices?.reduce((sum, b) => sum + parseFloat(b.amount || "0"), 0) || 0;
  const totalPaid = invoices?.reduce((sum, b) => sum + parseFloat(b.amountPaid || "0"), 0) || 0;
  const totalOutstanding = totalRevenue - totalPaid;
  const overdueCount = invoices?.filter(b => b.dueDate && new Date(b.dueDate) < new Date() && b.paymentStatus !== "paid").length || 0;

  const recordPaymentMutation = useMutation({
    mutationFn: async ({ bookingId, amount, method }: { bookingId: string; amount: number; method: string }) => {
      const res = await apiRequest("POST", `/api/admin/bookings/${bookingId}/payment`, { amount, method });
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/admin/billing/invoices"] });
      setPaymentDialog({ open: false, booking: null });
      setPaymentAmount("");
      toast({ title: "Payment Recorded", description: "Payment has been recorded successfully." });
    },
    onError: () => {
      toast({ title: "Error", description: "Failed to record payment.", variant: "destructive" });
    },
  });

  const extendDueDateMutation = useMutation({
    mutationFn: async ({ bookingId, dueDate }: { bookingId: string; dueDate: string }) => {
      const res = await apiRequest("PATCH", `/api/admin/bookings/${bookingId}/due-date`, { dueDate });
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/admin/billing/invoices"] });
      setDueDateDialog({ open: false, booking: null });
      setNewDueDate("");
      toast({ title: "Due Date Extended", description: "The due date has been updated." });
    },
    onError: () => {
      toast({ title: "Error", description: "Failed to extend due date.", variant: "destructive" });
    },
  });

  const updateMarginMutation = useMutation({
    mutationFn: async (marginPercent: string) => {
      const res = await apiRequest("PUT", "/api/admin/settings/margin", { marginPercent });
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/settings/margin"] });
      setMarginDialog(false);
      setNewMargin("");
      toast({ title: "Margin Updated", description: "Default margin has been updated for new bookings." });
    },
    onError: () => {
      toast({ title: "Error", description: "Failed to update margin.", variant: "destructive" });
    },
  });

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between gap-4 flex-wrap">
        <div>
          <h1 className="text-2xl font-bold" data-testid="text-admin-billing-title">Billing Management</h1>
          <p className="text-muted-foreground">Manage invoices, payments, and margins</p>
        </div>
        <Button variant="outline" onClick={() => { setNewMargin(marginSetting?.marginPercent || "15"); setMarginDialog(true); }} data-testid="button-edit-margin">
          <Percent className="mr-2 h-4 w-4" />
          Margin: {marginSetting?.marginPercent || "15"}%
        </Button>
      </div>

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <Card data-testid="card-admin-revenue">
          <CardContent className="p-4">
            <div className="flex items-center gap-3">
              <div className="rounded-lg bg-blue-500/10 p-2"><IndianRupee className="h-5 w-5 text-blue-500" /></div>
              <div>
                <p className="text-sm text-muted-foreground">Total Revenue</p>
                <p className="text-xl font-bold">₹{totalRevenue.toFixed(2)}</p>
              </div>
            </div>
          </CardContent>
        </Card>
        <Card data-testid="card-admin-collected">
          <CardContent className="p-4">
            <div className="flex items-center gap-3">
              <div className="rounded-lg bg-green-500/10 p-2"><CheckCircle className="h-5 w-5 text-green-500" /></div>
              <div>
                <p className="text-sm text-muted-foreground">Collected</p>
                <p className="text-xl font-bold">₹{totalPaid.toFixed(2)}</p>
              </div>
            </div>
          </CardContent>
        </Card>
        <Card data-testid="card-admin-outstanding">
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
        <Card data-testid="card-admin-overdue">
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
              <Input type="date" value={startDate} onChange={(e) => setStartDate(e.target.value)} className="w-40" data-testid="input-admin-start-date" />
            </div>
            <div className="flex items-center gap-2">
              <label className="text-sm text-muted-foreground">To</label>
              <Input type="date" value={endDate} onChange={(e) => setEndDate(e.target.value)} className="w-40" data-testid="input-admin-end-date" />
            </div>
            <Select value={statusFilter} onValueChange={setStatusFilter}>
              <SelectTrigger className="w-40" data-testid="select-admin-status">
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
        <div className="space-y-4">{[1,2,3].map(i => <Skeleton key={i} className="h-28 w-full" />)}</div>
      ) : !invoices?.length ? (
        <Card>
          <CardContent className="p-8 text-center">
            <FileText className="mx-auto h-12 w-12 text-muted-foreground/50" />
            <p className="mt-2 text-muted-foreground">No invoices found</p>
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-3">
          {invoices.map((inv) => {
            const outstanding = parseFloat(inv.amount || "0") - parseFloat(inv.amountPaid || "0");
            const isOverdue = inv.dueDate && new Date(inv.dueDate) < new Date() && inv.paymentStatus !== "paid";
            return (
              <Card key={inv.id} className={isOverdue ? "border-red-300 dark:border-red-800" : ""} data-testid={`card-admin-invoice-${inv.id}`}>
                <CardContent className="p-4">
                  <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
                    <div className="space-y-1 flex-1">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="font-medium">{inv.serviceName}</span>
                        <Badge variant="outline" className="text-xs capitalize">{inv.bookingType}</Badge>
                        {getPaymentBadge(isOverdue ? "overdue" : inv.paymentStatus)}
                      </div>
                      <div className="flex items-center gap-4 text-sm text-muted-foreground flex-wrap">
                        <span>Patient: {inv.patientName}</span>
                        {inv.providerName && <span>Provider: {inv.providerName}</span>}
                      </div>
                      <div className="flex items-center gap-4 text-xs text-muted-foreground flex-wrap">
                        <span><Calendar className="mr-1 inline h-3 w-3" />{inv.createdAt ? new Date(inv.createdAt).toLocaleDateString() : "N/A"}</span>
                        {inv.dueDate && <span className={isOverdue ? "text-red-500 font-medium" : ""}>Due: {new Date(inv.dueDate).toLocaleDateString()}</span>}
                        {inv.basePrice && <span>Base: ₹{parseFloat(inv.basePrice).toFixed(2)}</span>}
                        {inv.marginPercent && <span>Margin: {inv.marginPercent}%</span>}
                      </div>
                    </div>
                    <div className="flex items-center gap-3">
                      <div className="text-right mr-3">
                        <div className="text-lg font-bold">₹{parseFloat(inv.amount || "0").toFixed(2)}</div>
                        {outstanding > 0 && inv.paymentStatus !== "paid" && (
                          <div className="text-sm text-orange-600">Due: ₹{outstanding.toFixed(2)}</div>
                        )}
                      </div>
                      <div className="flex gap-2">
                        {inv.paymentStatus !== "paid" && (
                          <Button size="sm" variant="outline" onClick={() => { setPaymentAmount(""); setPaymentDialog({ open: true, booking: inv }); }} data-testid={`button-record-payment-${inv.id}`}>
                            <CreditCard className="mr-1 h-3 w-3" />Pay
                          </Button>
                        )}
                        <Button size="sm" variant="outline" onClick={() => { setNewDueDate(inv.dueDate ? new Date(inv.dueDate).toISOString().split("T")[0] : ""); setDueDateDialog({ open: true, booking: inv }); }} data-testid={`button-extend-due-${inv.id}`}>
                          <CalendarPlus className="mr-1 h-3 w-3" />Due
                        </Button>
                      </div>
                    </div>
                  </div>
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}

      <Dialog open={paymentDialog.open} onOpenChange={(open) => setPaymentDialog({ open, booking: open ? paymentDialog.booking : null })}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Record Payment</DialogTitle>
            <DialogDescription>
              Record a payment for {paymentDialog.booking?.serviceName}
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <div>
              <Label>Total Amount</Label>
              <p className="text-lg font-bold">₹{parseFloat(paymentDialog.booking?.amount || "0").toFixed(2)}</p>
            </div>
            <div>
              <Label>Already Paid</Label>
              <p className="text-sm">₹{parseFloat(paymentDialog.booking?.amountPaid || "0").toFixed(2)}</p>
            </div>
            <div>
              <Label>Outstanding</Label>
              <p className="text-sm font-medium text-orange-600">
                ₹{(parseFloat(paymentDialog.booking?.amount || "0") - parseFloat(paymentDialog.booking?.amountPaid || "0")).toFixed(2)}
              </p>
            </div>
            <div className="space-y-2">
              <Label htmlFor="paymentAmount">Payment Amount (₹)</Label>
              <Input id="paymentAmount" type="number" step="0.01" value={paymentAmount} onChange={(e) => setPaymentAmount(e.target.value)} placeholder="Enter amount" data-testid="input-payment-amount" />
            </div>
            <div className="space-y-2">
              <Label htmlFor="paymentMethod">Payment Method</Label>
              <Select value={paymentMethodInput} onValueChange={setPaymentMethodInput}>
                <SelectTrigger data-testid="select-payment-method">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="bank_transfer">Bank Transfer</SelectItem>
                  <SelectItem value="upi">UPI</SelectItem>
                  <SelectItem value="cash">Cash</SelectItem>
                  <SelectItem value="cheque">Cheque</SelectItem>
                  <SelectItem value="other">Other</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setPaymentDialog({ open: false, booking: null })}>Cancel</Button>
            <Button onClick={() => { if (paymentDialog.booking && paymentAmount) { recordPaymentMutation.mutate({ bookingId: paymentDialog.booking.id, amount: parseFloat(paymentAmount), method: paymentMethodInput }); } }} disabled={!paymentAmount || recordPaymentMutation.isPending} data-testid="button-confirm-record-payment">
              {recordPaymentMutation.isPending ? "Recording..." : "Record Payment"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={dueDateDialog.open} onOpenChange={(open) => setDueDateDialog({ open, booking: open ? dueDateDialog.booking : null })}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Extend Due Date</DialogTitle>
            <DialogDescription>
              Set a new due date for {dueDateDialog.booking?.serviceName}
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <div>
              <Label>Current Due Date</Label>
              <p className="text-sm">{dueDateDialog.booking?.dueDate ? new Date(dueDateDialog.booking.dueDate).toLocaleDateString() : "Not set"}</p>
            </div>
            <div className="space-y-2">
              <Label htmlFor="newDueDate">New Due Date</Label>
              <Input id="newDueDate" type="date" value={newDueDate} onChange={(e) => setNewDueDate(e.target.value)} data-testid="input-new-due-date" />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDueDateDialog({ open: false, booking: null })}>Cancel</Button>
            <Button onClick={() => { if (dueDateDialog.booking && newDueDate) { extendDueDateMutation.mutate({ bookingId: dueDateDialog.booking.id, dueDate: newDueDate }); } }} disabled={!newDueDate || extendDueDateMutation.isPending} data-testid="button-confirm-extend-due">
              {extendDueDateMutation.isPending ? "Updating..." : "Update Due Date"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={marginDialog} onOpenChange={setMarginDialog}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Edit Default Margin</DialogTitle>
            <DialogDescription>
              This margin will be applied to all new bookings. Existing bookings are not affected.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <div>
              <Label>Current Margin</Label>
              <p className="text-lg font-bold">{marginSetting?.marginPercent || "15"}%</p>
            </div>
            <div className="space-y-2">
              <Label htmlFor="newMargin">New Margin (%)</Label>
              <Input id="newMargin" type="number" step="0.5" min="0" max="100" value={newMargin} onChange={(e) => setNewMargin(e.target.value)} data-testid="input-new-margin" />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setMarginDialog(false)}>Cancel</Button>
            <Button onClick={() => { if (newMargin) updateMarginMutation.mutate(newMargin); }} disabled={!newMargin || updateMarginMutation.isPending} data-testid="button-confirm-margin">
              {updateMarginMutation.isPending ? "Updating..." : "Update Margin"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
