import { Badge } from "@/components/ui/badge";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { AlertTriangle, CheckCircle2 } from "lucide-react";

export const getStatusColor = (status: string) => {
  switch (status?.toLowerCase()) {
    case 'draft': return 'bg-gray-100 text-gray-800';
    case 'submitted': return 'bg-blue-100 text-blue-800';
    case 'closed': return 'bg-green-100 text-green-800';
    default: return 'bg-gray-100 text-gray-800';
  }
};

interface DeliveryBadgeProps {
  ordQty: number;
  recQty: number;
}

export function DeliveryBadge({ ordQty, recQty }: DeliveryBadgeProps) {
  if (ordQty <= 0) return null;
  const isPartial = recQty < ordQty;
  if (isPartial) {
    return (
      <Tooltip>
        <TooltipTrigger asChild>
          <span className="inline-flex items-center gap-0.5 text-xs font-semibold text-amber-800 bg-amber-100 border border-amber-300 rounded px-1.5 py-0.5 cursor-default">
            <AlertTriangle className="w-3 h-3" />Partial
          </span>
        </TooltipTrigger>
        <TooltipContent side="top">
          <p className="text-xs">{recQty} of {ordQty} units received</p>
        </TooltipContent>
      </Tooltip>
    );
  }
  return (
    <span className="inline-flex items-center gap-0.5 text-xs font-semibold text-green-800 bg-green-100 border border-green-300 rounded px-1.5 py-0.5">
      <CheckCircle2 className="w-3 h-3" />Complete
    </span>
  );
}

interface StatusPillProps {
  status?: string | null;
  closed?: boolean;
}

export function StatusPill({ status, closed }: StatusPillProps) {
  return (
    <Badge
      variant="outline"
      className={closed
        ? "border-green-300 text-green-800 bg-green-50"
        : "border-blue-300 text-blue-800 bg-blue-50"
      }
    >
      {status?.toUpperCase()}
    </Badge>
  );
}
