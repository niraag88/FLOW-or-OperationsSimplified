import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Database, Play, CheckCircle, XCircle, Loader2, Clock, Download, RotateCcw, Upload, AlertTriangle, History, ShieldAlert, Wrench, FileArchive, Lock } from "lucide-react";
import { Checkbox } from "@/components/ui/checkbox";
import { useToast } from "@/hooks/use-toast";
import { apiRequest } from "@/lib/queryClient";
import { format } from "date-fns";
import { useState, useRef } from "react";
import ScheduledBackupCard from "./ScheduledBackupCard";
import TypedConfirmDialog from "../common/TypedConfirmDialog";
import { RESTORE_PHRASE, FORCE_RECONCILE_PHRASE } from "@shared/destructiveActionPhrases";

function formatBytes(bytes: any) {
  if (!bytes) return "—";
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function formatDate(ts: any) {
  if (!ts) return "Never";
  try { return format(new Date(ts), "dd/MM/yy HH:mm"); } catch { return "—"; }
}

function formatDuration(ms: any) {
  if (!ms) return "—";
  if (ms < 1000) return `${ms}ms`;
  return `${(ms / 1000).toFixed(1)}s`;
}

function StatusBadge({ success }: { success: boolean }) {
  if (success === null || success === undefined) return null;
  return success
    ? <Badge className="bg-emerald-100 text-emerald-800 border-emerald-200"><CheckCircle className="w-3 h-3 mr-1 inline" />OK</Badge>
    : <Badge variant="destructive"><XCircle className="w-3 h-3 mr-1 inline" />Failed</Badge>;
}

// Task #441 — schema reconcile outcome badge for the restore history table.
function ReconcileBadge({ row }: { row: any }) {
  const status = row?.reconcileStatus as string | undefined;
  if (!status || status === 'not_run') {
    return <span className="text-xs text-gray-400">—</span>;
  }
  if (status === 'no_changes') {
    return <Badge variant="outline" className="text-xs">In sync</Badge>;
  }
  if (status === 'success') {
    return (
      <Badge className="bg-emerald-100 text-emerald-800 border-emerald-200 text-xs">
        <Wrench className="w-3 h-3 mr-1 inline" />
        +{row.reconcileStatementsApplied || 0}
      </Badge>
    );
  }
  if (status === 'warnings_applied') {
    return (
      <Badge className="bg-amber-100 text-amber-800 border-amber-300 text-xs" title={row.reconcileWarnings || ''}>
        <AlertTriangle className="w-3 h-3 mr-1 inline" />
        Forced ({row.reconcileStatementsApplied || 0})
      </Badge>
    );
  }
  if (status === 'warnings_skipped') {
    return (
      <Badge className="bg-amber-100 text-amber-900 border-amber-300 text-xs" title={row.reconcileWarnings || ''}>
        <AlertTriangle className="w-3 h-3 mr-1 inline" />
        Skipped {row.reconcileStatementsSkipped || 0}
      </Badge>
    );
  }
  if (status === 'failed') {
    return (
      <Badge variant="destructive" className="text-xs" title={row.reconcileError || ''}>
        <XCircle className="w-3 h-3 mr-1 inline" />
        Failed
      </Badge>
    );
  }
  return <span className="text-xs text-gray-400">{status}</span>;
}

// Informational panel rendered as the `extra` slot of TypedConfirmDialog
// for the emergency-restore flow. Never participates in the disable
// predicate — the typed phrase is the sole safeguard.
interface BackupRunSummary {
  id: number;
  ranAt: string | number | Date;
  dbStorageKey?: string;
  dbFilename?: string;
  dbFileSize?: number;
  success?: boolean;
}

interface RestoreConfirmExtraProps {
  filename: string;
  run?: BackupRunSummary;
  file?: File;
  latestSuccessfulBackup?: BackupRunSummary | null;
  onTakeBackup: () => void;
  backupPending: boolean;
  backupJustTaken: boolean;
  isPending: boolean;
  acceptDataLoss: boolean;
  onAcceptDataLossChange: (v: boolean) => void;
}

function RestoreConfirmExtra({
  filename,
  run,
  file,
  latestSuccessfulBackup,
  onTakeBackup,
  backupPending,
  backupJustTaken,
  isPending,
  acceptDataLoss,
  onAcceptDataLossChange,
}: RestoreConfirmExtraProps) {
  return (
    <div className="space-y-3 text-sm">
      <div className="rounded-lg border border-gray-200 p-3 bg-gray-50 space-y-1">
        <p className="text-xs font-medium text-gray-500 uppercase tracking-wide">Restoring from</p>
        <p className="font-mono text-sm font-medium text-gray-900 break-all">{filename || "—"}</p>
        {run && (
          <p className="text-xs text-gray-500">
            Created: {formatDate(run.ranAt)}
            {run.dbFileSize ? ` · ${formatBytes(run.dbFileSize)}` : ""}
          </p>
        )}
        {file && !run && (
          <p className="text-xs text-gray-500">
            Size: {formatBytes(file.size)}
          </p>
        )}
      </div>

      <div className={`rounded-lg border p-3 space-y-1 ${latestSuccessfulBackup || backupJustTaken ? "border-gray-200 bg-gray-50" : "border-amber-200 bg-amber-50"}`}>
        <p className="text-xs font-medium uppercase tracking-wide text-gray-500">Most recent backup of current system</p>
        {backupJustTaken ? (
          <p className="text-sm font-medium text-emerald-700 flex items-center gap-1">
            <CheckCircle className="w-4 h-4" /> Fresh backup just taken — current state is saved.
          </p>
        ) : latestSuccessfulBackup ? (
          <p className="text-sm text-gray-700">
            {formatDate(latestSuccessfulBackup.ranAt)}
            {latestSuccessfulBackup.dbFilename ? ` · ${latestSuccessfulBackup.dbFilename.split('/').pop()}` : ""}
          </p>
        ) : (
          <p className="text-sm font-medium text-amber-700">No successful backups on record. Take a fresh backup before continuing.</p>
        )}
      </div>

      <div>
        <Button
          type="button"
          variant="outline"
          className="border-emerald-300 text-emerald-700 hover:bg-emerald-50 w-full"
          onClick={onTakeBackup}
          disabled={backupPending || isPending || backupJustTaken}
          data-testid="button-restore-take-backup-first"
        >
          {backupPending ? (
            <><Loader2 className="w-4 h-4 mr-2 animate-spin" />Running Backup…</>
          ) : backupJustTaken ? (
            <><CheckCircle className="w-4 h-4 mr-2" />Backup taken — current state is saved</>
          ) : (
            <><Play className="w-4 h-4 mr-2" />Take Fresh Backup First (Recommended)</>
          )}
        </Button>
        <p className="text-xs text-gray-500 mt-1">Saves the current state before restore. Strongly recommended.</p>
      </div>

      {/* Task #441 — schema reconcile notice + opt-in for data-loss changes */}
      <div className="rounded-lg border border-blue-200 bg-blue-50 p-3 space-y-2">
        <p className="text-xs font-medium uppercase tracking-wide text-blue-900 flex items-center gap-1">
          <Wrench className="w-3 h-3" /> After-restore schema check
        </p>
        <p className="text-xs text-blue-800 leading-relaxed">
          Once the data is restored, the system will automatically add back any columns or tables that have been added since this backup was taken — so you don't need to run any developer commands. Drops or renames are reported, never silently destroyed.
        </p>
        <p className="text-[11px] italic text-blue-700 leading-relaxed">
          Note: this is an <strong>after-the-fact</strong> reconciliation, not a preview. The system does not inspect the backup file's structure before you confirm — actual differences are detected and reported only once the restore has finished.
        </p>
        <label className="flex items-start gap-2 cursor-pointer pt-1">
          <Checkbox
            checked={acceptDataLoss}
            onCheckedChange={(v) => onAcceptDataLossChange(v === true)}
            disabled={isPending}
            data-testid="checkbox-accept-data-loss"
            className="mt-0.5"
          />
          <span className="text-xs text-blue-900">
            <strong>I accept data loss for unsafe changes.</strong> Tick this only if you understand that columns/tables removed since this backup will be dropped from the restored data.
          </span>
        </label>
      </div>
    </div>
  );
}

export default function BackupSettings() {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const fileInputRef = useRef<HTMLInputElement>(null);

  const [downloadingId, setDownloadingId] = useState<number | null>(null);
  // Task #427 — separate spinner state for the file-archive download
  // button so it can run independently of the SQL-dump download.
  const [downloadingFilesId, setDownloadingFilesId] = useState<number | null>(null);
  const [downloadingYear, setDownloadingYear] = useState<number | null>(null);
  const filesInputRef = useRef<HTMLInputElement>(null);
  const [restoreModal, setRestoreModal] = useState<
    | { type: "cloud"; run: BackupRunSummary; filename: string }
    | { type: "upload"; file: File; filename: string }
    | { type: "upload-files"; file: File; filename: string }
    | null
  >(null);
  const [restoredSuccessfully, setRestoredSuccessfully] = useState(false);
  const [backupJustTaken, setBackupJustTaken] = useState(false);
  // Task #441 — opt-in to applying schema changes that drop columns/tables
  const [acceptDataLoss, setAcceptDataLoss] = useState(false);
  // Captured from the most recent restore response so we can render a
  // reconcile summary in the post-restore banner without re-querying.
  const [lastReconcile, setLastReconcile] = useState<any>(null);
  // Task #441 (review fix) — capture the restore_runs row id returned by
  // the restore endpoint so the Force Reconciliation button targets the
  // correct row even before the restore-history query refetch lands.
  const [lastRestoreRunId, setLastRestoreRunId] = useState<number | null>(null);
  // Task #441 — typed-phrase consent dialog state for the force-reconcile
  // path. Independent of the restore confirm dialog so admins must
  // re-type the consent phrase even right after a restore.
  const [forceReconcileTarget, setForceReconcileTarget] = useState<number | null>(null);

  // ── Data Fetching ──────────────────────────────────────────────────────────

  const { data: runsData, isLoading: runsLoading } = useQuery<any>({
    queryKey: ["/api/ops/backup-runs"],
    staleTime: 30 * 1000,
  });

  const { data: restoreRunsData, isLoading: restoreRunsLoading } = useQuery<any>({
    queryKey: ["/api/ops/restore-runs"],
    staleTime: 30 * 1000,
  });

  // Task #427 — sealed year archives. One row per closed accounting year.
  const { data: yearArchivesData, isLoading: yearArchivesLoading } = useQuery<any>({
    queryKey: ["/api/ops/year-archives"],
    staleTime: 60 * 1000,
  });

  // ── Mutations ──────────────────────────────────────────────────────────────

  const runBackup = useMutation({
    mutationFn: async () => {
      const res = await apiRequest("POST", "/api/ops/run-backups");
      return res.json();
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ["/api/ops/backup-runs"] });
      if (data.success) {
        setBackupJustTaken(true);
        toast({ title: "Backup completed", description: "Database dump and file archive saved successfully." });
      } else {
        toast({ title: "Backup partially failed", description: "Check the run history for details.", variant: "destructive" });
      }
    },
    onError: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/ops/backup-runs"] });
      toast({ title: "Backup failed", description: "An error occurred. Check server logs.", variant: "destructive" });
    },
  });

  // Both restore mutations forward the typed phrase to the server.
  const restoreFromCloud = useMutation({
    mutationFn: async ({ runId, confirmation, acceptDataLoss }: { runId: number; confirmation: string; acceptDataLoss: boolean }) => {
      const res = await apiRequest("POST", `/api/ops/backup-runs/${runId}/restore`, { confirmation, acceptDataLoss });
      return res.json();
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ["/api/ops/restore-runs"] });
      setRestoreModal(null);
      if (data.success) {
        setLastReconcile(data.reconcile || null);
        setLastRestoreRunId(typeof data.restoreRunId === 'number' ? data.restoreRunId : null);
        setRestoredSuccessfully(true);
      } else {
        toast({ title: "Emergency restore failed", description: data.error || "An error occurred during restore.", variant: "destructive" });
      }
    },
    onError: async (err: any) => {
      queryClient.invalidateQueries({ queryKey: ["/api/ops/restore-runs"] });
      setRestoreModal(null);
      toast({ title: "Emergency restore failed", description: err.message || "An error occurred during restore.", variant: "destructive" });
    },
  });

  // Task #427 — restore the rolling-file set (logos + open-year scans)
  // from an uploaded .tar.gz archive. Closed-year sealed scans are
  // never touched. Uses the same RESTORE_PHRASE typed confirmation.
  const restoreFilesFromUpload = useMutation({
    mutationFn: async ({ file, confirmation }: { file: File; confirmation: string }) => {
      const formData = new FormData();
      formData.append("confirmation", confirmation);
      formData.append("file", file);
      const res = await fetch("/api/ops/restore-files-upload", {
        method: "POST",
        credentials: "include",
        body: formData,
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || `Server returned ${res.status}`);
      return data;
    },
    onSuccess: (data) => {
      setRestoreModal(null);
      if (data.success) {
        toast({
          title: "Files restored",
          description: `${data.restoredCount ?? 0} file(s) re-uploaded from the archive. Closed-year scans were untouched.`,
        });
      } else {
        toast({
          title: "Files restore failed",
          description: data.error || "An error occurred during file restore.",
          variant: "destructive",
        });
      }
    },
    onError: (err: any) => {
      setRestoreModal(null);
      toast({ title: "Files restore failed", description: err.message || "An error occurred.", variant: "destructive" });
    },
  });

  const restoreFromUpload = useMutation({
    mutationFn: async ({ file, confirmation, acceptDataLoss }: { file: File; confirmation: string; acceptDataLoss: boolean }) => {
      const formData = new FormData();
      // Append the confirmation field BEFORE the file so busboy
      // captures it before the file event fires.
      formData.append("confirmation", confirmation);
      formData.append("acceptDataLoss", acceptDataLoss ? "true" : "false");
      formData.append("file", file);
      const res = await fetch("/api/ops/restore-upload", {
        method: "POST",
        credentials: "include",
        body: formData,
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || `Server returned ${res.status}`);
      return data;
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ["/api/ops/restore-runs"] });
      setRestoreModal(null);
      if (data.success) {
        setLastReconcile(data.reconcile || null);
        setLastRestoreRunId(typeof data.restoreRunId === 'number' ? data.restoreRunId : null);
        setRestoredSuccessfully(true);
      } else {
        toast({ title: "Emergency restore failed", description: data.error || "An error occurred during restore.", variant: "destructive" });
      }
    },
    onError: (err: any) => {
      queryClient.invalidateQueries({ queryKey: ["/api/ops/restore-runs"] });
      setRestoreModal(null);
      toast({ title: "Emergency restore failed", description: err.message || "An error occurred during restore.", variant: "destructive" });
    },
  });

  // Task #441 — re-run schema reconcile against the latest restore_runs row,
  // applying changes even when drizzle-kit reports hasDataLoss. Used after a
  // restore landed in `warnings_skipped` because the admin hadn't ticked
  // "accept data loss" on the original restore.
  const forceReconcile = useMutation({
    // The phrase is sourced from the user-typed value in the
    // TypedConfirmDialog, NOT hardcoded. The server independently
    // verifies it matches FORCE_RECONCILE_PHRASE.
    mutationFn: async ({ runId, confirmation }: { runId: number; confirmation: string }) => {
      const res = await apiRequest("POST", `/api/ops/restore-runs/${runId}/force-reconcile`, {
        confirmation,
      });
      return res.json();
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ["/api/ops/restore-runs"] });
      setForceReconcileTarget(null);
      if (data.success) {
        setLastReconcile(data.reconcile || null);
        toast({ title: "Schema reconciliation complete", description: `Applied ${data.reconcile?.statementsApplied || 0} change(s).` });
      } else {
        toast({ title: "Reconciliation failed", description: data.reconcile?.error || data.error || "Unknown error.", variant: "destructive" });
      }
    },
    onError: (err: any) => {
      setForceReconcileTarget(null);
      toast({ title: "Reconciliation failed", description: err.message || "An error occurred.", variant: "destructive" });
    },
  });

  // ── Handlers ───────────────────────────────────────────────────────────────

  // Generic streaming download helper — used by SQL dump, file archive,
  // and sealed-year archive download buttons. The browser triggers the
  // save dialog via an <a download> click against an object URL.
  const downloadBlob = async (url: string, filename: string) => {
    const res = await fetch(url, { credentials: "include" });
    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      throw new Error(err.error || `Server returned ${res.status}`);
    }
    const blob = await res.blob();
    const objUrl = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = objUrl;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(objUrl);
  };

  const handleDownload = async (run: any) => {
    setDownloadingId(run.id);
    try {
      const filename = run.dbStorageKey?.split("/").pop() || `backup-${run.id}.sql.gz`;
      await downloadBlob(`/api/ops/backup-runs/${run.id}/download`, filename);
    } catch (err: any) {
      toast({ title: "Download failed", description: err.message || "Could not download backup file.", variant: "destructive" });
    } finally {
      setDownloadingId(null);
    }
  };

  // Task #427 — download the file-bytes archive (tar.gz of every scan +
  // logo) attached to a backup run.
  const handleDownloadFiles = async (run: any) => {
    setDownloadingFilesId(run.id);
    try {
      const filename = run.filesStorageKey?.split("/").pop() || `files-${run.id}.tar.gz`;
      await downloadBlob(`/api/ops/backup-runs/${run.id}/download-files`, filename);
    } catch (err: any) {
      toast({ title: "Download failed", description: err.message || "Could not download files archive.", variant: "destructive" });
    } finally {
      setDownloadingFilesId(null);
    }
  };

  // Task #427 — download a sealed year archive (permanent per-year file bundle).
  const handleDownloadYear = async (year: number, filename: string | null) => {
    setDownloadingYear(year);
    try {
      await downloadBlob(`/api/ops/year-archives/${year}/download`, filename || `year-${year}.tar.gz`);
    } catch (err: any) {
      toast({ title: "Download failed", description: err.message || "Could not download year archive.", variant: "destructive" });
    } finally {
      setDownloadingYear(null);
    }
  };

  const handleFilesUploadSelected = (e: any) => {
    const file = e.target.files?.[0];
    if (!file) return;
    e.target.value = "";
    setRestoreModal({ type: "upload-files", file, filename: file.name });
  };

  const handleRestoreClick = (run: any) => {
    setBackupJustTaken(false);
    setAcceptDataLoss(false);
    setRestoreModal({
      type: "cloud",
      run,
      filename: run.dbStorageKey?.split("/").pop() || `backup-${run.id}.sql.gz`,
    });
  };

  const handleFileSelected = (e: any) => {
    const file = e.target.files?.[0];
    if (!file) return;
    e.target.value = "";
    setBackupJustTaken(false);
    setAcceptDataLoss(false);
    setRestoreModal({ type: "upload", file, filename: file.name });
  };

  const handleModalClose = () => {
    setRestoreModal(null);
    setBackupJustTaken(false);
    setAcceptDataLoss(false);
  };

  const handleRestoreConfirm = (typedPhrase: string) => {
    if (restoreModal?.type === "cloud") {
      restoreFromCloud.mutate({ runId: restoreModal.run.id, confirmation: typedPhrase, acceptDataLoss });
    } else if (restoreModal?.type === "upload") {
      restoreFromUpload.mutate({ file: restoreModal.file, confirmation: typedPhrase, acceptDataLoss });
    } else if (restoreModal?.type === "upload-files") {
      restoreFilesFromUpload.mutate({ file: restoreModal.file, confirmation: typedPhrase });
    }
  };

  const isRestoring = restoreFromCloud.isPending || restoreFromUpload.isPending || restoreFilesFromUpload.isPending;
  const yearArchives: any[] = yearArchivesData?.archives || [];

  const allRuns: any[] = runsData?.runs || [];
  const runs = allRuns.slice(0, 10);
  const latestRun = runs[0] || null;
  const latestSuccessfulBackup = allRuns.find((r: any) => r.success === true) || null;
  const restoreHistory = (restoreRunsData?.runs || []).slice(0, 5);

  // ── Render ─────────────────────────────────────────────────────────────────

  return (
    <>
      <ScheduledBackupCard />

      <Card className="border-0 shadow-lg">
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Database className="w-5 h-5" />
            Backup & Recovery
          </CardTitle>
          <CardDescription>
            Manual database backups for routine use. Emergency restore is a last-resort disaster recovery operation — use it only when the current data must be replaced from a backup.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-6">

          {/* Post-restore success banner */}
          {restoredSuccessfully && (() => {
            // Reconcile status drives the colour and copy of the banner.
            const status = lastReconcile?.status as string | undefined;
            const skipped = status === 'warnings_skipped';
            const failed = status === 'failed';
            const banner = skipped
              ? "border-amber-300 bg-amber-50"
              : failed
                ? "border-red-300 bg-red-50"
                : "border-emerald-300 bg-emerald-50";
            const txt = skipped
              ? "text-amber-900"
              : failed
                ? "text-red-900"
                : "text-emerald-800";
            const Icon = skipped || failed ? AlertTriangle : CheckCircle;
            // Prefer the run id captured directly from the restore response
            // (race-free); fall back to the latest history row when reopening
            // settings after a refresh.
            const latestRestoreId =
              lastRestoreRunId ?? (restoreHistory[0]?.id as number | undefined);
            return (
              <Alert className={banner}>
                <Icon className={`w-4 h-4 ${txt}`} />
                <AlertDescription className={`${txt} space-y-2`}>
                  <div>
                    <strong>
                      {skipped
                        ? "Emergency restore completed with schema warnings."
                        : failed
                          ? "Emergency restore completed, but schema reconcile failed."
                          : "Emergency restore completed successfully."}
                    </strong>{" "}
                    The database has been restored from the selected backup.
                  </div>

                  {lastReconcile && status === 'success' && lastReconcile.statementsApplied > 0 && (
                    <div className="text-sm">
                      Schema reconcile added back {lastReconcile.statementsApplied} change(s) introduced after this backup was taken.
                    </div>
                  )}
                  {lastReconcile && status === 'no_changes' && (
                    <div className="text-sm">Backup was already in sync with the running app — no schema reconciliation needed.</div>
                  )}
                  {lastReconcile && status === 'warnings_applied' && (
                    <div className="text-sm">
                      Schema reconcile applied {lastReconcile.statementsApplied} change(s), including some that drop columns/tables (consent given).
                    </div>
                  )}
                  {lastReconcile && skipped && (
                    <div className="text-sm space-y-2">
                      <div>
                        The system did not apply {lastReconcile.statementsSkipped} schema change(s) because they would drop columns or tables. Until reconciled, screens that rely on the new structure may show errors.
                      </div>
                      {Array.isArray(lastReconcile.warnings) && lastReconcile.warnings.length > 0 && (
                        <ul className="list-disc list-inside text-xs space-y-0.5 max-h-40 overflow-auto rounded bg-amber-100/60 p-2">
                          {lastReconcile.warnings.map((w: string, i: number) => <li key={i}>{w}</li>)}
                        </ul>
                      )}
                      {latestRestoreId !== undefined && (
                        <Button
                          size="sm"
                          variant="outline"
                          className="border-amber-400 text-amber-900 hover:bg-amber-100"
                          disabled={forceReconcile.isPending}
                          onClick={() => setForceReconcileTarget(latestRestoreId)}
                          data-testid="button-force-reconcile"
                        >
                          {forceReconcile.isPending ? (
                            <><Loader2 className="w-3 h-3 mr-1 animate-spin" />Forcing reconcile…</>
                          ) : (
                            <><Wrench className="w-3 h-3 mr-1" />Apply changes anyway (accept data loss)</>
                          )}
                        </Button>
                      )}
                    </div>
                  )}
                  {lastReconcile && failed && (
                    <div className="text-sm font-mono break-all">{lastReconcile.error || "Unknown error."}</div>
                  )}

                  <div className="pt-1">
                    Please <button className="underline font-medium" onClick={() => window.location.href = "/login"}>log out and log back in</button> to continue working.
                  </div>
                </AlertDescription>
              </Alert>
            );
          })()}

          {/* Last known backup status */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div className="rounded-lg border p-4 space-y-1">
              <p className="text-xs font-medium text-gray-500 uppercase tracking-wide">Latest DB Backup</p>
              {latestRun ? (
                <>
                  <div className="flex items-center gap-2">
                    <StatusBadge success={latestRun.dbSuccess} />
                    <p className="text-sm font-mono truncate">{latestRun.dbFilename?.split('/').pop() || "—"}</p>
                  </div>
                  <p className="text-xs text-gray-500">{formatDate(latestRun.ranAt)}</p>
                </>
              ) : (
                <p className="text-sm text-gray-400">No backups recorded yet</p>
              )}
            </div>
            <div className="rounded-lg border p-4 space-y-1">
              <p className="text-xs font-medium text-gray-500 uppercase tracking-wide">Latest File Archive</p>
              {latestRun ? (
                <>
                  <div className="flex items-center gap-2">
                    <StatusBadge success={latestRun.filesSuccess} />
                    <p className="text-sm font-mono truncate">{latestRun.filesFilename?.split('/').pop() || "—"}</p>
                  </div>
                  <p className="text-xs text-gray-500">
                    {formatDate(latestRun.ranAt)}
                    {latestRun.filesObjectCount != null ? ` · ${latestRun.filesObjectCount.toLocaleString()} files` : ""}
                    {latestRun.filesSize ? ` · ${formatBytes(latestRun.filesSize)}` : ""}
                  </p>
                </>
              ) : (
                <p className="text-sm text-gray-400">No file archives recorded yet</p>
              )}
            </div>
          </div>

          {/* Action buttons */}
          <div className="flex flex-wrap gap-3 items-start">
            <div>
              <Button
                onClick={() => runBackup.mutate()}
                disabled={runBackup.isPending}
                className="bg-emerald-600 hover:bg-emerald-700"
              >
                {runBackup.isPending ? (
                  <><Loader2 className="w-4 h-4 mr-2 animate-spin" />Running Backup…</>
                ) : (
                  <><Play className="w-4 h-4 mr-2" />Run Backup Now</>
                )}
              </Button>
              <p className="text-xs text-gray-500 mt-1">Creates a full database dump and a real archive of every uploaded scan and logo.</p>
            </div>
            <div>
              <Button
                variant="outline"
                className="border-red-300 text-red-700 hover:bg-red-50"
                onClick={() => fileInputRef.current?.click()}
              >
                <Upload className="w-4 h-4 mr-2" />
                Upload &amp; Emergency Restore (database)
              </Button>
              <p className="text-xs text-gray-500 mt-1">Last-resort: restore the database from a downloaded .sql.gz file.</p>
              <input
                ref={fileInputRef}
                type="file"
                accept=".sql.gz"
                className="hidden"
                onChange={handleFileSelected}
              />
            </div>
            <div>
              <Button
                variant="outline"
                className="border-amber-300 text-amber-800 hover:bg-amber-50"
                onClick={() => filesInputRef.current?.click()}
              >
                <FileArchive className="w-4 h-4 mr-2" />
                Upload &amp; Restore Files
              </Button>
              <p className="text-xs text-gray-500 mt-1">Restore scans &amp; logos from a downloaded files .tar.gz. Closed-year scans are not touched.</p>
              <input
                ref={filesInputRef}
                type="file"
                accept=".tar.gz,.tgz,application/gzip"
                className="hidden"
                onChange={handleFilesUploadSelected}
              />
            </div>
          </div>

          {/* Backup run history */}
          <div>
            <h3 className="text-sm font-semibold text-gray-700 mb-3 flex items-center gap-2">
              <Clock className="w-4 h-4" /> Recent Backup Runs
            </h3>
            {runsLoading ? (
              <div className="flex items-center gap-2 text-sm text-gray-500"><Loader2 className="w-4 h-4 animate-spin" />Loading…</div>
            ) : runs.length === 0 ? (
              <div className="border rounded-lg p-6 text-center text-sm text-gray-400">
                No backup runs recorded yet. Run your first backup above.
              </div>
            ) : (
              <div className="border rounded-lg overflow-hidden">
                <table className="w-full text-sm">
                  <thead className="bg-gray-50 border-b">
                    <tr>
                      <th className="text-left px-3 py-2 text-xs font-medium text-gray-500">Started</th>
                      <th className="text-left px-3 py-2 text-xs font-medium text-gray-500">Status</th>
                      <th className="text-left px-3 py-2 text-xs font-medium text-gray-500 hidden sm:table-cell">DB File</th>
                      <th className="text-left px-3 py-2 text-xs font-medium text-gray-500 hidden sm:table-cell">DB Size</th>
                      <th className="text-left px-3 py-2 text-xs font-medium text-gray-500 hidden sm:table-cell">Files</th>
                      <th className="text-left px-3 py-2 text-xs font-medium text-gray-500">Actions</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y">
                    {runs.map((run: any) => (
                      <tr key={run.id} className="hover:bg-gray-50">
                        <td className="px-3 py-2 whitespace-nowrap text-gray-700">{formatDate(run.ranAt)}</td>
                        <td className="px-3 py-2"><StatusBadge success={run.success} /></td>
                        <td className="px-3 py-2 font-mono text-xs text-gray-500 hidden sm:table-cell truncate max-w-[180px]">
                          {run.dbFilename?.split('/').pop() || "—"}
                        </td>
                        <td className="px-3 py-2 text-gray-500 hidden sm:table-cell">
                          {formatBytes(run.dbFileSize)}
                        </td>
                        <td className="px-3 py-2 text-gray-500 hidden sm:table-cell">
                          {run.filesObjectCount != null ? (
                            <span title={run.filesSize ? formatBytes(run.filesSize) : ""}>
                              {run.filesObjectCount.toLocaleString()}
                              {run.filesSize ? <span className="text-gray-400"> · {formatBytes(run.filesSize)}</span> : null}
                            </span>
                          ) : "—"}
                        </td>
                        <td className="px-3 py-2">
                          <div className="flex flex-wrap items-center gap-1">
                            {run.dbSuccess && run.dbStorageKey && (
                              <Button
                                size="sm"
                                variant="outline"
                                onClick={() => handleDownload(run)}
                                disabled={downloadingId === run.id}
                                className="h-7 px-2 text-xs"
                                title="Download database dump (.sql.gz)"
                                data-testid={`button-download-db-${run.id}`}
                              >
                                {downloadingId === run.id
                                  ? <Loader2 className="w-3 h-3 animate-spin" />
                                  : <><Download className="w-3 h-3 mr-1" />DB</>
                                }
                              </Button>
                            )}
                            {run.filesSuccess && run.filesStorageKey && (
                              <Button
                                size="sm"
                                variant="outline"
                                onClick={() => handleDownloadFiles(run)}
                                disabled={downloadingFilesId === run.id}
                                className="h-7 px-2 text-xs"
                                title="Download files archive (.tar.gz of scans + logos)"
                                data-testid={`button-download-files-${run.id}`}
                              >
                                {downloadingFilesId === run.id
                                  ? <Loader2 className="w-3 h-3 animate-spin" />
                                  : <><FileArchive className="w-3 h-3 mr-1" />Files</>
                                }
                              </Button>
                            )}
                            {run.success && run.dbSuccess && run.dbStorageKey && (
                              <Button
                                size="sm"
                                variant="outline"
                                onClick={() => handleRestoreClick(run)}
                                disabled={isRestoring}
                                className="h-7 px-2 text-xs border-red-300 text-red-700 hover:bg-red-50"
                                title={run.filesStorageKey ? "Restore database AND files from this backup" : "Restore database only (no file archive recorded)"}
                              >
                                <RotateCcw className="w-3 h-3 mr-1" />Restore
                              </Button>
                            )}
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
            {runs.length > 0 && (
              <p className="text-xs text-gray-400 mt-1">Showing last {runs.length} backup run{runs.length !== 1 ? "s" : ""}.</p>
            )}
          </div>

          {/* Task #427 — sealed year archives (permanent per-year file bundles).
              One row per closed accounting year. Re-closing a reopened year
              overwrites the row + the storage object. Catalog lives in
              ops.year_archives so it survives database restores. */}
          <div>
            <h3 className="text-sm font-semibold text-gray-700 mb-3 flex items-center gap-2">
              <Lock className="w-4 h-4" /> Sealed Year Archives
            </h3>
            <p className="text-xs text-gray-500 mb-2">
              When you close an accounting year, every scan from that year is bundled into a permanent archive that the rolling 7-day backup never touches.
            </p>
            {yearArchivesLoading ? (
              <div className="flex items-center gap-2 text-sm text-gray-500"><Loader2 className="w-4 h-4 animate-spin" />Loading…</div>
            ) : yearArchives.length === 0 ? (
              <div className="border rounded-lg p-4 text-center text-sm text-gray-400">
                No years have been sealed yet. Close a financial year in the Books page to create one.
              </div>
            ) : (
              <div className="border rounded-lg overflow-hidden">
                <table className="w-full text-sm">
                  <thead className="bg-gray-50 border-b">
                    <tr>
                      <th className="text-left px-3 py-2 text-xs font-medium text-gray-500">Year</th>
                      <th className="text-left px-3 py-2 text-xs font-medium text-gray-500">Status</th>
                      <th className="text-left px-3 py-2 text-xs font-medium text-gray-500 hidden sm:table-cell">Sealed</th>
                      <th className="text-left px-3 py-2 text-xs font-medium text-gray-500 hidden sm:table-cell">Files</th>
                      <th className="text-left px-3 py-2 text-xs font-medium text-gray-500 hidden sm:table-cell">By</th>
                      <th className="text-left px-3 py-2 text-xs font-medium text-gray-500">Actions</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y">
                    {yearArchives.map((row: any) => (
                      <tr key={row.year} className="hover:bg-gray-50">
                        <td className="px-3 py-2 font-medium text-gray-700">{row.year}</td>
                        <td className="px-3 py-2"><StatusBadge success={row.success} /></td>
                        <td className="px-3 py-2 text-gray-500 hidden sm:table-cell">{formatDate(row.sealedAt)}</td>
                        <td className="px-3 py-2 text-gray-500 hidden sm:table-cell">
                          {row.objectCount != null ? row.objectCount.toLocaleString() : "—"}
                          {row.fileSize ? <span className="text-gray-400"> · {formatBytes(row.fileSize)}</span> : null}
                        </td>
                        <td className="px-3 py-2 text-gray-500 hidden sm:table-cell">{row.sealedByName || "—"}</td>
                        <td className="px-3 py-2">
                          {row.success && row.storageKey ? (
                            <Button
                              size="sm"
                              variant="outline"
                              onClick={() => handleDownloadYear(row.year, row.filename)}
                              disabled={downloadingYear === row.year}
                              className="h-7 px-2 text-xs"
                              data-testid={`button-download-year-${row.year}`}
                            >
                              {downloadingYear === row.year
                                ? <Loader2 className="w-3 h-3 animate-spin" />
                                : <><Download className="w-3 h-3 mr-1" />Download</>
                              }
                            </Button>
                          ) : (
                            <span className="text-xs text-red-600" title={row.errorMessage || ""}>{row.errorMessage ? "Seal failed" : "—"}</span>
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>

          {/* Restore history */}
          <div>
            <h3 className="text-sm font-semibold text-gray-700 mb-3 flex items-center gap-2">
              <History className="w-4 h-4" /> Recent Emergency Restore History
            </h3>
            {restoreRunsLoading ? (
              <div className="flex items-center gap-2 text-sm text-gray-500"><Loader2 className="w-4 h-4 animate-spin" />Loading…</div>
            ) : restoreHistory.length === 0 ? (
              <div className="border rounded-lg p-4 text-center text-sm text-gray-400">
                No emergency restores have been performed yet.
              </div>
            ) : (
              <div className="border rounded-lg overflow-hidden">
                <table className="w-full text-sm">
                  <thead className="bg-gray-50 border-b">
                    <tr>
                      <th className="text-left px-3 py-2 text-xs font-medium text-gray-500">When</th>
                      <th className="text-left px-3 py-2 text-xs font-medium text-gray-500">Status</th>
                      <th className="text-left px-3 py-2 text-xs font-medium text-gray-500">Schema</th>
                      <th className="text-left px-3 py-2 text-xs font-medium text-gray-500 hidden sm:table-cell">Source File</th>
                      <th className="text-left px-3 py-2 text-xs font-medium text-gray-500 hidden sm:table-cell">By</th>
                      <th className="text-left px-3 py-2 text-xs font-medium text-gray-500 hidden sm:table-cell">Duration</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y">
                    {restoreHistory.map((r: any) => (
                      <tr key={r.id} className="hover:bg-gray-50">
                        <td className="px-3 py-2 whitespace-nowrap text-gray-700">{formatDate(r.restoredAt)}</td>
                        <td className="px-3 py-2"><StatusBadge success={r.success} /></td>
                        <td className="px-3 py-2"><ReconcileBadge row={r} /></td>
                        <td className="px-3 py-2 font-mono text-xs text-gray-500 hidden sm:table-cell truncate max-w-[200px]">
                          {r.sourceFilename || r.backupDbFilename?.split('/').pop() || (r.sourceBackupRunId ? `Backup run #${r.sourceBackupRunId}` : "—")}
                        </td>
                        <td className="px-3 py-2 text-gray-500 hidden sm:table-cell">{r.triggeredByName || "—"}</td>
                        <td className="px-3 py-2 text-gray-500 hidden sm:table-cell">{formatDuration(r.durationMs)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>

        </CardContent>
      </Card>

      {/*
        Emergency-restore typed-phrase dialog (Task #337). Replaces the
        former bespoke RestoreConfirmModal. The destructive button only
        enables once the admin types RESTORE_PHRASE; the warning panel,
        backup-status panel, and "Take Fresh Backup First" button are
        passed through `extra` and never participate in the disable
        predicate.
      */}
      <TypedConfirmDialog
        open={!!restoreModal}
        onClose={handleModalClose}
        onConfirm={handleRestoreConfirm}
        title={restoreModal?.type === "upload-files" ? "Restore Files from Archive" : "Emergency Restore — Disaster Recovery"}
        description={
          restoreModal?.type === "upload-files" ? (
            <div className="rounded-lg bg-amber-50 border border-amber-200 p-3 text-amber-900 space-y-1">
              <p className="font-semibold flex items-center gap-2">
                <FileArchive className="w-4 h-4" />
                This will replace every uploaded scan and logo in storage.
              </p>
              <ul className="list-disc list-inside space-y-0.5 text-amber-800 mt-1 text-xs">
                <li>All current scans for the open year(s) and all logos will be replaced by the archive's contents</li>
                <li>Closed-year scans (sealed in their own permanent archives) are NOT touched</li>
                <li>The current files are snapshotted before the restore so a failure can be rolled back automatically</li>
                <li>This action cannot be undone once the restore completes successfully</li>
              </ul>
            </div>
          ) : (
            <div className="rounded-lg bg-red-50 border border-red-200 p-3 text-red-800 space-y-1">
              <p className="font-semibold flex items-center gap-2">
                <ShieldAlert className="w-4 h-4" />
                This is a last-resort disaster recovery operation.
              </p>
              <ul className="list-disc list-inside space-y-0.5 text-red-700 mt-1 text-xs">
                <li>All current live data will be permanently replaced</li>
                <li>Every invoice, product, customer, PO, DO, user and setting will be overwritten</li>
                <li>All active users will be logged out and must log in again</li>
                <li>This action cannot be undone</li>
                <li>Only proceed if you are performing disaster recovery</li>
              </ul>
            </div>
          )
        }
        extra={
          restoreModal && restoreModal.type !== "upload-files" ? (
            <RestoreConfirmExtra
              filename={restoreModal.filename}
              run={restoreModal.type === "cloud" ? restoreModal.run : undefined}
              file={restoreModal.type === "upload" ? restoreModal.file : undefined}
              latestSuccessfulBackup={latestSuccessfulBackup}
              onTakeBackup={() => runBackup.mutate()}
              backupPending={runBackup.isPending}
              backupJustTaken={backupJustTaken}
              isPending={isRestoring}
              acceptDataLoss={acceptDataLoss}
              onAcceptDataLossChange={setAcceptDataLoss}
            />
          ) : null
        }
        phrase={RESTORE_PHRASE}
        confirmLabel="Emergency Restore"
        isPending={isRestoring}
        inputTestId="input-emergency-restore-confirm"
        confirmTestId="button-emergency-restore-confirm"
      />

      {/*
        Task #441 — typed-phrase consent dialog for forcing schema reconcile
        with data-loss changes (drops/renames). Distinct from the restore
        confirm dialog so the admin must re-type FORCE_RECONCILE_PHRASE
        even when the previous restore just landed in 'warnings_skipped'.
      */}
      <TypedConfirmDialog
        open={forceReconcileTarget !== null}
        onClose={() => setForceReconcileTarget(null)}
        onConfirm={(typed) => {
          if (forceReconcileTarget !== null) {
            forceReconcile.mutate({ runId: forceReconcileTarget, confirmation: typed });
          }
        }}
        title="Force Schema Reconciliation — Accept Data Loss"
        description={
          <div className="rounded-lg bg-amber-50 border border-amber-200 p-3 text-amber-900 space-y-1">
            <p className="font-semibold flex items-center gap-2">
              <AlertTriangle className="w-4 h-4" />
              Apply schema changes that drop columns or tables.
            </p>
            <ul className="list-disc list-inside space-y-0.5 text-amber-800 mt-1 text-xs">
              <li>The previous restore left some schema changes unapplied because they would delete data.</li>
              <li>Forcing the reconcile now will drop those columns/tables from the restored database.</li>
              <li>Data inside those columns/tables will be permanently lost.</li>
              <li>Take a fresh backup first if you might still need that data.</li>
            </ul>
          </div>
        }
        phrase={FORCE_RECONCILE_PHRASE}
        confirmLabel="Force Reconciliation"
        isPending={forceReconcile.isPending}
        inputTestId="input-force-reconcile-confirm"
        confirmTestId="button-force-reconcile-confirm"
      />
    </>
  );
}
