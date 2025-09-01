import React from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { format } from "date-fns";
import { Package, ShoppingCart, Truck, FileText, Clock } from "lucide-react";

export default function RecentActivity({ data }) {
  const getRecentActivity = () => {
    const activities = [
      ...data.purchaseOrders.slice(0, 3).map(po => ({
        type: 'Purchase Order',
        icon: ShoppingCart,
        title: po.po_number,
        subtitle: `${po.currency} ${po.total_amount?.toFixed(2) || '0.00'}`,
        status: po.status,
        date: po.updated_date || po.created_date,
        color: 'bg-emerald-100 text-emerald-800'
      })),
      ...data.deliveryOrders.slice(0, 3).map(dod => ({
        type: 'Delivery Order',
        icon: Truck,
        title: dod.do_number,
        subtitle: `${dod.currency} ${dod.total_amount?.toFixed(2) || '0.00'}`,
        status: dod.status,
        date: dod.updated_date || dod.created_date,
        color: 'bg-amber-100 text-amber-800'
      })),
      ...data.invoices.slice(0, 3).map(inv => ({
        type: 'Invoice',
        icon: FileText,
        title: inv.invoice_number,
        subtitle: `${inv.currency} ${inv.total_amount?.toFixed(2) || '0.00'}`,
        status: inv.status,
        date: inv.updated_date || inv.created_date,
        color: 'bg-purple-100 text-purple-800'
      }))
    ];

    return activities
      .sort((a, b) => new Date(b.date) - new Date(a.date))
      .slice(0, 8);
  };

  const recentActivity = getRecentActivity();

  const getStatusColor = (status) => {
    switch (status?.toLowerCase()) {
      case 'draft': return 'bg-gray-100 text-gray-800';
      case 'confirmed': case 'sent': return 'bg-blue-100 text-blue-800';
      case 'delivered': case 'paid': return 'bg-emerald-100 text-emerald-800';
      case 'cancelled': return 'bg-red-100 text-red-800';
      case 'overdue': return 'bg-red-100 text-red-800';
      case 'in_transit': return 'bg-amber-100 text-amber-800';
      default: return 'bg-gray-100 text-gray-800';
    }
  };

  return (
    <Card className="border-0 shadow-lg">
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Clock className="w-5 h-5" />
          Recent Activity
        </CardTitle>
      </CardHeader>
      <CardContent>
        <div className="space-y-4">
          {recentActivity.length > 0 ? (
            recentActivity.map((activity, index) => (
              <div key={index} className="flex items-center gap-4 p-4 rounded-lg bg-gray-50 hover:bg-gray-100 transition-colors duration-200">
                <div className={`p-2 rounded-lg ${activity.color.replace('text-', 'text-').replace('bg-', 'bg-opacity-20 bg-')}`}>
                  <activity.icon className="w-5 h-5" />
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <p className="font-semibold text-gray-900">{activity.title}</p>
                    <Badge variant="outline" className="text-xs">
                      {activity.type}
                    </Badge>
                  </div>
                  <p className="text-sm text-gray-600">{activity.subtitle}</p>
                </div>
                <div className="text-right">
                  <Badge className={`${getStatusColor(activity.status)} border`}>
                    {activity.status?.replace(/_/g, ' ')}
                  </Badge>
                  <p className="text-xs text-gray-500 mt-1">
                    {activity.date ? format(new Date(activity.date), 'MMM d, HH:mm') : 'No date'}
                  </p>
                </div>
              </div>
            ))
          ) : (
            <div className="text-center py-8 text-gray-500">
              <Clock className="w-12 h-12 mx-auto mb-4 opacity-50" />
              <p>No recent activity to show</p>
            </div>
          )}
        </div>
      </CardContent>
    </Card>
  );
}