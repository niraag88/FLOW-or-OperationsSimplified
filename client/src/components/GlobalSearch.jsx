
import React, { useState, useEffect, useRef } from "react";
import { Search, Package, ShoppingCart, Truck, FileText, Building2, User } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Product } from "@/api/entities";
import { PurchaseOrder } from "@/api/entities";
import { DeliveryOrder } from "@/api/entities";
import { Invoice } from "@/api/entities";
import { Customer } from "@/api/entities";
import { Supplier } from "@/api/entities";

export default function GlobalSearch() {
  const [query, setQuery] = useState("");
  const [results, setResults] = useState([]);
  const [isOpen, setIsOpen] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const searchRef = useRef(null);
  const resultsRef = useRef(null);

  useEffect(() => {
    const handleClickOutside = (event) => {
      if (searchRef.current && !searchRef.current.contains(event.target)) {
        setIsOpen(false);
      }
    };

    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  useEffect(() => {
    if (query.length < 2) {
      setResults([]);
      setIsOpen(false);
      return;
    }

    const searchTimeout = setTimeout(async () => {
      setIsLoading(true);
      try {
        const searchPromises = [
          Product.list().then(products => 
            products.filter(p => 
              p.product_code?.toLowerCase().includes(query.toLowerCase()) ||
              p.product_name?.toLowerCase().includes(query.toLowerCase())
            ).map(p => ({ ...p, type: 'product' }))
          ),
          PurchaseOrder.list().then(pos => 
            pos.filter(po => 
              po.po_number?.toLowerCase().includes(query.toLowerCase())
            ).map(po => ({ ...po, type: 'purchase_order' }))
          ),
          DeliveryOrder.list().then(dos => 
            dos.filter(dod => 
              dod.do_number?.toLowerCase().includes(query.toLowerCase())
            ).map(dod => ({ ...dod, type: 'delivery_order' }))
          ),
          Invoice.list().then(invoices => 
            invoices.filter(inv => 
              inv.invoice_number?.toLowerCase().includes(query.toLowerCase())
            ).map(inv => ({ ...inv, type: 'invoice' }))
          ),
          Customer.list().then(customers => 
            customers.filter(c => 
              c.name?.toLowerCase().includes(query.toLowerCase())
            ).map(c => ({ ...c, type: 'customer' }))
          ),
          Supplier.list().then(suppliers => 
            suppliers.filter(s => 
              s.name?.toLowerCase().includes(query.toLowerCase())
            ).map(s => ({ ...s, type: 'supplier' }))
          ),
        ];

        const searchResults = await Promise.all(searchPromises);
        const flatResults = searchResults.flat().slice(0, 8);
        setResults(flatResults);
        setIsOpen(flatResults.length > 0);
      } catch (error) {
        console.error("Search error:", error);
        setResults([]);
      }
      setIsLoading(false);
    }, 300);

    return () => clearTimeout(searchTimeout);
  }, [query]);

  const getIcon = (type) => {
    switch (type) {
      case 'product': return <Package className="w-4 h-4" />;
      case 'purchase_order': return <ShoppingCart className="w-4 h-4" />;
      case 'delivery_order': return <Truck className="w-4 h-4" />;
      case 'invoice': return <FileText className="w-4 h-4" />;
      case 'customer': return <User className="w-4 h-4" />;
      case 'supplier': return <Building2 className="w-4 h-4" />;
      default: return <Search className="w-4 h-4" />;
    }
  };

  const getTypeLabel = (type) => {
    switch (type) {
      case 'product': return 'Product';
      case 'purchase_order': return 'Purchase Order';
      case 'delivery_order': return 'Delivery Order';
      case 'invoice': return 'Invoice';
      case 'customer': return 'Customer';
      case 'supplier': return 'Supplier';
      default: return type;
    }
  };

  const getDisplayText = (item) => {
    switch (item.type) {
      case 'product': return `${item.product_code} - ${item.product_name}`;
      case 'purchase_order': return `${item.po_number}`;
      case 'delivery_order': return `${item.do_number}`;
      case 'invoice': return `${item.invoice_number}`;
      case 'customer':
      case 'supplier': return item.name;
      default: return 'Unknown';
    }
  };

  return (
    <div className="relative" ref={searchRef}>
      <div className="relative">
        <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400 w-4 h-4" />
        <Input
          type="text"
          placeholder="Search SKU, orders, customers..."
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          onFocus={() => query.length >= 2 && results.length > 0 && setIsOpen(true)}
          className="pl-10 bg-slate-800 border-slate-700 text-white placeholder:text-gray-400 focus:border-emerald-500 focus:ring-emerald-500 w-64"
        />
      </div>

      {isOpen && (
        <Card className="absolute top-full left-0 w-96 mt-2 z-50 shadow-2xl border-slate-200" ref={resultsRef}>
          <CardContent className="p-0">
            <div className="max-h-64 overflow-y-auto">
              {isLoading ? (
                <div className="p-4 text-center text-gray-500">
                  <Search className="w-6 h-6 mx-auto mb-2 animate-spin" />
                  Searching...
                </div>
              ) : results.length > 0 ? (
                <div className="py-2">
                  {results.map((item, index) => (
                    <button
                      key={`${item.type}-${item.id}`}
                      className="w-full px-4 py-3 text-left hover:bg-gray-50 focus:bg-gray-50 border-b border-gray-100 last:border-b-0 transition-colors duration-150"
                      onClick={() => {
                        setQuery("");
                        setIsOpen(false);
                      }}
                    >
                      <div className="flex items-center gap-3">
                        <div className="text-gray-500">{getIcon(item.type)}</div>
                        <div className="flex-1 min-w-0">
                          <p className="text-sm font-medium text-gray-900 truncate">
                            {getDisplayText(item)}
                          </p>
                          <div className="flex items-center gap-2 mt-1">
                            <Badge variant="secondary" className="text-xs">
                              {getTypeLabel(item.type)}
                            </Badge>
                            {item.currency && (
                              <Badge variant="outline" className="text-xs">
                                {item.currency}
                              </Badge>
                            )}
                          </div>
                        </div>
                      </div>
                    </button>
                  ))}
                </div>
              ) : (
                <div className="p-4 text-center text-gray-500">
                  No results found for "{query}"
                </div>
              )}
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
