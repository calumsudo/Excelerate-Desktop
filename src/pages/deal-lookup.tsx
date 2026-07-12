import { useCallback, useEffect, useMemo, useState } from "react";
import {
  Button,
  Card,
  Input,
  Modal,
  ModalBody,
  ModalContent,
  ModalFooter,
  ModalHeader,
  Select,
  SelectItem,
  Skeleton,
  Tab,
  Tabs,
} from "@heroui/react";
import { Icon } from "@iconify/react";
import { useToast } from "@/contexts/toast-context";
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
import FilterPanel, { type FilterOptions } from "@components/deal-explorer/filter-panel";
import ExplorerTable from "@components/deal-explorer/explorer-table";
import PivotBuilder from "@components/deal-explorer/pivot-builder";
import ChartBuilder from "@components/deal-explorer/chart-builder";

const VIEWS_STORAGE_KEY = "excelerate.deal-lookup.views";

interface SavedView {
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

const uniqueSorted = (values: (string | null)[]): string[] =>
  [...new Set(values.filter((v): v is string => v != null && v !== ""))].sort();

function DealLookup() {
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

  const fetchRecords = useCallback(() => {
    setLoading(true);
    setError(null);
    getDealRecords()
      .then(setRecords)
      .catch((err) => setError(err instanceof Error ? err.message : "Failed to load deals"))
      .finally(() => setLoading(false));
  }, []);

  useEffect(fetchRecords, [fetchRecords]);

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

  const today = () => new Date().toISOString().slice(0, 10);
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

  return (
    <div className="p-6">
      <div className="flex flex-wrap justify-between items-center mb-6 gap-4">
        <div className="flex flex-col gap-1">
          <h1 className="text-3xl font-bold">Deal Lookup</h1>
          <p className="text-small text-default-400">
            Filter, pivot, chart, and export every deal you have access to.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Select
            aria-label="Saved views"
            placeholder="Saved views"
            size="sm"
            className="w-[200px]"
            isDisabled={savedViews.length === 0}
            selectedKeys={activeViewId != null ? [activeViewId] : []}
            onSelectionChange={(keys) => {
              const key = Array.from(keys)[0];
              const view = savedViews.find((v) => v.id === key);
              if (view) applyView(view);
            }}
          >
            {savedViews.map((view) => (
              <SelectItem key={view.id}>{view.name}</SelectItem>
            ))}
          </Select>
          {activeViewId != null && (
            <Button
              isIconOnly
              size="sm"
              variant="light"
              aria-label="Delete saved view"
              onPress={deleteActiveView}
            >
              <Icon icon="solar:trash-bin-minimalistic-linear" width={16} />
            </Button>
          )}
          <Button
            size="sm"
            variant="flat"
            startContent={<Icon icon="solar:bookmark-linear" width={16} />}
            onPress={() => setSaveModalOpen(true)}
          >
            Save view
          </Button>
          <Button
            isIconOnly
            size="sm"
            variant="flat"
            aria-label="Refresh data"
            isLoading={loading}
            onPress={fetchRecords}
          >
            {!loading && <Icon icon="solar:refresh-linear" width={16} />}
          </Button>
        </div>
      </div>

      {error && (
        <Card className="mb-6 bg-danger-50 border-danger-200">
          <div className="p-4 flex items-center gap-2">
            <Icon icon="solar:danger-triangle-bold" className="text-danger" width={20} />
            <span className="text-danger">{error}</span>
          </div>
        </Card>
      )}

      <FilterPanel filters={filters} onChange={setFilters} options={options} />

      <div className="grid grid-cols-2 sm:grid-cols-3 xl:grid-cols-5 gap-3 mb-4">
        {summaryCards.map((card) => (
          <Card key={card.label} className="dark:border-default-100 border border-transparent">
            <div className="p-3 flex flex-col gap-1">
              <span className="text-tiny text-default-500">{card.label}</span>
              {loading ? (
                <Skeleton className="rounded-lg">
                  <div className="h-6 w-20 bg-default-200"></div>
                </Skeleton>
              ) : (
                <span className="text-large font-semibold">{card.value}</span>
              )}
            </div>
          </Card>
        ))}
      </div>

      {loading ? (
        <Card className="dark:border-default-100 border border-transparent">
          <div className="p-4">
            <Skeleton className="rounded-lg mb-4">
              <div className="h-4 w-48 bg-default-200"></div>
            </Skeleton>
            <Skeleton className="rounded-lg">
              <div className="h-[400px] w-full bg-default-200"></div>
            </Skeleton>
          </div>
        </Card>
      ) : (
        <Tabs aria-label="Deal lookup views" className="mb-2">
          <Tab
            key="table"
            title={
              <div className="flex items-center gap-2">
                <Icon icon="solar:list-linear" width={16} />
                Table
              </div>
            }
          >
            <ExplorerTable
              records={filtered}
              visibleFields={visibleFields}
              onVisibleFieldsChange={setVisibleFields}
              onExport={exportTable}
              exporting={exporting}
            />
          </Tab>
          <Tab
            key="pivot"
            title={
              <div className="flex items-center gap-2">
                <Icon icon="solar:widget-linear" width={16} />
                Pivot
              </div>
            }
          >
            <PivotBuilder
              records={filtered}
              config={pivotConfig}
              onConfigChange={setPivotConfig}
              onExport={exportPivot}
              exporting={exporting}
            />
          </Tab>
          <Tab
            key="chart"
            title={
              <div className="flex items-center gap-2">
                <Icon icon="solar:chart-2-linear" width={16} />
                Chart
              </div>
            }
          >
            <ChartBuilder records={filtered} config={chartConfig} onConfigChange={setChartConfig} />
          </Tab>
        </Tabs>
      )}

      <Modal isOpen={saveModalOpen} onOpenChange={setSaveModalOpen} size="sm">
        <ModalContent>
          <ModalHeader>Save current view</ModalHeader>
          <ModalBody>
            <p className="text-small text-default-500">
              Saves the filters, visible columns, pivot, and chart setup so you can reapply them
              later.
            </p>
            <Input
              aria-label="View name"
              autoFocus
              label="View name"
              size="sm"
              value={viewName}
              onValueChange={setViewName}
              onKeyDown={(e) => {
                if (e.key === "Enter") saveCurrentView();
              }}
            />
          </ModalBody>
          <ModalFooter>
            <Button size="sm" variant="light" onPress={() => setSaveModalOpen(false)}>
              Cancel
            </Button>
            <Button
              size="sm"
              color="primary"
              isDisabled={!viewName.trim()}
              onPress={saveCurrentView}
            >
              Save
            </Button>
          </ModalFooter>
        </ModalContent>
      </Modal>
    </div>
  );
}

export default DealLookup;
