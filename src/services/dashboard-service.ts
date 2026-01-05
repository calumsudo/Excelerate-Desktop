import { invoke } from '@tauri-apps/api/core';

export interface MerchantData {
  id: string;
  portfolio_name: string;
  funder_name: string;
  date_funded?: string;
  merchant_name: string;
  website?: string;
  advance_id?: string;
  funder_advance_id?: string;
  industry_naics_or_sic?: string;
  state?: string;
  fico?: string;
  buy_rate?: number;
  commission?: number;
  total_amount_funded?: number;
  created_timestamp: string;
  updated_timestamp: string;
}

export interface DashboardStats {
  totalMerchants: number;
  totalFunded: number;
  avgBuyRate: number;
  avgCommission: number;
  activeFunders: number;
  recentFundings: number;
}

export interface FunderDistribution {
  name: string;
  value: number;
  percentage?: number;
}

export interface MonthlyFunding {
  month: string;
  amount: number;
  count: number;
}

export interface PortfolioSummary {
  portfolio_name: string;
  total_merchants: number;
  total_funded: number;
  active_funders: string[];
  avg_buy_rate: number;
  avg_commission: number;
  recent_fundings: number;
}

export async function getPortfolioMerchants(portfolioName: string): Promise<MerchantData[]> {
  try {
    return await invoke<MerchantData[]>('get_merchants_by_portfolio', { portfolioName });
  } catch (error) {
    console.error('Failed to fetch portfolio merchants:', error);
    return [];
  }
}

export async function getDashboardStats(portfolioName?: string): Promise<DashboardStats> {
  try {
    return await invoke<DashboardStats>('get_dashboard_stats', { portfolioName });
  } catch (error) {
    console.error('Failed to fetch dashboard stats:', error);
    return {
      totalMerchants: 0,
      totalFunded: 0,
      avgBuyRate: 0,
      avgCommission: 0,
      activeFunders: 0,
      recentFundings: 0,
    };
  }
}

export async function getFunderDistribution(portfolioName?: string): Promise<FunderDistribution[]> {
  try {
    return await invoke<FunderDistribution[]>('get_funder_distribution', { portfolioName });
  } catch (error) {
    console.error('Failed to fetch funder distribution:', error);
    return [];
  }
}

export async function getMonthlyFundingTrends(portfolioName?: string): Promise<MonthlyFunding[]> {
  try {
    return await invoke<MonthlyFunding[]>('get_monthly_funding_trends', { portfolioName });
  } catch (error) {
    console.error('Failed to fetch monthly funding trends:', error);
    return [];
  }
}

export async function getPortfolioSummaries(): Promise<PortfolioSummary[]> {
  try {
    return await invoke<PortfolioSummary[]>('get_portfolio_summaries');
  } catch (error) {
    console.error('Failed to fetch portfolio summaries:', error);
    return [];
  }
}

export function calculateMetrics(merchants: MerchantData[]) {
  const totalMerchants = merchants.length;
  const totalFunded = merchants.reduce((sum, m) => sum + (m.total_amount_funded || 0), 0);
  
  const validBuyRates = merchants.filter(m => m.buy_rate).map(m => m.buy_rate!);
  const avgBuyRate = validBuyRates.length > 0 
    ? validBuyRates.reduce((sum, rate) => sum + rate, 0) / validBuyRates.length 
    : 0;
  
  const validCommissions = merchants.filter(m => m.commission).map(m => m.commission!);
  const avgCommission = validCommissions.length > 0
    ? validCommissions.reduce((sum, comm) => sum + comm, 0) / validCommissions.length
    : 0;
  
  const uniqueFunders = new Set(merchants.map(m => m.funder_name));
  const activeFunders = uniqueFunders.size;
  
  // Count fundings from the last 30 days
  const thirtyDaysAgo = new Date();
  thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);
  
  const recentFundings = merchants.filter(m => {
    if (!m.date_funded) return false;
    const fundedDate = new Date(m.date_funded);
    return fundedDate >= thirtyDaysAgo;
  }).length;
  
  return {
    totalMerchants,
    totalFunded,
    avgBuyRate,
    avgCommission,
    activeFunders,
    recentFundings,
  };
}

export function groupByFunder(merchants: MerchantData[]): FunderDistribution[] {
  const funderTotals = merchants.reduce((acc, merchant) => {
    const amount = merchant.total_amount_funded || 0;
    acc[merchant.funder_name] = (acc[merchant.funder_name] || 0) + amount;
    return acc;
  }, {} as Record<string, number>);
  
  const totalAmount = Object.values(funderTotals).reduce((sum, amt) => sum + amt, 0);
  
  return Object.entries(funderTotals)
    .map(([name, value]) => ({
      name,
      value,
      percentage: totalAmount > 0 ? (value / totalAmount) * 100 : 0,
    }))
    .sort((a, b) => b.value - a.value)
    .slice(0, 8); // Top 8 funders
}

export function getMonthlyTrends(merchants: MerchantData[]): MonthlyFunding[] {
  const monthlyData = merchants.reduce((acc, merchant) => {
    if (!merchant.date_funded) return acc;
    
    const date = new Date(merchant.date_funded);
    const monthKey = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`;
    
    if (!acc[monthKey]) {
      acc[monthKey] = { amount: 0, count: 0 };
    }
    
    acc[monthKey].amount += merchant.total_amount_funded || 0;
    acc[monthKey].count += 1;
    
    return acc;
  }, {} as Record<string, { amount: number; count: number }>);
  
  // Get last 6 months
  const months: MonthlyFunding[] = [];
  const now = new Date();
  
  for (let i = 5; i >= 0; i--) {
    const date = new Date(now.getFullYear(), now.getMonth() - i, 1);
    const monthKey = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`;
    const monthName = date.toLocaleDateString('en-US', { month: 'short' });
    
    months.push({
      month: monthName,
      amount: monthlyData[monthKey]?.amount || 0,
      count: monthlyData[monthKey]?.count || 0,
    });
  }
  
  return months;
}