"use client";

import { useState, useEffect, useMemo } from "react";
import { Card, Select, SelectItem, Skeleton, Tab, Tabs } from "@heroui/react";
import { Icon } from "@iconify/react";
import {
  ResponsiveContainer,
  PieChart,
  Pie,
  Tooltip,
  Cell,
  Label,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  Area,
  AreaChart,
  CartesianGrid,
  ComposedChart,
  Line,
} from "recharts";
import {
  listPortfolios,
  getPortfolioAnalytics,
  computeKpis,
  buildAllocationsByMonth,
  normalizeStacked,
  latestMonthAllocation,
  currentAllocation,
  buildCommissionsByMonth,
  buildRtrSeries,
  buildVintagePerformance,
  formatMoney,
  formatPct,
  formatMonth,
  type PortfolioOption,
  type PortfolioAnalytics,
  type StackedByFunder,
  type PieSlice,
} from "@services/analytics-service";

// Enough distinct colors for the 11 workbook funders.
const CHART_COLORS = [
  "hsl(var(--heroui-primary-500))",
  "hsl(var(--heroui-secondary-500))",
  "hsl(var(--heroui-success-500))",
  "hsl(var(--heroui-warning-500))",
  "hsl(var(--heroui-danger-500))",
  "hsl(var(--heroui-primary-300))",
  "hsl(var(--heroui-secondary-300))",
  "hsl(var(--heroui-success-600))",
  "hsl(var(--heroui-warning-600))",
  "hsl(var(--heroui-danger-300))",
  "hsl(var(--heroui-default-500))",
  "hsl(var(--heroui-default-300))",
];

const funderColor = (index: number) => CHART_COLORS[index % CHART_COLORS.length];

function Dashboard() {
  const [portfolios, setPortfolios] = useState<PortfolioOption[]>([]);
  const [selectedId, setSelectedId] = useState<number | null>(null);
  const [analytics, setAnalytics] = useState<PortfolioAnalytics | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    listPortfolios()
      .then((list) => {
        setPortfolios(list);
        setSelectedId((current) => current ?? list[0]?.id ?? null);
        if (list.length === 0) {
          setLoading(false);
          setError("No portfolios are shared with your account.");
        }
      })
      .catch((err) => {
        setLoading(false);
        setError(err instanceof Error ? err.message : "Failed to load portfolios");
      });
  }, []);

  useEffect(() => {
    if (selectedId == null) return;
    let cancelled = false;
    setLoading(true);
    setError(null);
    getPortfolioAnalytics(selectedId)
      .then((data) => {
        if (!cancelled) setAnalytics(data);
      })
      .catch((err) => {
        if (!cancelled) setError(err instanceof Error ? err.message : "Failed to load analytics");
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [selectedId]);

  const kpis = useMemo(() => computeKpis(analytics?.monthly ?? []), [analytics]);
  const allocations = useMemo(
    () => buildAllocationsByMonth(analytics?.vintages ?? [], analytics?.funderNames ?? {}),
    [analytics]
  );
  const allocationsPct = useMemo(() => normalizeStacked(allocations), [allocations]);
  const latestVintage = useMemo(
    () => latestMonthAllocation(analytics?.vintages ?? [], analytics?.funderNames ?? {}),
    [analytics]
  );
  const currentAlloc = useMemo(
    () => currentAllocation(analytics?.allocations ?? [], analytics?.funderNames ?? {}),
    [analytics]
  );
  const commissions = useMemo(() => buildCommissionsByMonth(analytics?.monthly ?? []), [analytics]);
  const rtrSeries = useMemo(
    () => buildRtrSeries(analytics?.rtr ?? [], analytics?.funderNames ?? {}),
    [analytics]
  );
  const performance = useMemo(() => buildVintagePerformance(analytics?.monthly ?? []), [analytics]);

  const hasData = (analytics?.monthly.length ?? 0) > 0;

  const kpiCards = [
    {
      title: "Dollars at Work",
      value: formatMoney(kpis.dollarsAtWork),
      subtitle: `${kpis.dealCount.toLocaleString()} deals`,
      icon: "solar:dollar-bold",
    },
    {
      title: "Cost Basis",
      value: formatMoney(kpis.costBasis),
      subtitle: "participation + commissions",
      icon: "solar:wallet-money-bold",
    },
    {
      title: "Net RTR Outstanding",
      value: formatMoney(kpis.netRtrOutstanding),
      subtitle: "after bad debt",
      icon: "solar:hourglass-bold",
    },
    {
      title: "Principal / Profit Returned",
      value: `${formatMoney(kpis.principalReturned)} / ${formatMoney(kpis.profitReturned)}`,
      subtitle: `${formatMoney(kpis.principalReturned + kpis.profitReturned)} total received`,
      icon: "solar:round-transfer-diagonal-bold",
    },
    {
      title: "Lifetime Return",
      value: formatPct(kpis.lifetimeReturn),
      subtitle: "RTR received / cost basis − 1",
      icon: "solar:chart-2-bold",
      tone: kpis.lifetimeReturn >= 0 ? ("success" as const) : ("danger" as const),
    },
    {
      title: "Bad Debt",
      value: formatPct(kpis.badDebtPct),
      subtitle: "of initial net RTR",
      icon: "solar:danger-triangle-bold",
      tone: kpis.badDebtPct > 0.05 ? ("danger" as const) : ("success" as const),
    },
  ];

  return (
    <div className="p-6">
      <div className="flex justify-between items-center mb-6">
        <h1 className="text-3xl font-bold">Portfolio Dashboard</h1>
        <Select
          aria-label="Select Portfolio"
          className="max-w-[220px]"
          isDisabled={portfolios.length === 0}
          selectedKeys={selectedId != null ? [String(selectedId)] : []}
          onSelectionChange={(keys) => {
            const key = Array.from(keys)[0];
            if (key != null) setSelectedId(Number(key));
          }}
        >
          {portfolios.map((p) => (
            <SelectItem key={String(p.id)}>{p.name}</SelectItem>
          ))}
        </Select>
      </div>

      {error && (
        <Card className="mb-6 bg-danger-50 border-danger-200">
          <div className="p-4 flex items-center gap-2">
            <Icon icon="solar:danger-triangle-bold" className="text-danger" width={20} />
            <span className="text-danger">{error}</span>
          </div>
        </Card>
      )}

      {!loading && !error && !hasData && (
        <Card className="mb-6 dark:border-default-100 border border-transparent">
          <div className="p-8 flex flex-col items-center gap-2 text-center">
            <Icon icon="solar:database-bold" className="text-default-400" width={32} />
            <p className="text-default-600 font-medium">No deal data in this portfolio yet</p>
            <p className="text-default-400 text-small">
              Run the one-time workbook import from the portfolio page to populate the dashboard.
            </p>
          </div>
        </Card>
      )}

      {/* KPI cards from portfolio_monthly */}
      <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-4 mb-6">
        {kpiCards.map((item) => (
          <KpiCard key={item.title} {...item} loading={loading} />
        ))}
      </div>

      {/* Allocations by vintage month, stacked by funder */}
      <AllocationsByMonthCard dollars={allocations} percents={allocationsPct} loading={loading} />

      {/* Allocation snapshots */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 mb-6">
        <AllocationPieCard
          title={
            latestVintage.month
              ? `Allocation — ${latestVintage.month} Vintage`
              : "Latest Vintage Allocation"
          }
          slices={latestVintage.slices}
          loading={loading}
        />
        <AllocationPieCard
          title="Current Allocation — Cost Basis"
          slices={currentAlloc}
          loading={loading}
        />
      </div>

      {/* RTR received over time */}
      <RtrCard series={rtrSeries} loading={loading} />

      {/* Vintage performance */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 mb-6">
        <CommissionsCard data={commissions} loading={loading} />
        <PointsPerMonthCard data={performance} loading={loading} />
      </div>

      <TermVsFactorCard data={performance} loading={loading} />
    </div>
  );
}

const ChartSkeleton = ({ height = 250 }: { height?: number }) => (
  <div className="p-4">
    <Skeleton className="rounded-lg mb-4">
      <div className="h-4 w-48 bg-default-200"></div>
    </Skeleton>
    <Skeleton className="rounded-lg">
      <div style={{ height }} className="w-full bg-default-200"></div>
    </Skeleton>
  </div>
);

const EmptyChart = ({ height = 250 }: { height?: number }) => (
  <div style={{ height }} className="flex items-center justify-center">
    <span className="text-default-400">No data available</span>
  </div>
);

const KpiCard = ({
  title,
  value,
  subtitle,
  icon,
  tone,
  loading,
}: {
  title: string;
  value: string;
  subtitle?: string;
  icon: string;
  tone?: "success" | "danger";
  loading: boolean;
}) => {
  if (loading) {
    return (
      <Card className="dark:border-default-100 border border-transparent">
        <div className="p-4">
          <Skeleton className="rounded-lg mb-2">
            <div className="h-4 w-24 bg-default-200"></div>
          </Skeleton>
          <Skeleton className="rounded-lg">
            <div className="h-8 w-32 bg-default-200"></div>
          </Skeleton>
        </div>
      </Card>
    );
  }

  return (
    <Card className="dark:border-default-100 border border-transparent">
      <div className="flex flex-col gap-y-1 p-4">
        <dt className="text-small text-default-500 font-medium flex items-center gap-2">
          <Icon icon={icon} width={16} />
          {title}
        </dt>
        <dd
          className={
            tone === "success"
              ? "text-success text-2xl font-semibold"
              : tone === "danger"
                ? "text-danger text-2xl font-semibold"
                : "text-default-700 text-2xl font-semibold"
          }
        >
          {value}
        </dd>
        {subtitle && <span className="text-tiny text-default-400">{subtitle}</span>}
      </div>
    </Card>
  );
};

const FunderLegend = ({ funders }: { funders: string[] }) => (
  <div className="text-tiny text-default-500 flex w-full flex-wrap justify-center gap-x-4 gap-y-1 px-4 pb-4">
    {funders.map((funder, index) => (
      <div key={funder} className="flex items-center gap-2">
        <span className="h-2 w-2 rounded-full" style={{ backgroundColor: funderColor(index) }} />
        <span>{funder}</span>
      </div>
    ))}
  </div>
);

const StackedTooltip = ({
  active,
  label,
  payload,
  formatter,
}: {
  active?: boolean;
  label?: string;
  payload?: Array<{ name: string; value: number; color?: string }>;
  formatter: (value: number) => string;
}) => {
  if (!active || !payload || payload.length === 0) return null;
  const shown = [...payload].reverse().filter((p) => p.value !== 0);
  return (
    <div className="rounded-medium bg-background text-tiny shadow-small p-2 max-h-[260px] overflow-y-auto">
      <p className="font-medium mb-1">{label}</p>
      {shown.map((entry) => (
        <div key={entry.name} className="flex items-center gap-x-2">
          <span className="h-2 w-2 rounded-full" style={{ backgroundColor: entry.color }} />
          <span className="text-default-500">{entry.name}:</span>
          <span className="text-default-700 font-medium">{formatter(entry.value)}</span>
        </div>
      ))}
    </div>
  );
};

const AllocationsByMonthCard = ({
  dollars,
  percents,
  loading,
}: {
  dollars: StackedByFunder;
  percents: StackedByFunder;
  loading: boolean;
}) => {
  const [mode, setMode] = useState<"dollars" | "percent">("dollars");

  if (loading) {
    return (
      <Card className="dark:border-default-100 border border-transparent mb-6">
        <ChartSkeleton height={300} />
      </Card>
    );
  }

  const stacked = mode === "dollars" ? dollars : percents;
  const format = mode === "dollars" ? formatMoney : (v: number) => `${v.toFixed(1)}%`;

  return (
    <Card className="dark:border-default-100 border border-transparent mb-6">
      <div className="flex items-center justify-between p-4 pb-0">
        <h3 className="text-small text-default-500 font-medium">
          Allocations by Month (vintage cost basis)
        </h3>
        <Tabs size="sm" selectedKey={mode} onSelectionChange={(key) => setMode(key as typeof mode)}>
          <Tab key="dollars" title="$" />
          <Tab key="percent" title="%" />
        </Tabs>
      </div>

      {stacked.rows.length > 0 ? (
        <>
          <ResponsiveContainer
            className="[&_.recharts-surface]:outline-hidden"
            height={300}
            width="100%"
          >
            <BarChart
              accessibilityLayer
              data={stacked.rows}
              margin={{ top: 20, right: 14, left: 8, bottom: 5 }}
            >
              <CartesianGrid
                stroke="hsl(var(--heroui-default-200))"
                strokeDasharray="3 3"
                vertical={false}
              />
              <XAxis
                dataKey="month"
                strokeOpacity={0.25}
                style={{ fontSize: "var(--heroui-font-size-tiny)" }}
                tickLine={false}
                minTickGap={16}
              />
              <YAxis
                axisLine={false}
                style={{ fontSize: "var(--heroui-font-size-tiny)" }}
                tickLine={false}
                tickFormatter={(value) =>
                  mode === "dollars" ? formatMoney(value) : `${value.toFixed(0)}%`
                }
                domain={mode === "percent" ? [0, 100] : undefined}
              />
              <Tooltip
                content={<StackedTooltip formatter={format} />}
                cursor={{ fill: "hsl(var(--heroui-default-100))", opacity: 0.4 }}
              />
              {stacked.funders.map((funder, index) => (
                <Bar
                  key={funder}
                  animationDuration={450}
                  animationEasing="ease"
                  dataKey={funder}
                  stackId="allocations"
                  fill={funderColor(index)}
                />
              ))}
            </BarChart>
          </ResponsiveContainer>
          <FunderLegend funders={stacked.funders} />
        </>
      ) : (
        <EmptyChart height={300} />
      )}
    </Card>
  );
};

const AllocationPieCard = ({
  title,
  slices,
  loading,
}: {
  title: string;
  slices: PieSlice[];
  loading: boolean;
}) => {
  if (loading) {
    return (
      <Card className="dark:border-default-100 min-h-[340px] border border-transparent">
        <ChartSkeleton height={220} />
      </Card>
    );
  }

  const total = slices.reduce((sum, s) => sum + s.value, 0);

  return (
    <Card className="dark:border-default-100 min-h-[340px] border border-transparent">
      <div className="flex flex-col gap-y-2 p-4 pb-0">
        <h3 className="text-small text-default-500 font-medium">{title}</h3>
        <dd className="flex items-baseline gap-x-1">
          <span className="text-default-900 text-3xl font-semibold">{formatMoney(total)}</span>
          <span className="text-medium text-default-500 font-medium">total</span>
        </dd>
      </div>

      {slices.length > 0 ? (
        <>
          <ResponsiveContainer
            className="[&_.recharts-surface]:outline-hidden"
            height={200}
            width="100%"
          >
            <PieChart accessibilityLayer margin={{ top: 0, right: 0, left: 0, bottom: 0 }}>
              <Tooltip
                content={({ payload }) => {
                  if (!payload || payload.length === 0) return null;
                  return (
                    <div className="rounded-medium bg-background text-tiny shadow-small p-2">
                      {payload.map((entry, index) => (
                        <div key={index} className="flex items-center gap-x-2">
                          <div
                            className="h-2 w-2 rounded-full"
                            style={{ backgroundColor: entry.payload.fill }}
                          />
                          <span className="text-default-500">{entry.name}:</span>
                          <span className="text-default-700 font-medium">
                            {formatMoney(entry.value as number)}
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
                animationDuration={1000}
                animationEasing="ease"
                cornerRadius={6}
                data={slices}
                dataKey="value"
                innerRadius="60%"
                nameKey="name"
                paddingAngle={2}
                strokeWidth={0}
              >
                {slices.map((slice, index) => (
                  <Cell key={slice.name} fill={funderColor(index)} />
                ))}
                <Label
                  content={({ viewBox }) => {
                    if (viewBox && "cx" in viewBox && "cy" in viewBox) {
                      return (
                        <text
                          x={viewBox.cx}
                          y={viewBox.cy}
                          textAnchor="middle"
                          dominantBaseline="middle"
                        >
                          <tspan
                            x={viewBox.cx}
                            y={viewBox.cy! - 10}
                            className="fill-default-700 text-2xl font-bold"
                          >
                            {slices.length}
                          </tspan>
                          <tspan
                            x={viewBox.cx}
                            y={viewBox.cy! + 10}
                            className="fill-default-500 text-sm"
                          >
                            Funders
                          </tspan>
                        </text>
                      );
                    }
                    return null;
                  }}
                  position="center"
                />
              </Pie>
            </PieChart>
          </ResponsiveContainer>
          <FunderLegend funders={slices.map((s) => s.name)} />
        </>
      ) : (
        <EmptyChart />
      )}
    </Card>
  );
};

const rtrDateLabel = (date: string) => formatMonth(date.slice(0, 7));

const RtrCard = ({
  series,
  loading,
}: {
  series: ReturnType<typeof buildRtrSeries>;
  loading: boolean;
}) => {
  const [mode, setMode] = useState<"growth" | "by-funder">("growth");

  if (loading) {
    return (
      <Card className="dark:border-default-100 border border-transparent mb-6">
        <ChartSkeleton height={300} />
      </Card>
    );
  }

  const totalReceived =
    series.points.length > 0 ? series.points[series.points.length - 1].cumulative : 0;

  return (
    <Card className="dark:border-default-100 border border-transparent mb-6">
      <div className="flex items-center justify-between p-4 pb-0">
        <div className="flex flex-col gap-y-1">
          <h3 className="text-small text-default-500 font-medium">Net RTR Received</h3>
          <dd className="flex items-baseline gap-x-1">
            <span className="text-default-900 text-3xl font-semibold">
              {formatMoney(totalReceived)}
            </span>
            <span className="text-medium text-default-500 font-medium">to date</span>
          </dd>
        </div>
        <Tabs size="sm" selectedKey={mode} onSelectionChange={(key) => setMode(key as typeof mode)}>
          <Tab key="growth" title="Growth" />
          <Tab key="by-funder" title="By Funder" />
        </Tabs>
      </div>

      {series.points.length > 0 ? (
        <>
          <ResponsiveContainer
            className="[&_.recharts-surface]:outline-hidden"
            height={300}
            width="100%"
          >
            <AreaChart
              accessibilityLayer
              data={series.points}
              margin={{ top: 20, right: 14, left: 8, bottom: 5 }}
            >
              <defs>
                <linearGradient id="rtrGradient" x1="0" x2="0" y1="0" y2="1">
                  <stop offset="10%" stopColor="hsl(var(--heroui-primary-500))" stopOpacity={0.3} />
                  <stop
                    offset="100%"
                    stopColor="hsl(var(--heroui-primary-100))"
                    stopOpacity={0.1}
                  />
                </linearGradient>
              </defs>
              <CartesianGrid
                stroke="hsl(var(--heroui-default-200))"
                strokeDasharray="3 3"
                vertical={false}
              />
              <XAxis
                dataKey="date"
                strokeOpacity={0.25}
                style={{ fontSize: "var(--heroui-font-size-tiny)" }}
                tickLine={false}
                tickFormatter={rtrDateLabel}
                minTickGap={24}
              />
              <YAxis
                axisLine={false}
                style={{ fontSize: "var(--heroui-font-size-tiny)" }}
                tickLine={false}
                tickFormatter={formatMoney}
              />
              <Tooltip
                content={({ active, label, payload }) => {
                  if (!active || !payload || payload.length === 0) return null;
                  return (
                    <StackedTooltip
                      active
                      label={String(label)}
                      payload={payload as Array<{ name: string; value: number; color?: string }>}
                      formatter={formatMoney}
                    />
                  );
                }}
                cursor={{ strokeWidth: 0 }}
              />
              {mode === "growth" ? (
                <Area
                  animationDuration={800}
                  animationEasing="ease"
                  dataKey="cumulative"
                  name="Cumulative Net RTR"
                  fill="url(#rtrGradient)"
                  stroke="hsl(var(--heroui-primary-500))"
                  strokeWidth={2}
                  type="monotone"
                />
              ) : (
                series.funders.map((funder, index) => (
                  <Area
                    key={funder}
                    animationDuration={800}
                    animationEasing="ease"
                    dataKey={funder}
                    stackId="rtr"
                    fill={funderColor(index)}
                    fillOpacity={0.7}
                    stroke={funderColor(index)}
                    strokeWidth={1}
                    type="monotone"
                  />
                ))
              )}
            </AreaChart>
          </ResponsiveContainer>
          {mode === "by-funder" && <FunderLegend funders={series.funders} />}
        </>
      ) : (
        <EmptyChart height={300} />
      )}
    </Card>
  );
};

const CommissionsCard = ({
  data,
  loading,
}: {
  data: ReturnType<typeof buildCommissionsByMonth>;
  loading: boolean;
}) => {
  if (loading) {
    return (
      <Card className="dark:border-default-100 min-h-[340px] border border-transparent">
        <ChartSkeleton />
      </Card>
    );
  }

  return (
    <Card className="dark:border-default-100 min-h-[340px] border border-transparent">
      <div className="flex flex-col gap-y-4 p-4">
        <h3 className="text-small text-default-500 font-medium">
          Participation &amp; Commissions by Month
        </h3>
        {data.length > 0 ? (
          <>
            <ResponsiveContainer
              className="[&_.recharts-surface]:outline-hidden"
              height={250}
              width="100%"
            >
              <BarChart accessibilityLayer data={data} margin={{ top: 10, right: 14, left: 8 }}>
                <CartesianGrid
                  stroke="hsl(var(--heroui-default-200))"
                  strokeDasharray="3 3"
                  vertical={false}
                />
                <XAxis
                  dataKey="month"
                  strokeOpacity={0.25}
                  style={{ fontSize: "var(--heroui-font-size-tiny)" }}
                  tickLine={false}
                  minTickGap={16}
                />
                <YAxis
                  axisLine={false}
                  style={{ fontSize: "var(--heroui-font-size-tiny)" }}
                  tickLine={false}
                  tickFormatter={formatMoney}
                />
                <Tooltip
                  content={<StackedTooltip formatter={formatMoney} />}
                  cursor={{ fill: "hsl(var(--heroui-default-100))", opacity: 0.4 }}
                />
                <Bar
                  animationDuration={450}
                  dataKey="participation"
                  name="Participation $"
                  fill="hsl(var(--heroui-default-400))"
                  radius={[3, 3, 0, 0]}
                />
                <Bar
                  animationDuration={450}
                  dataKey="commissions"
                  name="Commissions $"
                  fill="hsl(var(--heroui-warning-500))"
                  radius={[3, 3, 0, 0]}
                />
              </BarChart>
            </ResponsiveContainer>
            <div className="text-tiny text-default-500 flex justify-center gap-4">
              <div className="flex items-center gap-2">
                <span
                  className="h-2 w-2 rounded-full"
                  style={{ backgroundColor: "hsl(var(--heroui-default-400))" }}
                />
                Participation $
              </div>
              <div className="flex items-center gap-2">
                <span
                  className="h-2 w-2 rounded-full"
                  style={{ backgroundColor: "hsl(var(--heroui-warning-500))" }}
                />
                Commissions $
              </div>
            </div>
          </>
        ) : (
          <EmptyChart />
        )}
      </div>
    </Card>
  );
};

const PointsPerMonthCard = ({
  data,
  loading,
}: {
  data: ReturnType<typeof buildVintagePerformance>;
  loading: boolean;
}) => {
  if (loading) {
    return (
      <Card className="dark:border-default-100 min-h-[340px] border border-transparent">
        <ChartSkeleton />
      </Card>
    );
  }

  const rows = data.filter((d) => d.pointsPerMonth != null);

  return (
    <Card className="dark:border-default-100 min-h-[340px] border border-transparent">
      <div className="flex flex-col gap-y-4 p-4">
        <h3 className="text-small text-default-500 font-medium">Points per Month by Vintage</h3>
        {rows.length > 0 ? (
          <ResponsiveContainer
            className="[&_.recharts-surface]:outline-hidden"
            height={250}
            width="100%"
          >
            <BarChart accessibilityLayer data={rows} margin={{ top: 10, right: 14, left: 8 }}>
              <CartesianGrid
                stroke="hsl(var(--heroui-default-200))"
                strokeDasharray="3 3"
                vertical={false}
              />
              <XAxis
                dataKey="month"
                strokeOpacity={0.25}
                style={{ fontSize: "var(--heroui-font-size-tiny)" }}
                tickLine={false}
                minTickGap={16}
              />
              <YAxis
                axisLine={false}
                style={{ fontSize: "var(--heroui-font-size-tiny)" }}
                tickLine={false}
                tickFormatter={(value) => value.toFixed(1)}
              />
              <Tooltip
                content={({ active, label, payload }) => {
                  if (!active || !payload || payload.length === 0) return null;
                  return (
                    <div className="rounded-medium bg-background text-tiny shadow-small p-2">
                      <p className="font-medium">{label}</p>
                      <p className="text-default-500">
                        {(payload[0].value as number).toFixed(2)} points / month
                      </p>
                    </div>
                  );
                }}
                cursor={{ fill: "hsl(var(--heroui-default-100))", opacity: 0.4 }}
              />
              <Bar
                animationDuration={450}
                dataKey="pointsPerMonth"
                name="Points per Month"
                fill="hsl(var(--heroui-secondary-500))"
                radius={[3, 3, 0, 0]}
              />
            </BarChart>
          </ResponsiveContainer>
        ) : (
          <EmptyChart />
        )}
      </div>
    </Card>
  );
};

const TermVsFactorCard = ({
  data,
  loading,
}: {
  data: ReturnType<typeof buildVintagePerformance>;
  loading: boolean;
}) => {
  if (loading) {
    return (
      <Card className="dark:border-default-100 border border-transparent mb-6">
        <ChartSkeleton height={280} />
      </Card>
    );
  }

  const rows = data.filter((d) => d.termMonths != null || d.weightedAvgFactor != null);

  return (
    <Card className="dark:border-default-100 border border-transparent mb-6">
      <div className="flex items-center justify-between p-4 pb-0">
        <h3 className="text-small text-default-500 font-medium">
          Term vs Weighted Avg Net Factor by Vintage
        </h3>
        <div className="text-tiny text-default-500 flex gap-4">
          <div className="flex items-center gap-2">
            <span
              className="h-2 w-2 rounded-full"
              style={{ backgroundColor: "hsl(var(--heroui-default-400))" }}
            />
            Term (months)
          </div>
          <div className="flex items-center gap-2">
            <span
              className="h-2 w-2 rounded-full"
              style={{ backgroundColor: "hsl(var(--heroui-primary-500))" }}
            />
            Net Factor
          </div>
        </div>
      </div>

      {rows.length > 0 ? (
        <ResponsiveContainer
          className="[&_.recharts-surface]:outline-hidden"
          height={280}
          width="100%"
        >
          <ComposedChart
            accessibilityLayer
            data={rows}
            margin={{ top: 20, right: 14, left: 8, bottom: 5 }}
          >
            <CartesianGrid
              stroke="hsl(var(--heroui-default-200))"
              strokeDasharray="3 3"
              vertical={false}
            />
            <XAxis
              dataKey="month"
              strokeOpacity={0.25}
              style={{ fontSize: "var(--heroui-font-size-tiny)" }}
              tickLine={false}
              minTickGap={16}
            />
            <YAxis
              yAxisId="term"
              axisLine={false}
              style={{ fontSize: "var(--heroui-font-size-tiny)" }}
              tickLine={false}
              tickFormatter={(value) => `${value.toFixed(0)}mo`}
            />
            <YAxis
              yAxisId="factor"
              orientation="right"
              axisLine={false}
              style={{ fontSize: "var(--heroui-font-size-tiny)" }}
              tickLine={false}
              domain={["auto", "auto"]}
              tickFormatter={(value) => value.toFixed(2)}
            />
            <Tooltip
              content={({ active, label, payload }) => {
                if (!active || !payload || payload.length === 0) return null;
                const term = payload.find((p) => p.dataKey === "termMonths");
                const factor = payload.find((p) => p.dataKey === "weightedAvgFactor");
                return (
                  <div className="rounded-medium bg-background text-tiny shadow-small p-2">
                    <p className="font-medium">{label}</p>
                    {term?.value != null && (
                      <p className="text-default-500">
                        Term: {(term.value as number).toFixed(1)} months
                      </p>
                    )}
                    {factor?.value != null && (
                      <p className="text-default-500">
                        Net factor: {(factor.value as number).toFixed(3)}
                      </p>
                    )}
                  </div>
                );
              }}
              cursor={{ fill: "hsl(var(--heroui-default-100))", opacity: 0.4 }}
            />
            <Bar
              yAxisId="term"
              animationDuration={450}
              dataKey="termMonths"
              name="Term (months)"
              fill="hsl(var(--heroui-default-300))"
              radius={[3, 3, 0, 0]}
            />
            <Line
              yAxisId="factor"
              animationDuration={800}
              dataKey="weightedAvgFactor"
              name="Weighted Avg Net Factor"
              stroke="hsl(var(--heroui-primary-500))"
              strokeWidth={2}
              dot={false}
              type="monotone"
            />
          </ComposedChart>
        </ResponsiveContainer>
      ) : (
        <EmptyChart height={280} />
      )}
    </Card>
  );
};

export default Dashboard;
