import { ReactNode } from 'react';
import { useAuth } from '@/hooks/useAuth';
import { Loader2, ShieldX } from 'lucide-react';
import Layout from '@/pages/Layout';

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
      <Layout>
        <div className="flex items-center justify-center min-h-[400px]">
          <div className="text-center max-w-md mx-auto">
            <div className="bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-lg p-8">
              <ShieldX className="h-16 w-16 text-red-500 dark:text-red-400 mx-auto mb-4" />
              <h2 className="text-2xl font-semibold text-red-800 dark:text-red-300 mb-2">Access Denied</h2>
              <p className="text-red-600 dark:text-red-400 mb-4">
                You don't have permission to view this page. Your current role doesn't allow access to this section.
              </p>
              <p className="text-sm text-red-500 dark:text-red-400">
                Contact your administrator if you believe this is an error.
              </p>
            </div>
          </div>
        </div>
      </Layout>
    );
  }

  return <>{children}</>;
}