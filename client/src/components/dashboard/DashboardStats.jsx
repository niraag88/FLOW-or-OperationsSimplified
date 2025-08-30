import React from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { 
  Package, 
  ShoppingCart, 
  Truck, 
  FileText,
  TrendingUp,
  TrendingDown
} from "lucide-react";

export default function DashboardStats({ data }) {
  const stats = [
    {
      title: "Products",
      value: data.products.length,
      icon: Package,
      color: "bg-blue-500",
      change: "+12%",
      changeType: "increase"
    },
    {
      title: "Purchase Orders",
      value: data.purchaseOrders.length,
      icon: ShoppingCart,
      color: "bg-emerald-500",
      change: "+8%",
      changeType: "increase"
    },
    {
      title: "Delivery Orders",
      value: data.deliveryOrders.length,
      icon: Truck,
      color: "bg-amber-500",
      change: "+15%",
      changeType: "increase"
    },
    {
      title: "Invoices",
      value: data.invoices.length,
      icon: FileText,
      color: "bg-purple-500",
      change: "-3%",
      changeType: "decrease"
    }
  ];

  const totalValue = data.invoices.reduce((sum, inv) => sum + (inv.total_amount || 0), 0);

  return (
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
              {stat.changeType === 'increase' ? (
                <TrendingUp className="w-4 h-4 text-emerald-500 mr-1" />
              ) : (
                <TrendingDown className="w-4 h-4 text-red-500 mr-1" />
              )}
              <span className={`text-xs font-medium ${
                stat.changeType === 'increase' ? 'text-emerald-600' : 'text-red-600'
              }`}>
                {stat.change}
              </span>
              <span className="text-xs text-gray-500 ml-1">this month</span>
            </div>
          </CardContent>
        </Card>
      ))}
    </div>
  );
}