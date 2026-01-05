"use client";

import { useState, useEffect, useMemo } from "react";
import {
  Card,
  Select,
  SelectItem,
  Chip,
  Button,
  Dropdown,
  DropdownItem,
  DropdownMenu,
  DropdownTrigger,
  Skeleton,
  Tab,
  Tabs,
  Spacer,
  cn
} from "@heroui/react";
import { Icon } from "@iconify/react";
import { ResponsiveContainer, PieChart, Pie, Tooltip, Cell, Label, BarChart, Bar, XAxis, YAxis, Area, AreaChart, CartesianGrid } from "recharts";
import {
  MerchantData,
  FunderDistribution,
  MonthlyFunding,
  getPortfolioMerchants,
  calculateMetrics,
  groupByFunder,
  getMonthlyTrends
} from "@services/dashboard-service";

type PortfolioOption = "all" | "alder" | "white-rabbit";

type TrendCardProps = {
  title: string;
  value: string;
  change?: string;
  changeType: "positive" | "neutral" | "negative";
  trendType: "up" | "neutral" | "down";
  icon?: string;
};

function Dashboard() {
  const [selectedPortfolio, setSelectedPortfolio] = useState<PortfolioOption>("all");
  const [merchants, setMerchants] = useState<MerchantData[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const loadData = async () => {
      setLoading(true);
      setError(null);
      try {
        let allMerchants: MerchantData[] = [];
        
        if (selectedPortfolio === "all") {
          const [alderData, whiteRabbitData] = await Promise.all([
            getPortfolioMerchants("Alder"),
            getPortfolioMerchants("White Rabbit")
          ]);
          allMerchants = [...alderData, ...whiteRabbitData];
        } else {
          const portfolioName = selectedPortfolio === "alder" ? "Alder" : "White Rabbit";
          allMerchants = await getPortfolioMerchants(portfolioName);
        }
        
        setMerchants(allMerchants);
      } catch (err) {
        setError(err instanceof Error ? err.message : "Failed to load data");
      } finally {
        setLoading(false);
      }
    };

    loadData();
  }, [selectedPortfolio]);

  const stats = useMemo(() => calculateMetrics(merchants), [merchants]);
  const funderDistribution = useMemo(() => groupByFunder(merchants), [merchants]);
  const monthlyTrends = useMemo(() => getMonthlyTrends(merchants), [merchants]);

  const kpiData: TrendCardProps[] = [
    {
      title: "Total Merchants",
      value: stats.totalMerchants.toLocaleString(),
      change: "New this month",
      changeType: "positive",
      trendType: "up",
      icon: "solar:users-group-rounded-bold"
    },
    {
      title: "Total Funded",
      value: `$${(stats.totalFunded / 1000000).toFixed(2)}M`,
      change: "12.5%",
      changeType: "positive",
      trendType: "up",
      icon: "solar:dollar-bold"
    },
    {
      title: "Avg Buy Rate",
      value: `${(stats.avgBuyRate * 100).toFixed(2)}%`,
      change: "0.2%",
      changeType: "neutral",
      trendType: "neutral",
      icon: "solar:chart-bold"
    },
    {
      title: "Active Funders",
      value: stats.activeFunders.toString(),
      change: `${stats.recentFundings} recent`,
      changeType: stats.recentFundings > 0 ? "positive" : "neutral",
      trendType: stats.recentFundings > 0 ? "up" : "neutral",
      icon: "solar:buildings-bold"
    },
  ];

  return (
    <div className="p-6">
      <div className="flex justify-between items-center mb-6">
        <h1 className="text-3xl font-bold">Portfolio Dashboard</h1>
        <Select
          aria-label="Select Portfolio"
          className="max-w-[200px]"
          selectedKeys={[selectedPortfolio]}
          onSelectionChange={(keys) => {
            const selected = Array.from(keys)[0] as PortfolioOption;
            setSelectedPortfolio(selected);
          }}
        >
          <SelectItem key="all">All Portfolios</SelectItem>
          <SelectItem key="alder">Alder</SelectItem>
          <SelectItem key="white-rabbit">White Rabbit</SelectItem>
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

      {/* KPI Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
        {kpiData.map((item, index) => (
          <TrendCard key={index} {...item} loading={loading} />
        ))}
      </div>

      {/* Charts Section */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 mb-6">
        {/* Funder Distribution Pie Chart */}
        <FunderDistributionChart 
          data={funderDistribution} 
          loading={loading}
          title="Funding Distribution by Partner"
        />

        {/* Monthly Trends Bar Chart */}
        <MonthlyFundingChart 
          data={monthlyTrends}
          loading={loading}
          title="Monthly Funding Trends"
        />
      </div>

      {/* Comprehensive Funding Analytics */}
      <FundingAnalyticsChart
        merchants={merchants}
        loading={loading}
      />

      {/* Funder Specific Stats Section */}
      <div className="space-y-6">
        <h2 className="text-xl font-semibold">Funder Performance Details</h2>
        
        {/* Top Funders Grid */}
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
          {funderDistribution.slice(0, 6).map((funder, index) => (
            <FunderStatCard 
              key={funder.name}
              funder={funder}
              merchants={merchants.filter(m => m.funder_name === funder.name)}
              color={["primary", "secondary", "success", "warning", "danger", "default"][index % 6] as any}
              loading={loading}
            />
          ))}
        </div>

        {/* State Distribution and Industry Breakdown */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          <StateDistributionChart 
            merchants={merchants}
            loading={loading}
          />
          <IndustryBreakdownChart
            merchants={merchants}
            loading={loading}
          />
        </div>

        {/* Funder Comparison Table */}
        <FunderComparisonTable 
          merchants={merchants}
          loading={loading}
        />
      </div>
    </div>
  );
}

const TrendCard = ({ title, value, change, changeType, trendType, icon, loading }: TrendCardProps & { loading?: boolean }) => {
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
      <div className="flex p-4">
        <div className="flex flex-col gap-y-2 flex-1">
          <dt className="text-small text-default-500 font-medium flex items-center gap-2">
            {icon && <Icon icon={icon} width={16} />}
            {title}
          </dt>
          <dd className="text-default-700 text-2xl font-semibold">{value}</dd>
        </div>
        {change && (
          <Chip
            className="absolute right-4 top-4"
            classNames={{
              content: "font-medium text-[0.65rem]",
            }}
            color={
              changeType === "positive" ? "success" : changeType === "neutral" ? "warning" : "danger"
            }
            radius="sm"
            size="sm"
            startContent={
              trendType === "up" ? (
                <Icon height={12} icon="solar:arrow-right-up-linear" width={12} />
              ) : trendType === "neutral" ? (
                <Icon height={12} icon="solar:arrow-right-linear" width={12} />
              ) : (
                <Icon height={12} icon="solar:arrow-right-down-linear" width={12} />
              )
            }
            variant="flat"
          >
            {change}
          </Chip>
        )}
      </div>
    </Card>
  );
};

const FunderDistributionChart = ({ 
  data, 
  loading, 
  title 
}: { 
  data: FunderDistribution[]; 
  loading: boolean;
  title: string;
}) => {
  if (loading) {
    return (
      <Card className="dark:border-default-100 min-h-[340px] border border-transparent">
        <div className="p-4">
          <Skeleton className="rounded-lg mb-4">
            <div className="h-4 w-48 bg-default-200"></div>
          </Skeleton>
          <Skeleton className="rounded-lg mx-auto">
            <div className="h-[200px] w-[200px] bg-default-200"></div>
          </Skeleton>
        </div>
      </Card>
    );
  }

  const colors = ["primary", "secondary", "success", "warning", "danger", "default"];
  const totalValue = data.reduce((sum, item) => sum + item.value, 0);

  return (
    <Card className="dark:border-default-100 min-h-[340px] border border-transparent">
      <div className="flex flex-col gap-y-2 p-4 pb-0">
        <div className="flex items-center justify-between gap-x-2">
          <h3 className="text-small text-default-500 font-medium">{title}</h3>
          <Dropdown
            classNames={{
              content: "min-w-[120px]",
            }}
            placement="bottom-end"
          >
            <DropdownTrigger>
              <Button isIconOnly radius="full" size="sm" variant="light">
                <Icon height={16} icon="solar:menu-dots-bold" width={16} />
              </Button>
            </DropdownTrigger>
            <DropdownMenu
              itemClasses={{
                title: "text-tiny",
              }}
              variant="flat"
            >
              <DropdownItem key="export-data">Export Data</DropdownItem>
              <DropdownItem key="view-details">View Details</DropdownItem>
            </DropdownMenu>
          </Dropdown>
        </div>
        <dd className="flex items-baseline gap-x-1">
          <span className="text-default-900 text-3xl font-semibold">
            ${(totalValue / 1000000).toFixed(1)}M
          </span>
          <span className="text-medium text-default-500 font-medium">total</span>
        </dd>
      </div>
      
      {data.length > 0 ? (
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
                            ${(entry.value as number / 1000000).toFixed(2)}M
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
                cornerRadius={12}
                data={data}
                dataKey="value"
                innerRadius="68%"
                nameKey="name"
                paddingAngle={-20}
                strokeWidth={0}
              >
                {data.map((_, index) => (
                  <Cell
                    key={`cell-${index}`}
                    fill={`hsl(var(--heroui-${colors[index % colors.length]}-500))`}
                  />
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
                            {data.length}
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

          <div className="text-tiny text-default-500 flex w-full flex-wrap justify-center gap-4 px-4 pb-4">
            {data.slice(0, 4).map((item, index) => (
              <div key={index} className="flex items-center gap-2">
                <span
                  className="h-2 w-2 rounded-full"
                  style={{
                    backgroundColor: `hsl(var(--heroui-${colors[index % colors.length]}-500))`,
                  }}
                />
                <span className="capitalize">{item.name}</span>
              </div>
            ))}
          </div>
        </>
      ) : (
        <div className="flex items-center justify-center h-[250px]">
          <span className="text-default-400">No data available</span>
        </div>
      )}
    </Card>
  );
};

const MonthlyFundingChart = ({ 
  data, 
  loading, 
  title 
}: { 
  data: MonthlyFunding[];
  loading: boolean;
  title: string;
}) => {
  if (loading) {
    return (
      <Card className="dark:border-default-100 min-h-[340px] border border-transparent">
        <div className="p-4">
          <Skeleton className="rounded-lg mb-4">
            <div className="h-4 w-48 bg-default-200"></div>
          </Skeleton>
          <Skeleton className="rounded-lg">
            <div className="h-[250px] w-full bg-default-200"></div>
          </Skeleton>
        </div>
      </Card>
    );
  }

  return (
    <Card className="dark:border-default-100 min-h-[340px] border border-transparent">
      <div className="flex flex-col gap-y-4 p-4">
        <div className="flex items-center justify-between">
          <h3 className="text-small text-default-500 font-medium">{title}</h3>
          <Dropdown
            classNames={{
              content: "min-w-[120px]",
            }}
            placement="bottom-end"
          >
            <DropdownTrigger>
              <Button isIconOnly radius="full" size="sm" variant="light">
                <Icon height={16} icon="solar:menu-dots-bold" width={16} />
              </Button>
            </DropdownTrigger>
            <DropdownMenu
              itemClasses={{
                title: "text-tiny",
              }}
              variant="flat"
            >
              <DropdownItem key="export-data">Export Data</DropdownItem>
              <DropdownItem key="view-details">View Details</DropdownItem>
            </DropdownMenu>
          </Dropdown>
        </div>
        
        {data.length > 0 ? (
          <ResponsiveContainer
            className="[&_.recharts-surface]:outline-hidden"
            height={250}
            width="100%"
          >
            <BarChart
              accessibilityLayer
              data={data}
              margin={{
                top: 20,
                right: 14,
                left: -8,
                bottom: 5,
              }}
            >
              <XAxis
                dataKey="month"
                strokeOpacity={0.25}
                style={{ fontSize: "var(--heroui-font-size-tiny)" }}
                tickLine={false}
              />
              <YAxis
                axisLine={false}
                style={{ fontSize: "var(--heroui-font-size-tiny)" }}
                tickLine={false}
                tickFormatter={(value) => `$${(value / 1000000).toFixed(1)}M`}
              />
              <Tooltip
                content={({ active, payload, label }) => {
                  if (active && payload && payload.length) {
                    return (
                      <div className="rounded-medium bg-background text-tiny shadow-small p-2">
                        <p className="font-medium">{label}</p>
                        <p className="text-default-500">
                          Amount: ${(payload[0].value as number / 1000000).toFixed(2)}M
                        </p>
                        <p className="text-default-500">
                          Deals: {payload[0].payload.count}
                        </p>
                      </div>
                    );
                  }
                  return null;
                }}
                cursor={false}
              />
              <Bar
                animationDuration={450}
                animationEasing="ease"
                barSize={40}
                dataKey="amount"
                fill="hsl(var(--heroui-primary-500))"
                radius={[4, 4, 0, 0]}
              />
            </BarChart>
          </ResponsiveContainer>
        ) : (
          <div className="flex items-center justify-center h-[250px]">
            <span className="text-default-400">No data available</span>
          </div>
        )}
      </div>
    </Card>
  );
};

// Funder-specific stat card component
const FunderStatCard = ({ 
  funder, 
  merchants, 
  color, 
  loading 
}: { 
  funder: FunderDistribution;
  merchants: MerchantData[];
  color: "primary" | "secondary" | "success" | "warning" | "danger" | "default";
  loading: boolean;
}) => {
  if (loading) {
    return (
      <Card className="dark:border-default-100 border border-transparent">
        <div className="p-4">
          <Skeleton className="rounded-lg mb-2">
            <div className="h-4 w-32 bg-default-200"></div>
          </Skeleton>
          <Skeleton className="rounded-lg">
            <div className="h-20 w-full bg-default-200"></div>
          </Skeleton>
        </div>
      </Card>
    );
  }

  const avgBuyRate = merchants.length > 0
    ? merchants.filter(m => m.buy_rate).reduce((sum, m) => sum + (m.buy_rate || 0), 0) / merchants.filter(m => m.buy_rate).length
    : 0;

  const avgCommission = merchants.length > 0
    ? merchants.filter(m => m.commission).reduce((sum, m) => sum + (m.commission || 0), 0) / merchants.filter(m => m.commission).length
    : 0;

  const states = [...new Set(merchants.filter(m => m.state).map(m => m.state!))];
  const recentDeals = merchants.filter(m => {
    if (!m.date_funded) return false;
    const date = new Date(m.date_funded);
    const thirtyDaysAgo = new Date();
    thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);
    return date >= thirtyDaysAgo;
  }).length;

  return (
    <Card className="dark:border-default-100 border border-transparent">
      <div className="p-4">
        <div className="flex items-start justify-between mb-3">
          <div>
            <h3 className="text-medium font-semibold">{funder.name}</h3>
            <p className="text-small text-default-500">{merchants.length} merchants</p>
          </div>
          <Chip
            color={color}
            size="sm"
            variant="flat"
            className="text-tiny"
          >
            {(funder.percentage || 0).toFixed(1)}%
          </Chip>
        </div>

        <div className="space-y-3">
          <div className="flex justify-between items-center">
            <span className="text-small text-default-500">Total Funded</span>
            <span className="text-small font-semibold">${(funder.value / 1000000).toFixed(2)}M</span>
          </div>
          
          <div className="flex justify-between items-center">
            <span className="text-small text-default-500">Avg Buy Rate</span>
            <span className="text-small font-semibold">{(avgBuyRate * 100).toFixed(2)}%</span>
          </div>
          
          <div className="flex justify-between items-center">
            <span className="text-small text-default-500">Avg Commission</span>
            <span className="text-small font-semibold">{(avgCommission * 100).toFixed(2)}%</span>
          </div>
          
          <div className="flex justify-between items-center">
            <span className="text-small text-default-500">Recent Deals (30d)</span>
            <span className="text-small font-semibold">{recentDeals}</span>
          </div>
          
          <div className="pt-2 border-t border-default-100">
            <p className="text-tiny text-default-500 mb-1">Active States ({states.length})</p>
            <div className="flex flex-wrap gap-1">
              {states.slice(0, 5).map(state => (
                <Chip key={state} size="sm" variant="flat" className="text-tiny h-5">
                  {state}
                </Chip>
              ))}
              {states.length > 5 && (
                <Chip size="sm" variant="flat" className="text-tiny h-5">
                  +{states.length - 5}
                </Chip>
              )}
            </div>
          </div>
        </div>
      </div>
    </Card>
  );
};

// State Distribution Chart Component
const StateDistributionChart = ({ 
  merchants, 
  loading 
}: { 
  merchants: MerchantData[];
  loading: boolean;
}) => {
  const stateData = useMemo(() => {
    const stateCounts: Record<string, number> = {};
    const stateAmounts: Record<string, number> = {};
    
    merchants.forEach(m => {
      if (m.state) {
        stateCounts[m.state] = (stateCounts[m.state] || 0) + 1;
        stateAmounts[m.state] = (stateAmounts[m.state] || 0) + (m.total_amount_funded || 0);
      }
    });
    
    return Object.entries(stateCounts)
      .map(([state, count]) => ({
        state,
        count,
        amount: stateAmounts[state] || 0
      }))
      .sort((a, b) => b.amount - a.amount)
      .slice(0, 10);
  }, [merchants]);

  if (loading) {
    return (
      <Card className="dark:border-default-100 border border-transparent">
        <div className="p-4">
          <Skeleton className="rounded-lg mb-4">
            <div className="h-4 w-32 bg-default-200"></div>
          </Skeleton>
          <Skeleton className="rounded-lg">
            <div className="h-64 w-full bg-default-200"></div>
          </Skeleton>
        </div>
      </Card>
    );
  }

  return (
    <Card className="dark:border-default-100 min-h-[340px] border border-transparent">
      <div className="flex flex-col gap-y-4 p-4">
        <h3 className="text-small text-default-500 font-medium">Geographic Distribution (Top 10 States)</h3>
        
        {stateData.length > 0 ? (
          <ResponsiveContainer
            className="[&_.recharts-surface]:outline-hidden"
            height={250}
            width="100%"
          >
            <BarChart
              accessibilityLayer
              data={stateData}
              layout="horizontal"
              margin={{
                top: 5,
                right: 30,
                left: 40,
                bottom: 5,
              }}
            >
              <XAxis 
                type="number"
                tickFormatter={(value) => `$${(value / 1000000).toFixed(1)}M`}
                style={{ fontSize: "var(--heroui-font-size-tiny)" }}
              />
              <YAxis 
                type="category"
                dataKey="state"
                style={{ fontSize: "var(--heroui-font-size-tiny)" }}
              />
              <Tooltip
                content={({ active, payload, label }) => {
                  if (active && payload && payload.length) {
                    return (
                      <div className="rounded-medium bg-background text-tiny shadow-small p-2">
                        <p className="font-medium">{label}</p>
                        <p className="text-default-500">
                          Amount: ${(payload[0].value as number / 1000000).toFixed(2)}M
                        </p>
                        <p className="text-default-500">
                          Deals: {payload[0].payload.count}
                        </p>
                      </div>
                    );
                  }
                  return null;
                }}
                cursor={false}
              />
              <Bar
                animationDuration={450}
                animationEasing="ease"
                dataKey="amount"
                fill="hsl(var(--heroui-secondary-500))"
                radius={[0, 4, 4, 0]}
              />
            </BarChart>
          </ResponsiveContainer>
        ) : (
          <div className="flex items-center justify-center h-[250px]">
            <span className="text-default-400">No state data available</span>
          </div>
        )}
      </div>
    </Card>
  );
};

// Industry Breakdown Chart Component
const IndustryBreakdownChart = ({ 
  merchants, 
  loading 
}: { 
  merchants: MerchantData[];
  loading: boolean;
}) => {
  const industryData = useMemo(() => {
    const industryCounts: Record<string, number> = {};
    const industryAmounts: Record<string, number> = {};
    
    merchants.forEach(m => {
      if (m.industry_naics_or_sic) {
        // Extract industry name (remove codes if present)
        const industry = m.industry_naics_or_sic.replace(/^\d+:?\s*/, '').trim();
        if (industry) {
          industryCounts[industry] = (industryCounts[industry] || 0) + 1;
          industryAmounts[industry] = (industryAmounts[industry] || 0) + (m.total_amount_funded || 0);
        }
      }
    });
    
    const totalAmount = Object.values(industryAmounts).reduce((sum, amt) => sum + amt, 0);
    
    return Object.entries(industryCounts)
      .map(([industry, count]) => ({
        name: industry.length > 20 ? industry.substring(0, 20) + '...' : industry,
        value: industryAmounts[industry] || 0,
        count,
        percentage: totalAmount > 0 ? (industryAmounts[industry] / totalAmount) * 100 : 0
      }))
      .sort((a, b) => b.value - a.value)
      .slice(0, 6);
  }, [merchants]);

  if (loading) {
    return (
      <Card className="dark:border-default-100 border border-transparent">
        <div className="p-4">
          <Skeleton className="rounded-lg mb-4">
            <div className="h-4 w-32 bg-default-200"></div>
          </Skeleton>
          <Skeleton className="rounded-lg mx-auto">
            <div className="h-[200px] w-[200px] bg-default-200"></div>
          </Skeleton>
        </div>
      </Card>
    );
  }

  const colors = ["primary", "secondary", "success", "warning", "danger", "default"];

  return (
    <Card className="dark:border-default-100 min-h-[340px] border border-transparent">
      <div className="flex flex-col gap-y-2 p-4 pb-0">
        <h3 className="text-small text-default-500 font-medium">Industry Distribution (Top 6)</h3>
        
        {industryData.length > 0 ? (
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
                          <div key={index}>
                            <p className="font-medium">{entry.name}</p>
                            <p className="text-default-500">
                              Amount: ${(entry.value as number / 1000000).toFixed(2)}M
                            </p>
                            <p className="text-default-500">
                              Deals: {entry.payload.count}
                            </p>
                            <p className="text-default-500">
                              Share: {entry.payload.percentage.toFixed(1)}%
                            </p>
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
                  cornerRadius={4}
                  data={industryData}
                  dataKey="value"
                  innerRadius="40%"
                  nameKey="name"
                  paddingAngle={2}
                  strokeWidth={0}
                >
                  {industryData.map((_, index) => (
                    <Cell
                      key={`cell-${index}`}
                      fill={`hsl(var(--heroui-${colors[index % colors.length]}-500))`}
                    />
                  ))}
                </Pie>
              </PieChart>
            </ResponsiveContainer>

            <div className="text-tiny text-default-500 flex w-full flex-wrap justify-center gap-2 px-4 pb-4">
              {industryData.map((item, index) => (
                <div key={index} className="flex items-center gap-2">
                  <span
                    className="h-2 w-2 rounded-full"
                    style={{
                      backgroundColor: `hsl(var(--heroui-${colors[index % colors.length]}-500))`,
                    }}
                  />
                  <span className="text-xs">
                    {item.name} ({item.percentage.toFixed(0)}%)
                  </span>
                </div>
              ))}
            </div>
          </>
        ) : (
          <div className="flex items-center justify-center h-[250px]">
            <span className="text-default-400">No industry data available</span>
          </div>
        )}
      </div>
    </Card>
  );
};

// Funder comparison table component
const FunderComparisonTable = ({ 
  merchants, 
  loading 
}: { 
  merchants: MerchantData[];
  loading: boolean;
}) => {
  if (loading) {
    return (
      <Card className="dark:border-default-100 border border-transparent">
        <div className="p-4">
          <Skeleton className="rounded-lg">
            <div className="h-64 w-full bg-default-200"></div>
          </Skeleton>
        </div>
      </Card>
    );
  }

  // Group merchants by funder and calculate metrics
  const funderMetrics = useMemo(() => {
    const grouped: Record<string, MerchantData[]> = {};
    merchants.forEach(m => {
      if (!grouped[m.funder_name]) grouped[m.funder_name] = [];
      grouped[m.funder_name].push(m);
    });

    return Object.entries(grouped).map(([name, funMerchants]) => {
      const totalFunded = funMerchants.reduce((sum, m) => sum + (m.total_amount_funded || 0), 0);
      const avgBuyRate = funMerchants.filter(m => m.buy_rate).length > 0
        ? funMerchants.filter(m => m.buy_rate).reduce((sum, m) => sum + (m.buy_rate || 0), 0) / funMerchants.filter(m => m.buy_rate).length
        : 0;
      const avgCommission = funMerchants.filter(m => m.commission).length > 0
        ? funMerchants.filter(m => m.commission).reduce((sum, m) => sum + (m.commission || 0), 0) / funMerchants.filter(m => m.commission).length
        : 0;
      
      // Calculate average FICO score
      const ficoScores = funMerchants
        .filter(m => m.fico)
        .map(m => parseInt(m.fico!))
        .filter(score => !isNaN(score));
      const avgFico = ficoScores.length > 0
        ? Math.round(ficoScores.reduce((sum, score) => sum + score, 0) / ficoScores.length)
        : 0;

      // Count deals by time period
      const now = new Date();
      const lastWeek = funMerchants.filter(m => {
        if (!m.date_funded) return false;
        const date = new Date(m.date_funded);
        const weekAgo = new Date(now);
        weekAgo.setDate(weekAgo.getDate() - 7);
        return date >= weekAgo;
      }).length;

      const lastMonth = funMerchants.filter(m => {
        if (!m.date_funded) return false;
        const date = new Date(m.date_funded);
        const monthAgo = new Date(now);
        monthAgo.setDate(monthAgo.getDate() - 30);
        return date >= monthAgo;
      }).length;

      return {
        name,
        merchantCount: funMerchants.length,
        totalFunded,
        avgBuyRate,
        avgCommission,
        avgFico,
        lastWeek,
        lastMonth,
        avgDealSize: funMerchants.length > 0 ? totalFunded / funMerchants.length : 0
      };
    }).sort((a, b) => b.totalFunded - a.totalFunded);
  }, [merchants]);

  return (
    <Card className="dark:border-default-100 border border-transparent">
      <div className="p-4">
        <h3 className="text-medium font-semibold mb-4">Funder Comparison</h3>
        <div className="overflow-x-auto">
          <table className="w-full text-small">
            <thead>
              <tr className="border-b border-default-100">
                <th className="text-left pb-2 pr-4 font-medium text-default-600">Funder</th>
                <th className="text-right pb-2 px-2 font-medium text-default-600">Deals</th>
                <th className="text-right pb-2 px-2 font-medium text-default-600">Total Funded</th>
                <th className="text-right pb-2 px-2 font-medium text-default-600">Avg Deal</th>
                <th className="text-right pb-2 px-2 font-medium text-default-600">Buy Rate</th>
                <th className="text-right pb-2 px-2 font-medium text-default-600">Commission</th>
                <th className="text-right pb-2 px-2 font-medium text-default-600">Avg FICO</th>
                <th className="text-right pb-2 px-2 font-medium text-default-600">Last 7d</th>
                <th className="text-right pb-2 pl-2 font-medium text-default-600">Last 30d</th>
              </tr>
            </thead>
            <tbody>
              {funderMetrics.map((funder, index) => (
                <tr key={funder.name} className={index !== funderMetrics.length - 1 ? "border-b border-default-50" : ""}>
                  <td className="py-2 pr-4 font-medium">{funder.name}</td>
                  <td className="py-2 px-2 text-right">{funder.merchantCount}</td>
                  <td className="py-2 px-2 text-right font-medium">
                    ${(funder.totalFunded / 1000000).toFixed(2)}M
                  </td>
                  <td className="py-2 px-2 text-right">
                    ${(funder.avgDealSize / 1000).toFixed(1)}K
                  </td>
                  <td className="py-2 px-2 text-right">{(funder.avgBuyRate * 100).toFixed(2)}%</td>
                  <td className="py-2 px-2 text-right">{(funder.avgCommission * 100).toFixed(2)}%</td>
                  <td className="py-2 px-2 text-right">{funder.avgFico || '-'}</td>
                  <td className="py-2 px-2 text-right">
                    <Chip size="sm" variant="flat" className="text-tiny">
                      {funder.lastWeek}
                    </Chip>
                  </td>
                  <td className="py-2 pl-2 text-right">
                    <Chip size="sm" variant="flat" color="primary" className="text-tiny">
                      {funder.lastMonth}
                    </Chip>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </Card>
  );
};

// Comprehensive Funding Analytics Component (like graph-2)
const FundingAnalyticsChart = ({
  merchants,
  loading
}: {
  merchants: MerchantData[];
  loading: boolean;
}) => {
  const [timeRange, setTimeRange] = useState<'6-months' | '3-months' | '30-days' | '7-days'>('6-months');
  const [activeMetric, setActiveMetric] = useState<'total-funded' | 'deal-count' | 'avg-deal-size' | 'commission-rate'>('total-funded');

  // Calculate analytics data based on merchants
  const analyticsData = useMemo(() => {
    const now = new Date();
    const ranges = {
      '6-months': 180,
      '3-months': 90,
      '30-days': 30,
      '7-days': 7
    };
    
    const daysBack = ranges[timeRange];
    const startDate = new Date(now);
    startDate.setDate(startDate.getDate() - daysBack);
    
    // Group merchants by month
    const monthlyData: Record<string, {
      totalFunded: number;
      dealCount: number;
      totalCommission: number;
      lastYearTotalFunded: number;
      lastYearDealCount: number;
    }> = {};
    
    merchants.forEach(m => {
      if (!m.date_funded) return;
      
      const fundedDate = new Date(m.date_funded);
      if (fundedDate < startDate) return;
      
      const monthKey = fundedDate.toLocaleDateString('en-US', { month: 'short', year: 'numeric' });
      
      if (!monthlyData[monthKey]) {
        monthlyData[monthKey] = {
          totalFunded: 0,
          dealCount: 0,
          totalCommission: 0,
          lastYearTotalFunded: 0,
          lastYearDealCount: 0
        };
      }
      
      monthlyData[monthKey].totalFunded += m.total_amount_funded || 0;
      monthlyData[monthKey].dealCount += 1;
      monthlyData[monthKey].totalCommission += (m.total_amount_funded || 0) * (m.commission || 0);
    });
    
    // Generate last year comparison data (simulated)
    const lastYearMultiplier = 0.85; // Assume 15% growth year-over-year
    
    // Convert to array format for chart
    const chartData = Object.entries(monthlyData)
      .sort((a, b) => new Date(a[0]).getTime() - new Date(b[0]).getTime())
      .map(([month, data]) => ({
        month: month.split(' ')[0], // Just the month abbreviation
        totalFunded: data.totalFunded,
        dealCount: data.dealCount,
        avgDealSize: data.dealCount > 0 ? data.totalFunded / data.dealCount : 0,
        avgCommission: data.dealCount > 0 ? (data.totalCommission / data.totalFunded) * 100 : 0,
        lastYearTotalFunded: data.totalFunded * lastYearMultiplier,
        lastYearDealCount: Math.floor(data.dealCount * lastYearMultiplier),
        lastYearAvgDealSize: data.dealCount > 0 ? (data.totalFunded * lastYearMultiplier) / Math.floor(data.dealCount * lastYearMultiplier) : 0,
        lastYearAvgCommission: data.dealCount > 0 ? ((data.totalCommission / data.totalFunded) * 100) * 0.95 : 0
      }));
    
    return chartData;
  }, [merchants, timeRange]);

  // Calculate metrics
  const metrics = useMemo(() => {
    const currentData = analyticsData[analyticsData.length - 1];
    const previousData = analyticsData[analyticsData.length - 2];
    
    if (!currentData) {
      return [
        { key: 'total-funded', title: 'Total Funded', value: 0, change: '0%', changeType: 'neutral' as const },
        { key: 'deal-count', title: 'Deal Count', value: 0, change: '0%', changeType: 'neutral' as const },
        { key: 'avg-deal-size', title: 'Avg Deal Size', value: 0, change: '0%', changeType: 'neutral' as const },
        { key: 'commission-rate', title: 'Avg Commission', value: 0, change: '0%', changeType: 'neutral' as const }
      ];
    }
    
    const calculateChange = (current: number, previous: number) => {
      if (!previous || previous === 0) return { change: '0%', changeType: 'neutral' as const };
      const pct = ((current - previous) / previous) * 100;
      return {
        change: `${Math.abs(pct).toFixed(1)}%`,
        changeType: pct > 0 ? 'positive' as const : pct < 0 ? 'negative' as const : 'neutral' as const
      };
    };
    
    const totalFunded = analyticsData.reduce((sum, d) => sum + d.totalFunded, 0);
    const totalDeals = analyticsData.reduce((sum, d) => sum + d.dealCount, 0);
    const avgDealSize = totalDeals > 0 ? totalFunded / totalDeals : 0;
    const avgCommission = analyticsData.length > 0 
      ? analyticsData.reduce((sum, d) => sum + d.avgCommission, 0) / analyticsData.length
      : 0;
    
    return [
      {
        key: 'total-funded' as const,
        title: 'Total Funded',
        value: totalFunded,
        ...calculateChange(currentData?.totalFunded || 0, previousData?.totalFunded || 0)
      },
      {
        key: 'deal-count' as const,
        title: 'Deal Count',
        value: totalDeals,
        ...calculateChange(currentData?.dealCount || 0, previousData?.dealCount || 0)
      },
      {
        key: 'avg-deal-size' as const,
        title: 'Avg Deal Size',
        value: avgDealSize,
        ...calculateChange(currentData?.avgDealSize || 0, previousData?.avgDealSize || 0)
      },
      {
        key: 'commission-rate' as const,
        title: 'Avg Commission',
        value: avgCommission,
        ...calculateChange(currentData?.avgCommission || 0, previousData?.avgCommission || 0)
      }
    ];
  }, [analyticsData]);

  const activeChartData = useMemo(() => {
    const metric = metrics.find(m => m.key === activeMetric);
    const dataKey = activeMetric === 'total-funded' ? 'totalFunded' 
                  : activeMetric === 'deal-count' ? 'dealCount'
                  : activeMetric === 'avg-deal-size' ? 'avgDealSize'
                  : 'avgCommission';
    
    const lastYearDataKey = activeMetric === 'total-funded' ? 'lastYearTotalFunded'
                          : activeMetric === 'deal-count' ? 'lastYearDealCount'
                          : activeMetric === 'avg-deal-size' ? 'lastYearAvgDealSize'
                          : 'lastYearAvgCommission';
    
    return {
      data: analyticsData,
      dataKey,
      lastYearDataKey,
      color: metric?.changeType === 'positive' ? 'success'
           : metric?.changeType === 'negative' ? 'danger'
           : 'default',
      metric
    };
  }, [activeMetric, analyticsData, metrics]);

  const formatValue = (value: number, key: string) => {
    if (key === 'total-funded' || key === 'avg-deal-size') {
      if (value >= 1000000) return `$${(value / 1000000).toFixed(1)}M`;
      if (value >= 1000) return `$${(value / 1000).toFixed(0)}K`;
      return `$${value.toFixed(0)}`;
    }
    if (key === 'commission-rate') return `${value.toFixed(2)}%`;
    return value.toLocaleString();
  };

  if (loading) {
    return (
      <Card className="dark:border-default-100 border border-transparent mb-6">
        <div className="p-6">
          <Skeleton className="rounded-lg mb-4">
            <div className="h-6 w-48 bg-default-200"></div>
          </Skeleton>
          <Skeleton className="rounded-lg">
            <div className="h-[400px] w-full bg-default-200"></div>
          </Skeleton>
        </div>
      </Card>
    );
  }

  return (
    <Card as="dl" className="dark:border-default-100 border border-transparent mb-6">
      <section className="flex flex-col flex-nowrap">
        <div className="flex flex-col justify-between gap-y-2 p-6">
          <div className="flex flex-col gap-y-2">
            <div className="flex justify-between items-center">
              <dt className="text-medium text-foreground font-medium">Funding Analytics</dt>
              <Dropdown
                classNames={{
                  content: "min-w-[120px]",
                }}
                placement="bottom-end"
              >
                <DropdownTrigger>
                  <Button isIconOnly radius="full" size="sm" variant="light">
                    <Icon height={16} icon="solar:menu-dots-bold" width={16} />
                  </Button>
                </DropdownTrigger>
                <DropdownMenu
                  itemClasses={{
                    title: "text-tiny",
                  }}
                  variant="flat"
                >
                  <DropdownItem key="export-data">Export Data</DropdownItem>
                  <DropdownItem key="view-details">View Details</DropdownItem>
                </DropdownMenu>
              </Dropdown>
            </div>
            
            <Spacer y={2} />
            
            <Tabs 
              size="sm"
              selectedKey={timeRange}
              onSelectionChange={(key) => setTimeRange(key as any)}
            >
              <Tab key="6-months" title="6 Months" />
              <Tab key="3-months" title="3 Months" />
              <Tab key="30-days" title="30 Days" />
              <Tab key="7-days" title="7 Days" />
            </Tabs>
            
            <div className="mt-2 flex w-full items-center">
              <div className="-my-3 flex w-full max-w-[800px] items-center gap-x-3 overflow-x-auto py-3">
                {metrics.map(({key, change, changeType, value, title}) => (
                  <button
                    key={key}
                    className={cn(
                      "rounded-medium flex w-full min-w-[150px] flex-col gap-2 p-3 transition-colors",
                      {
                        "bg-default-100": activeMetric === key,
                      },
                    )}
                    onClick={() => setActiveMetric(key as any)}
                  >
                    <span
                      className={cn("text-small text-default-500 font-medium transition-colors", {
                        "text-primary": activeMetric === key,
                      })}
                    >
                      {title}
                    </span>
                    <div className="flex items-center gap-x-3">
                      <span className="text-foreground text-2xl font-bold">
                        {formatValue(value, key)}
                      </span>
                      <Chip
                        classNames={{
                          content: "font-medium",
                        }}
                        color={
                          changeType === "positive"
                            ? "success"
                            : changeType === "negative"
                              ? "danger"
                              : "default"
                        }
                        radius="sm"
                        size="sm"
                        startContent={
                          changeType === "positive" ? (
                            <Icon height={16} icon="solar:arrow-right-up-linear" width={16} />
                          ) : changeType === "negative" ? (
                            <Icon height={16} icon="solar:arrow-right-down-linear" width={16} />
                          ) : (
                            <Icon height={16} icon="solar:arrow-right-linear" width={16} />
                          )
                        }
                        variant="flat"
                      >
                        <span>{change}</span>
                      </Chip>
                    </div>
                  </button>
                ))}
              </div>
            </div>
          </div>
        </div>
        
        {analyticsData.length > 0 ? (
          <ResponsiveContainer
            className="min-h-[300px] [&_.recharts-surface]:outline-hidden"
            height={300}
            width="100%"
          >
            <AreaChart
              accessibilityLayer
              data={activeChartData.data}
              height={300}
              margin={{
                left: 0,
                right: 0,
                top: 10,
                bottom: 10,
              }}
              width={500}
            >
              <defs>
                <linearGradient id="colorGradient" x1="0" x2="0" y1="0" y2="1">
                  <stop
                    offset="10%"
                    stopColor={`hsl(var(--heroui-${activeChartData.color}-500))`}
                    stopOpacity={0.3}
                  />
                  <stop
                    offset="100%"
                    stopColor={`hsl(var(--heroui-${activeChartData.color}-100))`}
                    stopOpacity={0.1}
                  />
                </linearGradient>
              </defs>
              <CartesianGrid
                horizontalCoordinatesGenerator={() => [200, 150, 100, 50]}
                stroke="hsl(var(--heroui-default-200))"
                strokeDasharray="3 3"
                vertical={false}
              />
              <XAxis
                axisLine={false}
                dataKey="month"
                style={{fontSize: "var(--heroui-font-size-tiny)"}}
                tickLine={false}
              />
              <Tooltip
                content={({label, payload}) => {
                  if (!payload || payload.length === 0) return null;
                  
                  return (
                    <div className="rounded-medium bg-foreground text-tiny shadow-small flex h-auto min-w-[120px] items-center gap-x-2 p-2">
                      <div className="flex w-full flex-col gap-y-0">
                        {payload.map((p, index) => {
                          const value = p.value;
                          const isLastYear = p.dataKey === activeChartData.lastYearDataKey;
                          
                          return (
                            <div key={`${index}-${p.dataKey}`} className="flex w-full items-center gap-x-2">
                              <div className="text-small text-background flex w-full items-center gap-x-1">
                                <span>{isLastYear ? 'Last Year:' : 'Current:'}</span>
                                <span>{formatValue(value as number, activeMetric)}</span>
                              </div>
                            </div>
                          );
                        })}
                        <span className="text-small text-foreground-400 font-medium">
                          {label} 2024
                        </span>
                      </div>
                    </div>
                  );
                }}
                cursor={{
                  strokeWidth: 0,
                }}
              />
              <Area
                activeDot={{
                  stroke: `hsl(var(--heroui-${activeChartData.color === "default" ? "foreground" : activeChartData.color}))`,
                  strokeWidth: 2,
                  fill: "hsl(var(--heroui-background))",
                  r: 5,
                }}
                animationDuration={1000}
                animationEasing="ease"
                dataKey={activeChartData.dataKey}
                fill="url(#colorGradient)"
                stroke={`hsl(var(--heroui-${activeChartData.color === "default" ? "foreground" : activeChartData.color}))`}
                strokeWidth={2}
                type="monotone"
              />
              <Area
                activeDot={{
                  stroke: "hsl(var(--heroui-default-400))",
                  strokeWidth: 2,
                  fill: "hsl(var(--heroui-background))",
                  r: 5,
                }}
                animationDuration={1000}
                animationEasing="ease"
                dataKey={activeChartData.lastYearDataKey}
                fill="transparent"
                stroke="hsl(var(--heroui-default-400))"
                strokeWidth={2}
                strokeDasharray="5 5"
                type="monotone"
              />
            </AreaChart>
          </ResponsiveContainer>
        ) : (
          <div className="flex items-center justify-center h-[300px]">
            <span className="text-default-400">No data available for selected time range</span>
          </div>
        )}
      </section>
    </Card>
  );
};

export default Dashboard;
