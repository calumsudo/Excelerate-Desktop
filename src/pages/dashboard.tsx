"use client";

import { Button, Card, Chip, Select, SelectItem } from "@heroui/react";
import { Icon } from "@iconify/react";
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
import NeedsAttentionCard from "@components/dashboard/needs-attention-card";
import { ConcentrationSection } from "@components/dashboard/concentration-section";
import { useDashboardAnalytics } from "@/hooks/use-dashboard-analytics";

const ALL_PORTFOLIOS_KEY = "all";

function Dashboard() {
  const {
    portfolios,
    selection,
    setSelection,
    funderId,
    setFunderId,
    funderName,
    scopeLabel,
    loading,
    error,
    hasData,
    kpiCards,
    allocations,
    allocationsPct,
    latestVintage,
    currentAlloc,
    commissions,
    rtrSeries,
    performance,
    deals,
    dealsLoading,
    dealsError,
    needsAttention,
    attentionLoading,
    concentration,
    concentrationLoading,
    onFunderClick,
  } = useDashboardAnalytics();

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

      {/* At-risk deals flagged by the deal_health view, worst first */}
      <NeedsAttentionCard deals={needsAttention} loading={attentionLoading} />

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

      {/* Geographic + industry exposure with concentration-limit flags */}
      <ConcentrationSection breakdown={concentration} loading={concentrationLoading} />

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
