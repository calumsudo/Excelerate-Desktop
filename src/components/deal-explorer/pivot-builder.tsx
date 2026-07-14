import { useMemo } from "react";
import { Button, Card, Select, SelectItem } from "@heroui/react";
import { Icon } from "@iconify/react";
import {
  buildPivot,
  formatFieldValue,
  AGGREGATION_LABELS,
  DIMENSION_FIELDS,
  NUMERIC_FIELDS,
  type Aggregation,
  type DealRecord,
  type PivotConfig,
} from "@services/deal-explorer-service";

const NO_COLUMN_KEY = "__none__";

const PivotBuilder = ({
  records,
  config,
  onConfigChange,
  onExport,
  exporting,
}: {
  records: DealRecord[];
  config: PivotConfig;
  onConfigChange: (config: PivotConfig) => void;
  onExport: (pivot: ReturnType<typeof buildPivot>) => void;
  exporting: boolean;
}) => {
  const pivot = useMemo(() => buildPivot(records, config), [records, config]);
  const format = (value: number | null) =>
    value == null ? "—" : formatFieldValue(value, pivot.valueType);

  const singleKeySelect = (
    label: string,
    selected: string,
    items: { key: string; label: string }[],
    onSelect: (key: string) => void,
    width = "w-full sm:max-w-[200px]"
  ) => (
    <Select
      aria-label={label}
      label={label}
      size="sm"
      className={width}
      selectedKeys={[selected]}
      onSelectionChange={(keys) => {
        const key = Array.from(keys)[0];
        if (key != null) onSelect(String(key));
      }}
    >
      {items.map((item) => (
        <SelectItem key={item.key}>{item.label}</SelectItem>
      ))}
    </Select>
  );

  const dimensionItems = DIMENSION_FIELDS.map((f) => ({
    key: f.key as string,
    label: f.label,
  }));

  return (
    <Card className="dark:border-default-100 border border-transparent">
      <div className="flex flex-wrap items-end justify-between gap-3 p-4 pb-2">
        <div className="flex flex-wrap items-end gap-2">
          {singleKeySelect("Rows", config.rowField, dimensionItems, (rowField) =>
            onConfigChange({ ...config, rowField })
          )}
          {singleKeySelect(
            "Columns",
            config.colField ?? NO_COLUMN_KEY,
            [{ key: NO_COLUMN_KEY, label: "None" }, ...dimensionItems],
            (key) => onConfigChange({ ...config, colField: key === NO_COLUMN_KEY ? null : key })
          )}
          {singleKeySelect(
            "Aggregation",
            config.agg,
            Object.entries(AGGREGATION_LABELS).map(([key, label]) => ({ key, label })),
            (agg) => onConfigChange({ ...config, agg: agg as Aggregation }),
            "w-full sm:max-w-[130px]"
          )}
          {config.agg !== "count" &&
            singleKeySelect(
              "Value",
              config.valueField,
              NUMERIC_FIELDS.map((f) => ({ key: f.key as string, label: f.label })),
              (valueField) => onConfigChange({ ...config, valueField })
            )}
        </div>
        <Button
          size="sm"
          variant="flat"
          color="primary"
          isLoading={exporting}
          startContent={!exporting && <Icon icon="solar:download-linear" width={16} />}
          onPress={() => onExport(pivot)}
        >
          Export CSV
        </Button>
      </div>

      <div className="p-4 pt-2 overflow-auto max-h-[560px]">
        {pivot.rows.length === 0 ? (
          <div className="h-[200px] flex items-center justify-center">
            <span className="text-default-400">No deals match the current filters</span>
          </div>
        ) : (
          <table className="w-full text-tiny">
            <thead className="sticky top-0 bg-content1 z-10">
              <tr className="text-default-500">
                <th className="text-left font-medium px-2 py-2 border-b border-divider">
                  {pivot.rowLabel.toUpperCase()}
                </th>
                {pivot.colLabels.map((label) => (
                  <th
                    key={label}
                    className="text-right font-medium px-2 py-2 border-b border-divider whitespace-nowrap"
                  >
                    {label.toUpperCase()}
                  </th>
                ))}
                <th className="text-right font-semibold px-2 py-2 border-b border-divider">
                  TOTAL
                </th>
              </tr>
            </thead>
            <tbody>
              {pivot.rows.map((row) => (
                <tr key={row.label} className="hover:bg-default-50">
                  <td className="px-2 py-1.5 border-b border-divider whitespace-nowrap">
                    {row.label}
                  </td>
                  {row.values.map((value, index) => (
                    <td
                      key={pivot.colLabels[index]}
                      className="text-right px-2 py-1.5 border-b border-divider whitespace-nowrap tabular-nums"
                    >
                      {format(value)}
                    </td>
                  ))}
                  <td className="text-right font-medium px-2 py-1.5 border-b border-divider whitespace-nowrap tabular-nums">
                    {format(row.total)}
                  </td>
                </tr>
              ))}
              <tr className="font-semibold">
                <td className="px-2 py-2">Total</td>
                {pivot.colTotals.map((value, index) => (
                  <td
                    key={pivot.colLabels[index]}
                    className="text-right px-2 py-2 whitespace-nowrap tabular-nums"
                  >
                    {format(value)}
                  </td>
                ))}
                <td className="text-right px-2 py-2 whitespace-nowrap tabular-nums">
                  {format(pivot.grandTotal)}
                </td>
              </tr>
            </tbody>
          </table>
        )}
      </div>
    </Card>
  );
};

export default PivotBuilder;
