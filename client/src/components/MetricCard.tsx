import { ReactNode } from "react";
import { TrendingUp, TrendingDown } from "lucide-react";
import { Card } from "@/components/ui/card";

interface MetricCardProps {
  title: string;
  value: string | number;
  trend: {
    value: string;
    direction: "up" | "down";
  };
  icon: ReactNode;
  backgroundColor: string;
  iconBackgroundColor: string;
}

export function MetricCard({
  title,
  value,
  trend,
  icon,
  backgroundColor,
  iconBackgroundColor,
}: MetricCardProps) {
  const TrendIcon = trend.direction === "up" ? TrendingUp : TrendingDown;
  const trendColor = trend.direction === "up" ? "text-green-600" : "text-red-600";

  return (
    <Card className={`${backgroundColor} rounded-xl p-6 border`} data-testid={`metric-card-${title.toLowerCase().replace(/\s+/g, '-')}`}>
      <div className="flex items-center justify-between mb-4">
        <div className={`w-12 h-12 ${iconBackgroundColor} rounded-lg flex items-center justify-center`}>
          {icon}
        </div>
      </div>
      <div className="space-y-2">
        <p className="text-slate-600 text-sm font-medium">{title}</p>
        <p className="text-3xl font-bold text-slate-900" data-testid={`metric-value-${title.toLowerCase().replace(/\s+/g, '-')}`}>
          {value}
        </p>
        <div className="flex items-center text-sm">
          <TrendIcon className={`w-4 h-4 ${trendColor} mr-1`} />
          <span className={`${trendColor} font-medium`}>{trend.value}</span>
          <span className="text-slate-500 ml-1">this month</span>
        </div>
      </div>
    </Card>
  );
}
