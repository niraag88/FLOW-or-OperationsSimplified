import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Badge } from '@/components/ui/badge';
import { FileText, Search } from 'lucide-react';
import { format, isValid, parseISO } from 'date-fns';

interface AuditLog {
  id: number;
  actor: string;
  actorName: string;
  targetId: string;
  targetType: string;
  action: string;
  details: string;
  timestamp: string;
}

const ACTION_COLORS: Record<string, string> = {
  CREATE: 'bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-200',
  UPDATE: 'bg-blue-100 text-blue-800 dark:bg-blue-900 dark:text-blue-200',
  DELETE: 'bg-red-100 text-red-800 dark:bg-red-900 dark:text-red-200',
  UPLOAD: 'bg-yellow-100 text-yellow-800 dark:bg-yellow-900 dark:text-yellow-200',
  REMOVE_FILE: 'bg-orange-100 text-orange-800 dark:bg-orange-900 dark:text-orange-200',
};

function formatLogDate(dateString: string) {
  if (!dateString) return '-';
  try {
    const date = typeof dateString === 'string' ? parseISO(dateString) : new Date(dateString);
    return isValid(date) ? format(date, 'dd/MM/yy HH:mm') : '-';
  } catch {
    return '-';
  }
}

export default function AuditLogTable() {
  const [search, setSearch] = useState('');
  const [actionFilter, setActionFilter] = useState('all');
  const [typeFilter, setTypeFilter] = useState('all');
  const [dateFrom, setDateFrom] = useState('');
  const [dateTo, setDateTo] = useState('');

  const { data, isLoading } = useQuery<AuditLog[]>({
    queryKey: ['/api/audit-logs'],
    refetchOnWindowFocus: false,
  });

  const logs = data ?? [];

  const targetTypes = Array.from(new Set(logs.map(l => l.targetType))).sort();
  const actionTypes = Array.from(new Set(logs.map(l => l.action))).sort();

  const filtered = logs.filter(log => {
    if (actionFilter !== 'all' && log.action !== actionFilter) return false;
    if (typeFilter !== 'all' && log.targetType !== typeFilter) return false;
    if (search) {
      const q = search.toLowerCase();
      if (
        !log.actorName?.toLowerCase().includes(q) &&
        !log.details?.toLowerCase().includes(q)
      ) return false;
    }
    if (dateFrom) {
      const logDate = new Date(log.timestamp);
      const from = new Date(dateFrom);
      from.setHours(0, 0, 0, 0);
      if (logDate < from) return false;
    }
    if (dateTo) {
      const logDate = new Date(log.timestamp);
      const to = new Date(dateTo);
      to.setHours(23, 59, 59, 999);
      if (logDate > to) return false;
    }
    return true;
  });

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap gap-3">
        <div className="relative flex-1 min-w-[200px]">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400" />
          <Input
            className="pl-9"
            placeholder="Search by actor or details..."
            value={search}
            onChange={e => setSearch(e.target.value)}
          />
        </div>

        <Select value={actionFilter} onValueChange={setActionFilter}>
          <SelectTrigger className="w-[160px]">
            <SelectValue placeholder="Action type" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All actions</SelectItem>
            {actionTypes.map(a => (
              <SelectItem key={a} value={a}>{a}</SelectItem>
            ))}
          </SelectContent>
        </Select>

        <Select value={typeFilter} onValueChange={setTypeFilter}>
          <SelectTrigger className="w-[160px]">
            <SelectValue placeholder="Target type" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All types</SelectItem>
            {targetTypes.map(t => (
              <SelectItem key={t} value={t}>{t}</SelectItem>
            ))}
          </SelectContent>
        </Select>

        <Input
          type="date"
          className="w-[150px]"
          value={dateFrom}
          onChange={e => setDateFrom(e.target.value)}
          title="From date"
        />
        <Input
          type="date"
          className="w-[150px]"
          value={dateTo}
          onChange={e => setDateTo(e.target.value)}
          title="To date"
        />
      </div>

      {isLoading ? (
        <div className="text-center py-12 text-gray-500">Loading audit logs...</div>
      ) : (
        <div className="w-full overflow-x-auto rounded-md border">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="w-[130px]">Time</TableHead>
                <TableHead className="w-[110px]">Actor</TableHead>
                <TableHead className="w-[110px]">Action</TableHead>
                <TableHead className="w-[110px]">Type</TableHead>
                <TableHead className="w-[110px]">Target</TableHead>
                <TableHead>Details</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {filtered.map(log => (
                <TableRow key={log.id} className="hover:bg-gray-50 dark:hover:bg-gray-800">
                  <TableCell className="text-xs text-gray-500 whitespace-nowrap">
                    {formatLogDate(log.timestamp)}
                  </TableCell>
                  <TableCell className="font-medium text-sm">{log.actorName}</TableCell>
                  <TableCell>
                    <Badge className={`${ACTION_COLORS[log.action] || 'bg-gray-100 text-gray-800'} border-0 text-xs`}>
                      {log.action}
                    </Badge>
                  </TableCell>
                  <TableCell className="text-sm text-gray-600 dark:text-gray-400">{log.targetType}</TableCell>
                  <TableCell className="text-xs text-gray-500 font-mono">{log.targetId}</TableCell>
                  <TableCell className="text-sm max-w-xs truncate" title={log.details}>{log.details}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>

          {filtered.length === 0 && (
            <div className="text-center py-12 text-gray-500">
              <FileText className="w-10 h-10 mx-auto mb-3 opacity-40" />
              <p className="text-sm">
                {logs.length === 0 ? 'No audit log entries yet.' : 'No entries match the current filters.'}
              </p>
            </div>
          )}
        </div>
      )}

      {filtered.length > 0 && (
        <p className="text-xs text-gray-400 text-right">
          Showing {filtered.length} of {logs.length} entries (newest first)
        </p>
      )}
    </div>
  );
}
