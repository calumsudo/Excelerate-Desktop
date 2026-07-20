import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import { useToast } from "@/contexts/toast-context-value";
import { formatMoney } from "@services/analytics-service";
import {
  applyFilters,
  getDealRecords,
  pivotToCsv,
  recordsToCsv,
  saveCsvFile,
  DEFAULT_CHART_CONFIG,
  DEFAULT_PIVOT_CONFIG,
  DEFAULT_VISIBLE_FIELDS,
  EMPTY_FILTERS,
  type ChartConfig,
  type DealRecord,
  type ExplorerFilters,
  type PivotConfig,
  type PivotData,
} from "@services/deal-explorer-service";
import {
  deleteDeal,
  getDealFormValues,
  getEditorLookups,
  EMPTY_DEAL_FORM,
  type DealFormValues,
  type EditorLookups,
} from "@services/deal-editor-service";
import PivotSyncService, { type UnresolvedPivotRow } from "@services/pivot-sync-service";
import { type FilterOptions } from "@components/deal-explorer/filter-panel";

const EMPTY_LOOKUPS: EditorLookups = {
  portfolios: [],
  funders: [],
  industries: [],
  states: [],
  merchants: [],
};

// Versioned so a future change to the SavedView shape can bump the suffix and
// ignore incompatible saved data instead of crashing on parse.
const VIEWS_STORAGE_KEY = "excelerate.deal-lookup.views:v1";

export interface SavedView {
  id: string;
  name: string;
  filters: ExplorerFilters;
  visibleFields: string[];
  pivot: PivotConfig;
  chart: ChartConfig;
}

function loadSavedViews(): SavedView[] {
  try {
    const raw = localStorage.getItem(VIEWS_STORAGE_KEY);
    return raw ? (JSON.parse(raw) as SavedView[]) : [];
  } catch {
    return [];
  }
}

const today = () => new Date().toISOString().slice(0, 10);

const uniqueSorted = (values: (string | null)[]): string[] =>
  [...new Set(values.filter((v): v is string => v != null && v !== ""))].sort();

/**
 * Owns all deal-lookup state and side effects: records, filters, visible
 * fields, pivot/chart config, saved views, deal CRUD, and unmatched-row
 * reconciliation. Kept out of the page component so the page is presentation.
 */
// react-doctor-disable-next-line react-doctor/prefer-useReducer -- these hold largely independent concerns (records, load status, filters, visible fields, pivot/chart config, saved views) that change at different times, so a single reducer would not improve consistency
export function useDealLookup() {
  const { showToast } = useToast();
  const [records, setRecords] = useState<DealRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [filters, setFilters] = useState<ExplorerFilters>(EMPTY_FILTERS);
  const [visibleFields, setVisibleFields] = useState<string[]>(DEFAULT_VISIBLE_FIELDS);
  const [pivotConfig, setPivotConfig] = useState<PivotConfig>(DEFAULT_PIVOT_CONFIG);
  const [chartConfig, setChartConfig] = useState<ChartConfig>(DEFAULT_CHART_CONFIG);

  const [savedViews, setSavedViews] = useState<SavedView[]>(loadSavedViews);
  const [activeViewId, setActiveViewId] = useState<string | null>(null);
  const [viewName, setViewName] = useState("");
  const [saveModalOpen, setSaveModalOpen] = useState(false);
  const [exporting, setExporting] = useState(false);

  // Deal CRUD
  const [lookups, setLookups] = useState<EditorLookups>(EMPTY_LOOKUPS);
  const [formOpen, setFormOpen] = useState(false);
  const [editing, setEditing] = useState<{ dealId: string; values: DealFormValues } | null>(null);
  const [createDefaults, setCreateDefaults] = useState<DealFormValues | null>(null);
  const [deleting, setDeleting] = useState<DealRecord | null>(null);
  const [deleteBusy, setDeleteBusy] = useState(false);

  // Unmatched pivot-row reconciliation
  const [unresolvedRows, setUnresolvedRows] = useState<UnresolvedPivotRow[]>([]);
  const [unresolvedLoading, setUnresolvedLoading] = useState(true);
  const [busyRowId, setBusyRowId] = useState<string | null>(null);
  /**
   * When set, the next saved deal also resolves this pivot row. A ref, not
   * state: it is only ever read inside handlers, never rendered.
   */
  const pendingResolveRowIdRef = useRef<string | null>(null);

  const fetchLookups = useCallback(() => {
    getEditorLookups()
      .then(setLookups)
      .catch((err) =>
        showToast({
          title: "Failed to load deal form lookups",
          description: err instanceof Error ? err.message : String(err),
          type: "error",
        })
      );
  }, [showToast]);

  const fetchRecords = useCallback(() => {
    setLoading(true);
    setError(null);
    getDealRecords()
      .then(setRecords)
      .catch((err) => setError(err instanceof Error ? err.message : "Failed to load deals"))
      .finally(() => setLoading(false));
  }, []);

  const fetchUnresolved = useCallback(() => {
    setUnresolvedLoading(true);
    PivotSyncService.listUnresolvedRows()
      .then(setUnresolvedRows)
      .catch((err) =>
        showToast({
          title: "Failed to load unmatched pivot rows",
          description: err instanceof Error ? err.message : String(err),
          type: "error",
        })
      )
      .finally(() => setUnresolvedLoading(false));
  }, [showToast]);

  useEffect(fetchRecords, [fetchRecords]);
  useEffect(fetchLookups, [fetchLookups]);
  useEffect(fetchUnresolved, [fetchUnresolved]);

  // The command palette lands here with a search term in router state. Apply
  // it over clean filters, then clear the state so back/refresh don't reapply.
  const location = useLocation();
  const navigate = useNavigate();
  useEffect(() => {
    const state = location.state as { dealLookupSearch?: string } | null;
    if (state?.dealLookupSearch == null) return;
    setFilters({ ...EMPTY_FILTERS, search: state.dealLookupSearch });
    setActiveViewId(null);
    navigate(location.pathname, { replace: true, state: null });
  }, [location.state, location.pathname, navigate]);

  const openCreate = () => {
    setEditing(null);
    setCreateDefaults(null);
    pendingResolveRowIdRef.current = null;
    setFormOpen(true);
  };

  const openEdit = async (record: DealRecord) => {
    try {
      const values = await getDealFormValues(record.id);
      setEditing({ dealId: record.id, values });
      setCreateDefaults(null);
      pendingResolveRowIdRef.current = null;
      setFormOpen(true);
    } catch (err) {
      showToast({
        title: "Failed to load deal",
        description: err instanceof Error ? err.message : String(err),
        type: "error",
      });
    }
  };

  const resolveRow = async (row: UnresolvedPivotRow, dealId: string) => {
    setBusyRowId(row.row_id);
    try {
      await PivotSyncService.resolveRow(row.row_id, dealId);
      showToast({
        title: "Pivot row resolved",
        description: `${row.merchant_name} — payment written for ${row.report_date}`,
        type: "success",
      });
      fetchRecords();
      fetchUnresolved();
    } catch (err) {
      showToast({
        title: "Failed to resolve pivot row",
        description: err instanceof Error ? err.message : String(err),
        type: "error",
      });
    } finally {
      setBusyRowId(null);
    }
  };

  /** "New deal" from an unmatched row: prefill the form, resolve after save. */
  const createDealFromRow = (row: UnresolvedPivotRow) => {
    setEditing(null);
    setCreateDefaults({
      ...EMPTY_DEAL_FORM,
      portfolioId: row.portfolio_id,
      funderId: row.funder_id,
      merchantName: row.merchant_name,
      funderAdvanceId: row.advance_id ?? "",
      dateFunded: row.report_date,
    });
    pendingResolveRowIdRef.current = row.row_id;
    setFormOpen(true);
  };

  const handleSaved = async (dealId: string) => {
    showToast({ title: editing != null ? "Deal updated" : "Deal created", type: "success" });
    const pendingRowId = pendingResolveRowIdRef.current;
    if (pendingRowId != null) {
      const row = unresolvedRows.find((r) => r.row_id === pendingRowId);
      pendingResolveRowIdRef.current = null;
      if (row != null) {
        await resolveRow(row, dealId);
        fetchLookups();
        return; // resolveRow already refetched records
      }
    }
    fetchRecords();
    fetchLookups(); // a save may have added or renamed a merchant
  };

  const confirmDelete = async () => {
    if (deleting == null) return;
    setDeleteBusy(true);
    try {
      await deleteDeal(deleting.id);
      showToast({
        title: "Deal deleted",
        description: deleting.merchant_name ?? deleting.funder_advance_id ?? deleting.id,
        type: "success",
      });
      setDeleting(null);
      fetchRecords();
    } catch (err) {
      showToast({
        title: "Delete failed",
        description: err instanceof Error ? err.message : String(err),
        type: "error",
      });
    } finally {
      setDeleteBusy(false);
    }
  };

  const options = useMemo<FilterOptions>(
    () => ({
      portfolios: uniqueSorted(records.map((r) => r.portfolio_name)),
      funders: uniqueSorted(records.map((r) => r.funder_name)),
      industries: uniqueSorted(records.map((r) => r.industry)),
      states: uniqueSorted(records.map((r) => r.state)),
      months: uniqueSorted(records.map((r) => r.vintage_month?.slice(0, 7) ?? null)),
    }),
    [records]
  );

  const filtered = useMemo(() => applyFilters(records, filters), [records, filters]);

  const summary = useMemo(() => {
    const sum = (pick: (r: DealRecord) => number | null) =>
      filtered.reduce((acc, r) => acc + (pick(r) ?? 0), 0);
    return {
      funded: sum((r) => r.total_amount_funded),
      costBasis: sum((r) => r.cost_basis),
      netReceived: sum((r) => r.total_net_received),
      balance: sum((r) => r.net_rtr_balance),
    };
  }, [filtered]);

  const persistViews = (views: SavedView[]) => {
    setSavedViews(views);
    localStorage.setItem(VIEWS_STORAGE_KEY, JSON.stringify(views));
  };

  const saveCurrentView = () => {
    const name = viewName.trim();
    if (!name) return;
    const view: SavedView = {
      id: `view-${Date.now()}`,
      name,
      filters,
      visibleFields,
      pivot: pivotConfig,
      chart: chartConfig,
    };
    persistViews([...savedViews, view]);
    setActiveViewId(view.id);
    setViewName("");
    setSaveModalOpen(false);
    showToast({ title: `View "${name}" saved`, type: "success" });
  };

  const applyView = (view: SavedView) => {
    // Merge over defaults so views saved before new filters/configs still load.
    setFilters({ ...EMPTY_FILTERS, ...view.filters });
    setVisibleFields(view.visibleFields.length > 0 ? view.visibleFields : DEFAULT_VISIBLE_FIELDS);
    setPivotConfig({ ...DEFAULT_PIVOT_CONFIG, ...view.pivot });
    setChartConfig({ ...DEFAULT_CHART_CONFIG, ...view.chart });
    setActiveViewId(view.id);
  };

  const deleteActiveView = () => {
    if (activeViewId == null) return;
    const view = savedViews.find((v) => v.id === activeViewId);
    persistViews(savedViews.filter((v) => v.id !== activeViewId));
    setActiveViewId(null);
    if (view) showToast({ title: `View "${view.name}" deleted`, type: "info" });
  };

  const exportCsv = async (defaultName: string, csv: string) => {
    setExporting(true);
    try {
      const path = await saveCsvFile(defaultName, csv);
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
  };

  const exportTable = () =>
    exportCsv(`deals-${today()}.csv`, recordsToCsv(filtered, visibleFields));
  const exportPivot = (pivot: PivotData) =>
    exportCsv(`deal-pivot-${today()}.csv`, pivotToCsv(pivot));

  const summaryCards = [
    { label: "Deals", value: filtered.length.toLocaleString() },
    { label: "Amount Funded", value: formatMoney(summary.funded) },
    { label: "Cost Basis", value: formatMoney(summary.costBasis) },
    { label: "Net Received", value: formatMoney(summary.netReceived) },
    { label: "Net RTR Balance", value: formatMoney(summary.balance) },
  ];

  return {
    records,
    loading,
    error,
    filters,
    setFilters,
    visibleFields,
    setVisibleFields,
    pivotConfig,
    setPivotConfig,
    chartConfig,
    setChartConfig,
    savedViews,
    activeViewId,
    viewName,
    setViewName,
    saveModalOpen,
    setSaveModalOpen,
    exporting,
    lookups,
    formOpen,
    setFormOpen,
    editing,
    createDefaults,
    deleting,
    setDeleting,
    deleteBusy,
    unresolvedRows,
    unresolvedLoading,
    busyRowId,
    options,
    filtered,
    summaryCards,
    fetchRecords,
    openCreate,
    openEdit,
    resolveRow,
    createDealFromRow,
    handleSaved,
    confirmDelete,
    saveCurrentView,
    applyView,
    deleteActiveView,
    exportTable,
    exportPivot,
  };
}
