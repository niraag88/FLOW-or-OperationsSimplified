import { useQueries } from "@tanstack/react-query";
import { Card, CardHeader } from "@/components/ui/card";
import DashboardStats from "../components/dashboard/DashboardStats";
import RecentActivity from "../components/dashboard/RecentActivity";
import LowStockAlert from "../components/dashboard/LowStockAlert";
import QuickActions from "../components/dashboard/QuickActions";

const DASHBOARD_QUERIES = [
  { queryKey: ["/api/products"] },
  { queryKey: ["/api/purchase-orders"] },
  { queryKey: ["/api/delivery-orders"] },
  { queryKey: ["/api/invoices"] },
  { queryKey: ["/api/customers"] },
  { queryKey: ["/api/suppliers"] },
];

function extractArray(result) {
  if (!result) return [];
  if (Array.isArray(result)) return result;
  return result?.data ?? [];
}

export default function Dashboard() {
  const results = useQueries({ queries: DASHBOARD_QUERIES });

  const isLoading = results.some((r) => r.isLoading);

  const [products, purchaseOrders, deliveryOrders, invoices, customers, suppliers] =
    results.map((r) => extractArray(r.data));

  const data = { products, purchaseOrders, deliveryOrders, invoices, customers, suppliers };

  if (isLoading) {
    return (
      <div className="space-y-8">
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
          {[...Array(4)].map((_, i) => (
            <Card key={i} className="animate-pulse">
              <CardHeader className="space-y-0 pb-2">
                <div className="h-4 bg-gray-200 rounded w-1/2"></div>
                <div className="h-8 bg-gray-200 rounded w-3/4 mt-2"></div>
              </CardHeader>
            </Card>
          ))}
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-8">
      {/* Stats Overview */}
      <DashboardStats data={data} />

      {/* Quick Actions + Low Stock */}
      <div className="grid grid-cols-1 xl:grid-cols-3 gap-8">
        <div className="xl:col-span-2">
          <QuickActions />
        </div>
        <div>
          <LowStockAlert products={data.products} />
        </div>
      </div>

      {/* Recent Activity — full width below */}
      <RecentActivity data={data} />
    </div>
  );
}
