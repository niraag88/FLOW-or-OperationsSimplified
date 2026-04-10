import React from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { format, subDays, isAfter, parseISO } from "date-fns";
import { ShoppingCart, Truck, FileText, Clock } from "lucide-react";

interface RecentActivityProps {
  data: Record<string, unknown[]>;
}

export default function RecentActivity({ data }: RecentActivityProps) {
  const sevenDaysAgo = subDays(new Date(), 7);

  const parseDate = (val: any) => {
    if (!val) return null;
    const d = typeof val === 'string' ? parseISO(val) : new Date(val);
    return isNaN(d.getTime()) ? null : d;
  };

  const getRecentActivity = () => {
    const activities = [
      ...data.purchaseOrders.map((po: any) => {
        const date = parseDate(po.updatedAt || po.createdAt);
        const totalAmt = parseFloat(po.grandTotal || po.totalAmount || 0);
        return {
          type: 'Purchase Order',
          icon: ShoppingCart,
          docNumber: po.poNumber,
          party: po.supplierName || po.brandName || '—',
          amount: totalAmt > 0 ? `AED ${totalAmt.toFixed(2)}` : null,
          status: po.status,
          date,
          color: 'bg-emerald-100 text-emerald-700'
        };
      }),
      ...data.deliveryOrders.map((dod: any) => {
        const date = parseDate(dod.createdAt);
        const totalAmt = parseFloat(dod.total_amount || dod.totalAmount || 0);
        return {
          type: 'Delivery Order',
          icon: Truck,
          docNumber: dod.do_number || dod.orderNumber,
          party: dod.customer_name || dod.customerName || '—',
          amount: totalAmt > 0 ? `AED ${totalAmt.toFixed(2)}` : null,
          status: dod.status,
          date,
          color: 'bg-amber-100 text-amber-700'
        };
      }),
      ...data.invoices.map((inv: any) => {
        const date = parseDate(inv.createdAt);
        const base = parseFloat(inv.amount || 0);
        const vat = parseFloat(inv.vatAmount || inv.vat_amount || 0);
        const total = base + vat;
        return {
          type: 'Invoice',
          icon: FileText,
          docNumber: inv.invoiceNumber || inv.invoice_number,
          party: inv.customerName || inv.customer_name || '—',
          amount: total > 0 ? `AED ${total.toFixed(2)}` : null,
          status: inv.status,
          date,
          color: 'bg-purple-100 text-purple-700'
        };
      })
    ];

    return activities
      .filter((a: any) => a.date && isAfter(a.date, sevenDaysAgo))
      .sort((a: any, b: any) => b.date - a.date)
      .slice(0, 15);
  };

  const recentActivity = getRecentActivity();

  const getStatusColor = (status: any) => {
    switch (status?.toLowerCase()) {
      case 'draft': return 'bg-gray-100 text-gray-700 border-gray-200';
      case 'confirmed': case 'sent': case 'submitted': return 'bg-blue-100 text-blue-700 border-blue-200';
      case 'delivered': case 'paid': return 'bg-emerald-100 text-emerald-700 border-emerald-200';
      case 'cancelled': return 'bg-red-100 text-red-700 border-red-200';
      case 'in_transit': return 'bg-amber-100 text-amber-700 border-amber-200';
      case 'partially_received': return 'bg-orange-100 text-orange-700 border-orange-200';
      default: return 'bg-gray-100 text-gray-700 border-gray-200';
    }
  };

  return (
    <Card className="border-0 shadow-lg">
      <CardHeader className="pb-3">
        <CardTitle className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Clock className="w-5 h-5" />
            Recent Activity
          </div>
          <span className="text-xs font-normal text-gray-400">Last 7 days</span>
        </CardTitle>
      </CardHeader>
      <CardContent className="pt-0">
        {recentActivity.length > 0 ? (
          <div className="overflow-y-auto max-h-80 space-y-2 pr-1">
            {recentActivity.map((activity, index) => (
              <div
                key={index}
                className="flex items-center gap-3 p-3 rounded-lg bg-gray-50 hover:bg-gray-100 transition-colors duration-150"
              >
                <div className={`p-2 rounded-lg flex-shrink-0 ${activity.color}`}>
                  <activity.icon className="w-4 h-4" />
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="font-semibold text-gray-900 text-sm">{activity.docNumber}</span>
                    <Badge variant="outline" className="text-xs py-0 h-5">
                      {activity.type}
                    </Badge>
                  </div>
                  <p className="text-xs text-gray-500 truncate mt-0.5">
                    {activity.party}
                    {activity.amount ? <span className="ml-2 font-medium text-gray-700">{activity.amount}</span> : null}
                  </p>
                </div>
                <div className="text-right flex-shrink-0">
                  <Badge className={`text-xs border ${getStatusColor(activity.status)}`}>
                    {activity.status?.replace(/_/g, ' ')}
                  </Badge>
                  <p className="text-xs text-gray-400 mt-1">
                    {activity.date ? format(new Date(activity.date as string | number | Date), 'dd/MM/yy') : ''}
                  </p>
                </div>
              </div>
            ))}
          </div>
        ) : (
          <div className="text-center py-8 text-gray-400">
            <Clock className="w-10 h-10 mx-auto mb-3 opacity-40" />
            <p className="text-sm">No activity in the last 7 days</p>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
