import { useState } from "react";
import { useMutation } from "@tanstack/react-query";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import { Phone, Zap, CheckCircle2, XCircle, Loader2, RefreshCw, Info } from "lucide-react";
import { apiRequest } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";

interface TestResult {
  ok: boolean;
  message: string;
  stack?: string;
}

export default function DiagnosticsPage() {
  const { toast } = useToast();
  const [testPhone, setTestPhone] = useState("");
  const [bookingId, setBookingId] = useState("");
  const [twilioResult, setTwilioResult] = useState<TestResult | null>(null);
  const [reminderResult, setReminderResult] = useState<TestResult | null>(null);

  const testTwilio = useMutation({
    mutationFn: async () => {
      const res = await apiRequest("POST", "/api/admin/test-twilio", { phone: testPhone });
      return res.json() as Promise<TestResult>;
    },
    onSuccess: (data) => {
      setTwilioResult(data);
      if (data.ok) {
        toast({ title: "Call placed", description: data.message });
      } else {
        toast({ title: "Call failed", description: data.message, variant: "destructive" });
      }
    },
    onError: (e: any) => {
      const msg = e?.message || "Request failed";
      setTwilioResult({ ok: false, message: msg });
      toast({ title: "Error", description: msg, variant: "destructive" });
    },
  });

  const testReminder = useMutation({
    mutationFn: async () => {
      const res = await apiRequest("POST", `/api/admin/test-reminder/${bookingId.trim()}`);
      return res.json() as Promise<TestResult>;
    },
    onSuccess: (data) => {
      setReminderResult(data);
      if (data.ok) {
        toast({ title: "Reminders fired", description: data.message });
      } else {
        toast({ title: "Reminder failed", description: data.message, variant: "destructive" });
      }
    },
    onError: (e: any) => {
      const msg = e?.message || "Request failed";
      setReminderResult({ ok: false, message: msg });
      toast({ title: "Error", description: msg, variant: "destructive" });
    },
  });

  return (
    <div className="space-y-6 max-w-2xl">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">Diagnostics</h1>
        <p className="text-muted-foreground mt-1">
          Test Twilio voice calls and consultation reminders without waiting for a booking slot.
        </p>
      </div>

      {/* Single test call */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base">
            <Phone className="h-4 w-4" />
            Test Twilio Voice Call
          </CardTitle>
          <CardDescription>
            Places a single test call to any number. Use this to confirm your Twilio credentials,
            balance, and caller ID are all working.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="test-phone">Phone number (with country code)</Label>
            <div className="flex gap-2">
              <Input
                id="test-phone"
                data-testid="input-test-phone"
                placeholder="+917999833154"
                value={testPhone}
                onChange={(e) => setTestPhone(e.target.value)}
                className="max-w-xs"
              />
              <Button
                data-testid="button-test-twilio"
                onClick={() => testTwilio.mutate()}
                disabled={!testPhone.trim() || testTwilio.isPending}
              >
                {testTwilio.isPending ? (
                  <Loader2 className="h-4 w-4 animate-spin mr-2" />
                ) : (
                  <Zap className="h-4 w-4 mr-2" />
                )}
                Call Now
              </Button>
            </div>
            <p className="text-xs text-muted-foreground">
              The phone should ring within 5–10 seconds with a test message.
            </p>
          </div>

          {twilioResult && (
            <ResultBlock result={twilioResult} onClear={() => setTwilioResult(null)} />
          )}
        </CardContent>
      </Card>

      <Separator />

      {/* Re-fire reminder */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base">
            <RefreshCw className="h-4 w-4" />
            Re-fire Consultation Reminder
          </CardTitle>
          <CardDescription>
            Runs the full reminder flow for any consultation booking — calls the consultant, seeker,
            and admin exactly as the scheduler would at slot time. Also resets the booking's
            "reminder fired" flag so it can fire again.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="booking-id">Booking ID (UUID)</Label>
            <div className="flex gap-2">
              <Input
                id="booking-id"
                data-testid="input-booking-id"
                placeholder="7bc1db14-e804-48ae-80b7-5aec8282dd0c"
                value={bookingId}
                onChange={(e) => setBookingId(e.target.value)}
                className="max-w-sm font-mono text-sm"
              />
              <Button
                data-testid="button-test-reminder"
                onClick={() => testReminder.mutate()}
                disabled={!bookingId.trim() || testReminder.isPending}
                variant="outline"
              >
                {testReminder.isPending ? (
                  <Loader2 className="h-4 w-4 animate-spin mr-2" />
                ) : (
                  <RefreshCw className="h-4 w-4 mr-2" />
                )}
                Fire Reminders
              </Button>
            </div>
            <p className="text-xs text-muted-foreground flex items-start gap-1">
              <Info className="h-3 w-3 mt-0.5 shrink-0" />
              Find the booking ID in the All Bookings page — hover the booking number to copy the ID,
              or open the booking row and copy from the URL.
            </p>
          </div>

          {reminderResult && (
            <ResultBlock result={reminderResult} onClear={() => setReminderResult(null)} />
          )}
        </CardContent>
      </Card>

      <Separator />

      {/* Tips */}
      <Card className="bg-muted/40 border-dashed">
        <CardContent className="pt-5 space-y-2 text-sm text-muted-foreground">
          <p className="font-medium text-foreground">Where to watch for results</p>
          <ul className="space-y-1 list-disc list-inside">
            <li>
              <strong>Server logs</strong> — every step prints: calling consultant, calling seeker,
              calling admin, or the exact error with stack trace.
            </li>
            <li>
              <strong>Twilio Console → Monitor → Logs → Calls</strong> — shows each outbound call,
              status (queued / ringing / completed / failed), and Twilio's own error reason if it
              didn't ring.
            </li>
            <li>
              On a Twilio <strong>Trial account</strong>, you can only call numbers that are verified
              in the Twilio console. Upgrade to a paid account to call any number.
            </li>
          </ul>
        </CardContent>
      </Card>
    </div>
  );
}

function ResultBlock({ result, onClear }: { result: TestResult; onClear: () => void }) {
  return (
    <div
      className={`flex items-start gap-3 rounded-md border px-4 py-3 text-sm ${
        result.ok
          ? "border-green-200 bg-green-50 dark:border-green-800 dark:bg-green-950/30"
          : "border-red-200 bg-red-50 dark:border-red-800 dark:bg-red-950/30"
      }`}
      data-testid="result-twilio-test"
    >
      {result.ok ? (
        <CheckCircle2 className="h-4 w-4 text-green-600 dark:text-green-400 mt-0.5 shrink-0" />
      ) : (
        <XCircle className="h-4 w-4 text-red-600 dark:text-red-400 mt-0.5 shrink-0" />
      )}
      <div className="flex-1 space-y-1">
        <div className="flex items-center gap-2">
          <Badge variant={result.ok ? "default" : "destructive"} className="text-xs">
            {result.ok ? "Success" : "Failed"}
          </Badge>
          <button
            onClick={onClear}
            className="ml-auto text-xs text-muted-foreground hover:text-foreground"
          >
            Clear
          </button>
        </div>
        <p className={result.ok ? "text-green-800 dark:text-green-200" : "text-red-800 dark:text-red-200"}>
          {result.message}
        </p>
        {result.stack && (
          <pre className="mt-2 text-xs text-red-700 dark:text-red-300 whitespace-pre-wrap break-all">
            {result.stack}
          </pre>
        )}
      </div>
    </div>
  );
}
