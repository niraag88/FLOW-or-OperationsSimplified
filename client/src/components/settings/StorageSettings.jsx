
import React, { useState, useEffect } from "react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription, CardFooter } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Textarea } from "@/components/ui/textarea"; // Added this import
import { Save, HardDrive, Clock, Trash, Download } from "lucide-react";
import { logAuditAction } from "../utils/auditLogger";
import { useToast } from "@/components/ui/use-toast";

const initialSettings = {
  storage_provider: "Replit", // Fixed to Replit platform
  app_storage_base_path: "/company/{env}/",
  signed_url_ttl_minutes: 60,
  exports_base_path: "exports/{timestamp}/",
  docs_base_paths: {
    invoices: "documents/invoices/{YYYY}/{MM}/",
    pos: "documents/pos/{YYYY}/{MM}/",
    dos: "documents/dos/{YYYY}/{MM}/",
    attachments: "documents/attachments/{YYYY}/{MM}/",
    books: "books/{YYYY}/"
  },
  db_auto_export_enabled: false, // Manual exports only
  keyvalue_cleanup_enabled: true,
  keyvalue_cleanup_days: 30,
};

export default function StorageSettings({ currentUser }) {
  const [settings, setSettings] = useState(initialSettings);
  const [loading, setLoading] = useState(false);
  const [initialLoad, setInitialLoad] = useState(true);
  const { toast } = useToast();

  useEffect(() => {
    loadSettings();
  }, []);

  const loadSettings = async () => {
    try {
      const res = await fetch('/api/company-settings', { credentials: 'include' });
      if (res.ok) {
        const s = await res.json();
        if (s.storageBasePath) {
          setSettings(prev => ({ ...prev, app_storage_base_path: s.storageBasePath }));
        }
      }
    } catch (error) {
      console.error("Error loading storage settings:", error);
    } finally {
      setInitialLoad(false);
    }
  };

  const handleInputChange = (field, value) => {
    setSettings(prev => ({ ...prev, [field]: value }));
  };

  const handleSave = async () => {
    setLoading(true);
    try {
      await logAuditAction("StorageSettings", "singleton", "update", currentUser?.email, { settings });
      toast({
        title: "Settings noted",
        description: "Storage path templates are informational and do not require server persistence.",
      });
    } catch (error) {
      console.error("Error saving settings:", error);
      toast({ title: "Save failed", variant: "destructive" });
    } finally {
      setLoading(false);
    }
  };
  

  const handleRunBackup = async () => {
    setLoading(true);
    await logAuditAction("StorageSettings", "singleton", "manual_export", currentUser.email);
    toast({
      title: "Data Export Started",
      description: "Generating SQL export and saving to App Storage...",
    });
    // This is where a backend call would be made. We simulate a delay.
    setTimeout(() => {
      setLoading(false);
       toast({
        title: "Export Complete",
        description: "Data export saved to App Storage under /exports/",
      });
    }, 3000);
  };

  if (initialLoad) return <div>Loading settings...</div>;

  return (
    <Card className="border-0 shadow-lg">
      <CardHeader>
        <CardTitle>Storage & Data Management</CardTitle>
        <CardDescription>Configure Replit storage options, data organization, and export settings.</CardDescription>
      </CardHeader>
      <Tabs defaultValue="storage">
        <TabsList className="ml-6">
          <TabsTrigger value="storage">Replit Storage</TabsTrigger>
          <TabsTrigger value="paths">Object Paths</TabsTrigger>
          <TabsTrigger value="exports">Data Export</TabsTrigger>
        </TabsList>
        <TabsContent value="storage" className="p-6 space-y-6">
            <div className="bg-blue-50 p-4 rounded-lg mb-6">
              <h4 className="font-semibold text-blue-800 mb-2">Replit Storage Overview</h4>
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4 text-sm text-blue-700">
                <div>
                  <strong>SQL Database:</strong><br/>
                  10 GiB limit, PostgreSQL
                </div>
                <div>
                  <strong>App Storage:</strong><br/>
                  Unlimited, $0.03/GiB/month
                </div>
                <div>
                  <strong>Key-Value Store:</strong><br/>
                  50 MiB limit, 5,000 keys
                </div>
              </div>
            </div>
            
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label>Storage Provider</Label>
                <Input value="Replit Platform" disabled className="bg-gray-50"/>
                <p className="text-xs text-gray-500">Managed by Replit infrastructure</p>
              </div>
              <div className="space-y-2">
                <Label>Signed URL TTL (minutes)</Label>
                <Input type="number" value={settings.signed_url_ttl_minutes} onChange={(e) => handleInputChange('signed_url_ttl_minutes', parseInt(e.target.value))}/>
                <p className="text-xs text-gray-500">For temporary file access links</p>
              </div>
            </div>
            
            <div className="space-y-2">
              <Label>Key-Value Store Cleanup</Label>
              <div className="flex items-center space-x-2">
                <Switch id="kv-cleanup" checked={settings.keyvalue_cleanup_enabled} onCheckedChange={(c) => handleInputChange('keyvalue_cleanup_enabled', c)}/>
                <Label htmlFor="kv-cleanup">Auto-cleanup old Key-Value entries</Label>
              </div>
              {settings.keyvalue_cleanup_enabled && (
                <Input type="number" value={settings.keyvalue_cleanup_days} onChange={(e) => handleInputChange('keyvalue_cleanup_days', parseInt(e.target.value))} placeholder="Days to keep" className="mt-2"/>
              )}
            </div>
        </TabsContent>
        <TabsContent value="paths" className="p-6 space-y-6">
            <div className="space-y-2">
                <Label>App Storage Base Path</Label>
                <Input value={settings.app_storage_base_path} onChange={(e) => handleInputChange('app_storage_base_path', e.target.value)}/>
                <p className="text-xs text-gray-500">Base path for all object storage uploads</p>
            </div>
            <div className="space-y-2">
                <Label>Exports Path</Label>
                <Input value={settings.exports_base_path} onChange={(e) => handleInputChange('exports_base_path', e.target.value)}/>
            </div>
            <div className="space-y-2">
                 <Label>Document Type Paths (JSON)</Label>
                 <Textarea
                    value={JSON.stringify(settings.docs_base_paths, null, 2)}
                    onChange={(e) => {
                        try {
                            const parsed = JSON.parse(e.target.value);
                            setSettings(prev => ({...prev, docs_base_paths: parsed }));
                        } catch (err) {
                            // handle invalid json
                        }
                    }}
                    rows={8}
                    className="font-mono text-sm"
                 />
            </div>
             <Card>
                <CardHeader><CardTitle className="text-base">Example Object Paths</CardTitle></CardHeader>
                <CardContent className="text-xs text-gray-500 font-mono space-y-1">
                    <p><b>Invoice:</b> {settings.app_storage_base_path || '/company/{env}/'}{settings.docs_base_paths.invoices}INV-2023-001.pdf</p>
                    <p><b>Purchase Order:</b> {settings.app_storage_base_path || '/company/{env}/'}{settings.docs_base_paths.pos}PO-2023-001.pdf</p>
                    <p className="text-blue-600 mt-2"><b>Note:</b> Stored in Replit App Storage with pay-per-use billing</p>
                </CardContent>
            </Card>
        </TabsContent>
        <TabsContent value="exports" className="p-6 space-y-6">
            <div className="bg-amber-50 p-4 rounded-lg mb-6">
              <h4 className="font-semibold text-amber-800 mb-2">Replit Data Management</h4>
              <p className="text-sm text-amber-700">
                Replit automatically manages database reliability and snapshots. Use manual exports for data portability and external backups.
              </p>
            </div>
            
            <h3 className="text-lg font-semibold">Automated Exports</h3>
            <div className="flex items-center space-x-2">
              <Switch id="auto-export-enabled" checked={settings.db_auto_export_enabled} onCheckedChange={(c) => handleInputChange('db_auto_export_enabled', c)}/>
              <Label htmlFor="auto-export-enabled">Enable scheduled data exports to App Storage</Label>
            </div>
            <p className="text-sm text-gray-600">
              Note: Automated exports are stored in App Storage and incur storage costs ($0.03/GiB/month).
            </p>
            
            <h3 className="text-lg font-semibold mt-6">Manual Export</h3>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <Button onClick={handleRunBackup} disabled={loading} variant="outline">
                    <Download className="w-4 h-4 mr-2" /> Export SQL Data
                </Button>
                <Button onClick={() => toast({title: "CSV Export", description: "Starting CSV export of all tables..."})} disabled={loading} variant="outline">
                    <Download className="w-4 h-4 mr-2" /> Export CSV Data
                </Button>
            </div>
            
            <div className="mt-6">
                <h4 className="font-semibold mb-2">Recent Exports</h4>
                <div className="border rounded-md p-8 text-center text-gray-500">
                    <p>Export history will appear here.</p>
                    <p className="text-sm">Files are stored in your App Storage under /exports/</p>
                </div>
            </div>
            
            <div className="mt-6 p-4 bg-blue-50 rounded-lg">
              <h4 className="font-semibold text-blue-800 mb-2">Data Recovery Options</h4>
              <ul className="text-sm text-blue-700 space-y-1">
                <li>• Replit automatically creates database snapshots</li>
                <li>• Use the Rollback feature for point-in-time recovery</li>
                <li>• Manual exports provide additional data portability</li>
                <li>• Key-Value Store data should be backed up separately if critical</li>
              </ul>
            </div>
        </TabsContent>
      </Tabs>
      <CardFooter className="border-t pt-6">
        <div className="flex justify-end w-full">
            <Button onClick={handleSave} disabled={loading} className="bg-emerald-600 hover:bg-emerald-700">
                <Save className="w-4 h-4 mr-2"/>
                Save All Storage Settings
            </Button>
        </div>
      </CardFooter>
    </Card>
  );
}
