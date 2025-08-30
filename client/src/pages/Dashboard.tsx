import { Package, ShoppingCart, Truck, FileText } from "lucide-react";
import { Layout } from "@/components/Layout";
import { MetricCard } from "@/components/MetricCard";
import { RecentActivity } from "@/components/RecentActivity";

const metrics = [
  {
    title: "Products",
    value: 8,
    trend: { value: "+12%", direction: "up" as const },
    icon: <Package className="w-6 h-6 text-blue-600" />,
    backgroundColor: "bg-blue-50 border-blue-100",
    iconBackgroundColor: "bg-blue-100",
  },
  {
    title: "Purchase Orders",
    value: 3,
    trend: { value: "+8%", direction: "up" as const },
    icon: <ShoppingCart className="w-6 h-6 text-green-600" />,
    backgroundColor: "bg-green-50 border-green-100",
    iconBackgroundColor: "bg-green-100",
  },
  {
    title: "Delivery Orders",
    value: 1,
    trend: { value: "+15%", direction: "up" as const },
    icon: <Truck className="w-6 h-6 text-orange-600" />,
    backgroundColor: "bg-orange-50 border-orange-100",
    iconBackgroundColor: "bg-orange-100",
  },
  {
    title: "Invoices",
    value: 2,
    trend: { value: "-3%", direction: "down" as const },
    icon: <FileText className="w-6 h-6 text-purple-600" />,
    backgroundColor: "bg-purple-50 border-purple-100",
    iconBackgroundColor: "bg-purple-100",
  },
];

export default function Dashboard() {
  return (
    <Layout>
      <div className="mx-auto px-4 sm:px-6 lg:px-8 py-8">
        {/* Page Header */}
        <div className="mb-8">
          <h1 className="text-3xl font-bold text-slate-900" data-testid="page-title">
            Dashboard
          </h1>
        </div>

        {/* Metric Cards */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6 mb-8">
          {metrics.map((metric) => (
            <MetricCard
              key={metric.title}
              title={metric.title}
              value={metric.value}
              trend={metric.trend}
              icon={metric.icon}
              backgroundColor={metric.backgroundColor}
              iconBackgroundColor={metric.iconBackgroundColor}
            />
          ))}
        </div>

        {/* Recent Activity */}
        <RecentActivity />
      </div>
    </Layout>
  );
}
