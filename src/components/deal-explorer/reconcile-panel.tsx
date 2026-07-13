import { useMemo, useState } from "react";
import { Autocomplete, AutocompleteItem, Button, Card, Chip, Skeleton } from "@heroui/react";
import { Icon } from "@iconify/react";
import type { UnresolvedPivotRow } from "@services/pivot-sync-service";
import { rankCandidateDeals, type DealRecord } from "@services/deal-explorer-service";
import type { EditorLookups } from "@services/deal-editor-service";

const money = (value: number) =>
  `$${value.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

const RowCard = ({
  row,
  deals,
  funderName,
  portfolioName,
  onResolve,
  onCreateDeal,
  busy,
}: {
  row: UnresolvedPivotRow;
  deals: DealRecord[];
  funderName: string;
  portfolioName: string;
  onResolve: (row: UnresolvedPivotRow, dealId: string) => void;
  onCreateDeal: (row: UnresolvedPivotRow) => void;
  busy: boolean;
}) => {
  const [selectedDealId, setSelectedDealId] = useState<string | null>(null);
  const candidates = useMemo(() => rankCandidateDeals(row, deals), [row, deals]);
  const exactMatches = useMemo(
    () =>
      row.advance_id != null
        ? candidates.filter((d) => d.funder_advance_id === row.advance_id).length
        : 0,
    [candidates, row.advance_id]
  );

  return (
    <div className="flex flex-wrap items-center gap-3 p-3 border-b border-divider last:border-b-0">
      <div className="flex flex-col gap-1 min-w-[260px] flex-1">
        <div className="flex items-center gap-2">
          <span className="font-medium text-small">{row.merchant_name || "Unknown merchant"}</span>
          {row.advance_id != null && (
            <span className="font-mono text-tiny text-default-500">{row.advance_id}</span>
          )}
          {exactMatches > 1 && (
            <Chip size="sm" variant="flat" color="danger">
              {exactMatches} deals share this ID
            </Chip>
          )}
        </div>
        <div className="flex items-center gap-2 text-tiny text-default-400">
          <Chip size="sm" variant="flat">
            {portfolioName}
          </Chip>
          <Chip size="sm" variant="flat" color="primary">
            {funderName}
          </Chip>
          <span>{row.report_date}</span>
          <span className="font-medium text-default-600">{money(row.net)} net</span>
        </div>
      </div>

      <div className="flex items-center gap-2">
        <Autocomplete
          aria-label="Match to deal"
          size="sm"
          className="w-[300px]"
          placeholder="Match to existing deal…"
          selectedKey={selectedDealId}
          onSelectionChange={(key) => setSelectedDealId(key != null ? String(key) : null)}
          items={candidates}
        >
          {(deal) => (
            <AutocompleteItem
              key={deal.id}
              textValue={`${deal.merchant_name ?? "Unknown"} ${deal.funder_advance_id ?? ""}`}
            >
              <div className="flex flex-col">
                <span className="text-small">{deal.merchant_name ?? "Unknown"}</span>
                <span className="text-tiny text-default-400">
                  {deal.funder_advance_id ?? "no advance ID"} · funded {deal.date_funded ?? "—"} ·{" "}
                  {deal.status}
                </span>
              </div>
            </AutocompleteItem>
          )}
        </Autocomplete>
        <Button
          size="sm"
          color="primary"
          variant="flat"
          isDisabled={selectedDealId == null || busy}
          isLoading={busy}
          onPress={() => selectedDealId != null && onResolve(row, selectedDealId)}
        >
          Resolve
        </Button>
        <Button
          size="sm"
          variant="flat"
          startContent={<Icon icon="solar:add-circle-linear" width={16} />}
          isDisabled={busy}
          onPress={() => onCreateDeal(row)}
        >
          New deal
        </Button>
      </div>
    </div>
  );
};

const ReconcilePanel = ({
  rows,
  deals,
  lookups,
  loading,
  busyRowId,
  onResolve,
  onCreateDeal,
}: {
  rows: UnresolvedPivotRow[];
  deals: DealRecord[];
  lookups: EditorLookups;
  loading: boolean;
  /** Row currently being resolved, to disable its buttons. */
  busyRowId: string | null;
  onResolve: (row: UnresolvedPivotRow, dealId: string) => void;
  onCreateDeal: (row: UnresolvedPivotRow) => void;
}) => {
  const funderNames = useMemo(
    () => new Map(lookups.funders.map((f) => [f.id, f.name])),
    [lookups.funders]
  );
  const portfolioNames = useMemo(
    () => new Map(lookups.portfolios.map((p) => [p.id, p.name])),
    [lookups.portfolios]
  );

  const totalNet = rows.reduce((acc, r) => acc + r.net, 0);

  if (loading) {
    return (
      <Card className="dark:border-default-100 border border-transparent">
        <div className="p-4">
          <Skeleton className="rounded-lg mb-4">
            <div className="h-4 w-48 bg-default-200"></div>
          </Skeleton>
          <Skeleton className="rounded-lg">
            <div className="h-[200px] w-full bg-default-200"></div>
          </Skeleton>
        </div>
      </Card>
    );
  }

  return (
    <Card className="dark:border-default-100 border border-transparent">
      <div className="flex flex-wrap items-center justify-between gap-2 p-4 pb-2">
        <div className="flex flex-col gap-1">
          <h3 className="text-small text-default-500 font-medium">Unmatched pivot rows</h3>
          <span className="text-tiny text-default-400">
            {rows.length.toLocaleString()} rows · {money(totalNet)} net not yet recorded as payments
          </span>
        </div>
      </div>

      {rows.length === 0 ? (
        <div className="p-8 flex flex-col items-center gap-2 text-center">
          <Icon icon="solar:check-circle-bold" className="text-success" width={32} />
          <p className="text-default-600 font-medium">Every pivot row is matched to a deal</p>
          <p className="text-default-400 text-small">
            Unmatched rows from monthly funder uploads will appear here for reconciliation.
          </p>
        </div>
      ) : (
        <div className="pb-2">
          {rows.map((row) => (
            <RowCard
              key={row.row_id}
              row={row}
              deals={deals}
              funderName={
                row.funder_id != null
                  ? (funderNames.get(row.funder_id) ?? `Funder ${row.funder_id}`)
                  : "Unknown funder"
              }
              portfolioName={
                row.portfolio_id != null
                  ? (portfolioNames.get(row.portfolio_id) ?? `Portfolio ${row.portfolio_id}`)
                  : "Unknown portfolio"
              }
              onResolve={onResolve}
              onCreateDeal={onCreateDeal}
              busy={busyRowId === row.row_id}
            />
          ))}
        </div>
      )}
    </Card>
  );
};

export default ReconcilePanel;
