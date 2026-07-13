import { Button, Card, Chip, Input, Select, SelectItem } from "@heroui/react";
import { Icon } from "@iconify/react";
import {
  countActiveFilters,
  fieldDef,
  formatFieldValue,
  DEAL_FIELDS,
  EMPTY_FILTERS,
  OPERATORS_BY_TYPE,
  OPERATOR_LABELS,
  type ExplorerFilters,
  type FilterOperator,
  type FilterRule,
} from "@services/deal-explorer-service";

/** Distinct values present in the loaded data, so filters only offer real options. */
export interface FilterOptions {
  portfolios: string[];
  funders: string[];
  industries: string[];
  states: string[];
  /** Vintage months as "YYYY-MM", ascending. */
  months: string[];
}

const STATUS_OPTIONS = ["Active", "Closed", "Defaulted"];

const MultiSelect = ({
  label,
  options,
  selected,
  onChange,
}: {
  label: string;
  options: string[];
  selected: string[];
  onChange: (values: string[]) => void;
}) => (
  <Select
    aria-label={label}
    label={label}
    size="sm"
    className="w-full sm:max-w-[180px]"
    selectionMode="multiple"
    selectedKeys={new Set(selected)}
    onSelectionChange={(keys) => onChange(Array.from(keys) as string[])}
    isDisabled={options.length === 0}
  >
    {options.map((option) => (
      <SelectItem key={option}>{option}</SelectItem>
    ))}
  </Select>
);

const MonthSelect = ({
  label,
  months,
  value,
  onChange,
}: {
  label: string;
  months: string[];
  value: string | null;
  onChange: (value: string | null) => void;
}) => (
  <Select
    aria-label={label}
    label={label}
    size="sm"
    className="w-full sm:max-w-[150px]"
    selectedKeys={value != null ? [value] : []}
    onSelectionChange={(keys) => {
      const key = Array.from(keys)[0];
      onChange(key != null ? String(key) : null);
    }}
    isDisabled={months.length === 0}
  >
    {months.map((month) => (
      <SelectItem key={month}>{formatFieldValue(`${month}-01`, "month")}</SelectItem>
    ))}
  </Select>
);

const ruleValuePlaceholder = (fieldKey: string): string => {
  const def = fieldDef(fieldKey);
  switch (def?.type) {
    case "percent":
      return "e.g. 50 (%)";
    case "money":
    case "number":
      return "value";
    case "month":
      return "YYYY-MM";
    case "date":
      return "YYYY-MM-DD";
    default:
      return "value";
  }
};

const RuleRow = ({
  rule,
  onChange,
  onRemove,
}: {
  rule: FilterRule;
  onChange: (rule: FilterRule) => void;
  onRemove: () => void;
}) => {
  const def = fieldDef(rule.field);
  const operators = def ? OPERATORS_BY_TYPE[def.type] : [];
  const needsValue = rule.operator !== "is_true" && rule.operator !== "is_false";
  const needsSecond = rule.operator === "between";

  return (
    <div className="flex flex-wrap items-center gap-2">
      <Select
        aria-label="Filter field"
        size="sm"
        className="w-[210px]"
        selectedKeys={[rule.field]}
        onSelectionChange={(keys) => {
          const key = Array.from(keys)[0];
          if (key == null) return;
          const nextDef = fieldDef(String(key));
          const nextOps = nextDef ? OPERATORS_BY_TYPE[nextDef.type] : [];
          onChange({
            ...rule,
            field: String(key),
            operator: nextOps.includes(rule.operator) ? rule.operator : nextOps[0],
            value: "",
            value2: "",
          });
        }}
      >
        {DEAL_FIELDS.map((field) => (
          <SelectItem key={field.key as string}>{field.label}</SelectItem>
        ))}
      </Select>
      <Select
        aria-label="Filter operator"
        size="sm"
        className="w-[130px]"
        selectedKeys={[rule.operator]}
        onSelectionChange={(keys) => {
          const key = Array.from(keys)[0];
          if (key != null) onChange({ ...rule, operator: key as FilterOperator });
        }}
      >
        {operators.map((op) => (
          <SelectItem key={op}>{OPERATOR_LABELS[op]}</SelectItem>
        ))}
      </Select>
      {needsValue && (
        <Input
          aria-label="Filter value"
          size="sm"
          className="w-[150px]"
          placeholder={ruleValuePlaceholder(rule.field)}
          value={rule.value}
          onValueChange={(value) => onChange({ ...rule, value })}
        />
      )}
      {needsSecond && (
        <>
          <span className="text-tiny text-default-400">and</span>
          <Input
            aria-label="Filter upper bound"
            size="sm"
            className="w-[150px]"
            placeholder={ruleValuePlaceholder(rule.field)}
            value={rule.value2}
            onValueChange={(value2) => onChange({ ...rule, value2 })}
          />
        </>
      )}
      <Button isIconOnly size="sm" variant="light" aria-label="Remove filter" onPress={onRemove}>
        <Icon icon="solar:trash-bin-minimalistic-linear" width={16} />
      </Button>
    </div>
  );
};

let nextRuleId = 1;

const FilterPanel = ({
  filters,
  onChange,
  options,
}: {
  filters: ExplorerFilters;
  onChange: (filters: ExplorerFilters) => void;
  options: FilterOptions;
}) => {
  const activeCount = countActiveFilters(filters);

  const addRule = () => {
    const rule: FilterRule = {
      id: `rule-${nextRuleId++}`,
      field: "total_amount_funded",
      operator: "gte",
      value: "",
      value2: "",
    };
    onChange({ ...filters, rules: [...filters.rules, rule] });
  };

  return (
    <Card className="dark:border-default-100 border border-transparent mb-4">
      <div className="flex flex-col gap-3 p-4">
        <div className="flex flex-wrap items-end gap-2">
          <Input
            aria-label="Search deals"
            label="Search"
            size="sm"
            className="w-full sm:max-w-[240px]"
            placeholder="Merchant, advance ID, industry…"
            startContent={<Icon icon="solar:magnifer-linear" width={16} />}
            value={filters.search}
            onValueChange={(search) => onChange({ ...filters, search })}
            isClearable
          />
          <MultiSelect
            label="Portfolio"
            options={options.portfolios}
            selected={filters.portfolios}
            onChange={(portfolios) => onChange({ ...filters, portfolios })}
          />
          <MultiSelect
            label="Funder"
            options={options.funders}
            selected={filters.funders}
            onChange={(funders) => onChange({ ...filters, funders })}
          />
          <MultiSelect
            label="Industry"
            options={options.industries}
            selected={filters.industries}
            onChange={(industries) => onChange({ ...filters, industries })}
          />
          <MultiSelect
            label="State"
            options={options.states}
            selected={filters.states}
            onChange={(states) => onChange({ ...filters, states })}
          />
          <MultiSelect
            label="Status"
            options={STATUS_OPTIONS}
            selected={filters.statuses}
            onChange={(statuses) => onChange({ ...filters, statuses })}
          />
          <MonthSelect
            label="Vintage from"
            months={options.months}
            value={filters.monthFrom}
            onChange={(monthFrom) => onChange({ ...filters, monthFrom })}
          />
          <MonthSelect
            label="Vintage to"
            months={options.months}
            value={filters.monthTo}
            onChange={(monthTo) => onChange({ ...filters, monthTo })}
          />
        </div>

        {filters.rules.length > 0 && (
          <div className="flex flex-col gap-2">
            {filters.rules.map((rule) => (
              <RuleRow
                key={rule.id}
                rule={rule}
                onChange={(next) =>
                  onChange({
                    ...filters,
                    rules: filters.rules.map((r) => (r.id === next.id ? next : r)),
                  })
                }
                onRemove={() =>
                  onChange({ ...filters, rules: filters.rules.filter((r) => r.id !== rule.id) })
                }
              />
            ))}
          </div>
        )}

        <div className="flex items-center gap-2">
          <Button
            size="sm"
            variant="flat"
            startContent={<Icon icon="solar:add-circle-linear" width={16} />}
            onPress={addRule}
          >
            Add field filter
          </Button>
          {activeCount > 0 && (
            <>
              <Chip size="sm" variant="flat" color="primary">
                {activeCount} active filter{activeCount === 1 ? "" : "s"}
              </Chip>
              <Button size="sm" variant="light" onPress={() => onChange(EMPTY_FILTERS)}>
                Clear all
              </Button>
            </>
          )}
        </div>
      </div>
    </Card>
  );
};

export default FilterPanel;
