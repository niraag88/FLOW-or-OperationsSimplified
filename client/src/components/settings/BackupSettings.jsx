import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Database, Play, CheckCircle, XCircle, Loader2, Clock } from "lucide-react";
import { useToast } from "@/components/ui/use-toast";
import { apiRequest } from "@/lib/queryClient";
import { format } from "date-fns";

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

function StatusBadge({ success }) {
  if (success === null || success === undefined) return null;
  return success
    ? <Badge className="bg-emerald-100 text-emerald-800 border-emerald-200"><CheckCircle className="w-3 h-3 mr-1 inline" />OK</Badge>
    : <Badge variant="destructive"><XCircle className="w-3 h-3 mr-1 inline" />Failed</Badge>;
}

export default function BackupSettings() {
  const { toast } = useToast();
  const queryClient = useQueryClient();

  const { data: runsData, isLoading: runsLoading } = useQuery({
    queryKey: ["/api/ops/backup-runs"],
    staleTime: 30 * 1000,
  });

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

  const runs = (runsData?.runs || []).slice(0, 10);
  const latestRun = runs[0] || null;

  return (
    <Card className="border-0 shadow-lg">
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Database className="w-5 h-5" />
          Backup & Recovery
        </CardTitle>
        <CardDescription>
          Manual database and object storage backups. Run a backup now or review the last 10 run records.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-6">

        {/* Last known backup status — sourced from backup_runs table */}
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

        {/* Run backup button */}
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
          <p className="text-xs text-gray-500 mt-2">
            Runs a full PostgreSQL dump + object storage manifest and uploads both to secure storage.
          </p>
        </div>

        {/* Run history */}
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

      </CardContent>
    </Card>
  );
}
