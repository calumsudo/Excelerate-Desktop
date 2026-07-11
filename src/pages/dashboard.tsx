"use client";

import { useState, useEffect, useMemo } from "react";
import { Button, Card, Chip, Select, SelectItem } from "@heroui/react";
import { Icon } from "@iconify/react";
import {
  listPortfolios,
  getPortfolioAnalytics,
  getFunderDeals,
  computeKpis,
  aggregateMonthlyByVintage,
  buildAllocationsByMonth,
  normalizeStacked,
  latestMonthAllocation,
  currentAllocation,
  buildCommissionsByMonth,
  buildRtrSeries,
  buildVintagePerformance,
  formatMoney,
  formatPct,
  type PortfolioOption,
  type PortfolioSelection,
  type PortfolioAnalytics,
  type MonthlyStatsRow,
  type FunderDealRow,
} from "@services/analytics-service";
import {
  KpiCard,
  AllocationsByMonthCard,
  AllocationPieCard,
  RtrCard,
  CommissionsCard,
  PointsPerMonthCard,
  TermVsFactorCard,
} from "@components/dashboard/charts";
import FunderDealsTable from "@components/dashboard/funder-deals-table";

const ALL_PORTFOLIOS_KEY = "all";

function Dashboard() {
  const [portfolios, setPortfolios] = useState<PortfolioOption[]>([]);
  const [selection, setSelection] = useState<PortfolioSelection | null>(null);
  const [analytics, setAnalytics] = useState<PortfolioAnalytics | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Funder drill-down (set by clicking a funder in a legend / pie / bar)
  const [funderId, setFunderId] = useState<number | null>(null);
  const [deals, setDeals] = useState<FunderDealRow[]>([]);
  const [dealsLoading, setDealsLoading] = useState(false);
  const [dealsError, setDealsError] = useState<string | null>(null);

  useEffect(() => {
    listPortfolios()
      .then((list) => {
        setPortfolios(list);
        setSelection((current) => current ?? (list.length > 0 ? "all" : null));
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
    if (selection == null) return;
    let cancelled = false;
    setLoading(true);
    setError(null);
    getPortfolioAnalytics(selection)
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
  }, [selection]);

  useEffect(() => {
    if (funderId == null || selection == null) {
      setDeals([]);
      setDealsError(null);
      return;
    }
    let cancelled = false;
    setDealsLoading(true);
    setDealsError(null);
    getFunderDeals(selection, funderId)
      .then((rows) => {
        if (!cancelled) setDeals(rows);
      })
      .catch((err) => {
        if (!cancelled) setDealsError(err instanceof Error ? err.message : "Failed to load deals");
      })
      .finally(() => {
        if (!cancelled) setDealsLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [funderId, selection]);

  const funderIdsByName = useMemo(
    () =>
      new Map(Object.entries(analytics?.funderNames ?? {}).map(([id, name]) => [name, Number(id)])),
    [analytics]
  );

  const handleFunderClick = (funderName: string) => {
    const id = funderIdsByName.get(funderName);
    if (id != null) setFunderId(id);
  };

  const funderName = funderId != null ? (analytics?.funderNames[funderId] ?? null) : null;
  const scopeLabel =
    selection === "all"
      ? "All Portfolios"
      : (portfolios.find((p) => p.id === selection)?.name ?? "");

  // Vintage-month rows for the current scope. The combined view and the funder
  // view can both have several source rows per month, so collapse them first.
  const monthlyRows = useMemo<MonthlyStatsRow[]>(() => {
    if (!analytics) return [];
    if (funderId != null)
      return aggregateMonthlyByVintage(analytics.vintages.filter((v) => v.funder_id === funderId));
    if (selection === "all") return aggregateMonthlyByVintage(analytics.monthly);
    return analytics.monthly;
  }, [analytics, selection, funderId]);

  const vintagesInScope = useMemo(() => {
    if (!analytics) return [];
    return funderId != null
      ? analytics.vintages.filter((v) => v.funder_id === funderId)
      : analytics.vintages;
  }, [analytics, funderId]);

  const rtrInScope = useMemo(() => {
    if (!analytics) return [];
    return funderId != null ? analytics.rtr.filter((r) => r.funder_id === funderId) : analytics.rtr;
  }, [analytics, funderId]);

  const kpis = useMemo(() => computeKpis(monthlyRows), [monthlyRows]);
  const allocations = useMemo(
    () => buildAllocationsByMonth(vintagesInScope, analytics?.funderNames ?? {}),
    [vintagesInScope, analytics]
  );
  const allocationsPct = useMemo(() => normalizeStacked(allocations), [allocations]);
  const latestVintage = useMemo(
    () => latestMonthAllocation(vintagesInScope, analytics?.funderNames ?? {}),
    [vintagesInScope, analytics]
  );
  const currentAlloc = useMemo(
    () => currentAllocation(analytics?.allocations ?? [], analytics?.funderNames ?? {}),
    [analytics]
  );
  const commissions = useMemo(() => buildCommissionsByMonth(monthlyRows), [monthlyRows]);
  const rtrSeries = useMemo(
    () => buildRtrSeries(rtrInScope, analytics?.funderNames ?? {}),
    [rtrInScope, analytics]
  );
  const performance = useMemo(() => buildVintagePerformance(monthlyRows), [monthlyRows]);

  // Snapshot cards for the funder drill-down, from funder_allocation_current.
  // In the "all" scope a funder has one row per portfolio, so sum / re-weight.
  const funderSnapshot = useMemo(() => {
    if (funderId == null || !analytics) return null;
    const rows = analytics.allocations.filter((a) => a.funder_id === funderId);
    const initial = rows.reduce((acc, r) => acc + (r.initial_cost_basis ?? 0), 0);
    const current = rows.reduce((acc, r) => acc + (r.current_cost_basis ?? 0), 0);
    const received = rows.reduce((acc, r) => acc + (r.rtr_received ?? 0), 0);
    const totalCurrent = analytics.allocations.reduce(
      (acc, r) => acc + Math.max(r.current_cost_basis ?? 0, 0),
      0
    );
    return {
      initial,
      current,
      received,
      share: totalCurrent > 0 ? Math.max(current, 0) / totalCurrent : 0,
    };
  }, [analytics, funderId]);

  const hasData = monthlyRows.length > 0;

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
    ...(funderSnapshot
      ? [
          {
            title: "Current Cost Basis",
            value: formatMoney(funderSnapshot.current),
            subtitle: `of ${formatMoney(funderSnapshot.initial)} initial`,
            icon: "solar:money-bag-bold",
          },
          {
            title: "RTR Received (snapshot)",
            value: formatMoney(funderSnapshot.received),
            subtitle: "current allocation view",
            icon: "solar:round-double-alt-arrow-down-bold",
          },
          {
            title: "Share of Current Allocation",
            value: formatPct(funderSnapshot.share),
            subtitle: `within ${scopeLabel.toLowerCase()}`,
            icon: "solar:pie-chart-2-bold",
          },
        ]
      : []),
  ];

  const onFunderClick = funderId == null ? handleFunderClick : undefined;

  return (
    <div className="p-6">
      <div className="flex justify-between items-center mb-6 gap-4">
        {funderName ? (
          <div className="flex items-center gap-3 min-w-0">
            <Button
              isIconOnly
              size="sm"
              variant="light"
              aria-label={`Back to ${scopeLabel}`}
              onPress={() => setFunderId(null)}
            >
              <Icon icon="solar:arrow-left-linear" width={20} />
            </Button>
            <h1 className="text-3xl font-bold truncate">{funderName}</h1>
            <Chip size="sm" variant="flat">
              {scopeLabel}
            </Chip>
          </div>
        ) : (
          <div className="flex flex-col gap-1">
            <h1 className="text-3xl font-bold">Portfolio Dashboard</h1>
            <p className="text-small text-default-400">
              Click a funder in any legend or chart to drill into funder-level detail.
            </p>
          </div>
        )}
        <Select
          aria-label="Select Portfolio"
          className="max-w-[220px]"
          isDisabled={portfolios.length === 0}
          selectedKeys={
            selection != null ? [selection === "all" ? ALL_PORTFOLIOS_KEY : String(selection)] : []
          }
          onSelectionChange={(keys) => {
            const key = Array.from(keys)[0];
            if (key == null) return;
            setFunderId(null);
            setSelection(key === ALL_PORTFOLIOS_KEY ? "all" : Number(key));
          }}
        >
          {[
            <SelectItem key={ALL_PORTFOLIOS_KEY}>All Portfolios</SelectItem>,
            ...portfolios.map((p) => <SelectItem key={String(p.id)}>{p.name}</SelectItem>),
          ]}
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
            <p className="text-default-600 font-medium">
              {funderName
                ? `No deal data for ${funderName} in this scope yet`
                : "No deal data in this portfolio yet"}
            </p>
            {!funderName && (
              <p className="text-default-400 text-small">
                Run the one-time workbook import from the portfolio page to populate the dashboard.
              </p>
            )}
          </div>
        </Card>
      )}

      {/* KPI cards from portfolio_monthly / monthly_vintage_stats */}
      <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-4 mb-6">
        {kpiCards.map((item) => (
          <KpiCard key={item.title} {...item} loading={loading} />
        ))}
      </div>

      {/* Allocations / cost basis by vintage month */}
      <AllocationsByMonthCard
        title={
          funderName
            ? `${funderName} — Cost Basis by Vintage Month`
            : "Allocations by Month (vintage cost basis)"
        }
        dollars={allocations}
        percents={allocationsPct}
        loading={loading}
        onFunderClick={onFunderClick}
      />

      {/* Allocation snapshots — portfolio scope only; a one-funder pie says nothing */}
      {funderId == null && (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 mb-6">
          <AllocationPieCard
            title={
              latestVintage.month
                ? `Allocation — ${latestVintage.month} Vintage`
                : "Latest Vintage Allocation"
            }
            slices={latestVintage.slices}
            loading={loading}
            onFunderClick={onFunderClick}
          />
          <AllocationPieCard
            title="Current Allocation — Cost Basis"
            slices={currentAlloc}
            loading={loading}
            onFunderClick={onFunderClick}
          />
        </div>
      )}

      {/* RTR received over time */}
      <RtrCard series={rtrSeries} loading={loading} onFunderClick={onFunderClick} />

      {/* Vintage performance */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 mb-6">
        <CommissionsCard data={commissions} loading={loading} />
        <PointsPerMonthCard data={performance} loading={loading} />
      </div>

      <TermVsFactorCard data={performance} loading={loading} />

      {/* Funder drill-down: the funder's deals */}
      {funderId != null && (
        <FunderDealsTable deals={deals} loading={dealsLoading} error={dealsError} />
      )}
    </div>
  );
}

export default Dashboard;
