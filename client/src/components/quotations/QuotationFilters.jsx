
import React, { useState, useEffect } from "react";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Button } from "@/components/ui/button";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Calendar } from "@/components/ui/calendar";
import { Filter, X, Calendar as CalendarIcon } from "lucide-react";
import { Customer } from "@/api/entities";
import { format } from "date-fns";
import { cn } from "@/lib/utils";

export default function QuotationFilters({ filters, onFiltersChange, onFilterChange }) {
  const [customers, setCustomers] = useState([]);
  const [dateRangeOpen, setDateRangeOpen] = useState(false);
  const [customStartDate, setCustomStartDate] = useState(null);
  const [customEndDate, setCustomEndDate] = useState(null);

  useEffect(() => {
    loadCustomers();
  }, []);

  const loadCustomers = async () => {
    try {
      const customersData = await Customer.list();
      setCustomers(customersData);
    } catch (error) {
      console.error("Error loading customers:", error);
    }
  };

  const handleFilterChange = (field, value) => {
    onFiltersChange(prev => ({
      ...prev,
      [field]: value
    }));
    if (onFilterChange) onFilterChange();
  };

  const clearFilters = () => {
    onFiltersChange({
      status: "all",
      customer: "all",
      dateRange: "all",
    });
    setCustomStartDate(null);
    setCustomEndDate(null);
    if (onFilterChange) onFilterChange();
  };

  const hasActiveFilters = filters.status !== "all" || filters.customer !== "all" || filters.dateRange !== "all";

  const handleDateRangeChange = (value) => {
    if (value !== 'custom') {
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
      return `${format(customStartDate, 'MMM dd')} - ${format(customEndDate, 'MMM dd')}`;
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
          <SelectItem value="draft">DRAFT</SelectItem>
          <SelectItem value="submitted">SUBMITTED</SelectItem>
        </SelectContent>
      </Select>

      <Select value={filters.customer} onValueChange={(value) => handleFilterChange('customer', value)}>
        <SelectTrigger className="w-48">
          <SelectValue placeholder="Customer" />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value="all">All Customers</SelectItem>
          {customers.map(customer => (
            <SelectItem key={customer.id} value={customer.id}>
              {customer.customer_name}
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
              <div className="grid grid-cols-2 gap-4">
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
                <Button 
                  size="sm" 
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
