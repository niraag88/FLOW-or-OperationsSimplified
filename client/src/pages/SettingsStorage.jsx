import { useState, useEffect } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Progress } from '@/components/ui/progress';
import { RefreshCw, Database, HardDrive, AlertTriangle } from 'lucide-react';
import { useToast } from '@/hooks/use-toast';

export default function SettingsStorage() {
  const { toast } = useToast();
  const [dbSize, setDbSize] = useState(0);
  const [storageSize, setStorageSize] = useState(0);
  const [loading, setLoading] = useState(true);
  const [lastUpdated, setLastUpdated] = useState(null);
  
  // Get storage quota from environment variable (default to 50GB)
  const quotaGB = parseInt(import.meta.env.VITE_STORAGE_QUOTA_GB || '50');
  const quotaBytes = quotaGB * 1024 * 1024 * 1024; // Convert GB to bytes
  
  const formatBytes = (bytes) => {
    if (bytes === 0) return '0 B';
    const k = 1024;
    const sizes = ['B', 'KB', 'MB', 'GB', 'TB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
  };

  const fetchStorageData = async () => {
    try {
      setLoading(true);
      
      // Fetch database size
      const dbResponse = await fetch('/api/db/size');
      if (!dbResponse.ok) {
        throw new Error('Failed to fetch database size');
      }
      const dbData = await dbResponse.json();
      setDbSize(dbData.bytes);
      
      // Fetch object storage size
      const storageResponse = await fetch('/api/storage/total-size');
      if (!storageResponse.ok) {
        throw new Error('Failed to fetch storage size');
      }
      const storageData = await storageResponse.json();
      setStorageSize(storageData.bytes);
      
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

  const totalUsed = dbSize + storageSize;
  const usagePercentage = (totalUsed / quotaBytes) * 100;
  
  // Determine progress bar color based on usage
  const getProgressColor = () => {
    if (usagePercentage >= 90) return 'bg-red-500';
    if (usagePercentage >= 80) return 'bg-yellow-500';
    return 'bg-blue-500';
  };

  const getStatusIcon = () => {
    if (usagePercentage >= 90) return <AlertTriangle className="w-5 h-5 text-red-500" />;
    if (usagePercentage >= 80) return <AlertTriangle className="w-5 h-5 text-yellow-500" />;
    return null;
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-bold tracking-tight">Storage Management</h2>
          <p className="text-muted-foreground">
            Monitor your database and object storage usage
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

      {/* Overall Usage Card */}
      <Card data-testid="card-storage-overview">
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            {getStatusIcon()}
            Storage Usage Overview
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-2">
            <div className="flex justify-between text-sm">
              <span>Total Usage</span>
              <span className="font-medium">
                {formatBytes(totalUsed)} / {quotaGB} GB
              </span>
            </div>
            <Progress 
              value={Math.min(usagePercentage, 100)} 
              className="h-3"
              data-testid="progress-total-usage"
            />
            <div className="flex justify-between text-xs text-muted-foreground">
              <span>{usagePercentage.toFixed(1)}% used</span>
              <span>{formatBytes(quotaBytes - totalUsed)} remaining</span>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Breakdown Cards */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        {/* Database Storage */}
        <Card data-testid="card-database-storage">
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Database className="w-5 h-5" />
              Database Storage
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-2">
              <div className="flex justify-between">
                <span className="text-sm text-muted-foreground">Used</span>
                <span className="font-medium" data-testid="text-db-size">
                  {formatBytes(dbSize)}
                </span>
              </div>
              <Progress 
                value={(dbSize / quotaBytes) * 100} 
                className="h-2"
                data-testid="progress-db-usage"
              />
              <div className="text-xs text-muted-foreground">
                {((dbSize / quotaBytes) * 100).toFixed(2)}% of total quota
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Object Storage */}
        <Card data-testid="card-object-storage">
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <HardDrive className="w-5 h-5" />
              Object Storage
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-2">
              <div className="flex justify-between">
                <span className="text-sm text-muted-foreground">Used</span>
                <span className="font-medium" data-testid="text-storage-size">
                  {formatBytes(storageSize)}
                </span>
              </div>
              <Progress 
                value={(storageSize / quotaBytes) * 100} 
                className="h-2"
                data-testid="progress-storage-usage"
              />
              <div className="text-xs text-muted-foreground">
                {((storageSize / quotaBytes) * 100).toFixed(2)}% of total quota
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Last Updated */}
      {lastUpdated && (
        <div className="text-xs text-muted-foreground text-center" data-testid="text-last-updated">
          Last updated: {lastUpdated.toLocaleString()}
        </div>
      )}

      {/* Usage Warnings */}
      {usagePercentage >= 80 && (
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
                    ? 'Your storage usage is critically high. Please clean up data or increase quota.'
                    : 'Your storage usage is getting high. Consider cleaning up old data.'
                  }
                </p>
              </div>
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}