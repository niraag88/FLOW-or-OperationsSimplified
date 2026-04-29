import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Alert, AlertDescription } from "@/components/ui/alert";
import {
  Form,
  FormControl,
  FormDescription,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from "@/components/ui/form";
import { CalendarClock, Loader2, CheckCircle, XCircle, Save, AlertTriangle } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { apiRequest } from "@/lib/queryClient";
import { useEffect } from "react";
import { format } from "date-fns";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";

const backupScheduleFormSchema = z
  .object({
    enabled: z.boolean(),
    frequency: z.enum(["daily", "every_2_days", "weekly"]).nullable(),
    timeOfDay: z
      .string()
      .regex(/^([01]\d|2[0-3]):[0-5]\d$/, "Time must be HH:MM (24-hour).")
      .nullable(),
    retentionCount: z
      .number({ invalid_type_error: "Retention must be a number." })
      .int("Retention must be a whole number.")
      .min(1, "Must be between 1 and 14.")
      .max(14, "Must be between 1 and 14."),
    alertThresholdDays: z
      .number({ invalid_type_error: "Alert threshold must be a number." })
      .int("Alert threshold must be a whole number.")
      .min(1, "Must be between 1 and 14.")
      .max(14, "Must be between 1 and 14."),
  })
  .superRefine((val, ctx) => {
    if (val.enabled) {
      if (!val.frequency) {
        ctx.addIssue({ code: z.ZodIssueCode.custom, message: "Pick a frequency.", path: ["frequency"] });
      }
      if (!val.timeOfDay) {
        ctx.addIssue({ code: z.ZodIssueCode.custom, message: "Pick a time of day.", path: ["timeOfDay"] });
      }
    }
  });

type BackupScheduleFormValues = z.infer<typeof backupScheduleFormSchema>;

interface ScheduleResponse {
  enabled: boolean;
  frequency: "daily" | "every_2_days" | "weekly" | null;
  timeOfDay: string | null;
  retentionCount: number;
  alertThresholdDays: number;
  nextDueAt: string | null;
  lastRunAt: string | null;
  lastSuccessfulBackupAt: string | null;
  lastRunSuccess: boolean | null;
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

  const form = useForm<BackupScheduleFormValues>({
    resolver: zodResolver(backupScheduleFormSchema),
    defaultValues: {
      enabled: false,
      frequency: null,
      timeOfDay: null,
      retentionCount: 7,
      alertThresholdDays: 2,
    },
  });

  // Hydrate form values from server response when data arrives.
  useEffect(() => {
    if (!data) return;
    form.reset({
      enabled: data.enabled,
      frequency: data.frequency,
      timeOfDay: data.timeOfDay,
      retentionCount: data.retentionCount ?? 7,
      alertThresholdDays: data.alertThresholdDays ?? 2,
    });
  }, [data, form]);

  const enabled = form.watch("enabled");

  const saveMutation = useMutation({
    mutationFn: async (values: BackupScheduleFormValues) => {
      const res = await apiRequest("PUT", "/api/ops/backup-schedule", values);
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/ops/backup-schedule"] });
      queryClient.invalidateQueries({ queryKey: ["/api/ops/backup-runs"] });
      toast({ title: "Schedule saved", description: "Backup schedule updated successfully." });
    },
    onError: async (err: any) => {
      try {
        const data = JSON.parse(err.message.replace(/^\d+:\s*/, ""));
        if (data.field) {
          form.setError(data.field as keyof BackupScheduleFormValues, {
            type: "server",
            message: data.error,
          });
        }
        toast({ title: "Save failed", description: data.error || "Could not save schedule.", variant: "destructive" });
      } catch {
        toast({ title: "Save failed", description: err.message || "Could not save schedule.", variant: "destructive" });
      }
    },
  });

  const onSubmit = (values: BackupScheduleFormValues) => {
    saveMutation.mutate(values);
  };

  const lastRunWasSuccess = data?.lastRunSuccess ?? null;

  // Stale detection mirrors the top-app StaleBackupBanner contract:
  // when there is no successful backup yet, only warn after the first
  // scheduled window has elapsed plus the alert threshold — this avoids
  // a false positive immediately after the admin enables the schedule.
  const isStale = (() => {
    if (!data?.enabled) return false;
    if (data.lastSuccessfulBackupAt) {
      const ageMs = Date.now() - new Date(data.lastSuccessfulBackupAt).getTime();
      return ageMs > data.alertThresholdDays * 86400_000;
    }
    if (!data.nextDueAt) return false;
    const graceCutoff = new Date(data.nextDueAt).getTime() + data.alertThresholdDays * 86400_000;
    return Date.now() > graceCutoff;
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
        <p className="text-xs text-gray-500 mt-2">
          Note: scheduled backups run from the app process, so they may be delayed if the app was asleep or restarting at the scheduled time. The stale-backup banner will warn you if no successful backup has run within your alert window.
        </p>
      </CardHeader>
      <CardContent className="space-y-6">
        {isLoading ? (
          <div className="flex items-center gap-2 text-sm text-gray-500">
            <Loader2 className="w-4 h-4 animate-spin" /> Loading schedule…
          </div>
        ) : (
          <Form {...form}>
            <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-6">
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
              <FormField
                control={form.control}
                name="enabled"
                render={({ field }) => (
                  <FormItem className="flex items-start justify-between gap-4 p-4 rounded-lg border bg-gray-50 space-y-0">
                    <div>
                      <FormLabel htmlFor="bs-enabled" className="text-sm font-semibold cursor-pointer">
                        Enable scheduled backups
                      </FormLabel>
                      <FormDescription className="text-xs text-gray-500 mt-1">
                        When off, no automatic backups run and the stale-backup banner is hidden.
                      </FormDescription>
                    </div>
                    <FormControl>
                      <Switch
                        id="bs-enabled"
                        checked={field.value}
                        onCheckedChange={field.onChange}
                        data-testid="switch-backup-schedule-enabled"
                      />
                    </FormControl>
                  </FormItem>
                )}
              />

              {/* Settings grid — every input below is disabled when the schedule is off */}
              <div className={`grid grid-cols-1 sm:grid-cols-2 gap-4 ${!enabled ? "opacity-60" : ""}`}>
                <FormField
                  control={form.control}
                  name="frequency"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel htmlFor="bs-frequency">Frequency</FormLabel>
                      <Select
                        value={field.value ?? ""}
                        onValueChange={(v) => field.onChange(v as BackupScheduleFormValues["frequency"])}
                        disabled={!enabled}
                      >
                        <FormControl>
                          <SelectTrigger id="bs-frequency" data-testid="select-backup-frequency">
                            <SelectValue placeholder="Pick a frequency" />
                          </SelectTrigger>
                        </FormControl>
                        <SelectContent>
                          <SelectItem value="daily">Daily</SelectItem>
                          <SelectItem value="every_2_days">Every 2 days</SelectItem>
                          <SelectItem value="weekly">Weekly</SelectItem>
                        </SelectContent>
                      </Select>
                      <FormMessage />
                    </FormItem>
                  )}
                />

                <FormField
                  control={form.control}
                  name="timeOfDay"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel htmlFor="bs-time">Time of day (Asia/Dubai)</FormLabel>
                      <FormControl>
                        <Input
                          id="bs-time"
                          type="time"
                          value={field.value ?? ""}
                          onChange={(e) => field.onChange(e.target.value || null)}
                          disabled={!enabled}
                          data-testid="input-backup-time"
                        />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />

                <FormField
                  control={form.control}
                  name="retentionCount"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel htmlFor="bs-retention">Retention (keep N most recent backups)</FormLabel>
                      <FormControl>
                        <Input
                          id="bs-retention"
                          type="number"
                          min={1}
                          max={14}
                          value={Number.isFinite(field.value) ? field.value : ""}
                          onChange={(e) => field.onChange(parseInt(e.target.value, 10))}
                          disabled={!enabled}
                          data-testid="input-backup-retention"
                        />
                      </FormControl>
                      <FormDescription className="text-xs text-gray-500">
                        Range 1–14. Older successful backups are deleted automatically after each run.
                      </FormDescription>
                      <FormMessage />
                    </FormItem>
                  )}
                />

                <FormField
                  control={form.control}
                  name="alertThresholdDays"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel htmlFor="bs-threshold">Warn me if no successful backup in (days)</FormLabel>
                      <FormControl>
                        <Input
                          id="bs-threshold"
                          type="number"
                          min={1}
                          max={14}
                          value={Number.isFinite(field.value) ? field.value : ""}
                          onChange={(e) => field.onChange(parseInt(e.target.value, 10))}
                          disabled={!enabled}
                          data-testid="input-backup-alert-threshold"
                        />
                      </FormControl>
                      <FormDescription className="text-xs text-gray-500">
                        Range 1–14. A red banner appears when the most recent success exceeds this age.
                      </FormDescription>
                      <FormMessage />
                    </FormItem>
                  )}
                />
              </div>

              {/* Save button */}
              <div>
                <Button
                  type="submit"
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
            </form>
          </Form>
        )}

        {/* Status panel */}
        {!isLoading && (
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
        )}
      </CardContent>
    </Card>
  );
}
