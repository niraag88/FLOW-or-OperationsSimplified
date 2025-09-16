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

export default function InvoiceFilters({ selectedStatuses, setSelectedStatuses, selectedCustomers, setSelectedCustomers, selectedCurrencies, setSelectedCurrencies, selectedTaxTreatments, setSelectedTaxTreatments, dateRange, setDateRange, resetPagination, customers = [] }) {
  const [dateRangeOpen, setDateRangeOpen] = useState(false);
  const [customStartDate, setCustomStartDate] = useState(null);
  const [customEndDate, setCustomEndDate] = useState(null);

  const clearFilters = () => {
    setSelectedStatuses([]);
    setSelectedCustomers([]);
    setSelectedCurrencies([]);
    setSelectedTaxTreatments([]);
    setDateRange("all");
    setCustomStartDate(null);
    setCustomEndDate(null);
    resetPagination();
  };

  const hasActiveFilters = selectedStatuses.length > 0 || selectedCustomers.length > 0 || 
                          selectedCurrencies.length > 0 || selectedTaxTreatments.length > 0 || 
                          dateRange !== "all";

  // Get unique values
  const uniqueStatuses = ['draft', 'submitted'];
  const uniqueCurrencies = ['AED']; // Invoices are AED-only per business requirements
  const uniqueTaxTreatments = ['standard', 'exempt', 'reverse_charge'];

  const handleDateRangeChange = (value) => {
    if (value !== 'custom') {
      setCustomStartDate(null);
      setCustomEndDate(null);
    }
    setDateRange(value);
    resetPagination();
  };

  const handleCustomDateRange = () => {
    if (customStartDate && customEndDate) {
      const customRange = {
        type: 'custom',
        startDate: customStartDate,
        endDate: customEndDate
      };
      setDateRange(customRange);
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
                {uniqueStatuses.map(status => (
                  <div key={status} className="flex items-center space-x-2">
                    <Checkbox
                      id={`invoice-status-${status}`}
                      checked={selectedStatuses.includes(status)}
                      onCheckedChange={(checked) => {
                        if (checked) {
                          setSelectedStatuses(prev => [...prev, status]);
                        } else {
                          setSelectedStatuses(prev => prev.filter(s => s !== status));
                        }
                        resetPagination();
                      }}
                    />
                    <label
                      htmlFor={`invoice-status-${status}`}
                      className="text-sm leading-none peer-disabled:cursor-not-allowed peer-disabled:opacity-70 cursor-pointer capitalize"
                    >
                      {status}
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
                {customers.map(customer => (
                  <div key={customer.id} className="flex items-center space-x-2">
                    <Checkbox
                      id={`invoice-customer-${customer.id}`}
                      checked={selectedCustomers.includes(customer.id)}
                      onCheckedChange={(checked) => {
                        if (checked) {
                          setSelectedCustomers(prev => [...prev, customer.id]);
                        } else {
                          setSelectedCustomers(prev => prev.filter(id => id !== customer.id));
                        }
                        resetPagination();
                      }}
                    />
                    <label
                      htmlFor={`invoice-customer-${customer.id}`}
                      className="text-sm leading-none peer-disabled:cursor-not-allowed peer-disabled:opacity-70 cursor-pointer"
                    >
                      {customer.customer_name}
                    </label>
                  </div>
                ))}
              </div>
            </div>
          </PopoverContent>
        </Popover>

        {/* Currency Filter */}
        <Popover>
          <PopoverTrigger asChild>
            <Button variant="outline" className="justify-between w-36">
              {selectedCurrencies.length === 0 ? "All Currencies" : `${selectedCurrencies.length} selected`}
              <ChevronDown className="ml-2 h-4 w-4" />
            </Button>
          </PopoverTrigger>
          <PopoverContent className="w-60 p-4">
            <div className="space-y-3">
              <h4 className="font-medium leading-none">Select Currencies</h4>
              <div className="space-y-2 max-h-60 overflow-y-auto">
                {uniqueCurrencies.map(currency => (
                  <div key={currency} className="flex items-center space-x-2">
                    <Checkbox
                      id={`invoice-currency-${currency}`}
                      checked={selectedCurrencies.includes(currency)}
                      onCheckedChange={(checked) => {
                        if (checked) {
                          setSelectedCurrencies(prev => [...prev, currency]);
                        } else {
                          setSelectedCurrencies(prev => prev.filter(c => c !== currency));
                        }
                        resetPagination();
                      }}
                    />
                    <label
                      htmlFor={`invoice-currency-${currency}`}
                      className="text-sm leading-none peer-disabled:cursor-not-allowed peer-disabled:opacity-70 cursor-pointer"
                    >
                      {currency}
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
                {uniqueTaxTreatments.map(treatment => (
                  <div key={treatment} className="flex items-center space-x-2">
                    <Checkbox
                      id={`invoice-tax-${treatment}`}
                      checked={selectedTaxTreatments.includes(treatment)}
                      onCheckedChange={(checked) => {
                        if (checked) {
                          setSelectedTaxTreatments(prev => [...prev, treatment]);
                        } else {
                          setSelectedTaxTreatments(prev => prev.filter(t => t !== treatment));
                        }
                        resetPagination();
                      }}
                    />
                    <label
                      htmlFor={`invoice-tax-${treatment}`}
                      className="text-sm leading-none peer-disabled:cursor-not-allowed peer-disabled:opacity-70 cursor-pointer capitalize"
                    >
                      {treatment.replace('_', ' ')}
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
      
      {/* Active filter badges */}
      {(selectedStatuses.length > 0 || selectedCustomers.length > 0 || selectedCurrencies.length > 0 || selectedTaxTreatments.length > 0) && (
        <div className="flex flex-wrap gap-2">
          {selectedStatuses.map(status => (
            <Badge key={status} variant="secondary" className="gap-1">
              Status: {status}
              <X 
                className="h-3 w-3 cursor-pointer" 
                onClick={() => {
                  setSelectedStatuses(prev => prev.filter(s => s !== status));
                  resetPagination();
                }}
              />
            </Badge>
          ))}
          {selectedCustomers.map(customerId => {
            const customer = customers.find(c => c.id === customerId);
            return (
              <Badge key={customerId} variant="secondary" className="gap-1">
                Customer: {customer?.customer_name}
                <X 
                  className="h-3 w-3 cursor-pointer" 
                  onClick={() => {
                    setSelectedCustomers(prev => prev.filter(id => id !== customerId));
                    resetPagination();
                  }}
                />
              </Badge>
            );
          })}
          {selectedCurrencies.map(currency => (
            <Badge key={currency} variant="secondary" className="gap-1">
              Currency: {currency}
              <X 
                className="h-3 w-3 cursor-pointer" 
                onClick={() => {
                  setSelectedCurrencies(prev => prev.filter(c => c !== currency));
                  resetPagination();
                }}
              />
            </Badge>
          ))}
          {selectedTaxTreatments.map(treatment => (
            <Badge key={treatment} variant="secondary" className="gap-1">
              Tax: {treatment.replace('_', ' ')}
              <X 
                className="h-3 w-3 cursor-pointer" 
                onClick={() => {
                  setSelectedTaxTreatments(prev => prev.filter(t => t !== treatment));
                  resetPagination();
                }}
              />
            </Badge>
          ))}
        </div>
      )}
    </>
  );
}