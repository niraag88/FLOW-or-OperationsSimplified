
import React, { useState, useEffect } from "react";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Button } from "@/components/ui/button";
import { Filter, X } from "lucide-react";
import { Customer } from "@/api/entities";

export default function DOFilters({ filters, onFiltersChange }) {
  const [customers, setCustomers] = useState([]);

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
  };

  const clearFilters = () => {
    onFiltersChange({
      status: "all",
      customer: "all",
      dateRange: "all",
      tax_treatment: "all"
    });
  };

  const hasActiveFilters = filters.status !== "all" || filters.customer !== "all" || 
                          filters.dateRange !== "all" || filters.tax_treatment !== "all";

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

      <Select value={filters.tax_treatment || "all"} onValueChange={(value) => handleFilterChange('tax_treatment', value)}>
        <SelectTrigger className="w-40">
          <SelectValue placeholder="Tax Treatment" />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value="all">All Tax</SelectItem>
          <SelectItem value="StandardRated">Standard Rated</SelectItem>
          <SelectItem value="ZeroRated">Zero Rated</SelectItem>
          <SelectItem value="Exempt">Exempt</SelectItem>
          <SelectItem value="OutOfScope">Out of Scope</SelectItem>
        </SelectContent>
      </Select>

      <Select value={filters.dateRange} onValueChange={(value) => handleFilterChange('dateRange', value)}>
        <SelectTrigger className="w-32">
          <SelectValue placeholder="Date" />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value="all">All Time</SelectItem>
          <SelectItem value="today">Today</SelectItem>
          <SelectItem value="week">This Week</SelectItem>
          <SelectItem value="month">This Month</SelectItem>
          <SelectItem value="quarter">This Quarter</SelectItem>
        </SelectContent>
      </Select>

      {hasActiveFilters && (
        <Button variant="ghost" size="sm" onClick={clearFilters}>
          <X className="w-4 h-4" />
        </Button>
      )}
    </div>
  );
}
