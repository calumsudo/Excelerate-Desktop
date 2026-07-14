import {
  Button,
  Card,
  Chip,
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
import { formatMoney } from "@services/analytics-service";
import { type DealRecord } from "@services/deal-explorer-service";
import FilterPanel from "@components/deal-explorer/filter-panel";
import ExplorerTable from "@components/deal-explorer/explorer-table";
import PivotBuilder from "@components/deal-explorer/pivot-builder";
import ChartBuilder from "@components/deal-explorer/chart-builder";
import DealFormModal from "@components/deal-explorer/deal-form-modal";
import ReconcilePanel from "@components/deal-explorer/reconcile-panel";
import { useDealLookup } from "@/hooks/use-deal-lookup";

interface DeleteDealModalProps {
  deal: DealRecord | null;
  busy: boolean;
  onClose: () => void;
  onConfirm: () => void;
}

// Confirmation dialog for deleting a deal (and its recorded payments).
function DeleteDealModal({ deal, busy, onClose, onConfirm }: DeleteDealModalProps) {
  return (
    <Modal isOpen={deal != null} onOpenChange={(open) => !open && onClose()} size="sm">
      <ModalContent>
        <ModalHeader>Delete deal</ModalHeader>
        <ModalBody>
          <p className="text-small">
            Delete the deal for{" "}
            <span className="font-semibold">{deal?.merchant_name ?? "this merchant"}</span>
            {deal?.funder_advance_id != null && (
              <span className="text-default-500"> ({deal.funder_advance_id})</span>
            )}
            ?
          </p>
          {deal != null && deal.total_net_received > 0 && (
            <p className="text-small text-danger">
              {formatMoney(deal.total_net_received)} of recorded payments will be deleted with it.
            </p>
          )}
          <p className="text-tiny text-default-400">This cannot be undone.</p>
        </ModalBody>
        <ModalFooter>
          <Button size="sm" variant="light" onPress={onClose} isDisabled={busy}>
            Cancel
          </Button>
          <Button size="sm" color="danger" isLoading={busy} onPress={onConfirm}>
            Delete
          </Button>
        </ModalFooter>
      </ModalContent>
    </Modal>
  );
}

interface SaveViewModalProps {
  isOpen: boolean;
  onOpenChange: (open: boolean) => void;
  viewName: string;
  onViewNameChange: (value: string) => void;
  onSave: () => void;
}

// Names and saves the current filters/columns/pivot/chart as a reusable view.
function SaveViewModal({
  isOpen,
  onOpenChange,
  viewName,
  onViewNameChange,
  onSave,
}: SaveViewModalProps) {
  return (
    <Modal isOpen={isOpen} onOpenChange={onOpenChange} size="sm">
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
            onValueChange={onViewNameChange}
            onKeyDown={(e) => {
              if (e.key === "Enter") onSave();
            }}
          />
        </ModalBody>
        <ModalFooter>
          <Button size="sm" variant="light" onPress={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button size="sm" color="primary" isDisabled={!viewName.trim()} onPress={onSave}>
            Save
          </Button>
        </ModalFooter>
      </ModalContent>
    </Modal>
  );
}

function DealLookup() {
  const {
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
  } = useDealLookup();

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
              onCreate={openCreate}
              onEdit={openEdit}
              onDelete={setDeleting}
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
          <Tab
            key="unmatched"
            title={
              <div className="flex items-center gap-2">
                <Icon icon="solar:link-broken-linear" width={16} />
                Unmatched
                {unresolvedRows.length > 0 && (
                  <Chip size="sm" variant="flat" color="warning">
                    {unresolvedRows.length}
                  </Chip>
                )}
              </div>
            }
          >
            <ReconcilePanel
              rows={unresolvedRows}
              deals={records}
              lookups={lookups}
              loading={unresolvedLoading}
              busyRowId={busyRowId}
              onResolve={resolveRow}
              onCreateDeal={createDealFromRow}
            />
          </Tab>
        </Tabs>
      )}

      <DealFormModal
        isOpen={formOpen}
        onClose={() => setFormOpen(false)}
        lookups={lookups}
        editing={editing}
        createDefaults={createDefaults}
        onSaved={handleSaved}
      />

      <DeleteDealModal
        deal={deleting}
        busy={deleteBusy}
        onClose={() => setDeleting(null)}
        onConfirm={confirmDelete}
      />

      <SaveViewModal
        isOpen={saveModalOpen}
        onOpenChange={setSaveModalOpen}
        viewName={viewName}
        onViewNameChange={setViewName}
        onSave={saveCurrentView}
      />
    </div>
  );
}

export default DealLookup;
