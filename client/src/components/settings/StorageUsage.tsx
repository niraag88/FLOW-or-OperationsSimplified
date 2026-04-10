import React, { useState, useEffect, useCallback } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Separator } from '@/components/ui/separator';
import { 
  HardDrive, 
  Database, 
  Folder, 
  RefreshCw, 
  AlertTriangle,
  CheckCircle,
  Settings as SettingsIcon,
} from 'lucide-react';
import { useToast } from '@/hooks/use-toast';

const QUOTA_BYTES = 10 * 1024 * 1024 * 1024; // 10 GiB

function formatBytes(bytes) {
  if (bytes == null || isNaN(bytes)) return '—';
  if (bytes >= 1024 * 1024 * 1024) return `${(bytes / (1024 * 1024 * 1024)).toFixed(2)} GB`;
  if (bytes >= 1024 * 1024) return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  if (bytes >= 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${bytes} B`;
}

export default function StorageUsageComponent() {
  const [dbBytes, setDbBytes] = useState<any>(null);
  const [objectBytes, setObjectBytes] = useState<any>(null);
  const [warnAt, setWarnAt] = useState(80);
  const [criticalAt, setCriticalAt] = useState(90);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [savingSettings, setSavingSettings] = useState(false);
  const { toast } = useToast();

  const loadData = useCallback(async () => {
    try {
      const [dbRes, objRes, settingsRes] = await Promise.all([
        fetch('/api/db/size', { credentials: 'include' }),
        fetch('/api/storage/total-size', { credentials: 'include' }),
        fetch('/api/company-settings', { credentials: 'include' }),
      ]);

      if (dbRes.ok) {
        const d = await dbRes.json();
        setDbBytes(d.bytes ?? null);
      }
      if (objRes.ok) {
        const d = await objRes.json();
        setObjectBytes(d.bytes ?? null);
      }
      if (settingsRes.ok) {
        const s = await settingsRes.json();
        if (s.warnAtPercent != null) setWarnAt(s.warnAtPercent);
        if (s.criticalAtPercent != null) setCriticalAt(s.criticalAtPercent);
      }
    } catch (err: any) {
      console.error('Error loading storage data:', err);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useEffect(() => {
    loadData();
  }, [loadData]);

  const handleRefresh = async () => {
    setRefreshing(true);
    await loadData();
    toast({ title: 'Storage data refreshed', description: 'Fetched latest sizes from the database.' });
  };

  const handleSaveSettings = async () => {
    setSavingSettings(true);
    try {
      const res = await fetch('/api/company-settings', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ warnAtPercent: warnAt, criticalAtPercent: criticalAt }),
      });
      if (!res.ok) throw new Error('Failed to save');
      toast({ title: 'Settings saved', description: 'Quota thresholds updated.' });
    } catch (err: any) {
      console.error('Error saving storage settings:', err);
      toast({ title: 'Save failed', description: 'Could not update quota settings.', variant: 'destructive' });
    } finally {
      setSavingSettings(false);
    }
  };

  const totalBytes = (dbBytes ?? 0) + (objectBytes ?? 0);
  const usagePercent = QUOTA_BYTES > 0 ? Math.min(100, (totalBytes / QUOTA_BYTES) * 100) : 0;

  const quotaStatus = usagePercent >= criticalAt
    ? 'critical'
    : usagePercent >= warnAt
    ? 'warning'
    : 'normal';

  const statusColor = {
    normal: 'text-green-600 bg-green-50',
    warning: 'text-amber-600 bg-amber-50',
    critical: 'text-red-600 bg-red-50',
  }[quotaStatus];

  if (loading) {
    return (
      <div className="space-y-6">
        <div className="animate-pulse">
          <div className="h-8 bg-gray-200 rounded w-1/4 mb-6" />
          <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
            {[...Array(3)].map((_, i) => (
              <div key={i} className="h-32 bg-gray-200 rounded" />
            ))}
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex justify-between items-center">
        <div>
          <h3 className="text-lg font-semibold flex items-center gap-2">
            <HardDrive className="w-5 h-5" />
            Storage Usage
          </h3>
          <p className="text-sm text-gray-600">Monitor database and file storage utilisation</p>
        </div>
        <Button onClick={handleRefresh} disabled={refreshing} variant="outline">
          <RefreshCw className={`w-4 h-4 mr-2 ${refreshing ? 'animate-spin' : ''}`} />
          {refreshing ? 'Refreshing...' : 'Refresh'}
        </Button>
      </div>

      {/* Status Alert */}
      {quotaStatus !== 'normal' && (
        <Alert className={statusColor}>
          <AlertTriangle className="h-4 w-4" />
          <AlertTitle>Storage {quotaStatus === 'warning' ? 'Warning' : 'Critical'}</AlertTitle>
          <AlertDescription>
            You are using {usagePercent.toFixed(1)}% of your database quota ({formatBytes(totalBytes)} of {formatBytes(QUOTA_BYTES)}).
            {quotaStatus === 'critical' ? ' Immediate action required.' : ' Consider cleaning up old data.'}
          </AlertDescription>
        </Alert>
      )}

      {/* Usage progress bar */}
      <Card>
        <CardHeader>
          <CardTitle className="text-sm font-medium flex items-center gap-2">
            <HardDrive className="w-4 h-4" />
            Overall Usage — {usagePercent.toFixed(1)}% of 10 GiB quota
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="w-full bg-gray-200 rounded-full h-4 overflow-hidden">
            <div
              className={`h-4 rounded-full transition-all ${quotaStatus === 'critical' ? 'bg-red-500' : quotaStatus === 'warning' ? 'bg-amber-500' : 'bg-emerald-500'}`}
              style={{ width: `${Math.max(1, usagePercent)}%` }}
            />
          </div>
          <div className="flex justify-between text-xs text-gray-500 mt-1">
            <span>{formatBytes(totalBytes)} used</span>
            <span>{formatBytes(QUOTA_BYTES)} limit</span>
          </div>
        </CardContent>
      </Card>

      {/* Overview Cards */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Database</CardTitle>
            <Database className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{dbBytes != null ? formatBytes(dbBytes) : '—'}</div>
            <p className="text-xs text-muted-foreground">PostgreSQL database records</p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Object Storage</CardTitle>
            <Folder className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{objectBytes != null ? formatBytes(objectBytes) : '—'}</div>
            <p className="text-xs text-muted-foreground">Uploaded files &amp; documents</p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Total</CardTitle>
            <HardDrive className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{formatBytes(totalBytes)}</div>
            <p className="text-xs text-muted-foreground">Database + object storage combined</p>
          </CardContent>
        </Card>
      </div>

      {/* Object storage note */}
      <Card className="border-blue-100 bg-blue-50">
        <CardContent className="pt-4 pb-4">
          <p className="text-sm text-blue-700">
            <strong>Note:</strong> Object storage size reflects only files uploaded after storage tracking was enabled.
            Older documents are not counted until they are re-uploaded.
          </p>
        </CardContent>
      </Card>

      {/* Quota Settings */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <SettingsIcon className="w-5 h-5" />
            Storage Quota Settings
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <div className="space-y-2">
              <Label>Database Quota (GB)</Label>
              <Input type="number" value={10} disabled className="bg-gray-50" />
              <p className="text-xs text-gray-500">Fixed Replit SQL database limit</p>
            </div>
            <div className="space-y-2">
              <Label htmlFor="warning">Warn at (%)</Label>
              <Input
                id="warning"
                type="number"
                min="1"
                max="100"
                value={warnAt}
                onChange={(e) => setWarnAt(parseInt(e.target.value) || 80)}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="critical">Critical at (%)</Label>
              <Input
                id="critical"
                type="number"
                min="1"
                max="100"
                value={criticalAt}
                onChange={(e) => setCriticalAt(parseInt(e.target.value) || 90)}
              />
            </div>
          </div>
          <Button
            onClick={handleSaveSettings}
            disabled={savingSettings}
            className="bg-emerald-600 hover:bg-emerald-700"
          >
            {savingSettings ? 'Saving...' : 'Save Quota Settings'}
          </Button>
        </CardContent>
      </Card>
    </div>
  );
}
