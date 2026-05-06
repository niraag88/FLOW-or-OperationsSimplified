import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { ClipboardList } from 'lucide-react';
import AuditLogTable from '@/components/user-management/AuditLogTable';

export default function AuditLog() {
  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-gray-900 dark:text-white">Audit Log</h1>
        <p className="text-gray-600 dark:text-gray-400">
          View who did what, when. Filter by user, action, or target type.
        </p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <ClipboardList className="h-5 w-5" />
            System Activity
          </CardTitle>
          <CardDescription>
            Read-only history of CRUD activity across the system.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <AuditLogTable />
        </CardContent>
      </Card>
    </div>
  );
}
