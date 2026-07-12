import { useMemo, useState } from "react";
import {
  Button,
  Card,
  Chip,
  Dropdown,
  DropdownItem,
  DropdownMenu,
  DropdownTrigger,
  Pagination,
  Table,
  TableBody,
  TableCell,
  TableColumn,
  TableHeader,
  TableRow,
  type SortDescriptor,
} from "@heroui/react";
import { Icon } from "@iconify/react";
import {
  fieldDef,
  formatFieldValue,
  DEAL_FIELDS,
  type DealRecord,
  type FieldType,
} from "@services/deal-explorer-service";

const ROWS_PER_PAGE = 20;

const isNumericType = (type: FieldType) =>
  type === "number" || type === "money" || type === "percent";

const statusColor = (status: string) =>
  status === "Defaulted"
    ? ("danger" as const)
    : status === "Closed"
      ? ("default" as const)
      : ("success" as const);

function compareValues(a: unknown, b: unknown): number {
  if (a == null && b == null) return 0;
  if (a == null) return 1; // nulls last
  if (b == null) return -1;
  if (typeof a === "number" && typeof b === "number") return a - b;
  if (typeof a === "boolean" && typeof b === "boolean") return Number(a) - Number(b);
  return String(a).localeCompare(String(b));
}

const ExplorerTable = ({
  records,
  visibleFields,
  onVisibleFieldsChange,
  onExport,
  exporting,
}: {
  records: DealRecord[];
  visibleFields: string[];
  onVisibleFieldsChange: (fields: string[]) => void;
  onExport: () => void;
  exporting: boolean;
}) => {
  const [page, setPage] = useState(1);
  const [sort, setSort] = useState<SortDescriptor>({
    column: "date_funded",
    direction: "descending",
  });

  // Keep registry order so the table layout is stable however columns are picked.
  const columns = useMemo(
    () => DEAL_FIELDS.filter((f) => visibleFields.includes(f.key as string)),
    [visibleFields]
  );

  const sorted = useMemo(() => {
    const key = String(sort.column) as keyof DealRecord;
    const out = [...records].sort((a, b) => compareValues(a[key], b[key]));
    return sort.direction === "descending" ? out.reverse() : out;
  }, [records, sort]);

  const pages = Math.max(1, Math.ceil(sorted.length / ROWS_PER_PAGE));
  const currentPage = Math.min(page, pages);
  const pageRows = sorted.slice((currentPage - 1) * ROWS_PER_PAGE, currentPage * ROWS_PER_PAGE);

  return (
    <Card className="dark:border-default-100 border border-transparent">
      <div className="flex flex-wrap items-center justify-between gap-3 p-4 pb-2">
        <span className="text-tiny text-default-400">{records.length.toLocaleString()} deals</span>
        <div className="flex items-center gap-2">
          <Dropdown closeOnSelect={false}>
            <DropdownTrigger>
              <Button
                size="sm"
                variant="flat"
                startContent={<Icon icon="solar:tuning-2-linear" width={16} />}
              >
                Columns ({columns.length})
              </Button>
            </DropdownTrigger>
            <DropdownMenu
              aria-label="Visible columns"
              selectionMode="multiple"
              className="max-h-[400px] overflow-y-auto"
              selectedKeys={new Set(visibleFields)}
              onSelectionChange={(keys) => {
                const next = Array.from(keys) as string[];
                if (next.length > 0) onVisibleFieldsChange(next);
              }}
            >
              {DEAL_FIELDS.map((field) => (
                <DropdownItem key={field.key as string}>{field.label}</DropdownItem>
              ))}
            </DropdownMenu>
          </Dropdown>
          <Button
            size="sm"
            variant="flat"
            color="primary"
            isLoading={exporting}
            startContent={!exporting && <Icon icon="solar:download-linear" width={16} />}
            onPress={onExport}
          >
            Export CSV
          </Button>
        </div>
      </div>

      <div className="p-4 pt-0 overflow-x-auto">
        <Table
          aria-label="Deals"
          removeWrapper
          sortDescriptor={sort}
          onSortChange={(descriptor) => {
            setSort(descriptor);
            setPage(1);
          }}
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
          <TableHeader columns={columns}>
            {(column) => (
              <TableColumn
                key={column.key as string}
                allowsSorting
                align={isNumericType(column.type) ? "end" : "start"}
              >
                {column.label.toUpperCase()}
              </TableColumn>
            )}
          </TableHeader>
          <TableBody items={pageRows} emptyContent="No deals match the current filters">
            {(record) => (
              <TableRow key={record.id}>
                {(columnKey) => {
                  const def = fieldDef(String(columnKey));
                  const value = def ? record[def.key] : null;
                  if (def?.key === "status") {
                    return (
                      <TableCell>
                        <Chip size="sm" variant="flat" color={statusColor(record.status)}>
                          {record.status}
                        </Chip>
                      </TableCell>
                    );
                  }
                  return (
                    <TableCell className="text-tiny whitespace-nowrap">
                      {def ? formatFieldValue(value, def.type) : "—"}
                    </TableCell>
                  );
                }}
              </TableRow>
            )}
          </TableBody>
        </Table>
      </div>
    </Card>
  );
};

export default ExplorerTable;
