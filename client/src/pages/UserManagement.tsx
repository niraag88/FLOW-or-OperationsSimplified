import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useAuth } from '@/hooks/useAuth';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { Badge } from '@/components/ui/badge';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Switch } from '@/components/ui/switch';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs';
import { UserPlus, Edit, Trash2, Shield, Users, CheckCircle, XCircle, ClipboardList, AlertTriangle, RotateCcw } from 'lucide-react';
import { formatDate } from '@/utils/dateUtils';
import { apiRequest } from '@/lib/queryClient';
import { useToast } from '@/hooks/use-toast';
import AuditLogTable from '@/components/user-management/AuditLogTable';
import { FACTORY_RESET_CONFIRMATION_PHRASE } from '@shared/factoryResetPhrase';

interface User {
  id: string;
  username: string;
  role: 'Admin' | 'Manager' | 'Staff';
  firstName?: string;
  lastName?: string;
  email?: string;
  active: boolean;
  createdAt: string;
  lastLogin?: string;
  createdBy?: string;
}

interface CreateUserData {
  username: string;
  password: string;
  role: 'Admin' | 'Manager' | 'Staff';
  firstName?: string;
  lastName?: string;
  email?: string;
  active: boolean;
}

const getServerError = (error: Error, fallback: string): string => {
  try {
    const match = error.message.match(/^\d+: (.+)$/);
    if (match) {
      const text = match[1].trim();
      try {
        const parsed = JSON.parse(text);
        return parsed.error || parsed.message || text || fallback;
      } catch {
        return text || fallback;
      }
    }
  } catch {}
  return fallback;
};

export default function UserManagement() {
  const { user, hasRole, logout } = useAuth();
  const queryClient = useQueryClient();
  const { toast } = useToast();
  const isAdmin = hasRole(['Admin']);
  const canViewLogs = hasRole(['Admin', 'Manager']);
  const [activeTab, setActiveTab] = useState('users');
  const [isCreateDialogOpen, setIsCreateDialogOpen] = useState(false);
  const [editingUser, setEditingUser] = useState<User | null>(null);
  const [editPassword, setEditPassword] = useState('');
  const [showResetConfirm, setShowResetConfirm] = useState(false);
  const [isResetting, setIsResetting] = useState(false);
  const [resetConfirmText, setResetConfirmText] = useState('');
  const [createForm, setCreateForm] = useState<CreateUserData>({
    username: '',
    password: '',
    role: 'Staff',
    firstName: '',
    lastName: '',
    email: '',
    active: true
  });

  if (!canViewLogs) {
    return (
      <div className="flex items-center justify-center h-64">
        <Alert className="max-w-md">
          <Shield className="h-4 w-4" />
          <AlertDescription>
            Access denied. Manager or Admin privileges required.
          </AlertDescription>
        </Alert>
      </div>
    );
  }

  // Fetch users (Admin + Manager)
  const { data: usersData, isLoading } = useQuery<{ users: User[] }>({
    queryKey: ['/api/users'],
    refetchOnWindowFocus: false,
    enabled: canViewLogs,
  });

  // Create user mutation
  const createUserMutation = useMutation({
    mutationFn: async (userData: CreateUserData) => {
      const response = await apiRequest('POST', '/api/users', userData);
      return await response.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/users'] });
      setIsCreateDialogOpen(false);
      setCreateForm({
        username: '',
        password: '',
        role: 'Staff',
        firstName: '',
        lastName: '',
        email: '',
        active: true
      });
      toast({ title: 'User created', description: 'The new user account has been created.' });
    },
    onError: (error: Error) => {
      toast({
        title: 'Failed to create user',
        description: getServerError(error, 'An unexpected error occurred.'),
        variant: 'destructive',
      });
    },
  });

  // Update user mutation
  const updateUserMutation = useMutation({
    mutationFn: async ({ id, password, ...userData }: { id: string; password?: string } & Partial<User>) => {
      const body: Record<string, unknown> = { ...userData };
      if (password && password.trim()) body.password = password;
      const response = await apiRequest('PUT', `/api/users/${id}`, body);
      return await response.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/users'] });
      setEditingUser(null);
      setEditPassword('');
      toast({ title: 'User updated', description: 'User details have been saved.' });
    },
    onError: (error: Error) => {
      toast({
        title: 'Failed to update user',
        description: getServerError(error, 'An unexpected error occurred.'),
        variant: 'destructive',
      });
    },
  });

  // Delete user mutation
  const deleteUserMutation = useMutation({
    mutationFn: async (userId: string) => {
      await apiRequest('DELETE', `/api/users/${userId}`);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/users'] });
      toast({ title: 'User deleted', description: 'The user account has been removed.' });
    },
    onError: (error: Error) => {
      toast({
        title: 'Failed to delete user',
        description: getServerError(error, 'An unexpected error occurred.'),
        variant: 'destructive',
      });
    },
  });

  const handleCreateUser = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!createForm.username.trim() || !createForm.password.trim()) {
      return;
    }
    await createUserMutation.mutateAsync(createForm);
  };

  const handleUpdateUser = async () => {
    if (!editingUser) return;
    await updateUserMutation.mutateAsync({ ...editingUser, password: editPassword });
  };

  const handleDeleteUser = async (userId: string, username: string) => {
    if (confirm(`Are you sure you want to delete user "${username}"? This action cannot be undone.`)) {
      await deleteUserMutation.mutateAsync(userId);
    }
  };

  const handleFactoryReset = async () => {
    setIsResetting(true);
    try {
      const res = await fetch('/api/ops/factory-reset', {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ confirmation: FACTORY_RESET_CONFIRMATION_PHRASE }),
      });
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error(body.message || body.error || 'Factory reset failed');
      }
      setShowResetConfirm(false);
      setResetConfirmText('');
      sessionStorage.setItem('factoryResetComplete', '1');
      await logout();
      window.location.href = '/';
    } catch (err: unknown) {
      toast({
        title: 'Reset failed',
        description: err instanceof Error ? err.message : 'Could not complete the factory reset.',
        variant: 'destructive',
      });
    } finally {
      setIsResetting(false);
    }
  };

  const getRoleBadgeColor = (role: string) => {
    switch (role) {
      case 'Admin': return 'bg-red-100 text-red-800 dark:bg-red-900 dark:text-red-200';
      case 'Manager': return 'bg-blue-100 text-blue-800 dark:bg-blue-900 dark:text-blue-200';
      case 'Staff': return 'bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-200';
      default: return 'bg-gray-100 text-gray-800 dark:bg-gray-900 dark:text-gray-200';
    }
  };

  const users = usersData?.users || [];

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900 dark:text-white">User Management</h1>
          <p className="text-gray-600 dark:text-gray-400">Manage user accounts and view audit logs</p>
        </div>

        {isAdmin && activeTab === 'users' && (
          <Dialog open={isCreateDialogOpen} onOpenChange={setIsCreateDialogOpen}>
            <DialogTrigger asChild>
              <Button data-testid="button-create-user">
                <UserPlus className="mr-2 h-4 w-4" />
                Create User
              </Button>
            </DialogTrigger>
            <DialogContent className="sm:max-w-md">
              <form onSubmit={handleCreateUser}>
                <DialogHeader>
                  <DialogTitle>Create New User</DialogTitle>
                  <DialogDescription>
                    Create a new user account with role-based permissions
                  </DialogDescription>
                </DialogHeader>
                <div className="space-y-4 py-4">
                  <div className="space-y-2">
                    <Label htmlFor="username">Username *</Label>
                    <Input
                      id="username"
                      value={createForm.username}
                      onChange={(e) => setCreateForm({ ...createForm, username: e.target.value })}
                      placeholder="Enter username"
                      required
                      data-testid="input-create-username"
                    />
                  </div>

                  <div className="space-y-2">
                    <Label htmlFor="password">Password *</Label>
                    <Input
                      id="password"
                      type="password"
                      value={createForm.password}
                      onChange={(e) => setCreateForm({ ...createForm, password: e.target.value })}
                      placeholder="Enter password"
                      required
                      data-testid="input-create-password"
                    />
                  </div>

                  <div className="grid grid-cols-2 gap-4">
                    <div className="space-y-2">
                      <Label htmlFor="firstName">First Name</Label>
                      <Input
                        id="firstName"
                        value={createForm.firstName}
                        onChange={(e) => setCreateForm({ ...createForm, firstName: e.target.value })}
                        placeholder="First name"
                        data-testid="input-create-firstname"
                      />
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="lastName">Last Name</Label>
                      <Input
                        id="lastName"
                        value={createForm.lastName}
                        onChange={(e) => setCreateForm({ ...createForm, lastName: e.target.value })}
                        placeholder="Last name"
                        data-testid="input-create-lastname"
                      />
                    </div>
                  </div>

                  <div className="space-y-2">
                    <Label htmlFor="email">Email</Label>
                    <Input
                      id="email"
                      type="email"
                      value={createForm.email}
                      onChange={(e) => setCreateForm({ ...createForm, email: e.target.value })}
                      placeholder="user@company.com"
                      data-testid="input-create-email"
                    />
                  </div>

                  <div className="space-y-2">
                    <Label htmlFor="role">Role</Label>
                    <Select
                      value={createForm.role}
                      onValueChange={(value: 'Admin' | 'Manager' | 'Staff') =>
                        setCreateForm({ ...createForm, role: value })
                      }
                    >
                      <SelectTrigger data-testid="select-create-role">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="Staff">Staff</SelectItem>
                        <SelectItem value="Manager">Manager</SelectItem>
                        <SelectItem value="Admin">Admin</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>

                  <div className="flex items-center space-x-2">
                    <Switch
                      id="active"
                      checked={createForm.active}
                      onCheckedChange={(checked) => setCreateForm({ ...createForm, active: checked })}
                      data-testid="switch-create-active"
                    />
                    <Label htmlFor="active">Account Active</Label>
                  </div>
                </div>
                <DialogFooter>
                  <Button
                    type="button"
                    variant="outline"
                    onClick={() => setIsCreateDialogOpen(false)}
                    disabled={createUserMutation.isPending}
                  >
                    Cancel
                  </Button>
                  <Button
                    type="submit"
                    disabled={createUserMutation.isPending}
                    data-testid="button-confirm-create-user"
                  >
                    {createUserMutation.isPending ? 'Creating...' : 'Create User'}
                  </Button>
                </DialogFooter>
              </form>
            </DialogContent>
          </Dialog>
        )}
      </div>

      <Tabs value={activeTab} onValueChange={setActiveTab}>
        <TabsList className={`grid w-full ${isAdmin ? 'grid-cols-3' : 'grid-cols-2'}`}>
          <TabsTrigger value="users" className="flex items-center gap-2">
            <Users className="h-4 w-4" />
            Users
          </TabsTrigger>
          <TabsTrigger value="logs" className="flex items-center gap-2">
            <ClipboardList className="h-4 w-4" />
            Audit Logs
          </TabsTrigger>
          {isAdmin && (
            <TabsTrigger value="reset" className="flex items-center gap-2">
              <RotateCcw className="h-4 w-4" />
              Reset
            </TabsTrigger>
          )}
        </TabsList>

        <TabsContent value="users" className="space-y-6 mt-4">
            {/* Statistics Cards */}
            <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
              <Card>
                <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                  <CardTitle className="text-sm font-medium">Total Users</CardTitle>
                  <Users className="h-4 w-4 text-muted-foreground" />
                </CardHeader>
                <CardContent>
                  <div className="text-2xl font-bold">{users.length}</div>
                </CardContent>
              </Card>

              <Card>
                <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                  <CardTitle className="text-sm font-medium">Active Users</CardTitle>
                  <CheckCircle className="h-4 w-4 text-green-600" />
                </CardHeader>
                <CardContent>
                  <div className="text-2xl font-bold text-green-600">
                    {users.filter((u: any) => u.active).length}
                  </div>
                </CardContent>
              </Card>

              <Card>
                <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                  <CardTitle className="text-sm font-medium">Inactive Users</CardTitle>
                  <XCircle className="h-4 w-4 text-red-600" />
                </CardHeader>
                <CardContent>
                  <div className="text-2xl font-bold text-red-600">
                    {users.filter((u: any) => !u.active).length}
                  </div>
                </CardContent>
              </Card>
            </div>

            {/* Users Table */}
            <Card>
              <CardHeader>
                <CardTitle>Users</CardTitle>
                <CardDescription>
                  Manage user accounts, roles, and permissions
                </CardDescription>
              </CardHeader>
              <CardContent>
                {isLoading ? (
                  <div className="text-center py-4">Loading users...</div>
                ) : (
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>User</TableHead>
                        <TableHead>Role</TableHead>
                        <TableHead>Status</TableHead>
                        <TableHead>Created</TableHead>
                        <TableHead>Last Login</TableHead>
                        <TableHead>Actions</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {users.map((u) => (
                        <TableRow key={u.id}>
                          <TableCell>
                            <div>
                              <div className="font-medium">
                                {[u.firstName, u.lastName].filter(Boolean).join(' ') || u.username}
                              </div>
                              <div className="text-sm text-gray-500">
                                @{u.username}
                                {u.email && <span> • {u.email}</span>}
                              </div>
                            </div>
                          </TableCell>
                          <TableCell>
                            <Badge className={getRoleBadgeColor(u.role)}>
                              {u.role}
                            </Badge>
                          </TableCell>
                          <TableCell>
                            <div className="flex items-center gap-2">
                              {u.active ? (
                                <CheckCircle className="h-4 w-4 text-green-600" />
                              ) : (
                                <XCircle className="h-4 w-4 text-red-600" />
                              )}
                              <span className={u.active ? 'text-green-600' : 'text-red-600'}>
                                {u.active ? 'Active' : 'Inactive'}
                              </span>
                            </div>
                          </TableCell>
                          <TableCell className="text-sm text-gray-500">
                            {formatDate(u.createdAt)}
                          </TableCell>
                          <TableCell className="text-sm text-gray-500">
                            {u.lastLogin ? formatDate(u.lastLogin) : 'Never'}
                          </TableCell>
                          <TableCell>
                            {isAdmin && (
                              <div className="flex items-center gap-2">
                                <Button
                                  variant="outline"
                                  
                                  onClick={() => { setEditingUser(u); setEditPassword(''); }}
                                  data-testid={`button-edit-${u.username}`}
                                >
                                  <Edit className="h-3 w-3" />
                                </Button>
                                {u.id !== user?.id && (
                                  <Button
                                    variant="outline"
                                    
                                    onClick={() => handleDeleteUser(u.id, u.username)}
                                    disabled={deleteUserMutation.isPending}
                                    data-testid={`button-delete-${u.username}`}
                                  >
                                    <Trash2 className="h-3 w-3" />
                                  </Button>
                                )}
                              </div>
                            )}
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                )}
              </CardContent>
            </Card>
          </TabsContent>

        <TabsContent value="logs" className="mt-4">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <ClipboardList className="h-5 w-5" />
                Audit Log
              </CardTitle>
              <CardDescription>
                A record of all create, update, and delete actions across the system (up to 500 most recent entries).
              </CardDescription>
            </CardHeader>
            <CardContent>
              <AuditLogTable />
            </CardContent>
          </Card>
        </TabsContent>

        {isAdmin && (
          <TabsContent value="reset" className="mt-4">
            <Card className="border-red-200">
              <CardHeader>
                <CardTitle className="flex items-center gap-2 text-red-700">
                  <AlertTriangle className="h-5 w-5" />
                  Factory Reset
                </CardTitle>
                <CardDescription>
                  Permanently wipe all business data and restore the system to a clean slate.
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-6">
                <div className="rounded-lg border border-red-200 bg-red-50 p-4 space-y-3">
                  <p className="font-semibold text-red-800 text-sm">
                    What will be deleted:
                  </p>
                  <ul className="list-disc list-inside text-sm text-red-700 space-y-1">
                    <li>All products, brands, and customers</li>
                    <li>All purchase orders, goods receipts, and payments</li>
                    <li>All quotations, invoices, and delivery orders</li>
                    <li>All inventory records and stock movements</li>
                    <li>All audit logs and financial year data</li>
                    <li>All non-Admin user accounts</li>
                  </ul>
                  <p className="font-semibold text-red-800 text-sm mt-3">
                    What will be kept:
                  </p>
                  <ul className="list-disc list-inside text-sm text-green-700 space-y-1">
                    <li>Admin username and password — you can still log back in</li>
                  </ul>
                </div>

                <p className="text-sm text-gray-600">
                  This action is <strong>permanent and cannot be undone</strong>. The system will log you out immediately after the reset completes.
                </p>

                <Button
                  variant="destructive"
                  className="flex items-center gap-2"
                  onClick={() => setShowResetConfirm(true)}
                >
                  <RotateCcw className="h-4 w-4" />
                  Factory Reset
                </Button>
              </CardContent>
            </Card>
          </TabsContent>
        )}
      </Tabs>

      {/* Factory Reset Confirmation Dialog */}
      <Dialog
        open={showResetConfirm}
        onOpenChange={(open) => {
          if (!open && !isResetting) {
            setShowResetConfirm(false);
            setResetConfirmText('');
          }
        }}
      >
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-red-700">
              <AlertTriangle className="h-5 w-5" />
              Are you absolutely sure?
            </DialogTitle>
            <DialogDescription className="pt-2 text-base">
              This will permanently delete <strong>all</strong> data — products, customers, orders, invoices, receipts, audit logs, and all user accounts except the admin.
              <br /><br />
              <span className="font-semibold text-gray-900">This cannot be undone.</span> You will be logged out immediately after the reset.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-2 pt-2">
            <Label htmlFor="factory-reset-confirm-input" className="text-sm font-semibold text-gray-900">
              To confirm, type the phrase below exactly:
            </Label>
            <code
              data-testid="factory-reset-phrase"
              className="block break-words rounded border border-red-300 bg-red-50 px-2 py-1 text-xs font-mono text-red-800"
            >
              {FACTORY_RESET_CONFIRMATION_PHRASE}
            </code>
            <Input
              id="factory-reset-confirm-input"
              data-testid="input-factory-reset-confirm"
              type="text"
              autoComplete="off"
              autoCapitalize="off"
              autoCorrect="off"
              spellCheck={false}
              value={resetConfirmText}
              onChange={(e) => setResetConfirmText(e.target.value)}
              disabled={isResetting}
              placeholder="Type the phrase here"
              className="font-mono text-sm"
            />
          </div>
          <DialogFooter className="flex flex-col-reverse sm:flex-row gap-2 pt-2">
            <Button
              variant="outline"
              onClick={() => { setShowResetConfirm(false); setResetConfirmText(''); }}
              disabled={isResetting}
            >
              No, cancel
            </Button>
            <Button
              variant="destructive"
              onClick={handleFactoryReset}
              disabled={isResetting || resetConfirmText !== FACTORY_RESET_CONFIRMATION_PHRASE}
              data-testid="button-confirm-factory-reset"
              className="flex items-center gap-2"
            >
              {isResetting ? (
                <>Resetting…</>
              ) : (
                <>
                  <AlertTriangle className="h-4 w-4" />
                  Yes, wipe everything
                </>
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Edit User Dialog */}
      {editingUser && (
        <Dialog open={!!editingUser} onOpenChange={() => { setEditingUser(null); setEditPassword(''); }}>
          <DialogContent className="sm:max-w-md">
            <DialogHeader>
              <DialogTitle>Edit User</DialogTitle>
              <DialogDescription>
                Update user information and permissions
              </DialogDescription>
            </DialogHeader>
            <div className="space-y-4 py-4">
              <div className="space-y-2">
                <Label>Username</Label>
                <Input
                  value={editingUser.username}
                  onChange={(e) => setEditingUser({ ...editingUser, username: e.target.value })}
                  placeholder="Enter username"
                  data-testid="input-edit-username"
                />
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label>First Name</Label>
                  <Input
                    value={editingUser.firstName || ''}
                    onChange={(e) => setEditingUser({ ...editingUser, firstName: e.target.value })}
                    placeholder="First name"
                    data-testid="input-edit-firstname"
                  />
                </div>
                <div className="space-y-2">
                  <Label>Last Name</Label>
                  <Input
                    value={editingUser.lastName || ''}
                    onChange={(e) => setEditingUser({ ...editingUser, lastName: e.target.value })}
                    placeholder="Last name"
                    data-testid="input-edit-lastname"
                  />
                </div>
              </div>

              <div className="space-y-2">
                <Label>Email</Label>
                <Input
                  type="email"
                  value={editingUser.email || ''}
                  onChange={(e) => setEditingUser({ ...editingUser, email: e.target.value })}
                  placeholder="user@company.com"
                  data-testid="input-edit-email"
                />
              </div>

              <div className="space-y-2">
                <Label>New Password</Label>
                <Input
                  type="text"
                  value={editPassword}
                  onChange={(e) => setEditPassword(e.target.value)}
                  placeholder="Enter new password to change it"
                  data-testid="input-edit-password"
                />
                <p className="text-xs text-gray-500">
                  Leave blank to keep current password. Minimum 6 characters.
                </p>
              </div>

              <div className="space-y-2">
                <Label>Role</Label>
                <Select
                  value={editingUser.role}
                  onValueChange={(value: 'Admin' | 'Manager' | 'Staff') =>
                    setEditingUser({ ...editingUser, role: value })
                  }
                >
                  <SelectTrigger data-testid="select-edit-role">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="Staff">Staff</SelectItem>
                    <SelectItem value="Manager">Manager</SelectItem>
                    <SelectItem value="Admin">Admin</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              <div className="flex items-center space-x-2">
                <Switch
                  checked={editingUser.active}
                  onCheckedChange={(checked) => setEditingUser({ ...editingUser, active: checked })}
                  data-testid="switch-edit-active"
                />
                <Label>Account Active</Label>
              </div>
            </div>
            <DialogFooter>
              <Button
                type="button"
                variant="outline"
                onClick={() => { setEditingUser(null); setEditPassword(''); }}
                disabled={updateUserMutation.isPending}
              >
                Cancel
              </Button>
              <Button
                onClick={handleUpdateUser}
                disabled={updateUserMutation.isPending || (editPassword.length > 0 && editPassword.length < 6)}
                data-testid="button-confirm-update-user"
              >
                {updateUserMutation.isPending ? 'Updating...' : 'Update User'}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      )}
    </div>
  );
}
