import React, { useState, useEffect } from "react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription, CardFooter } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Save, Trash, Clock } from "lucide-react";
import { logAuditAction } from "../utils/auditLogger";
import { useToast } from "@/hooks/use-toast";

interface RetentionSettingsProps {
  currentUser?: { email?: string; role?: string } | null;
}

const initialSettings = {
  retention_exports_days: 60,
  retention_audit_logs_days: 730,
  lifecycle_cold_storage_after_days: 30,
};

export default function RetentionSettings({ currentUser }: RetentionSettingsProps) {
  const [settings, setSettings] = useState(initialSettings);
  const [loading, setLoading] = useState(false);
  const { toast } = useToast();

  useEffect(() => {
    loadSettings();
  }, []);

  const loadSettings = async () => {
    setLoading(true);
    try {
      const response = await fetch('/api/settings/retention', { credentials: 'include' });
      if (response.ok) {
        const data = await response.json();
        setSettings(prev => ({ ...prev, ...data }));
      }
    } catch (error: any) {
      console.error("Error loading retention settings:", error);
    } finally {
      setLoading(false);
    }
  };

  const handleInputChange = (field: any, value: any) => {
    setSettings(prev => ({ ...prev, [field]: parseInt(value) || 0 }));
  };

  const handleSave = async () => {
    setLoading(true);
    try {
      const response = await fetch('/api/settings/retention', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify(settings),
      });
      if (!response.ok) throw new Error('Save failed');
      await logAuditAction("StorageSettings", "singleton", "update_retention", currentUser?.email, { settings });
      toast({ title: "Retention settings saved" });
    } catch (error: any) {
      console.error("Error saving retention settings:", error);
      toast({ title: "Save failed", variant: "destructive" });
    } finally {
      setLoading(false);
    }
  };

  const handleRunRetention = async () => {
    setLoading(true);
    try {
      const response = await fetch('/api/settings/retention/purge', {
        method: 'POST',
        credentials: 'include',
      });
      if (!response.ok) throw new Error('Purge failed');
      const result = await response.json();
      await logAuditAction("StorageSettings", "singleton", "manual_retention_run", currentUser?.email, { auditLogsDeleted: result.auditLogsDeleted, storageFilesDeleted: result.storageFilesDeleted });
      toast({
        title: "Retention purge complete",
        description: `Removed ${result.auditLogsDeleted} audit log records (>${result.auditLogRetentionDays}d) and ${result.storageFilesDeleted} export files (>${result.exportRetentionDays}d).`,
      });
    } catch (error: any) {
      console.error("Error running retention purge:", error);
      toast({ title: "Purge failed", variant: "destructive" });
    } finally {
      setLoading(false);
    }
  };

  if (loading && settings === initialSettings) return <div>Loading...</div>;

  return (
    <Card className="border-0 shadow-lg">
      <CardHeader>
        <CardTitle>Data Retention & Lifecycle</CardTitle>
        <CardDescription>
          Configure how long data is kept and when it's moved to cold storage. These actions are performed by automated background jobs.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-6">
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <div className="space-y-2">
            <Label htmlFor="retention_exports">Generated Exports Retention (days)</Label>
            <Input 
              id="retention_exports"
              type="number" 
              value={settings.retention_exports_days} 
              onChange={(e) => handleInputChange('retention_exports_days', e.target.value)}
            />
            <p className="text-xs text-gray-500">Deletes old XLSX, CSV, PDF exports.</p>
          </div>
          <div className="space-y-2">
            <Label htmlFor="retention_audit">Audit Log Retention (days)</Label>
            <Input 
              id="retention_audit"
              type="number" 
              value={settings.retention_audit_logs_days}
              onChange={(e) => handleInputChange('retention_audit_logs_days', e.target.value)}
            />
            <p className="text-xs text-gray-500">Purges old audit trail records.</p>
          </div>
          <div className="space-y-2">
            <Label htmlFor="lifecycle_cold">Move to Cold Storage After (days)</Label>
            <Input 
              id="lifecycle_cold"
              type="number" 
              value={settings.lifecycle_cold_storage_after_days}
              onChange={(e) => handleInputChange('lifecycle_cold_storage_after_days', e.target.value)}
            />
            <p className="text-xs text-gray-500">Tags files for infrequent-access storage class.</p>
          </div>
        </div>
        <div>
          <Button onClick={handleRunRetention} variant="destructive" disabled={loading}>
            <Trash className="w-4 h-4 mr-2"/>
            Run Retention & Purge Now
          </Button>
        </div>
      </CardContent>
      <CardFooter className="border-t pt-6">
        <div className="flex justify-end w-full">
          <Button onClick={handleSave} disabled={loading} className="bg-emerald-600 hover:bg-emerald-700">
            <Save className="w-4 h-4 mr-2"/>
            Save Retention Settings
          </Button>
        </div>
      </CardFooter>
    </Card>
  );
}
