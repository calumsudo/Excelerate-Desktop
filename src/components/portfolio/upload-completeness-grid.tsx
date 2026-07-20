import React, { useEffect, useState } from "react";
import { Chip, Tooltip } from "@heroui/react";
import { Icon } from "@iconify/react";
import PivotSyncService, { UploadCompleteness } from "@services/pivot-sync-service";
import { FunderData } from "./funder-upload-section";

interface UploadCompletenessGridProps {
  portfolioName: string;
  funders: FunderData[];
  /** Bump to refetch after an upload or delete. */
  refreshToken: number;
  /** Clicking a missing cell jumps to that funder's upload slot for that month. */
  onMissingCellClick?: (funderName: string, monthKey: string) => void;
}

const monthLabel = (key: string) => {
  const [year, month] = key.split("-").map(Number);
  return new Date(Date.UTC(year, month - 1, 1)).toLocaleDateString("en-US", {
    month: "short",
    year: "numeric",
    timeZone: "UTC",
  });
};

const formatUploadedAt = (createdAt: string) =>
  new Date(createdAt).toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
  });

const UploadCompletenessGrid: React.FC<UploadCompletenessGridProps> = ({
  portfolioName,
  funders,
  refreshToken,
  onMissingCellClick,
}) => {
  const [data, setData] = useState<UploadCompleteness | null>(null);

  useEffect(() => {
    let cancelled = false;
    PivotSyncService.getUploadCompleteness(portfolioName)
      .then((result) => {
        if (!cancelled) setData(result);
      })
      .catch((error) => {
        console.error("Error loading upload completeness:", error);
      });
    return () => {
      cancelled = true;
    };
  }, [portfolioName, refreshToken]);

  if (!data) return null;

  const linked = new Set(data.linkedFunders);
  // Page funders first (upload-slot order), then linked funders the page
  // doesn't list — but only when they actually have uploads in the window,
  // so slot-less funders (ACS, VSPR) don't add permanent all-missing rows.
  const extraFunders = data.linkedFunders
    .filter(
      (name) =>
        !funders.some((f) => f.name === name) &&
        data.monthKeys.some((key) => data.uploads[`${name}|${key}`])
    )
    .sort((a, b) => a.localeCompare(b))
    .map((name) => ({ name, noSlot: true }));
  const rows = [
    ...funders.map((f) => ({ name: f.name, disabled: f.disabled ?? false, noSlot: false })),
    ...extraFunders.map((f) => ({ ...f, disabled: false })),
  ];

  const currentKey = data.monthKeys[data.monthKeys.length - 1];
  const outstanding = rows.filter(
    (row) =>
      linked.has(row.name) &&
      !row.disabled &&
      !row.noSlot &&
      !data.uploads[`${row.name}|${currentKey}`]
  ).length;

  return (
    <div className="bg-default-50 rounded-lg p-6 border border-default-200">
      <div className="flex items-center justify-between mb-4">
        <h2 className="text-xl font-semibold text-foreground">Upload Completeness</h2>
        <Chip
          size="sm"
          variant="flat"
          color={outstanding === 0 ? "success" : "warning"}
          data-testid="outstanding-chip"
        >
          {outstanding === 0
            ? `All reports in for ${monthLabel(currentKey)}`
            : `${outstanding} report${outstanding === 1 ? "" : "s"} outstanding for ${monthLabel(currentKey)}`}
        </Chip>
      </div>

      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr>
              <th className="text-left font-medium text-default-500 py-2 pr-4">Funder</th>
              {data.monthKeys.map((key) => (
                <th key={key} className="text-center font-medium text-default-500 py-2 px-3">
                  {monthLabel(key)}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => (
              <tr key={row.name} className="border-t border-default-200">
                <td className="py-2 pr-4 font-medium text-foreground whitespace-nowrap">
                  {row.name}
                </td>
                {data.monthKeys.map((key) => {
                  const upload = data.uploads[`${row.name}|${key}`];
                  if (upload) {
                    return (
                      <td key={key} className="py-2 px-3 text-center">
                        <Tooltip
                          content={`${upload.original_filename} — uploaded ${formatUploadedAt(upload.created_at)}`}
                        >
                          {/* span wrapper: HeroUI Tooltip needs a ref-forwarding child */}
                          <span className="inline-flex">
                            <Icon
                              icon="material-symbols:check-circle"
                              className="w-5 h-5 text-success"
                            />
                          </span>
                        </Tooltip>
                      </td>
                    );
                  }
                  if (!linked.has(row.name) || row.disabled || row.noSlot) {
                    return (
                      <td key={key} className="py-2 px-3 text-center">
                        <Tooltip
                          content={
                            row.disabled
                              ? "Uploads not supported yet"
                              : row.noSlot
                                ? "No monthly upload slot for this funder"
                                : "Funder not linked to this portfolio"
                          }
                        >
                          <span className="text-default-300">—</span>
                        </Tooltip>
                      </td>
                    );
                  }
                  return (
                    <td key={key} className="py-2 px-3 text-center">
                      <Tooltip content={`Missing — click to upload for ${monthLabel(key)}`}>
                        <button
                          type="button"
                          className="inline-flex items-center justify-center rounded-full hover:bg-warning-100 p-0.5 transition-colors"
                          onClick={() => onMissingCellClick?.(row.name, key)}
                          aria-label={`Upload ${row.name} report for ${monthLabel(key)}`}
                        >
                          <Icon
                            icon="material-symbols:error-outline"
                            className="w-5 h-5 text-warning"
                          />
                        </button>
                      </Tooltip>
                    </td>
                  );
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
};

export default UploadCompletenessGrid;
