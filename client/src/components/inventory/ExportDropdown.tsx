import React, { useState } from "react";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Button } from "@/components/ui/button";
import { Download, Eye } from "lucide-react";
import { exportToXLSX } from "../utils/export";
import { formatCurrency } from "@/utils/currency";
import { format } from "date-fns";

export default function ExportDropdown({
  products,
  totalProducts,
  activeTab,
  stockSubTab,
  stockMovements,
  lowStockProducts,
  outOfStockProducts,
  searchTerm,
  selectedBrands,
  selectedSizes,
  lowStockThreshold,
  fxRates,
}) {
  const [isExporting, setIsExporting] = useState(false);

  // Fetch ALL matching products from the server (respects active filters, ignores pagination)
  const fetchAllProducts = async () => {
    const params = new URLSearchParams();
    if (searchTerm) params.set("search", searchTerm);
    if (selectedBrands && selectedBrands.length > 0) params.set("brand", selectedBrands.join(","));
    if (selectedSizes && selectedSizes.length > 0) params.set("size", selectedSizes.join(","));
    const resp = await fetch(`/api/products?${params}`, { credentials: "include" });
    if (!resp.ok) throw new Error("Failed to fetch products for export");
    const result = await resp.json();
    return Array.isArray(result) ? result : (result.data || []);
  };

  const buildProductRows = (list) =>
    list.map((p) => ({
      Brand: p.brandName || "-",
      "Product Code": p.sku || "-",
      "Product Name": p.name || "-",
      Size: p.size || "-",
      "Cost Price": formatCurrency(p.costPrice, p.costPriceCurrency || "GBP"),
      "Sale Price (AED)": `AED ${parseFloat(p.unitPrice || 0).toFixed(2)}`,
      Status: p.isActive ? "Active" : "Inactive",
    }));

  // Opens a print window synchronously (must be called inside a user gesture),
  // shows a loading state, then populates content after async work completes.
  const openPrintWindow = () => {
    const pw = window.open("", "_blank");
    if (!pw) {
      alert("Please allow popups in your browser to use View & Print.");
      return null;
    }
    pw.document.write(`<!DOCTYPE html><html><head><style>
      body{font-family:Arial,sans-serif;margin:20px;font-size:12px;color:#333;}
    </style></head><body><p style="color:#888">Loading&hellip;</p></body></html>`);
    pw.document.close();
    return pw;
  };

  const writePrintContent = (pw, subtitle, headers, rows, total) => {
    const now = format(new Date(), "dd/MM/yy");
    const headerCells = headers.map((h) => `<th>${h}</th>`).join("");
    const bodyRows = rows
      .map((row) => `<tr>${headers.map((h) => `<td>${String(row[h] ?? "-")}</td>`).join("")}</tr>`)
      .join("");

    pw.document.open();
    pw.document.write(`<!DOCTYPE html>
<html>
<head>
  <title>${subtitle}</title>
  <style>
    body { font-family: Arial, sans-serif; margin: 20px; }
    .print-header { text-align: center; margin-bottom: 30px; }
    .print-header h1 { font-size: 24px; margin-bottom: 5px; }
    .print-header h2 { font-size: 18px; color: #666; margin-top: 0; font-weight: normal; }
    table { width: 100%; border-collapse: collapse; margin-bottom: 30px; }
    th, td { border: 1px solid #ddd; padding: 8px; text-align: left; }
    th { background: #f5f5f5; font-weight: bold; }
    td { font-size: 12px; }
    .print-footer { margin-top: 30px; font-size: 10px; color: #666; text-align: center; }
    @media print { body { margin: 0; } table { font-size: 10px; } }
  </style>
</head>
<body>
  <div class="print-header">
    <h1>Business Operations</h1>
    <h2>${subtitle}</h2>
  </div>
  <table>
    <thead><tr>${headerCells}</tr></thead>
    <tbody>${bodyRows}</tbody>
  </table>
  <div class="print-footer">
    <p>Generated: ${now} &nbsp;|&nbsp; Total records: ${total}</p>
  </div>
</body>
</html>`);
    pw.document.close();
  };

  const exportProducts = async (exportFmt) => {
    // For print: open window immediately in the user-gesture context BEFORE any async work
    const pw = exportFmt === "pdf" ? openPrintWindow() : null;
    if (exportFmt === "pdf" && !pw) return;

    setIsExporting(true);
    try {
      const allProducts = await fetchAllProducts();
      const filename = `products-${new Date().toISOString().split("T")[0]}`;

      if (exportFmt === "xlsx") {
        exportToXLSX(buildProductRows(allProducts), filename, "Products");
      } else {
        const headers = ["Brand", "Product Code", "Product Name", "Size", "Cost Price", "Sale Price (AED)", "Status"];
        writePrintContent(pw, "Products", headers, buildProductRows(allProducts), allProducts.length);
      }
    } catch (err: any) {
      console.error("Export error:", err);
      if (pw) pw.close();
      alert("Export failed. Please try again.");
    } finally {
      setIsExporting(false);
    }
  };

  const getFxRate = (currency) => {
    const c = String(currency || "GBP").toUpperCase();
    if (c === "AED") return 1.0;
    if (c === "USD") return fxRates?.usdToAed ?? 3.6725;
    if (c === "INR") return fxRates?.inrToAed ?? 0.044;
    return fxRates?.gbpToAed ?? 4.85;
  };

  const formatOrigCost = (costPrice, currency) => {
    const cost = parseFloat(costPrice) || 0;
    const curr = String(currency || "GBP").toUpperCase();
    return `${curr} ${cost.toFixed(2)}`;
  };

  const formatAedCost = (costPrice, currency) => {
    const cost = parseFloat(costPrice) || 0;
    const rate = getFxRate(currency);
    return `AED ${(cost * rate).toFixed(2)}`;
  };

  const formatOrigStockValue = (stock, costPrice, currency) => {
    const qty = stock || 0;
    const cost = parseFloat(costPrice) || 0;
    const curr = String(currency || "GBP").toUpperCase();
    return `${curr} ${(qty * cost).toFixed(2)}`;
  };

  const formatAedStockValue = (stock, costPrice, currency) => {
    const qty = stock || 0;
    const cost = parseFloat(costPrice) || 0;
    const rate = getFxRate(currency);
    return `AED ${(qty * cost * rate).toFixed(2)}`;
  };

  const buildCurrentStockRows = (list) =>
    list.map((p) => {
      const stock = p.stockQuantity || 0;
      const threshold = lowStockThreshold || 6;
      const status = stock === 0 ? "Out of Stock" : stock <= threshold ? "Low Stock" : "In Stock";
      return {
        Brand: p.brandName || "-",
        "Product Code": p.sku,
        "Product Name": p.name,
        Size: p.size || "-",
        "Current Stock": stock,
        Status: status,
        "Cost Price": formatOrigCost(p.costPrice, p.costPriceCurrency),
        "Cost Price (AED)": formatAedCost(p.costPrice, p.costPriceCurrency),
        "Stock Value": formatOrigStockValue(stock, p.costPrice, p.costPriceCurrency),
        "Stock Value (AED)": formatAedStockValue(stock, p.costPrice, p.costPriceCurrency),
      };
    });

  const exportCurrentStock = async (exportFmt) => {
    const pw = exportFmt === "pdf" ? openPrintWindow() : null;
    if (exportFmt === "pdf" && !pw) return;

    setIsExporting(true);
    try {
      const allProducts = await fetchAllProducts();
      const filename = `current-stock-${new Date().toISOString().split("T")[0]}`;
      const rows = buildCurrentStockRows(allProducts);

      if (exportFmt === "xlsx") {
        exportToXLSX(rows, filename, "Current Stock");
      } else {
        const headers = ["Brand", "Product Code", "Product Name", "Size", "Current Stock", "Status", "Cost Price", "Cost Price (AED)", "Stock Value", "Stock Value (AED)"];
        writePrintContent(pw, "Current Stock Levels", headers, rows, allProducts.length);
      }
    } catch (err: any) {
      console.error("Export error:", err);
      if (pw) pw.close();
      alert("Export failed. Please try again.");
    } finally {
      setIsExporting(false);
    }
  };

  const buildMovementRows = (list) =>
    list.map((m) => ({
      Date: format(new Date(m.createdAt), "dd/MM/yy"),
      "Product Code": m.productSku,
      "Product Name": m.productName,
      "Movement Type": m.movementType,
      Quantity: m.quantity,
      "Previous Stock": m.previousStock,
      "New Stock": m.newStock,
      "Unit Cost": m.unitCost || 0,
      Notes: m.notes || "",
    }));

  const exportStockMovements = async (exportFmt) => {
    const pw = exportFmt === "pdf" ? openPrintWindow() : null;
    if (exportFmt === "pdf" && !pw) return;

    setIsExporting(true);
    try {
      const filename = `stock-movements-${new Date().toISOString().split("T")[0]}`;
      const rows = buildMovementRows(stockMovements || []);

      if (exportFmt === "xlsx") {
        exportToXLSX(rows, filename, "Stock Movements");
      } else {
        const headers = ["Date", "Product Code", "Product Name", "Movement Type", "Quantity", "Previous Stock", "New Stock", "Unit Cost", "Notes"];
        writePrintContent(pw, "Stock Movements", headers, rows, rows.length);
      }
    } catch (err: any) {
      console.error("Export error:", err);
      if (pw) pw.close();
      alert("Export failed. Please try again.");
    } finally {
      setIsExporting(false);
    }
  };

  const buildLowStockRows = (list) =>
    list.map((p) => ({
      "Product Code": p.sku,
      "Product Name": p.name,
      "Current Stock": p.stockQuantity || 0,
      "Cost Price": formatOrigCost(p.costPrice, p.costPriceCurrency),
      "Cost Price (AED)": formatAedCost(p.costPrice, p.costPriceCurrency),
      "Stock Value": formatOrigStockValue(p.stockQuantity, p.costPrice, p.costPriceCurrency),
      "Stock Value (AED)": formatAedStockValue(p.stockQuantity, p.costPrice, p.costPriceCurrency),
    }));

  const exportLowStock = async (exportFmt) => {
    const pw = exportFmt === "pdf" ? openPrintWindow() : null;
    if (exportFmt === "pdf" && !pw) return;

    setIsExporting(true);
    try {
      const filename = `low-stock-alerts-${new Date().toISOString().split("T")[0]}`;
      const rows = buildLowStockRows(lowStockProducts || []);

      if (exportFmt === "xlsx") {
        exportToXLSX(rows, filename, "Low Stock Alerts");
      } else {
        const headers = ["Product Code", "Product Name", "Current Stock", "Cost Price", "Cost Price (AED)", "Stock Value", "Stock Value (AED)"];
        writePrintContent(pw, "Low Stock Alerts", headers, rows, rows.length);
      }
    } catch (err: any) {
      console.error("Export error:", err);
      if (pw) pw.close();
    } finally {
      setIsExporting(false);
    }
  };

  const buildOutOfStockRows = (list) =>
    list.map((p) => ({
      "Product Code": p.sku,
      "Product Name": p.name,
      Brand: p.brandName || "",
      Size: p.size || "",
      "Current Stock": 0,
      Status: "Out of Stock",
    }));

  const exportOutOfStock = async (exportFmt) => {
    const pw = exportFmt === "pdf" ? openPrintWindow() : null;
    if (exportFmt === "pdf" && !pw) return;

    setIsExporting(true);
    try {
      const filename = `out-of-stock-${new Date().toISOString().split("T")[0]}`;
      const rows = buildOutOfStockRows(outOfStockProducts || []);

      if (exportFmt === "xlsx") {
        exportToXLSX(rows, filename, "Out of Stock");
      } else {
        const headers = ["Product Code", "Product Name", "Brand", "Size", "Current Stock", "Status"];
        writePrintContent(pw, "Out of Stock Products", headers, rows, rows.length);
      }
    } catch (err: any) {
      console.error("Export error:", err);
      if (pw) pw.close();
    } finally {
      setIsExporting(false);
    }
  };

  const getDataTypeAndCount = () => {
    if (activeTab === "products") {
      return { type: "Products", count: totalProducts ?? products.length };
    } else if (activeTab === "stock") {
      switch (stockSubTab) {
        case "stock-levels":
          return { type: "Current Stock", count: totalProducts ?? products.length };
        case "low-stock":
          return { type: "Low Stock Alerts", count: lowStockProducts?.length || 0 };
        case "movements":
          return { type: "Stock Movements", count: stockMovements?.length || 0 };
        case "out-of-stock":
          return { type: "Out of Stock", count: outOfStockProducts?.length || 0 };
        default:
          return { type: "Stock Data", count: 0 };
      }
    }
    return { type: "Data", count: 0 };
  };

  const { type: dataType, count: itemCount } = getDataTypeAndCount();

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="outline" disabled={isExporting}>
          <Download className="w-4 h-4 mr-2" />
          {isExporting ? "Exporting..." : "Export"}
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-56">
        <div className="px-3 py-2 text-sm font-medium text-gray-700 border-b">
          Export {dataType} ({itemCount} records)
        </div>

        {activeTab === "products" && (
          <>
            <DropdownMenuItem onClick={() => exportProducts("pdf")} disabled={itemCount === 0 || isExporting}>
              <Eye className="w-4 h-4 mr-2" />
              View &amp; Print
            </DropdownMenuItem>
            <DropdownMenuItem onClick={() => exportProducts("xlsx")} disabled={itemCount === 0 || isExporting}>
              <Download className="w-4 h-4 mr-2" />
              Export to XLSX
            </DropdownMenuItem>
          </>
        )}

        {activeTab === "stock" && stockSubTab === "stock-levels" && (
          <>
            <DropdownMenuItem onClick={() => exportCurrentStock("pdf")} disabled={itemCount === 0 || isExporting}>
              <Eye className="w-4 h-4 mr-2" />
              View &amp; Print
            </DropdownMenuItem>
            <DropdownMenuItem onClick={() => exportCurrentStock("xlsx")} disabled={itemCount === 0 || isExporting}>
              <Download className="w-4 h-4 mr-2" />
              Export to XLSX
            </DropdownMenuItem>
          </>
        )}

        {activeTab === "stock" && stockSubTab === "movements" && (
          <>
            <DropdownMenuItem onClick={() => exportStockMovements("pdf")} disabled={itemCount === 0 || isExporting}>
              <Eye className="w-4 h-4 mr-2" />
              View &amp; Print
            </DropdownMenuItem>
            <DropdownMenuItem onClick={() => exportStockMovements("xlsx")} disabled={itemCount === 0 || isExporting}>
              <Download className="w-4 h-4 mr-2" />
              Export to XLSX
            </DropdownMenuItem>
          </>
        )}

        {activeTab === "stock" && stockSubTab === "low-stock" && (
          <>
            <DropdownMenuItem onClick={() => exportLowStock("pdf")} disabled={itemCount === 0 || isExporting}>
              <Eye className="w-4 h-4 mr-2" />
              View &amp; Print
            </DropdownMenuItem>
            <DropdownMenuItem onClick={() => exportLowStock("xlsx")} disabled={itemCount === 0 || isExporting}>
              <Download className="w-4 h-4 mr-2" />
              Export to XLSX
            </DropdownMenuItem>
          </>
        )}

        {activeTab === "stock" && stockSubTab === "out-of-stock" && (
          <>
            <DropdownMenuItem onClick={() => exportOutOfStock("pdf")} disabled={itemCount === 0 || isExporting}>
              <Eye className="w-4 h-4 mr-2" />
              View &amp; Print
            </DropdownMenuItem>
            <DropdownMenuItem onClick={() => exportOutOfStock("xlsx")} disabled={itemCount === 0 || isExporting}>
              <Download className="w-4 h-4 mr-2" />
              Export to XLSX
            </DropdownMenuItem>
          </>
        )}

        <DropdownMenuSeparator />

        <div className="px-3 py-2 text-xs text-gray-500">
          {activeTab === "products"
            ? "Exports all filtered products across all pages"
            : `Exports data from ${dataType.toLowerCase()} view`}
        </div>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
