import React from "react";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";

interface PaginationControlsProps {
  paginationData: { totalItems: number; totalPages: number; startIndex?: number; endIndex?: number };
  currentPage: number;
  setPage: React.Dispatch<React.SetStateAction<number>>;
  perPage: number;
  setPerPage: React.Dispatch<React.SetStateAction<number>>;
  itemName: string;
}

export function PaginationControls({ paginationData, currentPage, setPage, perPage, setPerPage, itemName }: PaginationControlsProps) {
  if (paginationData.totalItems === 0) return null;

  return (
    <div className="flex items-center justify-between mt-6 pt-4 border-t">
      <div className="flex items-center gap-2">
        <span className="text-sm text-gray-700">
          Showing {(paginationData.startIndex ?? 0) + 1} to {paginationData.endIndex ?? paginationData.totalItems} of {paginationData.totalItems} {itemName}
        </span>
      </div>

      <div className="flex items-center gap-4">
        {/* Items per page selector */}
        <div className="flex items-center gap-2">
          <span className="text-sm text-gray-700">Show:</span>
          <Select
            value={perPage >= paginationData.totalItems ? "all" : perPage.toString()}
            onValueChange={(value) => {
              setPerPage(value === "all" ? paginationData.totalItems : Number(value));
              setPage(1);
            }}
          >
            <SelectTrigger className="w-20">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="20">20</SelectItem>
              <SelectItem value="50">50</SelectItem>
              <SelectItem value="100">100</SelectItem>
              <SelectItem value="all">All</SelectItem>
            </SelectContent>
          </Select>
        </div>

        {/* Page navigation */}
        {paginationData.totalPages > 1 && (
          <div className="flex items-center gap-2">
            <Button
              variant="outline"
              size="sm"
              onClick={() => setPage((prev: number) => Math.max(1, prev - 1))}
              disabled={currentPage === 1}
            >
              Previous
            </Button>

            <div className="flex items-center gap-1">
              {Array.from({ length: Math.min(5, paginationData.totalPages) }, (_, i) => {
                let pageNumber;
                if (paginationData.totalPages <= 5) {
                  pageNumber = i + 1;
                } else if (currentPage <= 3) {
                  pageNumber = i + 1;
                } else if (currentPage >= paginationData.totalPages - 2) {
                  pageNumber = paginationData.totalPages - 4 + i;
                } else {
                  pageNumber = currentPage - 2 + i;
                }

                return (
                  <Button
                    key={pageNumber}
                    variant={currentPage === pageNumber ? "default" : "outline"}
                                          size="sm"
                    className="w-8 h-8 p-0"
                    onClick={() => setPage(pageNumber)}
                  >
                    {pageNumber}
                  </Button>
                );
              })}
            </div>

            <Button
              variant="outline"
              size="sm"
              onClick={() => setPage((prev: number) => Math.min(paginationData.totalPages, prev + 1))}
              disabled={currentPage === paginationData.totalPages}
            >
              Next
            </Button>
          </div>
        )}
      </div>
    </div>
  );
}
