import { useCallback, useEffect, useMemo, useState } from "react";
import { useToast } from "@/contexts/toast-context-value";
import { saveCsvFile } from "@services/deal-explorer-service";
import PivotSyncService, {
  type CommittedPivot,
  type CommittedPivotRow,
} from "@services/pivot-sync-service";

export const PORTFOLIOS = ["Alder", "White Rabbit"] as const;

const MONTH_NAMES = [
  "January",
  "February",
  "March",
  "April",
  "May",
  "June",
  "July",
  "August",
  "September",
  "October",
  "November",
  "December",
];

/** "YYYY-MM-DD" → "June". */
export const monthName = (reportDate: string): string =>
  MONTH_NAMES[Number(reportDate.slice(5, 7)) - 1] ?? reportDate.slice(5, 7);

/** "YYYY-MM-DD" → "June 2026". */
export const formatReportMonth = (reportDate: string): string =>
  `${monthName(reportDate)} ${reportDate.slice(0, 4)}`;

/** True when the pivot has at least one row carrying the split-fee breakdown. */
export const hasFeeBreakdown = (rows: CommittedPivotRow[]): boolean =>
  rows.some((r) => r.originator_fee != null || r.rb_fee != null || r.fee_discrepancy != null);

const csvEscape = (value: string): string =>
  /[",\n]/.test(value) ? `"${value.replace(/"/g, '""')}"` : value;

const csvLine = (values: (string | number | null)[]): string =>
  values.map((v) => csvEscape(v == null ? "" : String(v))).join(",");

/** Raw values so the CSV stays machine-readable; Receivabull columns only when present. */
export const pivotRowsToCsv = (rows: CommittedPivotRow[]): string => {
  const includeFees = hasFeeBreakdown(rows);
  const header = ["Advance ID", "Merchant", "Gross", "Fee", "Net", "Matched"];
  if (includeFees) header.splice(4, 0, "Originator Fee", "RB Fee", "Fee Discrepancy");
  const lines = [csvLine(header)];
  for (const row of rows) {
    const values: (string | number | null)[] = [
      row.advance_id,
      row.merchant_name,
      row.gross,
      row.fee,
    ];
    if (includeFees) values.push(row.originator_fee, row.rb_fee, row.fee_discrepancy);
    values.push(row.net, row.matched_deal_id != null ? "yes" : "no");
    lines.push(csvLine(values));
  }
  return lines.join("\n");
};

export function usePivotTables() {
  const { showToast } = useToast();

  const [funders, setFunders] = useState<string[]>([]);
  const [portfolio, setPortfolio] = useState<string>(PORTFOLIOS[0]);
  const [funder, setFunder] = useState<string>("");

  const [months, setMonths] = useState<string[]>([]);
  const [monthsLoading, setMonthsLoading] = useState(false);
  const [year, setYear] = useState<string>("");
  const [reportDate, setReportDate] = useState<string>("");

  const [pivot, setPivot] = useState<CommittedPivot | null>(null);
  const [pivotLoading, setPivotLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [exporting, setExporting] = useState(false);

  // Load the funder list once.
  useEffect(() => {
    PivotSyncService.listFunders()
      .then((names) => {
        setFunders(names);
        setFunder((current) => current || (names[0] ?? ""));
      })
      .catch((err) => setError(err instanceof Error ? err.message : String(err)));
  }, []);

  // Reload available months whenever portfolio + funder change.
  useEffect(() => {
    if (!portfolio || !funder) return;
    let cancelled = false;
    setMonthsLoading(true);
    setError(null);
    PivotSyncService.listPivotMonths(portfolio, funder)
      .then((dates) => {
        if (cancelled) return;
        setMonths(dates);
        setYear(dates[0]?.slice(0, 4) ?? "");
        setReportDate(dates[0] ?? "");
      })
      .catch((err) => {
        if (cancelled) return;
        setError(err instanceof Error ? err.message : String(err));
        setMonths([]);
        setYear("");
        setReportDate("");
      })
      .finally(() => !cancelled && setMonthsLoading(false));
    return () => {
      cancelled = true;
    };
  }, [portfolio, funder]);

  // Load the pivot whenever the selected month changes.
  useEffect(() => {
    if (!portfolio || !funder || !reportDate) {
      setPivot(null);
      return;
    }
    let cancelled = false;
    setPivotLoading(true);
    setError(null);
    PivotSyncService.getPivotTable(portfolio, funder, reportDate)
      .then((data) => !cancelled && setPivot(data))
      .catch((err) => {
        if (cancelled) return;
        setError(err instanceof Error ? err.message : String(err));
        setPivot(null);
      })
      .finally(() => !cancelled && setPivotLoading(false));
    return () => {
      cancelled = true;
    };
  }, [portfolio, funder, reportDate]);

  // Years that have a committed pivot, newest first.
  const years = useMemo(() => [...new Set(months.map((d) => d.slice(0, 4)))], [months]);

  // Report dates within the selected year (the Month selector's options).
  const monthsForYear = useMemo(() => months.filter((d) => d.slice(0, 4) === year), [months, year]);

  // Selecting a year snaps the month to that year's newest available pivot.
  const selectYear = useCallback(
    (nextYear: string) => {
      setYear(nextYear);
      const first = months.find((d) => d.slice(0, 4) === nextYear);
      if (first) setReportDate(first);
    },
    [months]
  );

  const showFeeBreakdown = useMemo(() => (pivot ? hasFeeBreakdown(pivot.rows) : false), [pivot]);

  const exportCsv = useCallback(async () => {
    if (!pivot || pivot.rows.length === 0) return;
    setExporting(true);
    try {
      const name = `pivot-${portfolio}-${funder}-${reportDate}.csv`
        .replace(/['\s]+/g, "-")
        .toLowerCase();
      const path = await saveCsvFile(name, pivotRowsToCsv(pivot.rows));
      if (path != null) {
        showToast({ title: "Export complete", description: path, type: "success" });
      }
    } catch (err) {
      showToast({
        title: "Export failed",
        description: err instanceof Error ? err.message : String(err),
        type: "error",
      });
    } finally {
      setExporting(false);
    }
  }, [pivot, portfolio, funder, reportDate, showToast]);

  return {
    funders,
    portfolio,
    setPortfolio,
    funder,
    setFunder,
    months,
    monthsLoading,
    years,
    year,
    selectYear,
    monthsForYear,
    reportDate,
    setReportDate,
    pivot,
    pivotLoading,
    showFeeBreakdown,
    error,
    exporting,
    exportCsv,
  };
}
