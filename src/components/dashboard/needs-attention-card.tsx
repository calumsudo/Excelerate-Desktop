import { Card, Chip, Skeleton } from "@heroui/react";
import { Icon } from "@iconify/react";
import {
  formatMoney,
  formatPct,
  type HealthStatus,
  type NeedsAttentionDeal,
} from "@services/analytics-service";

const STATUS_META: Record<
  Exclude<HealthStatus, "on_track">,
  { label: string; color: "danger" | "warning" | "secondary" }
> = {
  past_term: { label: "Past Term", color: "danger" },
  stale: { label: "Stale", color: "warning" },
  slipping: { label: "Slipping", color: "secondary" },
};

/** One line explaining why the deal is flagged. */
function flagDetail(deal: NeedsAttentionDeal): string {
  switch (deal.health_status) {
    case "past_term":
      return `term elapsed, ${formatPct(deal.pct_rtr_paid)} of RTR collected`;
    case "stale":
      return deal.last_payment_date != null
        ? `no payment in ${deal.days_since_last_payment} days`
        : `no payment ever, funded ${deal.days_since_last_payment} days ago`;
    case "slipping":
      return `${formatPct(deal.pct_rtr_paid)} collected at ${formatPct(
        deal.pct_term_elapsed ?? 0
      )} of term`;
    default:
      return "";
  }
}

const NeedsAttentionCard = ({
  deals,
  loading,
}: {
  deals: NeedsAttentionDeal[];
  loading: boolean;
}) => {
  if (loading) {
    return (
      <Card className="dark:border-default-100 border border-transparent mb-6">
        <div className="p-4">
          <Skeleton className="rounded-lg mb-4">
            <div className="h-4 w-48 bg-default-200"></div>
          </Skeleton>
          <Skeleton className="rounded-lg">
            <div className="h-24 w-full bg-default-200"></div>
          </Skeleton>
        </div>
      </Card>
    );
  }

  return (
    <Card className="dark:border-default-100 border border-transparent mb-6">
      <div className="flex items-center gap-2 p-4 pb-0">
        <Icon icon="solar:danger-triangle-bold" className="text-warning" width={18} />
        <h3 className="text-small text-default-500 font-medium">Needs Attention</h3>
        {deals.length > 0 && (
          <Chip size="sm" variant="flat" color="warning">
            {deals.length}
          </Chip>
        )}
      </div>

      {deals.length === 0 ? (
        <div className="p-4 pt-3 flex items-center gap-2 text-default-400">
          <Icon icon="solar:check-circle-bold" className="text-success" width={18} />
          <span className="text-small">All open deals are on pace.</span>
        </div>
      ) : (
        <div className="p-4 pt-2 max-h-[320px] overflow-y-auto">
          <ul className="divide-y divide-default-100">
            {deals.map((deal) => {
              const meta = STATUS_META[deal.health_status as keyof typeof STATUS_META];
              if (!meta) return null;
              return (
                <li key={deal.id} className="flex items-center gap-3 py-2">
                  <Chip size="sm" variant="flat" color={meta.color} className="shrink-0">
                    {meta.label}
                  </Chip>
                  <div className="min-w-0 flex-1">
                    <p className="text-small font-medium truncate">
                      {deal.merchant_name ?? deal.funder_advance_id ?? deal.id}
                      {deal.funder_name != null && (
                        <span className="text-default-400 font-normal"> · {deal.funder_name}</span>
                      )}
                    </p>
                    <p className="text-tiny text-default-400 truncate">{flagDetail(deal)}</p>
                  </div>
                  <div className="text-right shrink-0">
                    <p className="text-small font-semibold">
                      {formatMoney(deal.net_rtr_balance ?? 0)}
                    </p>
                    <p className="text-tiny text-default-400">outstanding</p>
                  </div>
                </li>
              );
            })}
          </ul>
        </div>
      )}
    </Card>
  );
};

export default NeedsAttentionCard;
