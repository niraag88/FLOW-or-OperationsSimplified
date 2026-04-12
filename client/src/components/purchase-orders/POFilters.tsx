
import React, { useState, useEffect } from "react";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Button } from "@/components/ui/button";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Calendar } from "@/components/ui/calendar";
import { Filter, X, Calendar as CalendarIcon } from "lucide-react";
import { Brand } from "@/api/entities"; // Changed from Supplier
import { format } from "date-fns";
import { cn } from "@/lib/utils";

interface POFiltersProps {
  filters: Record<string, string>;
  onFiltersChange: React.Dispatch<React.SetStateAction<Record<string, string>>>;
  onFilterChange?: () => void;
}

export default function POFilters({ filters, onFiltersChange, onFilterChange }: POFiltersProps) {
  const [brands, setBrands] = useState<any[]>([]); // Changed from suppliers
  const [dateRangeOpen, setDateRangeOpen] = useState(false);
  const [customStartDate, setCustomStartDate] = useState<any>(null);
  const [customEndDate, setCustomEndDate] = useState<any>(null);

  useEffect(() => {
    loadBrands(); // Changed from loadSuppliers
  }, []);

  const loadBrands = async () => { // Changed from loadSuppliers
    try {
      const brandsData = await Brand.list(); // Changed to Brand
      setBrands(brandsData); // Changed to setBrands
    } catch (error: any) {
      console.error("Error loading brands:", error); // Changed error message
    }
  };

  const handleFilterChange = (field: any, value: any) => {
    onFiltersChange((prev) => ({
      ...prev,
      [field]: value
    }));
    if (onFilterChange) onFilterChange();
  };

  const clearFilters = () => {
    onFiltersChange({
      status: "all",
      supplier: "all",
      dateRange: "all",
      paymentStatus: "all"
    });
    setCustomStartDate(null);
    setCustomEndDate(null);
    if (onFilterChange) onFilterChange();
  };

  const hasActiveFilters = filters.status !== "all" || filters.supplier !== "all" || filters.dateRange !== "all" || (filters.paymentStatus && filters.paymentStatus !== "all");

  const handleDateRangeChange = (value: any) => {
    if (value !== 'custom') {
      // Reset custom dates when switching to preset ranges
      setCustomStartDate(null);
      setCustomEndDate(null);
    }
    handleFilterChange('dateRange', value);
  };

  const handleCustomDateRange = () => {
    if (customStartDate && customEndDate) {
      const customRange = {
        type: 'custom',
        startDate: customStartDate,
        endDate: customEndDate
      };
      handleFilterChange('dateRange', customRange);
      setDateRangeOpen(false);
    }
  };

  const formatCustomDateRange = () => {
    if (customStartDate && customEndDate) {
      return `${format(customStartDate, 'dd/MM')} - ${format(customEndDate, 'dd/MM')}`;
    }
    return 'Pick date range';
  };

  return (
    <div className="flex items-center gap-3 flex-wrap">
      <Filter className="w-4 h-4 text-gray-500" />
      
      <Select value={filters.status} onValueChange={(value) => handleFilterChange('status', value)}>
        <SelectTrigger className="w-32">
          <SelectValue placeholder="Status" />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value="all">All Status</SelectItem>
          <SelectItem value="draft">Draft</SelectItem>
          <SelectItem value="submitted">Submitted</SelectItem>
          <SelectItem value="closed">Closed</SelectItem>
        </SelectContent>
      </Select>

      <Select value={filters.paymentStatus || 'all'} onValueChange={(value) => handleFilterChange('paymentStatus', value)}>
        <SelectTrigger className="w-44">
          <SelectValue placeholder="All Payments" />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value="all">All Payments</SelectItem>
          <SelectItem value="outstanding">Outstanding</SelectItem>
          <SelectItem value="paid">Paid</SelectItem>
        </SelectContent>
      </Select>

      <Select value={filters.supplier} onValueChange={(value) => handleFilterChange('supplier', value)}>
        <SelectTrigger className="w-48">
          <SelectValue placeholder="Brand/Supplier" /> {/* Changed placeholder */}
        </SelectTrigger>
        <SelectContent>
          <SelectItem value="all">All Brands</SelectItem> {/* Changed text */}
          {brands.map((brand: any) => ( // Changed from suppliers to brands
            <SelectItem key={brand.id} value={brand.id}>
              {brand.name}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>

      <Select value={typeof filters.dateRange === 'object' ? 'custom' : filters.dateRange} onValueChange={handleDateRangeChange}>
        <SelectTrigger className="w-32">
          <SelectValue placeholder="Date" />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value="all">All Time</SelectItem>
          <SelectItem value="today">Today</SelectItem>
          <SelectItem value="week">This Week</SelectItem>
          <SelectItem value="month">This Month</SelectItem>
          <SelectItem value="quarter">This Quarter</SelectItem>
          <SelectItem value="custom">Custom Range</SelectItem>
        </SelectContent>
      </Select>

      {/* Custom Date Range Picker */}
      {(filters.dateRange === 'custom' || typeof filters.dateRange === 'object') && (
        <Popover open={dateRangeOpen} onOpenChange={setDateRangeOpen}>
          <PopoverTrigger asChild>
            <Button
              variant="outline"
              className={cn(
                "w-48 justify-start text-left font-normal",
                !customStartDate && !customEndDate && "text-muted-foreground"
              )}
            >
              <CalendarIcon className="mr-2 h-4 w-4" />
              {formatCustomDateRange()}
            </Button>
          </PopoverTrigger>
          <PopoverContent className="w-auto p-4" align="start">
            <div className="space-y-4">
              <div className="text-sm font-medium">Select Date Range</div>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <div className="text-xs text-gray-500 mb-2">Start Date</div>
                  <Calendar
                    mode="single"
                    selected={customStartDate}
                    onSelect={setCustomStartDate}
                    disabled={(date) => date > new Date() || (customEndDate && date > customEndDate)}
                    initialFocus
                  />
                </div>
                <div>
                  <div className="text-xs text-gray-500 mb-2">End Date</div>
                  <Calendar
                    mode="single"
                    selected={customEndDate}
                    onSelect={setCustomEndDate}
                    disabled={(date) => date > new Date() || (customStartDate && date < customStartDate)}
                    initialFocus
                  />
                </div>
              </div>
              <div className="flex justify-end gap-2 pt-2 border-t">
                <Button variant="outline" size="sm" onClick={() => setDateRangeOpen(false)}>Cancel</Button>
                <Button size="sm"
                  onClick={handleCustomDateRange}
                  disabled={!customStartDate || !customEndDate}
                >
                  Apply
                </Button>
              </div>
            </div>
          </PopoverContent>
        </Popover>
      )}

      {hasActiveFilters && (
        <Button variant="ghost" size="sm" onClick={clearFilters}>
          <X className="w-4 h-4" />
        </Button>
      )}
    </div>
  );
}
