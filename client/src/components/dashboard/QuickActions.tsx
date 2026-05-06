import React from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Plus, Package, ShoppingCart, Truck, FileText, ClipboardList } from "lucide-react";
import { Link } from "react-router-dom";
import { createPageUrl } from "@/utils";
import { useAuth } from "@/hooks/useAuth";

export default function QuickActions() {
  const { user } = useAuth();
  const role = user?.role || '';
  // Staff can't reach Purchase Orders (Admin/Manager-only on the server).
  // Hide the quick action so it doesn't 403 on click (Task #429).
  const canSeePO = role === 'Admin' || role === 'Manager';
  // Inventory writes are Admin/Manager-only — Staff lands on a read-only
  // view, so the "New Product" entry would just deceive them.
  const canSeeNewProduct = role === 'Admin' || role === 'Manager';

  const actions = [
    canSeeNewProduct && {
      title: "New Product",
      icon: Package,
      href: createPageUrl("Inventory"),
      color: "bg-blue-500 hover:bg-blue-600"
    },
    canSeePO && {
      title: "New Purchase Order",
      icon: ShoppingCart,
      href: createPageUrl("Purchase Orders"),
      color: "bg-emerald-500 hover:bg-emerald-600"
    },
    {
      title: "New Quotation",
      icon: ClipboardList,
      href: createPageUrl("Quotations"),
      color: "bg-sky-500 hover:bg-sky-600"
    },
    {
      title: "New Invoice",
      icon: FileText,
      href: createPageUrl("Invoices"),
      color: "bg-purple-500 hover:bg-purple-600"
    },
    {
      title: "New Delivery Order",
      icon: Truck,
      href: createPageUrl("Delivery Orders"),
      color: "bg-amber-500 hover:bg-amber-600"
    }
  ].filter(Boolean) as Array<{ title: string; icon: any; href: string; color: string }>;

  return (
    <Card className="border-0 shadow-lg h-full flex flex-col">
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Plus className="w-5 h-5" />
          Quick Actions
        </CardTitle>
      </CardHeader>
      <CardContent>
        <div className="grid grid-cols-1 gap-3">
          {actions.map((action, index) => (
            <Link key={index} to={action.href}>
              <Button 
                className={`w-full justify-start gap-3 ${action.color} text-white border-0 shadow-md hover:shadow-lg transition-all duration-200`}
              >
                <action.icon className="w-4 h-4" />
                {action.title}
              </Button>
            </Link>
          ))}
        </div>
      </CardContent>
    </Card>
  );
}