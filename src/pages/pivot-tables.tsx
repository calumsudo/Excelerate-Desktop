import {
  Button,
  Card,
  Chip,
  Select,
  SelectItem,
  Skeleton,
  Table,
  TableBody,
  TableCell,
  TableColumn,
  TableHeader,
  TableRow,
} from "@heroui/react";
import { Icon } from "@iconify/react";
import { type CommittedPivotRow } from "@services/pivot-sync-service";
import { PORTFOLIOS, formatReportMonth, monthName, usePivotTables } from "@/hooks/use-pivot-tables";

const money = (value: number) =>
  `$${value.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

interface Column {
  key: string;
  label: string;
  align: "start" | "end";
}

// Column set for the pivot table; the split-fee columns only appear when the
// pivot carries them (Receivabull).
const buildColumns = (showFeeBreakdown: boolean): Column[] => [
  { key: "advance_id", label: "ADVANCE ID", align: "start" },
  { key: "merchant_name", label: "MERCHANT", align: "start" },
  { key: "gross", label: "GROSS", align: "end" },
  ...(showFeeBreakdown
    ? ([
        { key: "originator_fee", label: "ORIG. FEE", align: "end" },
        { key: "rb_fee", label: "RB FEE", align: "end" },
      ] as Column[])
    : []),
  { key: "fee", label: "FEE", align: "end" },
  { key: "net", label: "NET", align: "end" },
  ...(showFeeBreakdown
    ? ([{ key: "fee_discrepancy", label: "DISCREPANCY", align: "end" }] as Column[])
    : []),
  { key: "matched", label: "MATCHED", align: "start" },
];

function renderCell(row: CommittedPivotRow, columnKey: string) {
  const discrepant = row.fee_discrepancy != null && Math.abs(row.fee_discrepancy) >= 0.01;
  switch (columnKey) {
    case "advance_id":
      return <TableCell className="font-mono text-sm">{row.advance_id || "—"}</TableCell>;
    case "merchant_name":
      return <TableCell className="font-medium">{row.merchant_name}</TableCell>;
    case "gross":
      return <TableCell className="text-right font-mono text-sm">{money(row.gross)}</TableCell>;
    case "originator_fee":
      return (
        <TableCell className="text-right font-mono text-sm">
          {money(row.originator_fee ?? 0)}
        </TableCell>
      );
    case "rb_fee":
      return (
        <TableCell className="text-right font-mono text-sm">{money(row.rb_fee ?? 0)}</TableCell>
      );
    case "fee":
      return <TableCell className="text-right font-mono text-sm">{money(row.fee)}</TableCell>;
    case "net":
      return <TableCell className="text-right font-mono text-sm">{money(row.net)}</TableCell>;
    case "fee_discrepancy":
      return (
        <TableCell
          className={`text-right font-mono text-sm ${
            discrepant ? "text-warning-600 font-semibold" : ""
          }`}
        >
          {money(row.fee_discrepancy ?? 0)}
        </TableCell>
      );
    case "matched":
      return (
        <TableCell>
          {row.matched_deal_id != null ? (
            <Chip size="sm" variant="flat" color="success">
              Matched
            </Chip>
          ) : (
            <Chip size="sm" variant="flat" color="warning">
              Unmatched
            </Chip>
          )}
        </TableCell>
      );
    default:
      return <TableCell>—</TableCell>;
  }
}

function PivotTables() {
  const {
    funders,
    portfolio,
    setPortfolio,
    funder,
    setFunder,
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
  } = usePivotTables();

  const rows = pivot?.rows ?? [];
  const columns = buildColumns(showFeeBreakdown);
  const noMonths = Boolean(funder) && !monthsLoading && years.length === 0;

  return (
    <div className="p-6">
      <div className="flex flex-wrap justify-between items-center mb-6 gap-4">
        <div className="flex flex-col gap-1">
          <h1 className="text-3xl font-bold">Pivot Tables</h1>
          <p className="text-small text-default-400">
            Browse and export the pivot committed for a portfolio, funder, and month.
          </p>
        </div>
        <Button
          size="sm"
          color="primary"
          variant="flat"
          isLoading={exporting}
          isDisabled={rows.length === 0}
          startContent={!exporting && <Icon icon="solar:download-minimalistic-linear" width={16} />}
          onPress={exportCsv}
        >
          Export CSV
        </Button>
      </div>

      <Card className="mb-6 dark:border-default-100 border border-transparent">
        <div className="p-4 grid grid-cols-2 md:grid-cols-4 gap-3">
          <Select
            aria-label="Portfolio"
            label="Portfolio"
            size="sm"
            selectedKeys={[portfolio]}
            onSelectionChange={(keys) => {
              const key = Array.from(keys)[0];
              if (key) setPortfolio(String(key));
            }}
          >
            {PORTFOLIOS.map((p) => (
              <SelectItem key={p}>{p}</SelectItem>
            ))}
          </Select>

          <Select
            aria-label="Funder"
            label="Funder"
            size="sm"
            isDisabled={funders.length === 0}
            selectedKeys={funder ? [funder] : []}
            onSelectionChange={(keys) => {
              const key = Array.from(keys)[0];
              if (key) setFunder(String(key));
            }}
          >
            {funders.map((f) => (
              <SelectItem key={f}>{f}</SelectItem>
            ))}
          </Select>

          <Select
            aria-label="Year"
            label="Year"
            size="sm"
            isDisabled={years.length === 0}
            selectedKeys={year ? [year] : []}
            onSelectionChange={(keys) => {
              const key = Array.from(keys)[0];
              if (key) selectYear(String(key));
            }}
          >
            {years.map((y) => (
              <SelectItem key={y}>{y}</SelectItem>
            ))}
          </Select>

          <Select
            aria-label="Month"
            label="Month"
            size="sm"
            isDisabled={monthsForYear.length === 0}
            selectedKeys={reportDate ? [reportDate] : []}
            onSelectionChange={(keys) => {
              const key = Array.from(keys)[0];
              if (key) setReportDate(String(key));
            }}
          >
            {monthsForYear.map((d) => (
              <SelectItem key={d}>{monthName(d)}</SelectItem>
            ))}
          </Select>
        </div>
      </Card>

      {error && (
        <Card className="mb-6 bg-danger-50 border-danger-200">
          <div className="p-4 flex items-center gap-2">
            <Icon icon="solar:danger-triangle-bold" className="text-danger" width={20} />
            <span className="text-danger">{error}</span>
          </div>
        </Card>
      )}

      {monthsLoading && !error && (
        <Card className="dark:border-default-100 border border-transparent">
          <div className="p-4">
            <Skeleton className="rounded-lg">
              <div className="h-[300px] w-full bg-default-200"></div>
            </Skeleton>
          </div>
        </Card>
      )}

      {noMonths && !error && (
        <Card className="dark:border-default-100 border border-transparent">
          <div className="p-10 flex flex-col items-center gap-2 text-center">
            <Icon icon="solar:folder-open-linear" className="text-default-300" width={40} />
            <p className="text-default-500">
              No committed pivots for {funder || "this funder"} in {portfolio}.
            </p>
            <p className="text-tiny text-default-400">
              Upload a funder file from the portfolio page to create one.
            </p>
          </div>
        </Card>
      )}

      {Boolean(funder) &&
        !monthsLoading &&
        !noMonths &&
        !error &&
        (pivotLoading ? (
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
        ) : pivot == null ? (
          <Card className="dark:border-default-100 border border-transparent">
            <div className="p-10 flex flex-col items-center gap-2 text-center">
              <Icon icon="solar:folder-open-linear" className="text-default-300" width={40} />
              <p className="text-default-500">
                No pivot committed for this selection
                {reportDate ? ` (${formatReportMonth(reportDate)})` : ""}.
              </p>
            </div>
          </Card>
        ) : (
          <div className="flex flex-col gap-4">
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
              {[
                { label: "Rows", value: pivot.row_count.toLocaleString() },
                { label: "Total Gross", value: money(pivot.total_gross) },
                { label: "Total Fee", value: money(pivot.total_fee) },
                { label: "Total Net", value: money(pivot.total_net) },
              ].map((card) => (
                <Card
                  key={card.label}
                  className="dark:border-default-100 border border-transparent"
                >
                  <div className="p-3 flex flex-col gap-1">
                    <span className="text-tiny text-default-500">{card.label}</span>
                    <span className="text-large font-semibold">{card.value}</span>
                  </div>
                </Card>
              ))}
            </div>

            <div className="overflow-x-auto">
              <Table
                aria-label={`Committed pivot for ${portfolio} ${funder}`}
                classNames={{
                  tr: "data-[discrepant=true]:bg-warning-50 dark:data-[discrepant=true]:bg-warning-500/10",
                }}
              >
                <TableHeader columns={columns}>
                  {(column) => (
                    <TableColumn key={column.key} align={column.align}>
                      {column.label}
                    </TableColumn>
                  )}
                </TableHeader>
                <TableBody items={rows} emptyContent="This pivot has no rows.">
                  {(row) => (
                    <TableRow
                      key={row.id}
                      data-discrepant={
                        row.fee_discrepancy != null && Math.abs(row.fee_discrepancy) >= 0.01
                      }
                    >
                      {(columnKey) => renderCell(row, String(columnKey))}
                    </TableRow>
                  )}
                </TableBody>
              </Table>
            </div>
          </div>
        ))}
    </div>
  );
}

export default PivotTables;
