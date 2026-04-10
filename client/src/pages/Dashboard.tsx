import { useQuery } from "@tanstack/react-query";
import { Card, CardHeader } from "@/components/ui/card";
import DashboardStats from "../components/dashboard/DashboardStats";
import RecentActivity from "../components/dashboard/RecentActivity";
import LowStockAlert from "../components/dashboard/LowStockAlert";
import QuickActions from "../components/dashboard/QuickActions";

const STALE_5MIN = 5 * 60 * 1000;

function extractArray(value) {
  if (!value) return [];
  if (Array.isArray(value)) return value;
  return value?.data ?? [];
}

export default function Dashboard() {
  // Primary dashboard query — fetches products, POs, customers, suppliers,
  // goodsReceipts, companySettings and pre-calculated payment summary in one call
  const { data: dashboardData, isLoading: dashLoading } = useQuery<any>({
    queryKey: ["/api/dashboard"],
    staleTime: STALE_5MIN,
  });

  // Invoices fetched separately — /api/dashboard returns invoices: [] as any[]
  // DashboardStats requires the real array to compute payment counts
  const { data: invoicesRaw, isLoading: invoicesLoading } = useQuery({
    queryKey: ["/api/invoices"],
    staleTime: STALE_5MIN,
  });

  // Delivery orders fetched separately — not included in /api/dashboard
  const { data: deliveryOrdersRaw, isLoading: dosLoading } = useQuery({
    queryKey: ["/api/delivery-orders"],
    staleTime: STALE_5MIN,
  });

  const isLoading = dashLoading || invoicesLoading || dosLoading;

  const lowStockThreshold = parseInt(dashboardData?.companySettings?.lowStockThreshold) || 6;

  const data = {
    products:       extractArray(dashboardData?.products),
    purchaseOrders: extractArray(dashboardData?.purchaseOrders),
    deliveryOrders: extractArray(deliveryOrdersRaw),
    invoices:       extractArray(invoicesRaw),
    customers:      extractArray(dashboardData?.customers),
    suppliers:      extractArray(dashboardData?.suppliers),
    summary:        dashboardData?.summary ?? null,
  };

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
      <div className="grid grid-cols-1 xl:grid-cols-3 gap-8 items-stretch">
        <div className="xl:col-span-2 flex flex-col">
          <QuickActions />
        </div>
        <div className="flex flex-col">
          <LowStockAlert products={data.products} lowStockThreshold={lowStockThreshold} />
        </div>
      </div>

      {/* Recent Activity — full width below */}
      <RecentActivity data={data} />
    </div>
  );
}
