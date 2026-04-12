
import React, { useState, useEffect } from "react";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Button } from "@/components/ui/button";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Calendar } from "@/components/ui/calendar";
import { Filter, X, Calendar as CalendarIcon, ChevronDown } from "lucide-react";
import { Checkbox } from "@/components/ui/checkbox";
import { Badge } from "@/components/ui/badge";
import { format } from "date-fns";
import { cn } from "@/lib/utils";


export interface CustomDateRange {
  type: "custom";
  startDate: Date;
  endDate: Date;
}

interface DOFiltersProps {
  selectedStatuses: string[];
  setSelectedStatuses: React.Dispatch<React.SetStateAction<string[]>>;
  selectedCustomers: number[];
  setSelectedCustomers: React.Dispatch<React.SetStateAction<number[]>>;
  selectedTaxTreatments: string[];
  setSelectedTaxTreatments: React.Dispatch<React.SetStateAction<string[]>>;
  dateRange: string | CustomDateRange;
  setDateRange: (range: string | CustomDateRange) => void;
  resetPagination: () => void;
  customers?: { id: number; name: string; [key: string]: unknown }[];
}

export default function DOFilters({ selectedStatuses, setSelectedStatuses, selectedCustomers, setSelectedCustomers, selectedTaxTreatments, setSelectedTaxTreatments, dateRange, setDateRange, resetPagination, customers = [] }: DOFiltersProps) {
  const [dateRangeOpen, setDateRangeOpen] = useState(false);
  const [customStartDate, setCustomStartDate] = useState<Date | undefined>(undefined);
  const [customEndDate, setCustomEndDate] = useState<Date | undefined>(undefined);

  const clearFilters = () => {
    setSelectedStatuses([]);
    setSelectedCustomers([]);
    setSelectedTaxTreatments([]);
    setDateRange("all");
    setCustomStartDate(undefined);
    setCustomEndDate(undefined);
    resetPagination();
  };

  const hasActiveFilters = selectedStatuses.length > 0 || selectedCustomers.length > 0 || 
                          selectedTaxTreatments.length > 0 || dateRange !== "all";

  // Get unique values
  const uniqueStatuses = [
    { value: 'draft', label: 'Draft' },
    { value: 'submitted', label: 'Submitted' },
    { value: 'delivered', label: 'Delivered' },
  ];
  const uniqueTaxTreatments = [
    { value: 'StandardRated', label: 'Standard Rated (5%)' },
    { value: 'ZeroRated', label: 'Zero Rated (0%)' },
  ];

  const handleDateRangeChange = (value: string) => {
    if (value !== 'custom') {
      setCustomStartDate(undefined);
      setCustomEndDate(undefined);
    }
    setDateRange(value);
    resetPagination();
  };

  const handleCustomDateRange = () => {
    if (customStartDate && customEndDate) {
      const customRange: CustomDateRange = {
        type: 'custom' as const,
        startDate: customStartDate,
        endDate: customEndDate
      };
      setDateRange(customRange);
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
    <>
      <div className="flex items-center gap-3 flex-wrap">
        <Filter className="w-4 h-4 text-gray-500" />
        
        {/* Status Filter */}
        <Popover>
          <PopoverTrigger asChild>
            <Button variant="outline" className="justify-between w-36">
              {selectedStatuses.length === 0 ? "All Status" : `${selectedStatuses.length} selected`}
              <ChevronDown className="ml-2 h-4 w-4" />
            </Button>
          </PopoverTrigger>
          <PopoverContent className="w-60 p-4">
            <div className="space-y-3">
              <h4 className="font-medium leading-none">Select Status</h4>
              <div className="space-y-2 max-h-60 overflow-y-auto">
                {uniqueStatuses.map(({ value, label }) => (
                  <div key={value} className="flex items-center space-x-2">
                    <Checkbox
                      id={`do-status-${value}`}
                      checked={selectedStatuses.includes(value)}
                      onCheckedChange={(checked) => {
                        if (checked) {
                          setSelectedStatuses((prev: string[]) => [...prev, value]);
                        } else {
                          setSelectedStatuses((prev: string[]) => prev.filter((s: string) => s !== value));
                        }
                        resetPagination();
                      }}
                    />
                    <label
                      htmlFor={`do-status-${value}`}
                      className="text-sm leading-none peer-disabled:cursor-not-allowed peer-disabled:opacity-70 cursor-pointer"
                    >
                      {label}
                    </label>
                  </div>
                ))}
              </div>
            </div>
          </PopoverContent>
        </Popover>

        {/* Customer Filter */}
        <Popover>
          <PopoverTrigger asChild>
            <Button variant="outline" className="justify-between w-48">
              {selectedCustomers.length === 0 ? "All Customers" : `${selectedCustomers.length} selected`}
              <ChevronDown className="ml-2 h-4 w-4" />
            </Button>
          </PopoverTrigger>
          <PopoverContent className="w-60 p-4">
            <div className="space-y-3">
              <h4 className="font-medium leading-none">Select Customers</h4>
              <div className="space-y-2 max-h-60 overflow-y-auto">
                {customers.map((customer: any) => (
                  <div key={customer.id} className="flex items-center space-x-2">
                    <Checkbox
                      id={`do-customer-${customer.id}`}
                      checked={selectedCustomers.includes(customer.id)}
                      onCheckedChange={(checked) => {
                        if (checked) {
                          setSelectedCustomers((prev: number[]) => [...prev, customer.id]);
                        } else {
                          setSelectedCustomers((prev: number[]) => prev.filter((id: number) => id !== customer.id));
                        }
                        resetPagination();
                      }}
                    />
                    <label
                      htmlFor={`do-customer-${customer.id}`}
                      className="text-sm leading-none peer-disabled:cursor-not-allowed peer-disabled:opacity-70 cursor-pointer"
                    >
                      {customer.name}
                    </label>
                  </div>
                ))}
              </div>
            </div>
          </PopoverContent>
        </Popover>

        {/* Tax Treatment Filter */}
        <Popover>
          <PopoverTrigger asChild>
            <Button variant="outline" className="justify-between w-40">
              {selectedTaxTreatments.length === 0 ? "All Tax" : `${selectedTaxTreatments.length} selected`}
              <ChevronDown className="ml-2 h-4 w-4" />
            </Button>
          </PopoverTrigger>
          <PopoverContent className="w-60 p-4">
            <div className="space-y-3">
              <h4 className="font-medium leading-none">Select Tax Treatment</h4>
              <div className="space-y-2 max-h-60 overflow-y-auto">
                {uniqueTaxTreatments.map(({ value, label }) => (
                  <div key={value} className="flex items-center space-x-2">
                    <Checkbox
                      id={`do-tax-${value}`}
                      checked={selectedTaxTreatments.includes(value)}
                      onCheckedChange={(checked) => {
                        if (checked) {
                          setSelectedTaxTreatments((prev: string[]) => [...prev, value]);
                        } else {
                          setSelectedTaxTreatments((prev: string[]) => prev.filter((t: string) => t !== value));
                        }
                        resetPagination();
                      }}
                    />
                    <label
                      htmlFor={`do-tax-${value}`}
                      className="text-sm leading-none peer-disabled:cursor-not-allowed peer-disabled:opacity-70 cursor-pointer"
                    >
                      {label}
                    </label>
                  </div>
                ))}
              </div>
            </div>
          </PopoverContent>
        </Popover>

      <Select value={typeof dateRange === 'object' ? 'custom' : dateRange} onValueChange={handleDateRangeChange}>
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

      {(dateRange === 'custom' || typeof dateRange === 'object') && (
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
                    disabled={(date) => date > new Date() || !!(customEndDate && date > customEndDate)}
                    initialFocus
                  />
                </div>
                <div>
                  <div className="text-xs text-gray-500 mb-2">End Date</div>
                  <Calendar
                    mode="single"
                    selected={customEndDate}
                    onSelect={setCustomEndDate}
                    disabled={(date) => date > new Date() || !!(customStartDate && date < customStartDate)}
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
      
      {/* Active filter badges */}
      {(selectedStatuses.length > 0 || selectedCustomers.length > 0 || selectedTaxTreatments.length > 0) && (
        <div className="flex flex-wrap gap-2">
          {selectedStatuses.map((status: any) => {
            const statusOption = uniqueStatuses.find((s: any) => s.value === status);
            return (
              <Badge key={status} variant="secondary" className="gap-1">
                Status: {statusOption ? statusOption.label : status}
                <X 
                  className="h-3 w-3 cursor-pointer" 
                  onClick={() => {
                    setSelectedStatuses((prev: string[]) => prev.filter((s: string) => s !== status));
                    resetPagination();
                  }}
                />
              </Badge>
            );
          })}
          {selectedCustomers.map((customerId: number) => {
            const customer = customers.find((c: any) => c.id === customerId);
            return (
              <Badge key={customerId} variant="secondary" className="gap-1">
                Customer: {customer?.name}
                <X 
                  className="h-3 w-3 cursor-pointer" 
                  onClick={() => {
                    setSelectedCustomers((prev: number[]) => prev.filter((id: number) => id !== customerId));
                    resetPagination();
                  }}
                />
              </Badge>
            );
          })}
          {selectedTaxTreatments.map((treatment: any) => {
            const taxOption = uniqueTaxTreatments.find((t: any) => t.value === treatment);
            return (
              <Badge key={treatment} variant="secondary" className="gap-1">
                Tax: {taxOption ? taxOption.label : treatment}
                <X 
                  className="h-3 w-3 cursor-pointer" 
                  onClick={() => {
                    setSelectedTaxTreatments((prev: string[]) => prev.filter((t: string) => t !== treatment));
                    resetPagination();
                  }}
                />
              </Badge>
            );
          })}
        </div>
      )}
    </>
  );
}
