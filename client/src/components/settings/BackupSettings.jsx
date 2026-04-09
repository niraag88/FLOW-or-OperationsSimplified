import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from "@/components/ui/dialog";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Database, Play, CheckCircle, XCircle, Loader2, Clock, Download, RotateCcw, Upload, AlertTriangle, History } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { apiRequest } from "@/lib/queryClient";
import { format } from "date-fns";
import { useState, useRef } from "react";

function formatBytes(bytes) {
  if (!bytes) return "—";
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function formatDate(ts) {
  if (!ts) return "Never";
  try { return format(new Date(ts), "dd/MM/yy HH:mm"); } catch { return "—"; }
}

function formatDuration(ms) {
  if (!ms) return "—";
  if (ms < 1000) return `${ms}ms`;
  return `${(ms / 1000).toFixed(1)}s`;
}

function StatusBadge({ success }) {
  if (success === null || success === undefined) return null;
  return success
    ? <Badge className="bg-emerald-100 text-emerald-800 border-emerald-200"><CheckCircle className="w-3 h-3 mr-1 inline" />OK</Badge>
    : <Badge variant="destructive"><XCircle className="w-3 h-3 mr-1 inline" />Failed</Badge>;
}

/**
 * Confirmation modal for destructive restore actions.
 * Requires the user to type "RESTORE" before the confirm button activates.
 */
function RestoreConfirmModal({ open, onClose, onConfirm, filename, isPending }) {
  const [typed, setTyped] = useState("");

  const handleClose = () => {
    setTyped("");
    onClose();
  };

  const handleConfirm = () => {
    if (typed !== "RESTORE") return;
    onConfirm();
  };

  return (
    <Dialog open={open} onOpenChange={(v) => { if (!v) handleClose(); }}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 text-red-700">
            <AlertTriangle className="w-5 h-5" />
            Confirm Database Restore
          </DialogTitle>
          <DialogDescription asChild>
            <div className="space-y-3 text-sm">
              <div className="rounded-lg bg-red-50 border border-red-200 p-3 text-red-800">
                <strong>This will permanently replace all current data.</strong>
                <p className="mt-1">Every record in the database — invoices, products, customers, purchase orders, delivery orders, users, settings — will be overwritten with the contents of the selected backup. This cannot be undone.</p>
              </div>
              {filename && (
                <p className="text-gray-600">
                  Restoring from: <span className="font-mono font-medium text-gray-900">{filename}</span>
                </p>
              )}
              <p className="text-gray-600">
                After restore completes you will be logged out automatically and need to log back in.
              </p>
              <div>
                <p className="text-gray-700 font-medium mb-1">Type <span className="font-mono text-red-700">RESTORE</span> to confirm:</p>
                <Input
                  value={typed}
                  onChange={(e) => setTyped(e.target.value)}
                  placeholder="RESTORE"
                  className="font-mono"
                  disabled={isPending}
                />
              </div>
            </div>
          </DialogDescription>
        </DialogHeader>
        <DialogFooter className="gap-2">
          <Button variant="outline" onClick={handleClose} disabled={isPending}>
            Cancel
          </Button>
          <Button
            variant="destructive"
            disabled={typed !== "RESTORE" || isPending}
            onClick={handleConfirm}
          >
            {isPending ? <><Loader2 className="w-4 h-4 mr-2 animate-spin" />Restoring…</> : "Restore Database"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

export default function BackupSettings() {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const fileInputRef = useRef(null);

  const [downloadingId, setDownloadingId] = useState(null);
  const [restoreModal, setRestoreModal] = useState(null); // { type: 'cloud'|'upload', run?, file? }
  const [restoredSuccessfully, setRestoredSuccessfully] = useState(false);

  // ── Data Fetching ──────────────────────────────────────────────────────────

  const { data: runsData, isLoading: runsLoading } = useQuery({
    queryKey: ["/api/ops/backup-runs"],
    staleTime: 30 * 1000,
  });

  const { data: restoreRunsData, isLoading: restoreRunsLoading } = useQuery({
    queryKey: ["/api/ops/restore-runs"],
    staleTime: 30 * 1000,
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
        toast({ title: "Backup completed", description: "DB dump and object manifest saved successfully." });
      } else {
        toast({ title: "Backup partially failed", description: "Check the run history for details.", variant: "destructive" });
      }
    },
    onError: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/ops/backup-runs"] });
      toast({ title: "Backup failed", description: "An error occurred. Check server logs.", variant: "destructive" });
    },
  });

  const restoreFromCloud = useMutation({
    mutationFn: async (runId) => {
      const res = await apiRequest("POST", `/api/ops/backup-runs/${runId}/restore`);
      return res.json();
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ["/api/ops/restore-runs"] });
      setRestoreModal(null);
      if (data.success) {
        setRestoredSuccessfully(true);
      } else {
        toast({ title: "Restore failed", description: data.error || "An error occurred during restore.", variant: "destructive" });
      }
    },
    onError: async (err) => {
      queryClient.invalidateQueries({ queryKey: ["/api/ops/restore-runs"] });
      setRestoreModal(null);
      toast({ title: "Restore failed", description: err.message || "An error occurred during restore.", variant: "destructive" });
    },
  });

  const restoreFromUpload = useMutation({
    mutationFn: async (file) => {
      const formData = new FormData();
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
        setRestoredSuccessfully(true);
      } else {
        toast({ title: "Restore failed", description: data.error || "An error occurred during restore.", variant: "destructive" });
      }
    },
    onError: (err) => {
      queryClient.invalidateQueries({ queryKey: ["/api/ops/restore-runs"] });
      setRestoreModal(null);
      toast({ title: "Restore failed", description: err.message || "An error occurred during restore.", variant: "destructive" });
    },
  });

  // ── Handlers ───────────────────────────────────────────────────────────────

  const handleDownload = async (run) => {
    setDownloadingId(run.id);
    try {
      const res = await fetch(`/api/ops/backup-runs/${run.id}/download`, { credentials: "include" });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.error || `Server returned ${res.status}`);
      }
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      const filename = run.dbStorageKey?.split("/").pop() || `backup-${run.id}.sql.gz`;
      a.href = url;
      a.download = filename;
      document.body.appendChild(a);
      a.click();
      a.remove();
      URL.revokeObjectURL(url);
    } catch (err) {
      toast({ title: "Download failed", description: err.message || "Could not download backup file.", variant: "destructive" });
    } finally {
      setDownloadingId(null);
    }
  };

  const handleRestoreClick = (run) => {
    setRestoreModal({
      type: "cloud",
      run,
      filename: run.dbStorageKey?.split("/").pop() || `backup-${run.id}.sql.gz`,
    });
  };

  const handleFileSelected = (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    e.target.value = "";
    setRestoreModal({ type: "upload", file, filename: file.name });
  };

  const handleRestoreConfirm = () => {
    if (restoreModal?.type === "cloud") {
      restoreFromCloud.mutate(restoreModal.run.id);
    } else if (restoreModal?.type === "upload") {
      restoreFromUpload.mutate(restoreModal.file);
    }
  };

  const isRestoring = restoreFromCloud.isPending || restoreFromUpload.isPending;

  const runs = (runsData?.runs || []).slice(0, 10);
  const latestRun = runs[0] || null;
  const restoreHistory = (restoreRunsData?.runs || []).slice(0, 5);

  // ── Render ─────────────────────────────────────────────────────────────────

  return (
    <>
      <Card className="border-0 shadow-lg">
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Database className="w-5 h-5" />
            Backup & Recovery
          </CardTitle>
          <CardDescription>
            Manual database backups and full restore capability. Run a backup, download it offline, or restore the system from any saved backup.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-6">

          {/* Post-restore success banner */}
          {restoredSuccessfully && (
            <Alert className="border-emerald-300 bg-emerald-50">
              <CheckCircle className="w-4 h-4 text-emerald-700" />
              <AlertDescription className="text-emerald-800">
                <strong>Restore completed successfully.</strong> The database has been restored to the selected backup.
                Please <button className="underline font-medium" onClick={() => window.location.href = "/login"}>log out and log back in</button> to continue working.
              </AlertDescription>
            </Alert>
          )}

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
              <p className="text-xs font-medium text-gray-500 uppercase tracking-wide">Latest Object Manifest</p>
              {latestRun ? (
                <>
                  <div className="flex items-center gap-2">
                    <StatusBadge success={latestRun.manifestSuccess} />
                    <p className="text-sm font-mono truncate">{latestRun.manifestFilename?.split('/').pop() || "—"}</p>
                  </div>
                  <p className="text-xs text-gray-500">
                    {formatDate(latestRun.ranAt)}
                    {latestRun.manifestTotalObjects != null ? ` · ${latestRun.manifestTotalObjects.toLocaleString()} objects` : ""}
                    {latestRun.manifestTotalSizeBytes ? ` · ${formatBytes(latestRun.manifestTotalSizeBytes)}` : ""}
                  </p>
                </>
              ) : (
                <p className="text-sm text-gray-400">No manifests recorded yet</p>
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
              <p className="text-xs text-gray-500 mt-1">Creates a full PostgreSQL dump + object manifest.</p>
            </div>
            <div>
              <Button
                variant="outline"
                className="border-red-300 text-red-700 hover:bg-red-50"
                onClick={() => fileInputRef.current?.click()}
              >
                <Upload className="w-4 h-4 mr-2" />
                Upload & Restore
              </Button>
              <p className="text-xs text-gray-500 mt-1">Restore from a downloaded .sql.gz file.</p>
              <input
                ref={fileInputRef}
                type="file"
                accept=".sql.gz,.gz"
                className="hidden"
                onChange={handleFileSelected}
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
                      <th className="text-left px-3 py-2 text-xs font-medium text-gray-500 hidden sm:table-cell">Objects</th>
                      <th className="text-left px-3 py-2 text-xs font-medium text-gray-500">Actions</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y">
                    {runs.map((run) => (
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
                          {run.manifestTotalObjects != null ? run.manifestTotalObjects.toLocaleString() : "—"}
                        </td>
                        <td className="px-3 py-2">
                          {run.dbSuccess && run.dbStorageKey ? (
                            <div className="flex items-center gap-1">
                              <Button
                                size="sm"
                                variant="outline"
                                onClick={() => handleDownload(run)}
                                disabled={downloadingId === run.id}
                                className="h-7 px-2 text-xs"
                              >
                                {downloadingId === run.id
                                  ? <Loader2 className="w-3 h-3 animate-spin" />
                                  : <><Download className="w-3 h-3 mr-1" />Download</>
                                }
                              </Button>
                              {run.success && (
                                <Button
                                  size="sm"
                                  variant="outline"
                                  onClick={() => handleRestoreClick(run)}
                                  disabled={isRestoring}
                                  className="h-7 px-2 text-xs border-red-300 text-red-700 hover:bg-red-50"
                                >
                                  <RotateCcw className="w-3 h-3 mr-1" />Restore
                                </Button>
                              )}
                            </div>
                          ) : null}
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

          {/* Restore history */}
          <div>
            <h3 className="text-sm font-semibold text-gray-700 mb-3 flex items-center gap-2">
              <History className="w-4 h-4" /> Recent Restore History
            </h3>
            {restoreRunsLoading ? (
              <div className="flex items-center gap-2 text-sm text-gray-500"><Loader2 className="w-4 h-4 animate-spin" />Loading…</div>
            ) : restoreHistory.length === 0 ? (
              <div className="border rounded-lg p-4 text-center text-sm text-gray-400">
                No restores have been performed yet.
              </div>
            ) : (
              <div className="border rounded-lg overflow-hidden">
                <table className="w-full text-sm">
                  <thead className="bg-gray-50 border-b">
                    <tr>
                      <th className="text-left px-3 py-2 text-xs font-medium text-gray-500">When</th>
                      <th className="text-left px-3 py-2 text-xs font-medium text-gray-500">Status</th>
                      <th className="text-left px-3 py-2 text-xs font-medium text-gray-500 hidden sm:table-cell">Source File</th>
                      <th className="text-left px-3 py-2 text-xs font-medium text-gray-500 hidden sm:table-cell">By</th>
                      <th className="text-left px-3 py-2 text-xs font-medium text-gray-500 hidden sm:table-cell">Duration</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y">
                    {restoreHistory.map((r) => (
                      <tr key={r.id} className="hover:bg-gray-50">
                        <td className="px-3 py-2 whitespace-nowrap text-gray-700">{formatDate(r.restoredAt)}</td>
                        <td className="px-3 py-2"><StatusBadge success={r.success} /></td>
                        <td className="px-3 py-2 font-mono text-xs text-gray-500 hidden sm:table-cell truncate max-w-[200px]">
                          {r.sourceFilename || r.backupDbFilename?.split('/').pop() || (r.sourceBackupRunId ? `Backup run #${r.sourceBackupRunId}` : "—")}
                        </td>
                        <td className="px-3 py-2 text-gray-500 hidden sm:table-cell">{r.username || "—"}</td>
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

      {/* Restore confirmation modal */}
      <RestoreConfirmModal
        open={!!restoreModal}
        onClose={() => setRestoreModal(null)}
        onConfirm={handleRestoreConfirm}
        filename={restoreModal?.filename}
        isPending={isRestoring}
      />
    </>
  );
}
