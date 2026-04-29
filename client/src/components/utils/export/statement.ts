import ExcelJS from 'exceljs';
import { format } from 'date-fns';
import { downloadXLSX } from './shared';

/* ── Statement of Account XLSX export ──────────────────────────────────── */

export const exportStatementToXLSX = async ({ type, entity, companySettings, records, dateFrom, dateTo, statusFilter }: { type: string; entity: Record<string, any> | null; companySettings: Record<string, any> | null; records: Record<string, any>[]; dateFrom: string; dateTo: string; statusFilter: string }) => {
  const fmtAmt = (v: any) => new Intl.NumberFormat("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(v || 0);
  const fmtD   = (val: any) => {
    if (!val) return "—";
    try {
      const d = new Date(val);
      if (isNaN(d.getTime())) return "—";
      return format(d, "dd/MM/yy");
    } catch { return "—"; }
  };

  const entityName    = entity?.name || "—";
  const entityAddress = type === "invoices" ? (entity?.billingAddress || entity?.address || "") : (entity?.description || "");
  const entityTrn     = type === "invoices" ? (entity?.vatNumber || "") : "";
  const entityPhone   = type === "invoices" ? (entity?.phone || "") : (entity?.contactPhone || "");
  const entityEmail   = type === "invoices" ? (entity?.email || "") : (entity?.contactEmail || "");
  const entityContact = entity?.contactPerson || "";
  const entityWebsite = type === "pos" ? (entity?.website || "") : "";

  const dateFromFmt = dateFrom ? fmtD(dateFrom) : null;
  const dateToFmt   = dateTo   ? fmtD(dateTo)   : null;
  const period      = dateFromFmt || dateToFmt ? `${dateFromFmt || "start"} – ${dateToFmt || "present"}` : "All time";
  const statusLabel = statusFilter === "all" ? "All" : statusFilter === "paid" ? "Paid" : "Outstanding";
  const today       = format(new Date(), "dd/MM/yy");

  const totalAed = records.reduce((s: any, r: any) => s + (r._aed || 0), 0);
  const paidAed  = records.filter((r: any) => r._paymentStatus === "paid").reduce((s: any, r: any) => s + (r._aed || 0), 0);
  const outAed   = records.filter((r: any) => r._paymentStatus !== "paid").reduce((s: any, r: any) => s + (r._aed || 0), 0);
  const origCurrency = records.find((r: any) => r._currency && r._currency !== "AED")?._currency || null;
  const showDual = Boolean(origCurrency);
  const totalOrig = showDual ? records.reduce((s: any, r: any) => s + (r._origAmount || r._aed || 0), 0) : 0;
  const paidOrig  = showDual ? records.filter((r: any) => r._paymentStatus === "paid").reduce((s: any, r: any) => s + (r._origAmount || r._aed || 0), 0) : 0;
  const outOrig   = showDual ? records.filter((r: any) => r._paymentStatus !== "paid").reduce((s: any, r: any) => s + (r._origAmount || r._aed || 0), 0) : 0;

  const rows: any[] = [];

  rows.push(["STATEMENT OF ACCOUNT"]);
  rows.push([]);

  const fromLabel = "FROM";
  const toLabel   = type === "invoices" ? "BILL TO" : "BRAND";
  rows.push([fromLabel, "", "", "", "", toLabel]);
  rows.push([companySettings?.companyName || "", "", "", "", "", entityName]);

  const companyAddressLines = (companySettings?.address || "").split("\n").map((l: any) => l.trim()).filter(Boolean);
  const entityAddressLines  = entityAddress.split("\n").map((l: any) => l.trim()).filter(Boolean);

  const maxLines = Math.max(companyAddressLines.length, entityAddressLines.length);
  for (let i = 0; i < maxLines; i++) {
    rows.push([companyAddressLines[i] || "", "", "", "", "", entityAddressLines[i] || ""]);
  }

  if (entityContact) {
    rows.push(["", "", "", "", "", `Attn: ${entityContact}`]);
  }

  const phoneRow: any[] = [];
  phoneRow.push(companySettings?.phone ? `Tel: ${companySettings.phone}` : "");
  phoneRow.push(""); phoneRow.push(""); phoneRow.push(""); phoneRow.push("");
  phoneRow.push(entityPhone ? `Tel: ${entityPhone}` : "");
  if (phoneRow[0] || phoneRow[5]) rows.push(phoneRow);

  const emailRow: any[] = [];
  emailRow.push(companySettings?.email ? `Email: ${companySettings.email}` : "");
  emailRow.push(""); emailRow.push(""); emailRow.push(""); emailRow.push("");
  emailRow.push(entityEmail ? `Email: ${entityEmail}` : "");
  if (emailRow[0] || emailRow[5]) rows.push(emailRow);

  const trnRow: any[] = [];
  trnRow.push(companySettings?.taxNumber ? `TRN: ${companySettings.taxNumber}` : "");
  trnRow.push(""); trnRow.push(""); trnRow.push(""); trnRow.push("");
  trnRow.push(entityTrn ? `TRN: ${entityTrn}` : (entityWebsite ? `Web: ${entityWebsite}` : ""));
  if (trnRow[0] || trnRow[5]) rows.push(trnRow);

  rows.push([]);
  rows.push(["Period:", period, "", "Status:", statusLabel, "", "Records:", records.length]);
  rows.push([]);

  if (type === "invoices") {
    rows.push(["#", "Invoice #", "Date", "Subtotal (AED)", "VAT (AED)", "Total (AED)", "Status", "Received"]);
    records.forEach((r: any, i: any) => {
      rows.push([
        i + 1,
        r._ref,
        fmtD(r._date),
        `AED ${fmtAmt(r._subtotal)}`,
        `AED ${fmtAmt(r._vat)}`,
        `AED ${fmtAmt(r._aed)}`,
        r._paymentStatus === "paid" ? "Paid" : "Outstanding",
        fmtD(r._paymentDate),
      ]);
    });
  } else {
    rows.push(["#", "GRN #", "PO #", "Brand", "Reference No.", "Reference Date", "Amount", "Status", "Payment Date", "Remarks"]);
    records.forEach((r: any, i: any) => {
      const amt = r._currency && r._currency !== "AED"
        ? `${r._currency} ${fmtAmt(r._origAmount)}`
        : `AED ${fmtAmt(r._origAmount)}`;
      rows.push([
        i + 1,
        r._ref,
        r._poRef || "",
        r._brand || "—",
        r._refNo || "—",
        r._refDate ? fmtD(r._refDate) : "—",
        amt,
        r._paymentStatus === "paid" ? "Paid" : "Outstanding",
        fmtD(r._paymentDate),
        r._remarks || "",
      ]);
    });
  }

  rows.push([]);

  const colCount = type === "invoices" ? 8 : 10;
  const pad = (n: any) => Array(n).fill("");

  if (showDual) {
    rows.push([...pad(colCount - 3), "Outstanding:", `${origCurrency} ${fmtAmt(outOrig)}`, `AED ${fmtAmt(outAed)}`]);
    rows.push([...pad(colCount - 3), "Paid:",        `${origCurrency} ${fmtAmt(paidOrig)}`,`AED ${fmtAmt(paidAed)}`]);
    rows.push([...pad(colCount - 3), "Grand Total:", `${origCurrency} ${fmtAmt(totalOrig)}`,`AED ${fmtAmt(totalAed)}`]);
  } else {
    rows.push([...pad(colCount - 2), "Outstanding:", `AED ${fmtAmt(outAed)}`]);
    rows.push([...pad(colCount - 2), "Paid:",        `AED ${fmtAmt(paidAed)}`]);
    rows.push([...pad(colCount - 2), "Grand Total:", `AED ${fmtAmt(totalAed)}`]);
  }

  rows.push([]);
  rows.push(["Generated on:", today]);

  const wb = new ExcelJS.Workbook();
  const ws = wb.addWorksheet("Statement");
  ws.columns = type === "invoices"
    ? [{ width: 6 }, { width: 16 }, { width: 12 }, { width: 16 }, { width: 14 }, { width: 16 }, { width: 14 }, { width: 14 }]
    : [{ width: 6 }, { width: 14 }, { width: 14 }, { width: 16 }, { width: 16 }, { width: 13 }, { width: 14 }, { width: 14 }, { width: 14 }, { width: 22 }];
  for (const row of rows) {
    ws.addRow(row);
  }

  const safeName = (entity?.name || "statement").replace(/[/\\?*:|"<>]/g, "").replace(/\s+/g, "_");
  await downloadXLSX(wb, `SOA_${safeName}_${format(new Date(), "dd-MM-yy")}.xlsx`);
};
