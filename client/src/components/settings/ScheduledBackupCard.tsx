import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { CalendarClock, Loader2, CheckCircle, XCircle, Save, AlertTriangle } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { apiRequest } from "@/lib/queryClient";
import { useEffect, useState } from "react";
import { format } from "date-fns";

interface ScheduleResponse {
  enabled: boolean;
  frequency: "daily" | "every_2_days" | "weekly" | null;
  timeOfDay: string | null;
  retentionCount: number;
  alertThresholdDays: number;
  nextDueAt: string | null;
  lastRunAt: string | null;
  lastSuccessfulBackupAt: string | null;
}

const FREQUENCY_LABELS: Record<string, string> = {
  daily: "Daily",
  every_2_days: "Every 2 days",
  weekly: "Weekly",
};

function formatDate(ts: string | null) {
  if (!ts) return "Never";
  try {
    return format(new Date(ts), "dd/MM/yy HH:mm");
  } catch {
    return "—";
  }
}

export default function ScheduledBackupCard() {
  const { toast } = useToast();
  const queryClient = useQueryClient();

  const { data, isLoading } = useQuery<ScheduleResponse>({
    queryKey: ["/api/ops/backup-schedule"],
    staleTime: 30 * 1000,
  });

  const [enabled, setEnabled] = useState(false);
  const [frequency, setFrequency] = useState<string>("");
  const [timeOfDay, setTimeOfDay] = useState<string>("");
  const [retentionCount, setRetentionCount] = useState<number>(7);
  const [alertThresholdDays, setAlertThresholdDays] = useState<number>(2);
  const [errors, setErrors] = useState<Record<string, string>>({});

  // Hydrate form state from server response
  useEffect(() => {
    if (!data) return;
    setEnabled(data.enabled);
    setFrequency(data.frequency ?? "");
    setTimeOfDay(data.timeOfDay ?? "");
    setRetentionCount(data.retentionCount ?? 7);
    setAlertThresholdDays(data.alertThresholdDays ?? 2);
  }, [data]);

  const saveMutation = useMutation({
    mutationFn: async () => {
      const payload = {
        enabled,
        frequency: frequency || null,
        timeOfDay: timeOfDay || null,
        retentionCount,
        alertThresholdDays,
      };
      const res = await apiRequest("PUT", "/api/ops/backup-schedule", payload);
      return res.json();
    },
    onMutate: () => {
      setErrors({});
    },
    onSuccess: () => {
      setErrors({});
      queryClient.invalidateQueries({ queryKey: ["/api/ops/backup-schedule"] });
      queryClient.invalidateQueries({ queryKey: ["/api/ops/backup-runs"] });
      toast({ title: "Schedule saved", description: "Backup schedule updated successfully." });
    },
    onError: async (err: any) => {
      try {
        const data = JSON.parse(err.message.replace(/^\d+:\s*/, ""));
        if (data.field) {
          setErrors({ [data.field]: data.error });
        }
        toast({ title: "Save failed", description: data.error || "Could not save schedule.", variant: "destructive" });
      } catch {
        toast({ title: "Save failed", description: err.message || "Could not save schedule.", variant: "destructive" });
      }
    },
  });

  const handleSave = () => {
    const localErrors: Record<string, string> = {};
    if (enabled) {
      if (!frequency) localErrors.frequency = "Pick a frequency.";
      if (!timeOfDay) localErrors.timeOfDay = "Pick a time of day.";
    }
    if (retentionCount < 1 || retentionCount > 14) localErrors.retentionCount = "Must be between 1 and 14.";
    if (alertThresholdDays < 1 || alertThresholdDays > 14) localErrors.alertThresholdDays = "Must be between 1 and 14.";
    if (Object.keys(localErrors).length > 0) {
      setErrors(localErrors);
      return;
    }
    setErrors({});
    saveMutation.mutate();
  };

  const lastRunWasSuccess =
    data?.lastSuccessfulBackupAt && data?.lastRunAt
      ? new Date(data.lastSuccessfulBackupAt).getTime() === new Date(data.lastRunAt).getTime()
      : null;

  const isStale = (() => {
    if (!data?.enabled) return false;
    if (!data.lastSuccessfulBackupAt) return true;
    const ageMs = Date.now() - new Date(data.lastSuccessfulBackupAt).getTime();
    return ageMs > data.alertThresholdDays * 86400_000;
  })();

  return (
    <Card className="border-0 shadow-lg">
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <CalendarClock className="w-5 h-5" />
          Scheduled Backups
        </CardTitle>
        <CardDescription>
          Take database backups automatically on a cadence you choose. Old backups beyond the retention count are pruned automatically. Times are in Asia/Dubai (GST).
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-6">
        {isLoading ? (
          <div className="flex items-center gap-2 text-sm text-gray-500">
            <Loader2 className="w-4 h-4 animate-spin" /> Loading schedule…
          </div>
        ) : (
          <>
            {isStale && (
              <Alert className="border-red-300 bg-red-50">
                <AlertTriangle className="w-4 h-4 text-red-700" />
                <AlertDescription className="text-red-800">
                  <strong>No successful backup in {data!.alertThresholdDays} day{data!.alertThresholdDays !== 1 ? "s" : ""}.</strong>{" "}
                  Check that the scheduler is running and review recent backup runs below.
                </AlertDescription>
              </Alert>
            )}

            {/* Enable toggle */}
            <div className="flex items-start justify-between gap-4 p-4 rounded-lg border bg-gray-50">
              <div>
                <Label htmlFor="bs-enabled" className="text-sm font-semibold cursor-pointer">
                  Enable scheduled backups
                </Label>
                <p className="text-xs text-gray-500 mt-1">
                  When off, no automatic backups run and the stale-backup banner is hidden.
                </p>
              </div>
              <Switch
                id="bs-enabled"
                checked={enabled}
                onCheckedChange={setEnabled}
                data-testid="switch-backup-schedule-enabled"
              />
            </div>

            {/* Settings grid */}
            <div className={`grid grid-cols-1 sm:grid-cols-2 gap-4 ${!enabled ? "opacity-60 pointer-events-none" : ""}`}>
              <div className="space-y-1">
                <Label htmlFor="bs-frequency">Frequency</Label>
                <Select value={frequency} onValueChange={setFrequency} disabled={!enabled}>
                  <SelectTrigger id="bs-frequency" data-testid="select-backup-frequency">
                    <SelectValue placeholder="Pick a frequency" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="daily">Daily</SelectItem>
                    <SelectItem value="every_2_days">Every 2 days</SelectItem>
                    <SelectItem value="weekly">Weekly</SelectItem>
                  </SelectContent>
                </Select>
                {errors.frequency && <p className="text-xs text-red-600">{errors.frequency}</p>}
              </div>

              <div className="space-y-1">
                <Label htmlFor="bs-time">Time of day (Asia/Dubai)</Label>
                <Input
                  id="bs-time"
                  type="time"
                  value={timeOfDay}
                  onChange={(e) => setTimeOfDay(e.target.value)}
                  disabled={!enabled}
                  data-testid="input-backup-time"
                />
                {errors.timeOfDay && <p className="text-xs text-red-600">{errors.timeOfDay}</p>}
              </div>

              <div className="space-y-1">
                <Label htmlFor="bs-retention">Retention (keep N most recent backups)</Label>
                <Input
                  id="bs-retention"
                  type="number"
                  min={1}
                  max={14}
                  value={retentionCount}
                  onChange={(e) => setRetentionCount(parseInt(e.target.value, 10) || 0)}
                  data-testid="input-backup-retention"
                />
                <p className="text-xs text-gray-500">Range 1–14. Older successful backups are deleted automatically after each run.</p>
                {errors.retentionCount && <p className="text-xs text-red-600">{errors.retentionCount}</p>}
              </div>

              <div className="space-y-1">
                <Label htmlFor="bs-threshold">Warn me if no successful backup in (days)</Label>
                <Input
                  id="bs-threshold"
                  type="number"
                  min={1}
                  max={14}
                  value={alertThresholdDays}
                  onChange={(e) => setAlertThresholdDays(parseInt(e.target.value, 10) || 0)}
                  data-testid="input-backup-alert-threshold"
                />
                <p className="text-xs text-gray-500">Range 1–14. A red banner appears when the most recent success exceeds this age.</p>
                {errors.alertThresholdDays && <p className="text-xs text-red-600">{errors.alertThresholdDays}</p>}
              </div>
            </div>

            {/* Save button */}
            <div>
              <Button
                onClick={handleSave}
                disabled={saveMutation.isPending}
                data-testid="button-save-backup-schedule"
              >
                {saveMutation.isPending ? (
                  <><Loader2 className="w-4 h-4 mr-2 animate-spin" />Saving…</>
                ) : (
                  <><Save className="w-4 h-4 mr-2" />Save schedule</>
                )}
              </Button>
            </div>

            {/* Status panel */}
            <div className="border rounded-lg p-4 bg-gray-50 space-y-3">
              <h4 className="text-xs font-semibold text-gray-500 uppercase tracking-wide">Current schedule status</h4>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-sm">
                <div>
                  <p className="text-gray-500 text-xs">Schedule</p>
                  <p className="font-medium" data-testid="text-schedule-summary">
                    {data?.enabled
                      ? `${FREQUENCY_LABELS[data.frequency || ""] || "—"} at ${data.timeOfDay || "—"} (Dubai)`
                      : "Disabled"}
                  </p>
                </div>
                <div>
                  <p className="text-gray-500 text-xs">Next scheduled run</p>
                  <p className="font-medium" data-testid="text-next-due-at">
                    {data?.enabled && data?.nextDueAt ? formatDate(data.nextDueAt) : "—"}
                  </p>
                </div>
                <div>
                  <p className="text-gray-500 text-xs">Last attempted run</p>
                  <p className="font-medium flex items-center gap-2" data-testid="text-last-run-at">
                    {formatDate(data?.lastRunAt ?? null)}
                    {lastRunWasSuccess === true && (
                      <Badge className="bg-emerald-100 text-emerald-800 border-emerald-200">
                        <CheckCircle className="w-3 h-3 mr-1 inline" />OK
                      </Badge>
                    )}
                    {lastRunWasSuccess === false && (
                      <Badge variant="destructive">
                        <XCircle className="w-3 h-3 mr-1 inline" />Failed
                      </Badge>
                    )}
                  </p>
                </div>
                <div>
                  <p className="text-gray-500 text-xs">Last successful backup</p>
                  <p className="font-medium" data-testid="text-last-success-at">
                    {formatDate(data?.lastSuccessfulBackupAt ?? null)}
                  </p>
                </div>
              </div>
            </div>
          </>
        )}
      </CardContent>
    </Card>
  );
}
