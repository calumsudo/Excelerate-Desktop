import { useMemo } from "react";
import { Card, Select, SelectItem } from "@heroui/react";
import {
  ResponsiveContainer,
  BarChart,
  Bar,
  LineChart,
  Line,
  AreaChart,
  Area,
  PieChart,
  Pie,
  Cell,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
} from "recharts";
import {
  funderColor,
  EmptyChart,
  FunderLegend,
  StackedTooltip,
} from "@components/dashboard/charts";
import { formatMoney } from "@services/analytics-service";
import {
  buildChartData,
  chartRowsToPie,
  formatFieldValue,
  AGGREGATION_LABELS,
  COUNT_METRIC,
  DIMENSION_FIELDS,
  NUMERIC_FIELDS,
  type Aggregation,
  type ChartConfig,
  type ChartType,
  type DealRecord,
  type FieldType,
} from "@services/deal-explorer-service";

const NO_SERIES_KEY = "__none__";

const CHART_TYPES: { key: ChartType; label: string }[] = [
  { key: "bar", label: "Bar (stacked)" },
  { key: "line", label: "Line" },
  { key: "area", label: "Area (stacked)" },
  { key: "pie", label: "Pie" },
];

/** Compact tick labels; money gets the $1.2M treatment, the rest plain numbers. */
const axisFormatter = (valueType: FieldType) => (value: number) =>
  valueType === "money"
    ? formatMoney(value)
    : valueType === "percent"
      ? `${(value * 100).toFixed(0)}%`
      : value.toLocaleString("en-US", { maximumFractionDigits: 2 });

const ChartBuilder = ({
  records,
  config,
  onConfigChange,
}: {
  records: DealRecord[];
  config: ChartConfig;
  onConfigChange: (config: ChartConfig) => void;
}) => {
  const data = useMemo(() => buildChartData(records, config), [records, config]);
  const pieSlices = useMemo(
    () => (config.type === "pie" ? chartRowsToPie(data) : []),
    [config.type, data]
  );
  const tooltipFormat = (value: number) => formatFieldValue(value, data.valueType);

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

  const dimensionItems = DIMENSION_FIELDS.map((f) => ({ key: f.key as string, label: f.label }));
  const metricItems = [
    { key: COUNT_METRIC, label: "Deal Count" },
    ...NUMERIC_FIELDS.map((f) => ({ key: f.key as string, label: f.label })),
  ];

  const axisProps = {
    strokeOpacity: 0.25,
    style: { fontSize: "var(--heroui-font-size-tiny)" },
    tickLine: false,
  };
  const grid = (
    <CartesianGrid stroke="hsl(var(--heroui-default-200))" strokeDasharray="3 3" vertical={false} />
  );
  const tooltip = (
    <Tooltip
      content={<StackedTooltip formatter={tooltipFormat} />}
      cursor={{ fill: "hsl(var(--heroui-default-100))", opacity: 0.4 }}
    />
  );
  const xAxis = <XAxis dataKey="category" {...axisProps} minTickGap={16} />;
  const yAxis = (
    <YAxis axisLine={false} {...axisProps} tickFormatter={axisFormatter(data.valueType)} />
  );

  const renderChart = () => {
    if (config.type === "pie") {
      if (pieSlices.length === 0) return <EmptyChart height={340} />;
      return (
        <>
          <ResponsiveContainer height={340} width="100%">
            <PieChart accessibilityLayer>
              <Tooltip
                content={({ payload }) => {
                  if (!payload || payload.length === 0) return null;
                  const total = pieSlices.reduce((acc, s) => acc + s.value, 0);
                  return (
                    <div className="rounded-medium bg-background text-tiny shadow-small p-2">
                      {payload.map((entry) => (
                        <div key={entry.name} className="flex items-center gap-x-2">
                          <span
                            className="h-2 w-2 rounded-full"
                            style={{ backgroundColor: entry.payload.fill }}
                          />
                          <span className="text-default-500">{entry.name}:</span>
                          <span className="text-default-700 font-medium">
                            {tooltipFormat(entry.value as number)}
                            {total > 0 &&
                              ` (${(((entry.value as number) / total) * 100).toFixed(1)}%)`}
                          </span>
                        </div>
                      ))}
                    </div>
                  );
                }}
                cursor={false}
              />
              <Pie
                animationDuration={800}
                animationEasing="ease"
                cornerRadius={6}
                data={pieSlices}
                dataKey="value"
                nameKey="name"
                innerRadius="55%"
                paddingAngle={2}
                strokeWidth={0}
              >
                {pieSlices.map((slice, index) => (
                  <Cell key={slice.name} fill={funderColor(index)} />
                ))}
              </Pie>
            </PieChart>
          </ResponsiveContainer>
          <FunderLegend funders={pieSlices.map((s) => s.name)} />
        </>
      );
    }

    if (data.rows.length === 0) return <EmptyChart height={340} />;

    const margin = { top: 20, right: 14, left: 8, bottom: 5 };
    if (config.type === "line") {
      return (
        <ResponsiveContainer height={340} width="100%">
          <LineChart accessibilityLayer data={data.rows} margin={margin}>
            {grid}
            {xAxis}
            {yAxis}
            {tooltip}
            {data.series.map((name, index) => (
              <Line
                key={name}
                animationDuration={600}
                dataKey={name}
                stroke={funderColor(index)}
                strokeWidth={2}
                dot={false}
                type="monotone"
              />
            ))}
          </LineChart>
        </ResponsiveContainer>
      );
    }
    if (config.type === "area") {
      return (
        <ResponsiveContainer height={340} width="100%">
          <AreaChart accessibilityLayer data={data.rows} margin={margin}>
            {grid}
            {xAxis}
            {yAxis}
            {tooltip}
            {data.series.map((name, index) => (
              <Area
                key={name}
                animationDuration={600}
                dataKey={name}
                stackId="chart"
                fill={funderColor(index)}
                fillOpacity={0.7}
                stroke={funderColor(index)}
                strokeWidth={1}
                type="monotone"
              />
            ))}
          </AreaChart>
        </ResponsiveContainer>
      );
    }
    return (
      <ResponsiveContainer height={340} width="100%">
        <BarChart accessibilityLayer data={data.rows} margin={margin}>
          {grid}
          {xAxis}
          {yAxis}
          {tooltip}
          {data.series.map((name, index) => (
            <Bar
              key={name}
              animationDuration={450}
              dataKey={name}
              stackId="chart"
              fill={funderColor(index)}
            />
          ))}
        </BarChart>
      </ResponsiveContainer>
    );
  };

  return (
    <Card className="dark:border-default-100 border border-transparent">
      <div className="flex flex-wrap items-end gap-2 p-4 pb-2">
        {singleKeySelect(
          "Chart type",
          config.type,
          CHART_TYPES,
          (type) => onConfigChange({ ...config, type: type as ChartType }),
          "w-full sm:max-w-[160px]"
        )}
        {singleKeySelect(
          config.type === "pie" ? "Slices" : "X axis",
          config.dimension,
          dimensionItems,
          (dimension) => onConfigChange({ ...config, dimension })
        )}
        {config.type !== "pie" &&
          singleKeySelect(
            "Split by",
            config.seriesField ?? NO_SERIES_KEY,
            [{ key: NO_SERIES_KEY, label: "None" }, ...dimensionItems],
            (key) => onConfigChange({ ...config, seriesField: key === NO_SERIES_KEY ? null : key })
          )}
        {singleKeySelect("Metric", config.metric, metricItems, (metric) =>
          onConfigChange({ ...config, metric })
        )}
        {config.metric !== COUNT_METRIC &&
          singleKeySelect(
            "Aggregation",
            config.agg,
            Object.entries(AGGREGATION_LABELS).flatMap(([key, label]) =>
              key === "count" ? [] : [{ key, label }]
            ),
            (agg) => onConfigChange({ ...config, agg: agg as Aggregation }),
            "w-full sm:max-w-[130px]"
          )}
      </div>

      <div className="p-4 pt-2 [&_.recharts-surface]:outline-hidden">
        {renderChart()}
        {config.type !== "pie" && data.series.length > 1 && <FunderLegend funders={data.series} />}
      </div>
    </Card>
  );
};

export default ChartBuilder;
