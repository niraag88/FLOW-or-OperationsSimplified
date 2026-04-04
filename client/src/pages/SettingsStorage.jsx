import { useState, useEffect } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Progress } from '@/components/ui/progress';
import { RefreshCw, Database, HardDrive, Layers, AlertTriangle, Info } from 'lucide-react';
import { useToast } from '@/hooks/use-toast';

const QUOTA_BYTES = 50 * 1024 * 1024 * 1024; // 50 GiB — Replit Core plan limit

const formatBytes = (bytes) => {
  if (!bytes || bytes === 0) return '0 B';
  const k = 1024;
  const sizes = ['B', 'KB', 'MB', 'GB', 'TB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
};

export default function SettingsStorage() {
  const { toast } = useToast();
  const [dbSize, setDbSize] = useState(0);
  const [objectSize, setObjectSize] = useState(0);
  const [appSize, setAppSize] = useState(0);
  const [loading, setLoading] = useState(true);
  const [lastUpdated, setLastUpdated] = useState(null);

  const fetchStorageData = async () => {
    try {
      setLoading(true);

      const [dbRes, objectRes, appRes] = await Promise.all([
        fetch('/api/db/size', { credentials: 'include' }),
        fetch('/api/storage/total-size', { credentials: 'include' }),
        fetch('/api/system/app-size', { credentials: 'include' }),
      ]);

      if (!dbRes.ok) throw new Error('Failed to fetch database size');
      if (!objectRes.ok) throw new Error('Failed to fetch uploaded files size');
      if (!appRes.ok) throw new Error('Failed to fetch app size');

      const [dbData, objectData, appData] = await Promise.all([
        dbRes.json(),
        objectRes.json(),
        appRes.json(),
      ]);

      setDbSize(dbData.bytes || 0);
      setObjectSize(objectData.bytes || 0);
      setAppSize(appData.bytes || 0);
      setLastUpdated(new Date());
    } catch (error) {
      console.error('Error fetching storage data:', error);
      toast({
        title: 'Error',
        description: 'Failed to fetch storage data. Please try again.',
        variant: 'destructive',
      });
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchStorageData();
  }, []);

  const totalUsed = appSize + dbSize + objectSize;
  const usagePercentage = (totalUsed / QUOTA_BYTES) * 100;

  const getStatusIcon = () => {
    if (usagePercentage >= 90) return <AlertTriangle className="w-5 h-5 text-red-500" />;
    if (usagePercentage >= 80) return <AlertTriangle className="w-5 h-5 text-yellow-500" />;
    return null;
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-bold tracking-tight">Storage Management</h2>
          <p className="text-muted-foreground">
            Monitor how much space FLOW and your data are using
          </p>
        </div>
        <Button
          onClick={fetchStorageData}
          disabled={loading}
          variant="outline"
          size="sm"
          data-testid="button-refresh-storage"
        >
          <RefreshCw className={`w-4 h-4 mr-2 ${loading ? 'animate-spin' : ''}`} />
          Refresh
        </Button>
      </div>

      {/* Overview Card */}
      <Card data-testid="card-storage-overview">
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            {getStatusIcon()}
            Total Storage Used
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-2">
            <div className="flex justify-between text-sm">
              <span className="font-medium text-base">
                {loading ? '—' : formatBytes(totalUsed)}
              </span>
              <span className="text-muted-foreground">of 50 GiB</span>
            </div>
            <Progress
              value={loading ? 0 : Math.min(usagePercentage, 100)}
              className="h-3"
              data-testid="progress-total-usage"
            />
            <div className="flex justify-between text-xs text-muted-foreground">
              <span>{loading ? '—' : `${usagePercentage.toFixed(2)}% used`}</span>
              <span>{loading ? '—' : `${formatBytes(Math.max(0, QUOTA_BYTES - totalUsed))} remaining`}</span>
            </div>
          </div>

          <div className="flex items-start gap-2 text-xs text-muted-foreground bg-gray-50 rounded-md p-3">
            <Info className="w-4 h-4 mt-0.5 flex-shrink-0" />
            <p>
              The 50 GiB limit is based on the Replit Core plan allocation per app.
              If you are on a different Replit plan, your actual storage limit may differ.
            </p>
          </div>
        </CardContent>
      </Card>

      {/* Breakdown Cards */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        {/* Application */}
        <Card data-testid="card-app-storage">
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Layers className="w-5 h-5" />
              Application
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-2">
              <div className="flex justify-between items-baseline">
                <span className="text-sm text-muted-foreground">Size</span>
                <span className="text-2xl font-semibold" data-testid="text-app-size">
                  {loading ? '—' : formatBytes(appSize)}
                </span>
              </div>
              <Progress
                value={loading ? 0 : (appSize / QUOTA_BYTES) * 100}
                className="h-2"
                data-testid="progress-app-usage"
              />
              <div className="text-xs text-muted-foreground">
                {loading ? '' : `${((appSize / QUOTA_BYTES) * 100).toFixed(2)}% of plan limit`}
              </div>
              <p className="text-xs text-gray-500 pt-1">
                The FLOW app — source code, packages, and all dependencies. Grows when new features are added.
              </p>
            </div>
          </CardContent>
        </Card>

        {/* Business Data */}
        <Card data-testid="card-database-storage">
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Database className="w-5 h-5" />
              Business Data
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-2">
              <div className="flex justify-between items-baseline">
                <span className="text-sm text-muted-foreground">Size</span>
                <span className="text-2xl font-semibold" data-testid="text-db-size">
                  {loading ? '—' : formatBytes(dbSize)}
                </span>
              </div>
              <Progress
                value={loading ? 0 : (dbSize / QUOTA_BYTES) * 100}
                className="h-2"
                data-testid="progress-db-usage"
              />
              <div className="text-xs text-muted-foreground">
                {loading ? '' : `${((dbSize / QUOTA_BYTES) * 100).toFixed(2)}% of plan limit`}
              </div>
              <p className="text-xs text-gray-500 pt-1">
                All your invoices, products, customers, purchase orders, and records stored in the database.
              </p>
            </div>
          </CardContent>
        </Card>

        {/* Uploaded Files — only shown when > 0 */}
        {objectSize > 0 && (
          <Card data-testid="card-object-storage">
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <HardDrive className="w-5 h-5" />
                Uploaded Files
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="space-y-2">
                <div className="flex justify-between items-baseline">
                  <span className="text-sm text-muted-foreground">Size</span>
                  <span className="text-2xl font-semibold" data-testid="text-storage-size">
                    {formatBytes(objectSize)}
                  </span>
                </div>
                <Progress
                  value={(objectSize / QUOTA_BYTES) * 100}
                  className="h-2"
                  data-testid="progress-storage-usage"
                />
                <div className="text-xs text-muted-foreground">
                  {((objectSize / QUOTA_BYTES) * 100).toFixed(2)}% of plan limit
                </div>
                <p className="text-xs text-gray-500 pt-1">
                  Documents and files you have uploaded into FLOW.
                </p>
              </div>
            </CardContent>
          </Card>
        )}
      </div>

      {/* Last Updated */}
      {lastUpdated && (
        <div className="text-xs text-muted-foreground text-center" data-testid="text-last-updated">
          Last updated: {lastUpdated.toLocaleString()}
        </div>
      )}

      {/* Usage Warnings */}
      {!loading && usagePercentage >= 80 && (
        <Card className={`border-l-4 ${usagePercentage >= 90 ? 'border-red-500 bg-red-50' : 'border-yellow-500 bg-yellow-50'}`}>
          <CardContent className="pt-6">
            <div className="flex items-start gap-3">
              <AlertTriangle className={`w-5 h-5 ${usagePercentage >= 90 ? 'text-red-500' : 'text-yellow-500'}`} />
              <div>
                <h4 className={`font-medium ${usagePercentage >= 90 ? 'text-red-800' : 'text-yellow-800'}`}>
                  {usagePercentage >= 90 ? 'Critical Storage Usage' : 'High Storage Usage'}
                </h4>
                <p className={`text-sm ${usagePercentage >= 90 ? 'text-red-700' : 'text-yellow-700'}`}>
                  {usagePercentage >= 90
                    ? 'Your storage usage is critically high. Consider upgrading your Replit plan or removing unused data.'
                    : 'Your storage usage is getting high. Consider cleaning up old data or upgrading your plan.'}
                </p>
              </div>
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
