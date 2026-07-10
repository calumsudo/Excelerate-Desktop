import {
  Modal,
  ModalContent,
  ModalHeader,
  ModalBody,
  ModalFooter,
  Button,
  Table,
  TableHeader,
  TableColumn,
  TableBody,
  TableRow,
  TableCell,
  Chip,
} from "@heroui/react";
import { Icon } from "@iconify/react";
import { save } from "@tauri-apps/plugin-dialog";
import { writeTextFile } from "@tauri-apps/plugin-fs";
import { toast } from "@/services/toast-service";

interface UnmatchedDealFromUpdate {
  funder_name: string;
  sheet_name: string;
  advance_id: string;
  merchant_name: string;
  gross_amount: number;
  management_fee: number;
  net_amount: number;
}

interface DuplicateConflictFromUpdate {
  funder_name: string;
  sheet_name: string;
  advance_id: string;
  internal_advance_id: string;
  merchant_name: string;
  date_funded: string;
  row_index: number;
  net_amount: number;
  match_count: number;
}

interface UnmatchedDealsResultModalProps {
  isOpen: boolean;
  onOpenChange: (open: boolean) => void;
  unmatchedDeals: UnmatchedDealFromUpdate[];
  duplicateConflicts?: DuplicateConflictFromUpdate[];
  portfolioName: string;
  reportDate: string;
}

export function UnmatchedDealsResultModal({
  isOpen,
  onOpenChange,
  unmatchedDeals,
  duplicateConflicts = [],
  portfolioName,
  reportDate,
}: UnmatchedDealsResultModalProps) {
  const exportToCSV = async () => {
    try {
      const headers = [
        "Portfolio",
        "Funder",
        "Sheet Name",
        "Advance ID",
        "Merchant Name",
        "Gross Amount",
        "Management Fee",
        "Net Amount",
      ];

      // Helper function to escape CSV values
      const escapeCSV = (value: string | number): string => {
        const str = String(value);
        if (str.includes(",") || str.includes('"') || str.includes("\n")) {
          return `"${str.replace(/"/g, '""')}"`;
        }
        return str;
      };

      const rows = unmatchedDeals.map((deal) => [
        escapeCSV(portfolioName),
        escapeCSV(deal.funder_name),
        escapeCSV(deal.sheet_name),
        escapeCSV(deal.advance_id),
        escapeCSV(deal.merchant_name),
        deal.gross_amount.toFixed(2),
        deal.management_fee.toFixed(2),
        deal.net_amount.toFixed(2),
      ]);

      const csvContent = [headers.join(","), ...rows.map((row) => row.join(","))].join("\n");

      // Use Tauri's save dialog
      const defaultFileName = `unmatched_deals_${portfolioName}_${reportDate.replace(/\//g, "-")}.csv`;
      const filePath = await save({
        defaultPath: defaultFileName,
        filters: [
          {
            name: "CSV",
            extensions: ["csv"],
          },
        ],
      });

      if (filePath) {
        await writeTextFile(filePath, csvContent);
        toast.success("Export successful", `Saved to ${filePath}`);
      }
    } catch (error) {
      console.error("Error exporting CSV:", error);
      toast.error("Export failed", String(error));
    }
  };

  const totalGross = unmatchedDeals.reduce((sum, deal) => sum + deal.gross_amount, 0);
  const totalFees = unmatchedDeals.reduce((sum, deal) => sum + deal.management_fee, 0);
  const totalNet = unmatchedDeals.reduce((sum, deal) => sum + deal.net_amount, 0);

  const hasUnmatched = unmatchedDeals.length > 0;
  const hasDuplicates = duplicateConflicts.length > 0;
  const uniqueDuplicateIds = new Set(
    duplicateConflicts.map((d) => `${d.sheet_name}|${d.advance_id}`)
  );

  return (
    <Modal isOpen={isOpen} onOpenChange={onOpenChange} size="5xl" scrollBehavior="inside">
      <ModalContent>
        {(onClose) => (
          <>
            <ModalHeader className="flex flex-col gap-1">
              <h2 className="text-2xl font-bold">Reconciliation Required</h2>
              <p className="text-sm text-default-500 font-normal">
                {hasUnmatched && hasDuplicates
                  ? "Some deals couldn't be matched and some Funder Advance IDs appear on multiple workbook rows."
                  : hasUnmatched
                    ? "These deals from funder pivot tables were not found in the portfolio workbook."
                    : "Some Funder Advance IDs appear on multiple workbook rows and need human reconciliation."}
              </p>
            </ModalHeader>
            <ModalBody>
              {hasUnmatched && (
                <>
                  <div className="mb-4 p-4 bg-warning-50 dark:bg-warning-100/10 border border-warning-200 dark:border-warning-200/20 rounded-lg">
                    <div className="flex justify-between items-start mb-3">
                      <div>
                        <h3 className="text-lg font-semibold mb-2 flex items-center gap-2">
                          <Icon icon="mdi:alert-circle" className="text-warning" width={24} />
                          {unmatchedDeals.length} Deal{unmatchedDeals.length !== 1 ? "s" : ""} Not
                          Found in Workbook
                        </h3>
                        <p className="text-sm text-default-600 mb-3">
                          These deals need to be added to the {portfolioName} portfolio workbook.
                        </p>
                        <div className="grid grid-cols-3 gap-4 text-sm">
                          <div>
                            <span className="text-default-600">Total Gross:</span>
                            <p className="font-semibold">
                              $
                              {totalGross.toLocaleString(undefined, {
                                minimumFractionDigits: 2,
                                maximumFractionDigits: 2,
                              })}
                            </p>
                          </div>
                          <div>
                            <span className="text-default-600">Total Fees:</span>
                            <p className="font-semibold">
                              $
                              {totalFees.toLocaleString(undefined, {
                                minimumFractionDigits: 2,
                                maximumFractionDigits: 2,
                              })}
                            </p>
                          </div>
                          <div>
                            <span className="text-default-600">Total Net:</span>
                            <p className="font-semibold">
                              $
                              {totalNet.toLocaleString(undefined, {
                                minimumFractionDigits: 2,
                                maximumFractionDigits: 2,
                              })}
                            </p>
                          </div>
                        </div>
                      </div>
                      <Button
                        color="success"
                        size="sm"
                        onPress={exportToCSV}
                        startContent={<Icon icon="mdi:download" width={18} />}
                      >
                        Export CSV
                      </Button>
                    </div>
                  </div>

                  {/* Results Table */}
                  <div className="overflow-x-auto">
                    <Table aria-label="Unmatched deals table" isStriped>
                      <TableHeader>
                        <TableColumn>FUNDER</TableColumn>
                        <TableColumn>SHEET</TableColumn>
                        <TableColumn>ADVANCE ID</TableColumn>
                        <TableColumn>MERCHANT NAME</TableColumn>
                        <TableColumn align="end">GROSS</TableColumn>
                        <TableColumn align="end">FEE</TableColumn>
                        <TableColumn align="end">NET</TableColumn>
                      </TableHeader>
                      <TableBody>
                        {unmatchedDeals.map((deal, index) => (
                          <TableRow key={index}>
                            <TableCell>
                              <Chip size="sm" variant="flat" color="primary">
                                {deal.funder_name}
                              </Chip>
                            </TableCell>
                            <TableCell className="text-sm">{deal.sheet_name}</TableCell>
                            <TableCell className="font-mono text-sm">{deal.advance_id}</TableCell>
                            <TableCell className="font-medium">{deal.merchant_name}</TableCell>
                            <TableCell className="text-right font-mono text-sm">
                              $
                              {deal.gross_amount.toLocaleString(undefined, {
                                minimumFractionDigits: 2,
                                maximumFractionDigits: 2,
                              })}
                            </TableCell>
                            <TableCell className="text-right font-mono text-sm">
                              $
                              {deal.management_fee.toLocaleString(undefined, {
                                minimumFractionDigits: 2,
                                maximumFractionDigits: 2,
                              })}
                            </TableCell>
                            <TableCell className="text-right font-mono text-sm">
                              $
                              {deal.net_amount.toLocaleString(undefined, {
                                minimumFractionDigits: 2,
                                maximumFractionDigits: 2,
                              })}
                            </TableCell>
                          </TableRow>
                        ))}
                      </TableBody>
                    </Table>
                  </div>
                </>
              )}

              {hasDuplicates && (
                <div className={`${hasUnmatched ? "mt-6" : ""}`}>
                  <div className="mb-4 p-4 bg-danger-50 dark:bg-danger-100/10 border border-danger-200 dark:border-danger-200/20 rounded-lg">
                    <h3 className="text-lg font-semibold mb-2 flex items-center gap-2">
                      <Icon icon="mdi:content-duplicate" className="text-danger" width={24} />
                      {uniqueDuplicateIds.size} Funder Advance ID
                      {uniqueDuplicateIds.size !== 1 ? "s" : ""} with Multiple Rows (
                      {duplicateConflicts.length} rows total)
                    </h3>
                    <p className="text-sm text-default-600">
                      Net RTR was <strong>not written</strong> for these rows because the same
                      Funder Advance ID maps to multiple positions in the {portfolioName} workbook
                      (e.g. an original deal plus add-ons). Reconcile manually before re-running.
                    </p>
                  </div>
                  <div className="overflow-x-auto">
                    <Table aria-label="Duplicate funder advance ids" isStriped>
                      <TableHeader>
                        <TableColumn>FUNDER</TableColumn>
                        <TableColumn>SHEET</TableColumn>
                        <TableColumn>FUNDER ADV ID</TableColumn>
                        <TableColumn>WORKBOOK ADV ID</TableColumn>
                        <TableColumn>MERCHANT</TableColumn>
                        <TableColumn>DATE FUNDED</TableColumn>
                        <TableColumn align="end">ROW</TableColumn>
                        <TableColumn align="end">PIVOT NET</TableColumn>
                      </TableHeader>
                      <TableBody>
                        {duplicateConflicts.map((dup, index) => (
                          <TableRow key={index}>
                            <TableCell>
                              <Chip size="sm" variant="flat" color="primary">
                                {dup.funder_name}
                              </Chip>
                            </TableCell>
                            <TableCell className="text-sm">{dup.sheet_name}</TableCell>
                            <TableCell className="font-mono text-sm">{dup.advance_id}</TableCell>
                            <TableCell className="font-mono text-sm">
                              {dup.internal_advance_id || "—"}
                            </TableCell>
                            <TableCell className="font-medium">
                              {dup.merchant_name || "—"}
                            </TableCell>
                            <TableCell className="text-sm">
                              {dup.date_funded ? dup.date_funded.split("T")[0] : "—"}
                            </TableCell>
                            <TableCell className="text-right font-mono text-sm">
                              {dup.row_index}
                            </TableCell>
                            <TableCell className="text-right font-mono text-sm">
                              $
                              {dup.net_amount.toLocaleString(undefined, {
                                minimumFractionDigits: 2,
                                maximumFractionDigits: 2,
                              })}
                            </TableCell>
                          </TableRow>
                        ))}
                      </TableBody>
                    </Table>
                  </div>
                </div>
              )}
            </ModalBody>
            <ModalFooter>
              <Button color="primary" onPress={onClose}>
                Close
              </Button>
            </ModalFooter>
          </>
        )}
      </ModalContent>
    </Modal>
  );
}
