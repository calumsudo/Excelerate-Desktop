import { useMemo, useRef, useState } from "react";
import { Card, Select, SelectItem } from "@heroui/react";
import { Icon } from "@iconify/react";
import {
  formatMoney,
  formatPct,
  UNKNOWN_BUCKET_KEY,
  type ConcentrationBreakdown,
  type ConcentrationBucket,
} from "@services/analytics-service";
import { ChartSkeleton, EmptyChart } from "./charts";
import { US_MAP_VIEWBOX, US_STATE_PATHS, DC_MARKER } from "./us-states-paths";

// Sequential fill for the choropleth — one hue, low→high exposure. The
// numbered HeroUI steps flip in dark mode, which is exactly the anchor flip a
// dark-surface ramp needs (more exposure = brighter instead of darker).
const BIN_FILLS = [
  "hsl(var(--heroui-primary-300))",
  "hsl(var(--heroui-primary-400))",
  "hsl(var(--heroui-primary-500))",
  "hsl(var(--heroui-primary-600))",
  "hsl(var(--heroui-primary-700))",
];
const NO_EXPOSURE_FILL = "hsl(var(--heroui-default-100))";

const THRESHOLD_OPTIONS = [
  { key: "0.1", label: "10%" },
  { key: "0.15", label: "15%" },
  { key: "0.2", label: "20%" },
  { key: "0.25", label: "25%" },
];
const DEFAULT_THRESHOLD = 0.15;

/** Buckets at/over the alert threshold, excluding the unknown footnote bucket. */
const overThreshold = (buckets: ConcentrationBucket[], threshold: number) =>
  buckets.filter((b) => b.key !== UNKNOWN_BUCKET_KEY && b.share >= threshold);

const ThresholdChips = ({
  buckets,
  threshold,
  noun,
}: {
  buckets: ConcentrationBucket[];
  threshold: number;
  noun: string;
}) => {
  const flagged = overThreshold(buckets, threshold);
  if (flagged.length === 0) {
    return (
      <p className="text-tiny text-default-400 flex items-center gap-1.5 px-4 pb-4">
        <Icon icon="solar:shield-check-linear" width={14} />
        No {noun} above {formatPct(threshold, 0)} of dollars at work
      </p>
    );
  }
  return (
    <div className="flex flex-wrap items-center gap-2 px-4 pb-4">
      {flagged.map((b) => (
        <span
          key={b.key}
          className="text-tiny text-warning-700 bg-warning-50 border-warning-200 flex items-center gap-1 rounded-full border px-2 py-0.5 font-medium"
        >
          <Icon icon="solar:danger-triangle-bold" width={12} />
          {b.name} {formatPct(b.share)}
        </span>
      ))}
      <span className="text-tiny text-default-400">over the {formatPct(threshold, 0)} limit</span>
    </div>
  );
};

interface MapHover {
  bucket: ConcentrationBucket;
  x: number;
  y: number;
  /** Render the tooltip left of / above the cursor near the card edges, where it would clip. */
  flipX: boolean;
  flipY: boolean;
}

const StateMapCard = ({
  states,
  total,
  threshold,
  loading,
}: {
  states: ConcentrationBucket[];
  total: number;
  threshold: number;
  loading: boolean;
}) => {
  const containerRef = useRef<HTMLDivElement>(null);
  const [hover, setHover] = useState<MapHover | null>(null);

  const byCode = useMemo(() => new Map(states.map((b) => [b.key, b])), [states]);
  const mapped = states.filter((b) => b.key !== UNKNOWN_BUCKET_KEY);
  const unknown = states.find((b) => b.key === UNKNOWN_BUCKET_KEY);
  const maxValue = mapped.reduce((acc, b) => Math.max(acc, b.value), 0);

  const fillFor = (code: string): string => {
    const bucket = byCode.get(code);
    if (!bucket || bucket.value <= 0 || maxValue <= 0) return NO_EXPOSURE_FILL;
    const bin = Math.min(
      BIN_FILLS.length - 1,
      Math.floor((bucket.value / maxValue) * BIN_FILLS.length)
    );
    return BIN_FILLS[bin];
  };

  const handleMove = (code: string) => (event: React.MouseEvent) => {
    const bucket = byCode.get(code);
    const rect = containerRef.current?.getBoundingClientRect();
    if (!bucket || !rect) return;
    const x = event.clientX - rect.left;
    const y = event.clientY - rect.top;
    setHover({ bucket, x, y, flipX: x > rect.width - 200, flipY: y > rect.height - 110 });
  };

  if (loading) {
    return (
      <Card className="dark:border-default-100 border border-transparent">
        <ChartSkeleton height={300} />
      </Card>
    );
  }

  const topStates = mapped.slice(0, 5);

  return (
    <Card className="dark:border-default-100 border border-transparent">
      <div className="flex flex-col gap-y-1 p-4 pb-2">
        <h3 className="text-small text-default-500 font-medium">Exposure by State</h3>
        <p className="text-tiny text-default-400">Dollars at work per merchant state</p>
      </div>

      {mapped.length > 0 ? (
        <>
          <div ref={containerRef} className="relative px-4" onMouseLeave={() => setHover(null)}>
            <svg
              viewBox={US_MAP_VIEWBOX}
              className="h-auto w-full"
              role="img"
              aria-label="US map of dollars at work by state"
            >
              {Object.entries(US_STATE_PATHS).map(([code, d]) => {
                const flagged = (byCode.get(code)?.share ?? 0) >= threshold;
                return (
                  <path
                    key={code}
                    d={d}
                    fill={fillFor(code)}
                    stroke={
                      flagged ? "hsl(var(--heroui-warning-500))" : "hsl(var(--heroui-content1))"
                    }
                    strokeWidth={flagged ? 2 : 1}
                    onMouseMove={handleMove(code)}
                  />
                );
              })}
              <circle
                cx={DC_MARKER.cx}
                cy={DC_MARKER.cy}
                r={DC_MARKER.r}
                fill={fillFor("DC")}
                stroke="hsl(var(--heroui-content1))"
                strokeWidth={1}
                onMouseMove={handleMove("DC")}
              />
            </svg>
            {hover && (
              <div
                className="rounded-medium bg-background text-tiny shadow-small pointer-events-none absolute z-10 p-2 whitespace-nowrap"
                style={{
                  left: hover.x,
                  top: hover.y,
                  transform: `translate(${hover.flipX ? "calc(-100% - 12px)" : "12px"}, ${
                    hover.flipY ? "calc(-100% - 12px)" : "12px"
                  })`,
                }}
              >
                <p className="font-medium">{hover.bucket.name}</p>
                <p className="text-default-500">
                  {formatMoney(hover.bucket.value)} at work ({formatPct(hover.bucket.share)})
                </p>
                <p className="text-default-500">
                  {hover.bucket.dealCount.toLocaleString()}{" "}
                  {hover.bucket.dealCount === 1 ? "deal" : "deals"}
                </p>
              </div>
            )}
          </div>

          <div className="text-tiny text-default-400 flex items-center gap-2 px-4 pt-2">
            <span>$0</span>
            <span className="h-2 w-4 rounded-sm" style={{ backgroundColor: NO_EXPOSURE_FILL }} />
            {BIN_FILLS.map((fill) => (
              <span key={fill} className="h-2 w-4 rounded-sm" style={{ backgroundColor: fill }} />
            ))}
            <span>{formatMoney(maxValue)}</span>
          </div>

          <div className="flex flex-col gap-1 p-4">
            {topStates.map((b) => (
              <div key={b.key} className="text-tiny flex items-baseline justify-between gap-2">
                <span className="text-default-600 truncate">{b.name}</span>
                <span className="text-default-400 shrink-0">
                  {formatMoney(b.value)} · {b.dealCount.toLocaleString()}{" "}
                  {b.dealCount === 1 ? "deal" : "deals"} ·{" "}
                  <span className="text-default-600 font-medium">{formatPct(b.share)}</span>
                </span>
              </div>
            ))}
            {unknown && total > 0 && (
              <p className="text-tiny text-default-400 mt-1">
                {formatPct(unknown.share)} of dollars at work have no state on file
              </p>
            )}
          </div>

          <ThresholdChips buckets={states} threshold={threshold} noun="state" />
        </>
      ) : (
        <EmptyChart height={300} />
      )}
    </Card>
  );
};

const IndustryCard = ({
  industries,
  threshold,
  loading,
}: {
  industries: ConcentrationBucket[];
  threshold: number;
  loading: boolean;
}) => {
  if (loading) {
    return (
      <Card className="dark:border-default-100 border border-transparent">
        <ChartSkeleton height={300} />
      </Card>
    );
  }

  const named = industries.filter((b) => b.key !== UNKNOWN_BUCKET_KEY);
  const unknown = industries.find((b) => b.key === UNKNOWN_BUCKET_KEY);
  const top = named.slice(0, 10);
  const coveredShare = top.reduce((acc, b) => acc + b.share, 0);
  // Scale bars so the threshold sits at a fixed position across rows; the
  // headroom keeps a just-over-limit bar from filling the whole track.
  const scaleMax = Math.max(threshold * 1.25, ...top.map((b) => b.share));

  return (
    <Card className="dark:border-default-100 border border-transparent">
      <div className="flex flex-col gap-y-1 p-4 pb-2">
        <h3 className="text-small text-default-500 font-medium">Top Industries</h3>
        <p className="text-tiny text-default-400">
          {named.length > 10 ? `Top 10 of ${named.length} industries — ` : ""}
          {formatPct(coveredShare)} of dollars at work
          {unknown ? `; ${formatPct(unknown.share)} unclassified` : ""}
        </p>
      </div>

      {top.length > 0 ? (
        <>
          <div className="flex flex-col gap-2.5 px-4 pb-2">
            {top.map((b) => {
              const flagged = b.share >= threshold;
              return (
                <div key={b.key} className="flex flex-col gap-1">
                  <div className="text-tiny flex items-baseline justify-between gap-2">
                    <span className="text-default-600 flex min-w-0 items-center gap-1">
                      {flagged && (
                        <Icon
                          icon="solar:danger-triangle-bold"
                          width={12}
                          className="text-warning shrink-0"
                        />
                      )}
                      <span className="truncate">{b.name}</span>
                    </span>
                    <span className="text-default-400 shrink-0">
                      {formatMoney(b.value)} ·{" "}
                      <span
                        className={
                          flagged ? "text-warning-700 font-medium" : "text-default-600 font-medium"
                        }
                      >
                        {formatPct(b.share)}
                      </span>
                    </span>
                  </div>
                  <div className="bg-default-100 relative h-2 w-full overflow-hidden rounded-full">
                    <div
                      className="h-full rounded-full"
                      style={{
                        width: `${Math.min(100, (b.share / scaleMax) * 100)}%`,
                        backgroundColor: "hsl(var(--heroui-primary-500))",
                      }}
                    />
                    <div
                      className="bg-default-400 absolute inset-y-0 w-px"
                      style={{ left: `${(threshold / scaleMax) * 100}%` }}
                    />
                  </div>
                </div>
              );
            })}
          </div>
          <p className="text-tiny text-default-400 px-4 pb-2">
            ▏ marks the {formatPct(threshold, 0)} concentration limit
          </p>
          <ThresholdChips buckets={industries} threshold={threshold} noun="industry" />
        </>
      ) : (
        <EmptyChart height={300} />
      )}
    </Card>
  );
};

export const ConcentrationSection = ({
  breakdown,
  loading,
}: {
  breakdown: ConcentrationBreakdown | null;
  loading: boolean;
}) => {
  const [threshold, setThreshold] = useState(DEFAULT_THRESHOLD);

  const states = breakdown?.states ?? [];
  const industries = breakdown?.industries ?? [];
  const total = breakdown?.total ?? 0;

  return (
    <div className="mb-6">
      <div className="mb-3 flex items-center justify-between gap-4">
        <div className="flex flex-col">
          <h2 className="text-large font-semibold">Concentration Risk</h2>
          <p className="text-tiny text-default-400">
            Geographic and industry exposure of dollars at work
          </p>
        </div>
        <Select
          aria-label="Concentration alert threshold"
          label="Alert at"
          labelPlacement="outside-left"
          size="sm"
          className="w-[150px] shrink-0"
          classNames={{ label: "text-tiny text-default-400 whitespace-nowrap" }}
          selectedKeys={[String(threshold)]}
          onSelectionChange={(keys) => {
            const key = Array.from(keys)[0];
            if (key != null) setThreshold(Number(key));
          }}
        >
          {THRESHOLD_OPTIONS.map((option) => (
            <SelectItem key={option.key}>{option.label}</SelectItem>
          ))}
        </Select>
      </div>
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
        <StateMapCard states={states} total={total} threshold={threshold} loading={loading} />
        <IndustryCard industries={industries} threshold={threshold} loading={loading} />
      </div>
    </div>
  );
};
