import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { IndianRupee, TrendingUp, Users, Building, Download, BarChart3, PieChart, AlertTriangle } from "lucide-react";

interface AnalyticsData {
  summary: {
    grossRevenue: number;
    providerPayout: number;
    netRevenue: number;
    totalPaid: number;
    totalOutstanding: number;
  };
  byServiceType: Record<string, { count: number; revenue: number; margin: number }>;
  byProvider: Array<{ name: string; count: number; revenue: number; payout: number }>;
  bySeeker: Array<{ count: number; revenue: number; paid: number; outstanding: number }>;
  overdueCount: number;
  totalBookings: number;
}

export default function AdminAnalyticsPage() {
  const [startDate, setStartDate] = useState("");
  const [endDate, setEndDate] = useState("");

  const queryParams = new URLSearchParams();
  if (startDate) queryParams.set("startDate", new Date(startDate).toISOString());
  if (endDate) queryParams.set("endDate", new Date(endDate).toISOString());

  const { data, isLoading } = useQuery<AnalyticsData>({
    queryKey: ["/api/admin/analytics/revenue", startDate, endDate],
    queryFn: async () => {
      const res = await fetch(`/api/admin/analytics/revenue?${queryParams.toString()}`);
      if (!res.ok) throw new Error("Failed");
      return res.json();
    },
  });

  const exportCSV = () => {
    if (!data) return;
    const rows = [
      ["Metric", "Value"],
      ["Gross Revenue", data.summary.grossRevenue.toFixed(2)],
      ["Provider Payout", data.summary.providerPayout.toFixed(2)],
      ["Net Revenue (Profit)", data.summary.netRevenue.toFixed(2)],
      ["Total Paid", data.summary.totalPaid.toFixed(2)],
      ["Total Outstanding", data.summary.totalOutstanding.toFixed(2)],
      ["Total Bookings", data.totalBookings.toString()],
      ["Overdue Invoices", data.overdueCount.toString()],
      [""],
      ["Service Type", "Count", "Revenue", "Margin"],
      ...Object.entries(data.byServiceType).map(([type, d]) => [type, d.count.toString(), d.revenue.toFixed(2), d.margin.toFixed(2)]),
      [""],
      ["Provider", "Bookings", "Revenue", "Payout"],
      ...data.byProvider.map(p => [p.name, p.count.toString(), p.revenue.toFixed(2), p.payout.toFixed(2)]),
    ];
    const csv = rows.map(r => r.join(",")).join("\n");
    const blob = new Blob([csv], { type: "text/csv" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `perfusion-analytics-${startDate || "all"}-${endDate || "all"}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between gap-4 flex-wrap">
        <div>
          <h1 className="text-2xl font-bold" data-testid="text-analytics-title">Analytics</h1>
          <p className="text-muted-foreground">Revenue analysis and financial insights</p>
        </div>
        <Button variant="outline" onClick={exportCSV} disabled={!data} data-testid="button-export-csv">
          <Download className="mr-2 h-4 w-4" />
          Export CSV
        </Button>
      </div>

      <Card>
        <CardContent className="p-4">
          <div className="flex flex-wrap items-center gap-4">
            <div className="flex items-center gap-2">
              <label className="text-sm text-muted-foreground">From</label>
              <Input type="date" value={startDate} onChange={(e) => setStartDate(e.target.value)} className="w-40" data-testid="input-analytics-start" />
            </div>
            <div className="flex items-center gap-2">
              <label className="text-sm text-muted-foreground">To</label>
              <Input type="date" value={endDate} onChange={(e) => setEndDate(e.target.value)} className="w-40" data-testid="input-analytics-end" />
            </div>
          </div>
        </CardContent>
      </Card>

      {isLoading ? (
        <div className="space-y-4">{[1,2,3].map(i => <Skeleton key={i} className="h-24 w-full" />)}</div>
      ) : !data ? (
        <Card><CardContent className="p-8 text-center text-muted-foreground">No data available</CardContent></Card>
      ) : (
        <>
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-5">
            <Card data-testid="card-gross-revenue">
              <CardContent className="p-4">
                <div className="flex items-center gap-3">
                  <div className="rounded-lg bg-blue-500/10 p-2"><IndianRupee className="h-5 w-5 text-blue-500" /></div>
                  <div>
                    <p className="text-xs text-muted-foreground">Gross Revenue</p>
                    <p className="text-lg font-bold">₹{data.summary.grossRevenue.toFixed(2)}</p>
                  </div>
                </div>
              </CardContent>
            </Card>
            <Card data-testid="card-provider-payout">
              <CardContent className="p-4">
                <div className="flex items-center gap-3">
                  <div className="rounded-lg bg-orange-500/10 p-2"><Building className="h-5 w-5 text-orange-500" /></div>
                  <div>
                    <p className="text-xs text-muted-foreground">Provider Payout</p>
                    <p className="text-lg font-bold">₹{data.summary.providerPayout.toFixed(2)}</p>
                  </div>
                </div>
              </CardContent>
            </Card>
            <Card data-testid="card-net-profit">
              <CardContent className="p-4">
                <div className="flex items-center gap-3">
                  <div className="rounded-lg bg-green-500/10 p-2"><TrendingUp className="h-5 w-5 text-green-500" /></div>
                  <div>
                    <p className="text-xs text-muted-foreground">Net Profit</p>
                    <p className="text-lg font-bold">₹{data.summary.netRevenue.toFixed(2)}</p>
                  </div>
                </div>
              </CardContent>
            </Card>
            <Card data-testid="card-total-collected">
              <CardContent className="p-4">
                <div className="flex items-center gap-3">
                  <div className="rounded-lg bg-emerald-500/10 p-2"><IndianRupee className="h-5 w-5 text-emerald-500" /></div>
                  <div>
                    <p className="text-xs text-muted-foreground">Collected</p>
                    <p className="text-lg font-bold">₹{data.summary.totalPaid.toFixed(2)}</p>
                  </div>
                </div>
              </CardContent>
            </Card>
            <Card data-testid="card-total-outstanding-analytics">
              <CardContent className="p-4">
                <div className="flex items-center gap-3">
                  <div className="rounded-lg bg-red-500/10 p-2"><AlertTriangle className="h-5 w-5 text-red-500" /></div>
                  <div>
                    <p className="text-xs text-muted-foreground">Outstanding</p>
                    <p className="text-lg font-bold">₹{data.summary.totalOutstanding.toFixed(2)}</p>
                  </div>
                </div>
              </CardContent>
            </Card>
          </div>

          <div className="grid gap-4 sm:grid-cols-2">
            <Card>
              <CardContent className="p-4">
                <div className="flex items-center gap-3">
                  <BarChart3 className="h-5 w-5 text-muted-foreground" />
                  <div>
                    <p className="text-sm text-muted-foreground">Total Bookings</p>
                    <p className="text-2xl font-bold">{data.totalBookings}</p>
                  </div>
                </div>
              </CardContent>
            </Card>
            <Card>
              <CardContent className="p-4">
                <div className="flex items-center gap-3">
                  <AlertTriangle className="h-5 w-5 text-red-500" />
                  <div>
                    <p className="text-sm text-muted-foreground">Overdue Invoices</p>
                    <p className="text-2xl font-bold text-red-600">{data.overdueCount}</p>
                  </div>
                </div>
              </CardContent>
            </Card>
          </div>

          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2"><PieChart className="h-5 w-5" /> Revenue by Service Type</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="grid gap-4 sm:grid-cols-3">
                {Object.entries(data.byServiceType).map(([type, d]) => (
                  <div key={type} className="rounded-lg border p-4" data-testid={`card-service-type-${type}`}>
                    <div className="text-sm font-medium capitalize text-muted-foreground">{type}</div>
                    <div className="mt-1 text-2xl font-bold">₹{d.revenue.toFixed(2)}</div>
                    <div className="mt-1 flex items-center gap-3 text-xs text-muted-foreground">
                      <span>{d.count} bookings</span>
                      <span>Margin: ₹{d.margin.toFixed(2)}</span>
                    </div>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>

          {data.byProvider.length > 0 && (
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2"><Users className="h-5 w-5" /> Revenue by Provider</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="border-b">
                        <th className="py-2 text-left font-medium text-muted-foreground">Provider</th>
                        <th className="py-2 text-right font-medium text-muted-foreground">Bookings</th>
                        <th className="py-2 text-right font-medium text-muted-foreground">Revenue</th>
                        <th className="py-2 text-right font-medium text-muted-foreground">Payout</th>
                        <th className="py-2 text-right font-medium text-muted-foreground">Margin</th>
                      </tr>
                    </thead>
                    <tbody>
                      {data.byProvider.map((p, i) => (
                        <tr key={i} className="border-b last:border-0" data-testid={`row-provider-${i}`}>
                          <td className="py-2 font-medium">{p.name}</td>
                          <td className="py-2 text-right">{p.count}</td>
                          <td className="py-2 text-right">₹{p.revenue.toFixed(2)}</td>
                          <td className="py-2 text-right">₹{p.payout.toFixed(2)}</td>
                          <td className="py-2 text-right text-green-600">₹{(p.revenue - p.payout).toFixed(2)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </CardContent>
            </Card>
          )}
        </>
      )}
    </div>
  );
}
