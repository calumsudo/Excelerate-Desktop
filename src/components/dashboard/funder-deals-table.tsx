import { useMemo, useState } from "react";
import {
  Card,
  Chip,
  Input,
  Pagination,
  Skeleton,
  Table,
  TableBody,
  TableCell,
  TableColumn,
  TableHeader,
  TableRow,
} from "@heroui/react";
import { Icon } from "@iconify/react";
import { formatMoney, formatPct, type FunderDealRow } from "@services/analytics-service";

const ROWS_PER_PAGE = 15;

const money = (value: number | null) => (value != null ? formatMoney(value) : "—");

const dealStatus = (deal: FunderDealRow) => {
  if (deal.is_default) return { label: "Defaulted", color: "danger" as const };
  if (deal.date_closed != null) return { label: "Closed", color: "default" as const };
  return { label: "Active", color: "success" as const };
};

const FunderDealsTable = ({
  deals,
  loading,
  error,
}: {
  deals: FunderDealRow[];
  loading: boolean;
  error: string | null;
}) => {
  const [filter, setFilter] = useState("");
  const [page, setPage] = useState(1);

  const filtered = useMemo(() => {
    const needle = filter.trim().toLowerCase();
    // Newest vintages first — the service returns date_funded ascending.
    const sorted = [...deals].reverse();
    if (!needle) return sorted;
    return sorted.filter(
      (d) =>
        (d.merchant_name ?? "").toLowerCase().includes(needle) ||
        (d.funder_advance_id ?? "").toLowerCase().includes(needle) ||
        (d.advance_id ?? "").toLowerCase().includes(needle)
    );
  }, [deals, filter]);

  const pages = Math.max(1, Math.ceil(filtered.length / ROWS_PER_PAGE));
  const currentPage = Math.min(page, pages);
  const pageRows = filtered.slice((currentPage - 1) * ROWS_PER_PAGE, currentPage * ROWS_PER_PAGE);

  if (loading) {
    return (
      <Card className="dark:border-default-100 border border-transparent mb-6">
        <div className="p-4">
          <Skeleton className="rounded-lg mb-4">
            <div className="h-4 w-48 bg-default-200"></div>
          </Skeleton>
          <Skeleton className="rounded-lg">
            <div className="h-[300px] w-full bg-default-200"></div>
          </Skeleton>
        </div>
      </Card>
    );
  }

  return (
    <Card className="dark:border-default-100 border border-transparent mb-6">
      <div className="flex flex-wrap items-center justify-between gap-3 p-4 pb-0">
        <div className="flex flex-col gap-y-1">
          <h3 className="text-small text-default-500 font-medium">Deals</h3>
          <span className="text-tiny text-default-400">
            {filtered.length.toLocaleString()} of {deals.length.toLocaleString()} deals
          </span>
        </div>
        <Input
          aria-label="Filter deals"
          className="max-w-[260px]"
          size="sm"
          placeholder="Filter by merchant or advance ID"
          startContent={<Icon icon="solar:magnifer-linear" width={16} />}
          value={filter}
          onValueChange={(value) => {
            setFilter(value);
            setPage(1);
          }}
          isClearable
        />
      </div>

      {error ? (
        <div className="p-4 flex items-center gap-2">
          <Icon icon="solar:danger-triangle-bold" className="text-danger" width={20} />
          <span className="text-danger">{error}</span>
        </div>
      ) : (
        <div className="p-4">
          <Table
            aria-label="Funder deals"
            removeWrapper
            bottomContent={
              pages > 1 ? (
                <div className="flex justify-center">
                  <Pagination
                    size="sm"
                    showControls
                    page={currentPage}
                    total={pages}
                    onChange={setPage}
                  />
                </div>
              ) : null
            }
          >
            <TableHeader>
              <TableColumn>ADVANCE ID</TableColumn>
              <TableColumn>MERCHANT</TableColumn>
              <TableColumn>FUNDED</TableColumn>
              <TableColumn align="end">AMOUNT FUNDED</TableColumn>
              <TableColumn align="end">PARTICIPATION</TableColumn>
              <TableColumn align="end">COST BASIS</TableColumn>
              <TableColumn align="end">NET RTR</TableColumn>
              <TableColumn align="end">RECEIVED</TableColumn>
              <TableColumn align="end">% RTR PAID</TableColumn>
              <TableColumn align="end">BALANCE</TableColumn>
              <TableColumn>STATUS</TableColumn>
            </TableHeader>
            <TableBody emptyContent="No deals found">
              {pageRows.map((deal) => {
                const status = dealStatus(deal);
                return (
                  <TableRow key={deal.id}>
                    <TableCell className="text-tiny">
                      {deal.funder_advance_id ?? deal.advance_id ?? "—"}
                    </TableCell>
                    <TableCell className="text-tiny">{deal.merchant_name ?? "—"}</TableCell>
                    <TableCell className="text-tiny whitespace-nowrap">
                      {deal.date_funded ?? "—"}
                    </TableCell>
                    <TableCell className="text-tiny">{money(deal.total_amount_funded)}</TableCell>
                    <TableCell className="text-tiny">
                      {money(deal.participation_on_amount)}
                    </TableCell>
                    <TableCell className="text-tiny">{money(deal.cost_basis)}</TableCell>
                    <TableCell className="text-tiny">{money(deal.net_rtr)}</TableCell>
                    <TableCell className="text-tiny">{money(deal.total_net_received)}</TableCell>
                    <TableCell className="text-tiny">{formatPct(deal.pct_rtr_paid)}</TableCell>
                    <TableCell className="text-tiny">{money(deal.net_rtr_balance)}</TableCell>
                    <TableCell>
                      <Chip size="sm" variant="flat" color={status.color}>
                        {status.label}
                      </Chip>
                    </TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        </div>
      )}
    </Card>
  );
};

export default FunderDealsTable;
