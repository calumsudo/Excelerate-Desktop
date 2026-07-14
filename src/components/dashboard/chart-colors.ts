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

export const funderColor = (index: number) => CHART_COLORS[index % CHART_COLORS.length];
