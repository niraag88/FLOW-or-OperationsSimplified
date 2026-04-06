
import React, { useState, useRef, useCallback } from "react";
import { useNavigate } from "react-router-dom";
import { queryClient } from "@/lib/queryClient";
import { Button } from "@/components/ui/button";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { useToast } from "@/components/ui/use-toast";
import { createPageUrl } from "@/utils";
import {
  Download,
  Upload,
  ArrowLeft,
  CheckCircle2,
  XCircle,
  AlertTriangle,
  FileSpreadsheet,
  Loader2,
} from "lucide-react";
import * as XLSX from "xlsx";
import { SUPPORTED_CURRENCIES } from "@/utils/currency";
import { useQuery } from "@tanstack/react-query";

const HEADERS = [
  "Brand Name",
  "Product Code",
  "Product Name",
  "Size",
  "Purchase Price",
  "Purchase Price Currency",
  "Sale Price (AED)",
];

const SKU_REGEX = /^[A-Za-z0-9]{1,50}$/;
const STALE_3MIN = 3 * 60 * 1000;

function parseSheet(workbook) {
  const sheetName = workbook.SheetNames.find(n => n === 'Products') || workbook.SheetNames.find(n => !n.startsWith('_')) || workbook.SheetNames[0];
  const sheet = workbook.Sheets[sheetName];
  const raw = XLSX.utils.sheet_to_json(sheet, { header: 1, defval: "" });

  const rows = [];
  for (let i = 0; i < raw.length; i++) {
    const r = raw[i];
    const brandName = String(r[0] || "").trim();
    const productCode = String(r[1] || "").trim().toUpperCase().replace(/[^A-Z0-9]/g, "");
    const productName = String(r[2] || "").trim();
    const size = String(r[3] || "").trim();
    const purchasePrice = String(r[4] || "").trim();
    const purchasePriceCurrency = String(r[5] || "GBP").trim().toUpperCase();
    const salePrice = String(r[6] || "").trim();

    if (!brandName && !productCode && !productName && !salePrice) continue;
    if (brandName === HEADERS[0]) continue;
    if (productCode === "MYSKU001" && productName === "Example Product") continue;

    rows.push({ brandName, productCode, productName, size, purchasePrice, purchasePriceCurrency, salePrice, _rowIndex: i });
  }
  return rows;
}

function validateRows(rows, brandsSet) {
  const seenCodes = new Set();
  return rows.map((row) => {
    const errors = [];

    if (!row.brandName) errors.push("Brand name is required");
    else if (brandsSet && brandsSet.size > 0 && !brandsSet.has(row.brandName.toLowerCase())) {
      errors.push(`Brand "${row.brandName}" not found in system`);
    }

    if (!row.productCode) errors.push("Product code is required");
    else if (!SKU_REGEX.test(row.productCode)) errors.push("Product code must be 1–50 letters/numbers");

    if (!row.productName) errors.push("Product name is required");

    if (!row.salePrice) errors.push("Sale price is required");
    else if (isNaN(parseFloat(row.salePrice)) || parseFloat(row.salePrice) < 0) errors.push("Sale price must be a positive number");

    if (row.purchasePrice && (isNaN(parseFloat(row.purchasePrice)) || parseFloat(row.purchasePrice) < 0)) {
      errors.push("Purchase price must be a positive number");
    }

    if (row.purchasePriceCurrency && !SUPPORTED_CURRENCIES.includes(row.purchasePriceCurrency)) {
      errors.push(`Purchase currency must be one of: ${SUPPORTED_CURRENCIES.join(", ")}`);
    }

    if (row.productCode && seenCodes.has(row.productCode)) {
      errors.push(`Duplicate product code "${row.productCode}" in this file`);
    } else if (row.productCode) {
      seenCodes.add(row.productCode);
    }

    return { ...row, errors, valid: errors.length === 0 };
  });
}

export default function BulkAddProduct() {
  const navigate = useNavigate();
  const { toast } = useToast();
  const fileInputRef = useRef(null);

  const [parsedRows, setParsedRows] = useState(null);
  const [isDragging, setIsDragging] = useState(false);
  const [importing, setImporting] = useState(false);
  const [result, setResult] = useState(null);
  const [fileName, setFileName] = useState("");

  const { data: brandsData } = useQuery({
    queryKey: ["/api/brands"],
    staleTime: STALE_3MIN,
  });

  const brands = brandsData || [];
  const brandsSet = new Set(brands.map((b) => b.name.trim().toLowerCase()));

  const downloadTemplate = useCallback(async () => {
    try {
      const resp = await fetch("/api/products/bulk-template", { credentials: "include" });
      if (!resp.ok) throw new Error("Failed to generate template");
      const blob = await resp.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = "bulk-add-products-template.xlsx";
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
    } catch (err) {
      toast({
        title: "Download failed",
        description: "Could not generate the template. Please try again.",
        variant: "destructive",
      });
    }
  }, [toast]);

  const processFile = useCallback(
    (file) => {
      if (!file) return;
      setFileName(file.name);
      setResult(null);

      const reader = new FileReader();
      reader.onload = (e) => {
        try {
          const data = new Uint8Array(e.target.result);
          const workbook = XLSX.read(data, { type: "array" });
          const rows = parseSheet(workbook);
          const validated = validateRows(rows, brandsSet);
          setParsedRows(validated);
        } catch (err) {
          toast({
            title: "File error",
            description: "Could not read the file. Please use the XLSX template.",
            variant: "destructive",
          });
        }
      };
      reader.readAsArrayBuffer(file);
    },
    [brandsSet, toast]
  );

  const handleFileChange = (e) => {
    processFile(e.target.files?.[0]);
    e.target.value = "";
  };

  const handleDrop = (e) => {
    e.preventDefault();
    setIsDragging(false);
    const file = e.dataTransfer.files?.[0];
    if (file) processFile(file);
  };

  const validRows = parsedRows?.filter((r) => r.valid) || [];
  const invalidRows = parsedRows?.filter((r) => !r.valid) || [];

  const handleImport = async () => {
    if (validRows.length === 0) return;
    setImporting(true);
    try {
      const payload = validRows.map((r) => ({
        brandName: r.brandName,
        productCode: r.productCode,
        productName: r.productName,
        size: r.size,
        purchasePrice: r.purchasePrice || "0",
        purchasePriceCurrency: r.purchasePriceCurrency || "GBP",
        salePrice: r.salePrice,
      }));

      const resp = await fetch("/api/products/bulk", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ rows: payload }),
      });

      const data = await resp.json();

      if (!resp.ok) {
        toast({ title: "Import failed", description: data.error || "Unknown error", variant: "destructive" });
        return;
      }

      queryClient.invalidateQueries({ queryKey: ["/api/products"] });
      queryClient.invalidateQueries({ queryKey: ["/api/dashboard"] });
      setResult(data);
      setParsedRows(null);
      setFileName("");

      toast({
        title: "Import complete",
        description: `${data.created} product${data.created !== 1 ? "s" : ""} created successfully.`,
      });
    } catch (err) {
      toast({ title: "Import failed", description: "Network error. Please try again.", variant: "destructive" });
    } finally {
      setImporting(false);
    }
  };

  return (
    <div className="max-w-4xl mx-auto p-4 md:p-6 space-y-6">
      <div className="flex items-center gap-3">
        <Button variant="ghost" size="sm" onClick={() => navigate(createPageUrl("Inventory"))}>
          <ArrowLeft className="w-4 h-4 mr-1" />
          Back
        </Button>
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Bulk Add Products</h1>
          <p className="text-gray-600 text-sm">Download the template, fill it in, then upload to import multiple products at once.</p>
        </div>
      </div>

      {/* Step 1 — Download Template */}
      <div className="border rounded-lg p-5 space-y-3 bg-blue-50/50">
        <div className="flex items-center gap-2">
          <span className="flex items-center justify-center w-6 h-6 rounded-full bg-blue-600 text-white text-xs font-bold">1</span>
          <h2 className="font-semibold text-gray-900">Download the Template</h2>
        </div>
        <p className="text-sm text-gray-600">
          The template has the correct columns and includes dropdown lists for Brand Name and Currency where possible.
          Fill it in and save it as XLSX or CSV.
        </p>
        <Button onClick={downloadTemplate} variant="outline" className="gap-2">
          <Download className="w-4 h-4" />
          Download XLSX Template
        </Button>
        <div className="text-xs text-gray-500 mt-1">
          <strong>Required columns:</strong> Brand Name, Product Code, Product Name, Sale Price (AED)
          <br />
          <strong>Optional:</strong> Size, Purchase Price, Purchase Price Currency
        </div>
      </div>

      {/* Step 2 — Upload File */}
      <div className="border rounded-lg p-5 space-y-3">
        <div className="flex items-center gap-2">
          <span className="flex items-center justify-center w-6 h-6 rounded-full bg-blue-600 text-white text-xs font-bold">2</span>
          <h2 className="font-semibold text-gray-900">Upload Your Completed File</h2>
        </div>

        <div
          className={`border-2 border-dashed rounded-lg p-8 text-center cursor-pointer transition-colors ${
            isDragging ? "border-blue-500 bg-blue-50" : "border-gray-300 hover:border-gray-400 hover:bg-gray-50"
          }`}
          onClick={() => fileInputRef.current?.click()}
          onDragOver={(e) => { e.preventDefault(); setIsDragging(true); }}
          onDragLeave={() => setIsDragging(false)}
          onDrop={handleDrop}
        >
          <FileSpreadsheet className="w-10 h-10 mx-auto mb-3 text-gray-400" />
          <p className="text-sm font-medium text-gray-700">
            {fileName ? fileName : "Drag & drop your file here, or click to browse"}
          </p>
          <p className="text-xs text-gray-500 mt-1">Accepts XLSX and CSV files</p>
        </div>
        <input
          ref={fileInputRef}
          type="file"
          accept=".xlsx,.xls,.csv"
          className="hidden"
          onChange={handleFileChange}
        />
      </div>

      {/* Result banner */}
      {result && (
        <Alert className={result.failed === 0 ? "border-green-300 bg-green-50" : "border-amber-300 bg-amber-50"}>
          <CheckCircle2 className="w-4 h-4 text-green-600" />
          <AlertDescription>
            <span className="font-semibold text-green-700">{result.created} product{result.created !== 1 ? "s" : ""} created successfully.</span>
            {result.failed > 0 && (
              <>
                <span className="text-amber-700 ml-2">{result.failed} row{result.failed !== 1 ? "s" : ""} had errors.</span>
                <ul className="mt-2 space-y-1">
                  {result.errors.map((e, idx) => (
                    <li key={idx} className="text-xs text-red-600">
                      Row {e.row} ({e.sku || "no code"}): {e.message}
                    </li>
                  ))}
                </ul>
              </>
            )}
          </AlertDescription>
        </Alert>
      )}

      {/* Step 3 — Preview & Import */}
      {parsedRows && parsedRows.length > 0 && (
        <div className="border rounded-lg p-5 space-y-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <span className="flex items-center justify-center w-6 h-6 rounded-full bg-blue-600 text-white text-xs font-bold">3</span>
              <h2 className="font-semibold text-gray-900">Preview & Import</h2>
            </div>
            <div className="flex items-center gap-3">
              <span className="text-sm text-gray-500">
                <span className="text-green-600 font-medium">{validRows.length} ready</span>
                {invalidRows.length > 0 && (
                  <span className="text-red-600 font-medium ml-2">{invalidRows.length} with errors</span>
                )}
              </span>
              <Button
                onClick={handleImport}
                disabled={validRows.length === 0 || importing}
                className="bg-emerald-600 hover:bg-emerald-700 gap-2"
              >
                {importing ? (
                  <Loader2 className="w-4 h-4 animate-spin" />
                ) : (
                  <Upload className="w-4 h-4" />
                )}
                {importing ? "Importing..." : `Import ${validRows.length} Product${validRows.length !== 1 ? "s" : ""}`}
              </Button>
            </div>
          </div>

          {invalidRows.length > 0 && (
            <Alert className="border-amber-300 bg-amber-50">
              <AlertTriangle className="w-4 h-4 text-amber-600" />
              <AlertDescription className="text-amber-700 text-sm">
                {invalidRows.length} row{invalidRows.length !== 1 ? "s have" : " has"} errors and will be skipped. Fix them in your file and re-upload to include them.
              </AlertDescription>
            </Alert>
          )}

          <div className="overflow-auto rounded-md border">
            <table className="w-full text-sm">
              <thead className="bg-gray-50 border-b">
                <tr>
                  <th className="px-3 py-2 text-left font-medium text-gray-600 w-8">#</th>
                  <th className="px-3 py-2 text-left font-medium text-gray-600 w-8"></th>
                  <th className="px-3 py-2 text-left font-medium text-gray-600">Brand</th>
                  <th className="px-3 py-2 text-left font-medium text-gray-600">Code</th>
                  <th className="px-3 py-2 text-left font-medium text-gray-600">Product Name</th>
                  <th className="px-3 py-2 text-left font-medium text-gray-600">Size</th>
                  <th className="px-3 py-2 text-right font-medium text-gray-600">Purchase Price</th>
                  <th className="px-3 py-2 text-right font-medium text-gray-600">Sale Price (AED)</th>
                </tr>
              </thead>
              <tbody className="divide-y">
                {parsedRows.map((row, idx) => (
                  <tr
                    key={idx}
                    className={row.valid ? "bg-green-50/40" : "bg-red-50/60"}
                  >
                    <td className="px-3 py-2 text-gray-400 text-xs">{idx + 1}</td>
                    <td className="px-3 py-2">
                      {row.valid ? (
                        <CheckCircle2 className="w-4 h-4 text-green-500" />
                      ) : (
                        <Tooltip>
                          <TooltipTrigger asChild>
                            <XCircle className="w-4 h-4 text-red-500 cursor-help" />
                          </TooltipTrigger>
                          <TooltipContent side="right" className="max-w-xs">
                            <ul className="space-y-1">
                              {row.errors.map((err, ei) => (
                                <li key={ei} className="text-xs">• {err}</li>
                              ))}
                            </ul>
                          </TooltipContent>
                        </Tooltip>
                      )}
                    </td>
                    <td className="px-3 py-2">
                      <span className={row.errors.some(e => e.includes("Brand")) ? "text-red-600 font-medium" : ""}>
                        {row.brandName || <span className="text-gray-400 italic">—</span>}
                      </span>
                    </td>
                    <td className="px-3 py-2 font-mono text-xs">
                      <span className={row.errors.some(e => e.includes("code")) ? "text-red-600 font-medium" : ""}>
                        {row.productCode || <span className="text-gray-400 italic">—</span>}
                      </span>
                    </td>
                    <td className="px-3 py-2">
                      <span className={row.errors.some(e => e.includes("name")) ? "text-red-600 font-medium" : ""}>
                        {row.productName || <span className="text-gray-400 italic">—</span>}
                      </span>
                    </td>
                    <td className="px-3 py-2 text-gray-600">{row.size || "—"}</td>
                    <td className="px-3 py-2 text-right text-gray-600">
                      {row.purchasePrice ? `${row.purchasePrice} ${row.purchasePriceCurrency}` : "—"}
                    </td>
                    <td className="px-3 py-2 text-right">
                      <span className={row.errors.some(e => e.includes("Sale")) ? "text-red-600 font-medium" : "font-medium"}>
                        {row.salePrice || <span className="text-gray-400 italic font-normal">—</span>}
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <p className="text-xs text-gray-400">
            Hover the red icon on any row to see the validation error. Only green rows will be imported.
          </p>
        </div>
      )}

      {parsedRows && parsedRows.length === 0 && (
        <Alert className="border-amber-300 bg-amber-50">
          <AlertTriangle className="w-4 h-4 text-amber-600" />
          <AlertDescription className="text-amber-700 text-sm">
            No data rows found in the file. Make sure you have filled in rows below the header row.
          </AlertDescription>
        </Alert>
      )}
    </div>
  );
}
