import React, { useState, useEffect } from 'react';
import { useParams } from 'wouter';
import { CompanySettings } from '@/api/entities';
import QuotationTemplate from '../print/QuotationTemplate';
import "../../styles/print.css";

export default function QuotationPrintView() {
  const { id } = useParams();
  const [quotation, setQuotation] = useState(null);
  const [companySettings, setCompanySettings] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    // Get Quotation ID from URL params if not from wouter params
    const urlParams = new URLSearchParams(window.location.search);
    const quotationId = id || urlParams.get('id');
    
    if (!quotationId) {
      console.error('No quotation ID provided');
      setLoading(false);
      return;
    }

    const loadData = async () => {
      try {
        // Use optimized export API for speed like Purchase Orders
        const [quotationResponse, companyData] = await Promise.all([
          fetch(`/api/export/quotation?quotationId=${quotationId}`),
          CompanySettings.get()
        ]);
        
        const quotationResult = await quotationResponse.json();
        
        if (quotationResult.success) {
          setQuotation(quotationResult.data);
        } else {
          console.error('Error loading quotation:', quotationResult.error);
        }
        
        setCompanySettings(companyData);
      } catch (error) {
        console.error('Error loading data:', error);
      } finally {
        setLoading(false);
      }
    };

    loadData();
  }, [id]);

  useEffect(() => {
    if (!loading && quotation && companySettings) {
      // Auto-trigger print dialog
      setTimeout(() => {
        window.print();
      }, 500);
    }
  }, [loading, quotation, companySettings]);

  if (loading) {
    return <div className="p-8">Loading...</div>;
  }

  if (!quotation || !companySettings) {
    return <div className="p-8">Error loading quotation data</div>;
  }

  const formatDate = (dateString) => {
    if (!dateString) return '';
    return new Date(dateString).toLocaleDateString('en-GB');
  };

  // Use the External Format template like PO system
  return (
    <QuotationTemplate 
      data={quotation} 
      customer={quotation} 
      settings={companySettings} 
    />
  );
}