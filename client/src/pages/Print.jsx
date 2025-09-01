import React, { useState, useEffect } from 'react';
import { useSearchParams } from 'react-router-dom';
import { PurchaseOrder } from '@/api/entities';
import { Invoice } from '@/api/entities';
import { DeliveryOrder } from '@/api/entities';
import { Quotation } from '@/api/entities';
import { Brand } from '@/api/entities'; // Changed from Supplier to Brand
import { Customer } from '@/api/entities';
import { CompanySettings } from '@/api/entities';

import POTemplate from '../components/print/POTemplate';
import InvoiceTemplate from '../components/print/InvoiceTemplate';
import DOTemplate from '../components/print/DOTemplate';
import QuotationTemplate from '../components/print/QuotationTemplate';
import StockCountTemplate from '../components/print/StockCountTemplate';

export default function Print() {
  const [data, setData] = useState(null);
  const [relatedData, setRelatedData] = useState({});
  const [settings, setSettings] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  const [searchParams] = useSearchParams();
  const rawData = searchParams.get('data');
  const type = rawData ? JSON.parse(rawData).type : searchParams.get('type');
  const id = rawData ? JSON.parse(rawData).id : searchParams.get('id');
  const passedData = rawData ? JSON.parse(rawData).data : null;

  useEffect(() => {
    if (!type || !id) {
      setError('Document type and ID are required.');
      setLoading(false);
      return;
    }

    const loadDocument = async () => {
      try {
        setLoading(true);
        let doc;
        let related = {};

        // Load company settings
        try {
          const settingsList = await CompanySettings.list();
          setSettings(settingsList[0] || {});
        } catch (err) {
          console.warn('Could not load company settings:', err);
          setSettings({});
        }

        switch (type) {
          case 'po':
            doc = await PurchaseOrder.get(id);
            if (doc.supplier_id) {
              try {
                // supplier_id in PO actually refers to brand_id
                related.brand = await Brand.get(doc.supplier_id);
              } catch (err) {
                console.warn('Could not load brand for PO:', err);
              }
            }
            break;
          case 'invoice':
            doc = await Invoice.get(id);
            if (doc.customer_id) {
              try {
                related.customer = await Customer.get(doc.customer_id);
              } catch (err) {
                console.warn('Could not load customer for invoice:', err);
              }
            }
            break;
          case 'do':
            doc = await DeliveryOrder.get(id);
            if (doc.customer_id) {
              try {
                related.customer = await Customer.get(doc.customer_id);
              } catch (err) {
                console.warn('Could not load customer for DO:', err);
              }
            }
            break;
          case 'quotation':
            doc = await Quotation.get(id);
            if (doc.customer_id) {
              try {
                related.customer = await Customer.get(doc.customer_id);
              } catch (err) {
                console.warn('Could not load customer for quotation:', err);
              }
            }
            break;
          case 'stock-count':
            if (passedData) {
              doc = passedData;
            } else {
              doc = await StockCount.getById(id);
            }
            break;
          default:
            throw new Error(`Unsupported document type: ${type}`);
        }
        
        setData(doc);
        setRelatedData(related);
      } catch (err) {
        console.error('Error loading document:', err);
        setError(`Failed to load document. Please check the ID and try again. Error: ${err.message}`);
      } finally {
        setLoading(false);
      }
    };

    loadDocument();
  }, [type, id]);

  useEffect(() => {
    if (!loading && data) {
      setTimeout(() => window.print(), 500);
    }
  }, [loading, data]);

  if (loading) {
    return (
      <div className="flex items-center justify-center h-screen">
        <p className="text-lg text-gray-600">Loading printable document...</p>
      </div>
    );
  }

  if (error) {
    return (
      <div className="flex items-center justify-center h-screen p-8 bg-red-50">
        <p className="text-lg text-red-600 font-semibold">{error}</p>
      </div>
    );
  }

  const renderTemplate = () => {
    switch (type) {
      case 'po':
        return <POTemplate data={data} brand={relatedData.brand} settings={settings} />;
      case 'invoice':
        return <InvoiceTemplate data={data} customer={relatedData.customer} settings={settings} />;
      case 'do':
        return <DOTemplate data={data} customer={relatedData.customer} settings={settings} />;
      case 'quotation':
        return <QuotationTemplate data={data} customer={relatedData.customer} settings={settings} />;
      case 'stock-count':
        return <StockCountTemplate data={data} settings={settings} />;
      default:
        return null;
    }
  };

  return (
    <div className="bg-white">
      {renderTemplate()}
    </div>
  );
}