import { ReactNode } from 'react';
import { useAuth } from '@/hooks/useAuth';
import { Loader2 } from 'lucide-react';

interface ProtectedRouteProps {
  children: ReactNode;
  requiredRoles?: Array<'Admin' | 'Manager' | 'Staff'>;
}

export function ProtectedRoute({ children, requiredRoles = ['Admin', 'Manager', 'Staff'] }: ProtectedRouteProps) {
  const { isLoading, isAuthenticated, hasRole } = useAuth();

  if (isLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="text-center">
          <Loader2 className="h-8 w-8 animate-spin text-blue-600 mx-auto mb-4" />
          <p className="text-gray-600 dark:text-gray-400">Loading...</p>
        </div>
      </div>
    );
  }

  if (!isAuthenticated) {
    // AuthProvider will handle redirecting to login
    return null;
  }

  if (!hasRole(requiredRoles)) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="text-center">
          <div className="bg-red-100 dark:bg-red-900 text-red-800 dark:text-red-200 px-6 py-4 rounded-lg">
            <h2 className="text-xl font-semibold mb-2">Access Denied</h2>
            <p>You don't have permission to view this page.</p>
          </div>
        </div>
      </div>
    );
  }

  return <>{children}</>;
}