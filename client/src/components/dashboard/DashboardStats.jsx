import React from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { 
  Package, 
  ShoppingCart, 
  Truck, 
  FileText,
  TrendingUp,
  TrendingDown,
  Minus,
  CheckCircle,
  Clock
} from "lucide-react";

const getMonthBounds = (monthOffset = 0) => {
  const now = new Date();
  const start = new Date(now.getFullYear(), now.getMonth() + monthOffset, 1);
  const end = new Date(now.getFullYear(), now.getMonth() + monthOffset + 1, 1);
  return { start, end };
};

const countInMonth = (items, monthOffset) => {
  const { start, end } = getMonthBounds(monthOffset);
  return items.filter(item => {
    const d = new Date(item.createdAt || item.created_at);
    return !isNaN(d) && d >= start && d < end;
  }).length;
};

const computeChange = (items) => {
  const thisMonth = countInMonth(items, 0);
  const lastMonth = countInMonth(items, -1);
  const diff = thisMonth - lastMonth;

  if (lastMonth === 0 && thisMonth > 0) {
    return { label: "New", type: "increase" };
  }
  if (diff > 0) {
    return { label: `+${diff}`, type: "increase" };
  }
  if (diff < 0) {
    return { label: `${diff}`, type: "decrease" };
  }
  return { label: "No change", type: "neutral" };
};

export default function DashboardStats({ data }) {
  const stats = [
    {
      title: "Products",
      value: data.products.length,
      icon: Package,
      color: "bg-blue-500",
      items: data.products
    },
    {
      title: "Purchase Orders",
      value: data.purchaseOrders.length,
      icon: ShoppingCart,
      color: "bg-emerald-500",
      items: data.purchaseOrders
    },
    {
      title: "Delivery Orders",
      value: data.deliveryOrders.length,
      icon: Truck,
      color: "bg-amber-500",
      items: data.deliveryOrders
    },
    {
      title: "Invoices",
      value: data.invoices.length,
      icon: FileText,
      color: "bg-purple-500",
      items: data.invoices
    }
  ].map(s => ({ ...s, ...computeChange(s.items) }));

  const invoicePayment = data.summary?.invoicePayment || { outstanding: 0, paid: 0 };
  const poPayment = data.summary?.poPayment || { outstanding: 0, paid: 0 };

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
        {stats.map((stat, index) => (
          <Card key={index} className="relative overflow-hidden border-0 shadow-lg bg-gradient-to-br from-white to-gray-50">
            <div className={`absolute top-0 right-0 w-32 h-32 transform translate-x-8 -translate-y-8 ${stat.color} rounded-full opacity-10`} />
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium text-gray-600">
                {stat.title}
              </CardTitle>
              <div className={`p-2 rounded-lg ${stat.color} bg-opacity-10`}>
                <stat.icon className={`w-4 h-4 ${stat.color.replace('bg-', 'text-')}`} />
              </div>
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold text-gray-900">
                {stat.value.toLocaleString()}
              </div>
              <div className="flex items-center mt-1">
                {stat.type === 'increase' ? (
                  <TrendingUp className="w-4 h-4 text-emerald-500 mr-1 flex-shrink-0" />
                ) : stat.type === 'decrease' ? (
                  <TrendingDown className="w-4 h-4 text-red-500 mr-1 flex-shrink-0" />
                ) : (
                  <Minus className="w-4 h-4 text-gray-400 mr-1 flex-shrink-0" />
                )}
                <span className={`text-xs font-medium ${
                  stat.type === 'increase' ? 'text-emerald-600' :
                  stat.type === 'decrease' ? 'text-red-600' :
                  'text-gray-400'
                }`}>
                  {stat.label}
                </span>
                <span className="text-xs text-gray-500 ml-1">this month</span>
              </div>
            </CardContent>
          </Card>
        ))}
      </div>

      {/* Payment Status Summary Row */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <Card className="border-0 shadow-md">
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium text-gray-600 flex items-center gap-2">
              <FileText className="w-4 h-4 text-purple-500" />
              Invoice Payment Status
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="flex items-center gap-4">
              <div className="flex items-center gap-2">
                <Clock className="w-4 h-4 text-amber-500" />
                <span className="text-lg font-bold text-amber-600">{invoicePayment.outstanding.toLocaleString()}</span>
                <Badge className="bg-amber-100 text-amber-800 border border-amber-200 text-xs">OUTSTANDING</Badge>
              </div>
              <div className="flex items-center gap-2">
                <CheckCircle className="w-4 h-4 text-green-500" />
                <span className="text-lg font-bold text-green-600">{invoicePayment.paid.toLocaleString()}</span>
                <Badge className="bg-green-100 text-green-800 border border-green-200 text-xs">PAID</Badge>
              </div>
            </div>
          </CardContent>
        </Card>

        <Card className="border-0 shadow-md">
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium text-gray-600 flex items-center gap-2">
              <ShoppingCart className="w-4 h-4 text-emerald-500" />
              Purchase Order Payment Status
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="flex items-center gap-4">
              <div className="flex items-center gap-2">
                <Clock className="w-4 h-4 text-amber-500" />
                <span className="text-lg font-bold text-amber-600">{poPayment.outstanding.toLocaleString()}</span>
                <Badge className="bg-amber-100 text-amber-800 border border-amber-200 text-xs">OUTSTANDING</Badge>
              </div>
              <div className="flex items-center gap-2">
                <CheckCircle className="w-4 h-4 text-green-500" />
                <span className="text-lg font-bold text-green-600">{poPayment.paid.toLocaleString()}</span>
                <Badge className="bg-green-100 text-green-800 border border-green-200 text-xs">PAID</Badge>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
