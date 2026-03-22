import React, { useState, useEffect } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { 
  TrendingUp, 
  Package, 
  ShoppingCart, 
  Truck, 
  FileText,
  AlertTriangle,
  DollarSign,
  Users
} from "lucide-react";
import { Product } from "@/api/entities";
import { PurchaseOrder } from "@/api/entities";
import { DeliveryOrder } from "@/api/entities";
import { Invoice } from "@/api/entities";
import { Customer } from "@/api/entities";
import { Supplier } from "@/api/entities";
import DashboardStats from "../components/dashboard/DashboardStats";
import RecentActivity from "../components/dashboard/RecentActivity";
import LowStockAlert from "../components/dashboard/LowStockAlert";
import QuickActions from "../components/dashboard/QuickActions";

export default function Dashboard() {
  const [data, setData] = useState({
    products: [],
    purchaseOrders: [],
    deliveryOrders: [],
    invoices: [],
    customers: [],
    suppliers: []
  });
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    loadDashboardData();
  }, []);

  const loadDashboardData = async () => {
    try {
      const results = await Promise.allSettled([
        Product.list('-updated_date'),
        PurchaseOrder.list('-updated_date'),
        DeliveryOrder.list('-updated_date'),
        Invoice.list('-updated_date'),
        Customer.list('-updated_date'),
        Supplier.list('-updated_date')
      ]);

      const [products, purchaseOrders, deliveryOrders, invoices, customers, suppliers] =
        results.map(r => {
          if (r.status !== 'fulfilled') return [];
          const v = r.value;
          return Array.isArray(v) ? v : (v?.data ?? []);
        });

      setData({ products, purchaseOrders, deliveryOrders, invoices, customers, suppliers });
    } catch (error) {
      console.error("Error loading dashboard data:", error);
    } finally {
      setLoading(false);
    }
  };

  if (loading) {
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
