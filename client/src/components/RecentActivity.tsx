import { Clock, ShoppingCart, Truck, FileText, Package, ArrowRight } from "lucide-react";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";

interface ActivityItem {
  id: string;
  type: string;
  amount: string;
  status: "closed" | "draft" | "pending";
  timestamp: string;
  icon: "purchase-order" | "delivery-order" | "invoice" | "product";
}

// No mock activities - component will show actual recent activity data when implemented
const mockActivities: ActivityItem[] = [];

const getIcon = (type: ActivityItem["icon"]) => {
  switch (type) {
    case "purchase-order":
      return <ShoppingCart className="w-5 h-5 text-green-600" />;
    case "delivery-order":
      return <Truck className="w-5 h-5 text-orange-600" />;
    case "invoice":
      return <FileText className="w-5 h-5 text-purple-600" />;
    case "product":
      return <Package className="w-5 h-5 text-blue-600" />;
    default:
      return <FileText className="w-5 h-5 text-gray-600" />;
  }
};

const getIconBackground = (type: ActivityItem["icon"]) => {
  switch (type) {
    case "purchase-order":
      return "bg-green-100";
    case "delivery-order":
      return "bg-orange-100";
    case "invoice":
      return "bg-purple-100";
    case "product":
      return "bg-blue-100";
    default:
      return "bg-gray-100";
  }
};

const getStatusBadge = (status: ActivityItem["status"]) => {
  switch (status) {
    case "closed":
      return <Badge className="bg-green-100 text-green-800 hover:bg-green-100">closed</Badge>;
    case "draft":
      return <Badge className="bg-yellow-100 text-yellow-800 hover:bg-yellow-100">draft</Badge>;
    case "pending":
      return <Badge className="bg-slate-100 text-slate-800 hover:bg-slate-100">pending</Badge>;
    default:
      return <Badge variant="secondary">{status}</Badge>;
  }
};

export function RecentActivity() {
  return (
    <Card className="bg-white rounded-xl border border-slate-200 shadow-sm">
      <CardHeader className="px-6 py-4 border-b border-slate-200">
        <div className="flex items-center space-x-2">
          <Clock className="w-5 h-5 text-slate-500" />
          <h2 className="text-lg font-semibold text-slate-900">Recent Activity</h2>
        </div>
      </CardHeader>
      
      <CardContent className="p-0">
        <div className="divide-y divide-slate-100">
          {mockActivities.length === 0 ? (
            <div className="px-6 py-8 text-center text-slate-500">
              <Clock className="w-8 h-8 mx-auto mb-2 text-slate-400" />
              <p>No recent activity</p>
              <p className="text-sm">Activity will appear here when you start creating documents</p>
            </div>
          ) : (
            mockActivities.map((activity) => (
              <div
                key={activity.id}
                className="px-6 py-4 flex items-center justify-between hover:bg-slate-50 transition-colors"
                data-testid={`activity-item-${activity.id}`}
              >
                <div className="flex items-center space-x-4">
                  <div className={`w-10 h-10 ${getIconBackground(activity.icon)} rounded-lg flex items-center justify-center`}>
                    {getIcon(activity.icon)}
                  </div>
                  <div>
                    <div className="flex items-center space-x-2">
                      <span className="font-semibold text-slate-900" data-testid={`activity-id-${activity.id}`}>
                        {activity.id}
                      </span>
                      <span className="text-slate-500 text-sm">{activity.type}</span>
                    </div>
                    <p className="text-slate-600 text-sm">{activity.amount}</p>
                  </div>
                </div>
                <div className="text-right">
                  <div className="flex items-center space-x-2">
                    {getStatusBadge(activity.status)}
                  </div>
                  <p className="text-slate-500 text-sm mt-1">{activity.timestamp}</p>
                </div>
              </div>
            ))
          )}
        </div>

        {/* View All Activity Button */}
        <div className="px-6 py-4 border-t border-slate-200">
          <Button
            variant="ghost"
            className="w-full text-center text-slate-600 hover:text-slate-900 text-sm font-medium py-2 hover:bg-slate-50 transition-colors"
            data-testid="view-all-activity"
          >
            View all activity
            <ArrowRight className="w-4 h-4 ml-1" />
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}
