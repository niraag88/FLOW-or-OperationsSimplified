import React, { useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Users, Edit2, Globe, CreditCard } from "lucide-react";
import { Skeleton } from "@/components/ui/skeleton";

export default function CustomerList({ customers, loading, canEdit, onEdit, currentUser, onRefresh }: any) {
  
  const getVatTreatmentBadge = (customer) => {
    const vatTreatment = customer.vat_treatment_default;
    const isUAE = customer.country_code === 'AE';
    
    if (!vatTreatment) {
      // Show what automatic would be
      return (
        <Badge variant="outline" className={isUAE ? 'text-green-700 border-green-300' : 'text-blue-700 border-blue-300'}>
          Auto ({isUAE ? 'Standard' : 'Zero-rated'})
        </Badge>
      );
    }
    
    switch (vatTreatment) {
      case 'StandardRated':
        return <Badge variant="outline" className="text-green-700 border-green-300">Standard</Badge>;
      case 'ZeroRated':
        return <Badge variant="outline" className="text-blue-700 border-blue-300">Zero-rated</Badge>;
      case 'Exempt':
        return <Badge variant="outline" className="text-gray-700 border-gray-300">Exempt</Badge>;
      case 'OutOfScope':
        return <Badge variant="outline" className="text-gray-700 border-gray-300">OOS</Badge>;
      default:
        return <Badge variant="outline">Unknown</Badge>;
    }
  };

  if (loading) {
    return (
      <Card className="border-0 shadow-lg">
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Users className="w-5 h-5" />
            Customers
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="space-y-4">
            {[...Array(5)].map((_, i) => (
              <div key={i} className="flex items-center space-x-4 animate-pulse">
                <Skeleton className="h-12 w-12 rounded-lg" />
                <div className="space-y-2 flex-1">
                  <Skeleton className="h-4 w-[200px]" />
                  <Skeleton className="h-4 w-[150px]" />
                </div>
              </div>
            ))}
          </div>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card className="border-0 shadow-lg">
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Users className="w-5 h-5" />
          Customers ({customers.length})
        </CardTitle>
      </CardHeader>
      <CardContent>
        {/* Desktop Table */}
        <div className="hidden lg:block">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Company Name</TableHead>
                <TableHead>Contact</TableHead>
                <TableHead>Country</TableHead>
                <TableHead>VAT Default</TableHead>
                <TableHead>Currency</TableHead>
                <TableHead>Status</TableHead>
                <TableHead>Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {customers.map((customer) => (
                <TableRow key={customer.id} className="hover:bg-gray-50">
                  <TableCell>
                    <div>
                      <div className="font-medium text-gray-900">{customer.name}</div>
                      {customer.vat_number && (
                        <div className="text-xs text-gray-500 flex items-center gap-1">
                          <CreditCard className="w-3 h-3" />
                          {customer.vat_number}
                        </div>
                      )}
                    </div>
                  </TableCell>
                  <TableCell>
                    <div>
                      <div className="text-sm text-gray-900">{customer.contact_person || '—'}</div>
                      <div className="text-xs text-gray-500">{customer.email}</div>
                    </div>
                  </TableCell>
                  <TableCell>
                    <div className="flex items-center gap-2">
                      <Globe className="w-4 h-4 text-gray-400" />
                      <span className="font-medium">{customer.country_code}</span>
                      <span className="text-sm text-gray-500">{customer.country}</span>
                    </div>
                  </TableCell>
                  <TableCell>
                    {getVatTreatmentBadge(customer)}
                  </TableCell>
                  <TableCell>
                    <Badge variant="outline">{customer.currency}</Badge>
                  </TableCell>
                  <TableCell>
                    <Badge className={customer.isActive ? 'bg-green-100 text-green-800' : 'bg-gray-100 text-gray-800'}>
                      {customer.isActive ? 'Active' : 'Inactive'}
                    </Badge>
                  </TableCell>
                  <TableCell>
                    {canEdit && (
                      <Button
                        variant="ghost"
                        
                        onClick={() => onEdit(customer)}
                      >
                        <Edit2 className="w-4 h-4" />
                      </Button>
                    )}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>

        {/* Mobile Cards */}
        <div className="lg:hidden space-y-4">
          {customers.map((customer) => (
            <Card key={customer.id} className="p-4">
              <div className="flex items-start justify-between mb-3">
                <div>
                  <h3 className="font-semibold text-gray-900">{customer.name}</h3>
                  <p className="text-sm text-gray-600">{customer.email}</p>
                  {customer.contact_person && (
                    <p className="text-sm text-gray-500">{customer.contact_person}</p>
                  )}
                </div>
                <div className="flex flex-col gap-2">
                  <Badge className={customer.isActive ? 'bg-green-100 text-green-800' : 'bg-gray-100 text-gray-800'}>
                    {customer.isActive ? 'Active' : 'Inactive'}
                  </Badge>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-4 text-sm mb-4">
                <div>
                  <p className="text-gray-500">Country</p>
                  <p className="font-medium flex items-center gap-1">
                    <Globe className="w-3 h-3" />
                    {customer.country_code} • {customer.country}
                  </p>
                </div>
                <div>
                  <p className="text-gray-500">Currency</p>
                  <Badge variant="outline" className="w-fit">{customer.currency}</Badge>
                </div>
                <div>
                  <p className="text-gray-500">VAT Default</p>
                  {getVatTreatmentBadge(customer)}
                </div>
                {customer.vat_number && (
                  <div>
                    <p className="text-gray-500">VAT Number</p>
                    <p className="font-medium text-xs">{customer.vat_number}</p>
                  </div>
                )}
              </div>

              {canEdit && (
                <div className="flex justify-end pt-3 border-t border-gray-200">
                  <Button
                    variant="outline"
                    
                    onClick={() => onEdit(customer)}
                  >
                    <Edit2 className="w-4 h-4 mr-2" />
                    Edit
                  </Button>
                </div>
              )}
            </Card>
          ))}
        </div>

        {customers.length === 0 && (
          <div className="text-center py-12 text-gray-500">
            <Users className="w-12 h-12 mx-auto mb-4 opacity-50" />
            <p>No customers found</p>
          </div>
        )}
      </CardContent>
    </Card>
  );
}