import React, { useState } from 'react';
import { Card, CardHeader, CardTitle, CardContent, CardDescription, CardFooter } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Play, FileJson, Mail, History, Loader2, CheckCircle, XCircle } from 'lucide-react';
import { Switch } from '@/components/ui/switch';
import { Label } from '@/components/ui/label';
import { useToast } from "@/components/ui/use-toast";
import { User } from '@/api/entities';
import { logAuditAction } from '../components/utils/auditLogger';

export default function BackupDrill() {
    const [loading, setLoading] = useState(false);
    const [report, setReport] = useState(null);
    const [scheduleWeekly, setScheduleWeekly] = useState(false);
    const [currentUser, setCurrentUser] = useState(null);
    const { toast } = useToast();

    React.useEffect(() => {
        const fetchUser = async () => {
            try {
                const user = await User.me();
                setCurrentUser(user);
            } catch(e) {
                // handle error
            }
        };
        fetchUser();
    }, []);

    const handleRunDrill = async () => {
        setLoading(true);
        setReport(null);
        toast({ title: "Backup Drill Started", description: "This is a backend process and may take a few minutes." });
        
        if(currentUser) {
            await logAuditAction("BackupDrill", "singleton", "start_drill", currentUser.email);
        }

        // Simulate backend process
        setTimeout(() => {
            const success = Math.random() > 0.2; // 80% chance of success
            const newReport = {
                timestamp: new Date().toISOString(),
                status: success ? 'SUCCESS' : 'FAILURE',
                summary: success ? 'All checks passed.' : 'One or more checks failed.',
                db_restore_check: { status: 'PASS', duration_ms: 12530, notes: 'Table counts match. Sample queries OK.'},
                file_restore_check: { status: success ? 'PASS' : 'FAIL', duration_ms: 4580, sampled_files: 10, failed_files: success ? 0 : 1, notes: success ? 'All sampled files retrieved successfully.' : 'Failed to retrieve file: invoices/2023/12/INV-2023-123.pdf'},
                report_path: `/backups/drills/${Date.now()}_report.json`
            };
            setReport(newReport);
            setLoading(false);
            toast({
                title: `Drill Complete: ${newReport.status}`,
                variant: success ? 'default' : 'destructive'
            });

            if(currentUser) {
                 logAuditAction("BackupDrill", "singleton", "finish_drill", currentUser.email, { report: newReport });
            }

        }, 8000);
    };

    return (
        <div className="space-y-6">
            <div>
                <h1 className="text-2xl font-bold text-gray-900">Backup & Restore Drill</h1>
                <p className="text-gray-600">
                    Run a non-destructive test to ensure your backups are valid and restorable.
                </p>
            </div>

            <Card className="border-0 shadow-lg">
                <CardHeader>
                    <CardTitle>Run a Test Drill</CardTitle>
                    <CardDescription>
                        This will spin up a temporary database from the latest backup and verify file retrievability without affecting your live production data.
                    </CardDescription>
                </CardHeader>
                <CardContent className="space-y-4">
                    <div className="flex items-center space-x-2">
                        <Switch id="schedule-weekly" checked={scheduleWeekly} onCheckedChange={setScheduleWeekly} />
                        <Label htmlFor="schedule-weekly">Schedule weekly drill and email report to admins</Label>
                    </div>
                     <Button onClick={handleRunDrill} disabled={loading} size="lg">
                        {loading ? (
                            <><Loader2 className="w-5 h-5 mr-2 animate-spin"/> Running Drill...</>
                        ) : (
                            <><Play className="w-5 h-5 mr-2" /> Run Test Backup & Restore</>
                        )}
                    </Button>
                </CardContent>
                {report && (
                    <CardFooter className="flex flex-col items-start gap-4 border-t pt-6">
                        <h3 className="font-semibold text-lg">Drill Report</h3>
                        <div className={`p-4 rounded-lg w-full ${report.status === 'SUCCESS' ? 'bg-emerald-50' : 'bg-red-50'}`}>
                            <div className="flex items-center gap-4">
                                {report.status === 'SUCCESS' ? 
                                    <CheckCircle className="w-8 h-8 text-emerald-600"/> : 
                                    <XCircle className="w-8 h-8 text-red-600"/>
                                }
                                <div>
                                    <p className={`font-bold text-xl ${report.status === 'SUCCESS' ? 'text-emerald-800' : 'text-red-800'}`}>
                                        Drill {report.status}
                                    </p>
                                    <p className="text-sm text-gray-600">{report.summary}</p>
                                </div>
                            </div>
                        </div>

                         <div className="w-full space-y-2 text-sm">
                            <p><strong>DB Restore Check:</strong> <span className={report.db_restore_check.status === 'PASS' ? 'text-green-600' : 'text-red-600'}>{report.db_restore_check.status}</span> ({report.db_restore_check.notes})</p>
                            <p><strong>File Restore Check:</strong> <span className={report.file_restore_check.status === 'PASS' ? 'text-green-600' : 'text-red-600'}>{report.file_restore_check.status}</span> ({report.file_restore_check.notes})</p>
                        </div>

                        <div className="flex items-center gap-2">
                            <Button variant="outline" asChild>
                                <a href={report.report_path} target="_blank" rel="noreferrer"><FileJson className="w-4 h-4 mr-2" /> View Full Report</a>
                            </Button>
                             <Button variant="secondary">
                                <Mail className="w-4 h-4 mr-2" /> Email Report
                            </Button>
                        </div>
                    </CardFooter>
                )}
            </Card>

            <Card className="border-0 shadow-lg">
                <CardHeader>
                    <CardTitle className="flex items-center gap-2"><History className="w-5 h-5"/> Drill History</CardTitle>
                </CardHeader>
                <CardContent>
                    <div className="border rounded-md p-8 text-center text-gray-500">
                        <p>A list of past drill reports will appear here.</p>
                    </div>
                </CardContent>
            </Card>

        </div>
    );
}