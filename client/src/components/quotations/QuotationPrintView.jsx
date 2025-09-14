import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import QuotationTemplate from '../print/QuotationTemplate';
import "../../styles/print.css";

export default function QuotationPrintView() {
  const navigate = useNavigate();
  const [quotation, setQuotation] = useState(null);
  const [companySettings, setCompanySettings] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    // Get Quotation ID from URL params (same pattern as POPrintView)
    const urlParams = new URLSearchParams(window.location.search);
    const quotationId = urlParams.get('id');
    
    if (!quotationId) {
      navigate('/Quotations');
      return;
    }

    const loadData = async () => {
      try {
        // Load quotation data and company settings (same pattern as POPrintView)
        const [quotationResponse, companyResponse] = await Promise.all([
          fetch(`/api/export/quotation?quotationId=${quotationId}`),
          fetch('/api/company-settings')
        ]);
        
        const quotationResult = await quotationResponse.json();
        const companyResult = await companyResponse.json();
        
        if (quotationResult.success) {
          setQuotation(quotationResult.data);
          setCompanySettings(companyResult);
        } else {
          console.error('Error loading quotation:', quotationResult.error);
          navigate('/Quotations');
        }
        
      } catch (error) {
        console.error('Error loading data:', error);
        navigate('/Quotations');
      } finally {
        setLoading(false);
      }
    };

    loadData();
  }, [navigate]);

  // No auto-print - following PO system exactly

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