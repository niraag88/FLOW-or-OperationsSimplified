
import React, { useState, useEffect } from "react";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Button } from "@/components/ui/button";
import { Filter, X } from "lucide-react";
import { Brand } from "@/api/entities"; // Changed from Supplier

export default function POFilters({ filters, onFiltersChange }) {
  const [brands, setBrands] = useState([]); // Changed from suppliers

  useEffect(() => {
    loadBrands(); // Changed from loadSuppliers
  }, []);

  const loadBrands = async () => { // Changed from loadSuppliers
    try {
      const brandsData = await Brand.list(); // Changed to Brand
      setBrands(brandsData); // Changed to setBrands
    } catch (error) {
      console.error("Error loading brands:", error); // Changed error message
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
      supplier: "all", // This filter field name remains 'supplier' as per outline, but now holds brand IDs
      dateRange: "all"
    });
  };

  const hasActiveFilters = filters.status !== "all" || filters.supplier !== "all" || filters.dateRange !== "all";

  return (
    <div className="flex items-center gap-3">
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

      <Select value={filters.supplier} onValueChange={(value) => handleFilterChange('supplier', value)}>
        <SelectTrigger className="w-48">
          <SelectValue placeholder="Brand/Supplier" /> {/* Changed placeholder */}
        </SelectTrigger>
        <SelectContent>
          <SelectItem value="all">All Brands</SelectItem> {/* Changed text */}
          {brands.map(brand => ( // Changed from suppliers to brands
            <SelectItem key={brand.id} value={brand.id}>
              {brand.name}
            </SelectItem>
          ))}
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
