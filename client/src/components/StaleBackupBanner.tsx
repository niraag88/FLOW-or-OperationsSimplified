import { useQuery } from "@tanstack/react-query";
import { useState } from "react";
import { Link } from "react-router-dom";
import { AlertTriangle, X } from "lucide-react";
import { useAuth } from "@/hooks/useAuth";

interface ScheduleResponse {
  enabled: boolean;
  alertThresholdDays: number;
  lastSuccessfulBackupAt: string | null;
  nextDueAt: string | null;
}

const DISMISSED_KEY = "stale_backup_banner_dismissed";

export default function StaleBackupBanner() {
  const { user } = useAuth();
  const isAdmin = user?.role === "Admin";

  const [dismissed, setDismissed] = useState<boolean>(() => {
    try {
      return sessionStorage.getItem(DISMISSED_KEY) === "1";
    } catch {
      return false;
    }
  });

  const { data } = useQuery<ScheduleResponse>({
    queryKey: ["/api/ops/backup-schedule"],
    enabled: isAdmin,
    staleTime: 5 * 60 * 1000,
    refetchInterval: 5 * 60 * 1000,
  });

  if (!isAdmin || !data || dismissed) return null;
  if (!data.enabled) return null;

  const thresholdMs = data.alertThresholdDays * 86400_000;

  // Fresh-install / just-enabled grace period: if no backup has run yet,
  // only warn once we are past the first scheduled window plus the
  // alert threshold. Otherwise the banner would appear the moment an
  // admin enables the schedule, which is a false positive.
  if (!data.lastSuccessfulBackupAt) {
    if (!data.nextDueAt) return null;
    const overdueMs = Date.now() - new Date(data.nextDueAt).getTime();
    if (overdueMs <= thresholdMs) return null;
  } else {
    const ageMs = Date.now() - new Date(data.lastSuccessfulBackupAt).getTime();
    if (ageMs <= thresholdMs) return null;
  }

  const thresholdDays = data.alertThresholdDays;

  const handleDismiss = () => {
    setDismissed(true);
    try {
      sessionStorage.setItem(DISMISSED_KEY, "1");
    } catch {}
  };

  return (
    <div
      className="bg-red-600 text-white px-4 py-2 flex items-center gap-3 text-sm shadow-md"
      data-testid="banner-stale-backup"
    >
      <AlertTriangle className="w-4 h-4 flex-shrink-0" />
      <p className="flex-1">
        <strong>No successful backup in {thresholdDays} day{thresholdDays !== 1 ? "s" : ""}.</strong>{" "}
        <Link to="/settings" className="underline hover:no-underline font-medium">
          Open Settings → Backup to check the backup schedule
        </Link>
        .
      </p>
      <button
        type="button"
        onClick={handleDismiss}
        className="hover:bg-red-700 rounded p-1 flex-shrink-0"
        aria-label="Dismiss"
        data-testid="button-dismiss-stale-backup"
      >
        <X className="w-4 h-4" />
      </button>
    </div>
  );
}
