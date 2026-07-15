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
import { CloudSyncPreview } from "@/services/pivot-sync-service";

interface PivotReconciliationModalProps {
  isOpen: boolean;
  onOpenChange: (open: boolean) => void;
  previews: CloudSyncPreview[];
  onCommit: () => void;
  isCommitting: boolean;
}

const money = (value: number) =>
  `$${value.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

export function PivotReconciliationModal({
  isOpen,
  onOpenChange,
  previews,
  onCommit,
  isCommitting,
}: PivotReconciliationModalProps) {
  return (
    <Modal isOpen={isOpen} onOpenChange={onOpenChange} size="4xl" scrollBehavior="inside">
      <ModalContent>
        {(onClose) => (
          <>
            <ModalHeader className="flex flex-col gap-1">
              <h2 className="text-2xl font-bold">Confirm Cloud Save</h2>
              <p className="text-sm text-default-500 font-normal">
                Review the reconciliation before payments are written to the database. Matched and
                unmatched totals must account for every dollar of the pivot total.
              </p>
            </ModalHeader>
            <ModalBody>
              {previews.map((preview) => {
                const r = preview.reconciliation;
                // Rows whose fee breakdown does not reconcile:
                // gross - (originator + rb) != net (Receivabull only).
                const discrepancies = preview.pivot.rows.filter(
                  (row) =>
                    row.fee_discrepancy !== undefined && Math.abs(row.fee_discrepancy) >= 0.01
                );
                return (
                  <div
                    key={`${preview.portfolioName}-${preview.funderName}`}
                    className="mb-4 p-4 bg-default-50 border border-default-200 rounded-lg"
                  >
                    <div className="flex items-center gap-2 mb-3">
                      <Chip size="sm" variant="flat" color="primary">
                        {preview.funderName}
                      </Chip>
                      <span className="text-sm font-medium">{preview.portfolioName}</span>
                      <span className="text-xs text-default-500">{r.report_date}</span>
                    </div>

                    <div className="grid grid-cols-4 gap-4 text-sm mb-3">
                      <div>
                        <span className="text-default-600">Pivot Total (Net):</span>
                        <p className="font-semibold">{money(r.total_net)}</p>
                      </div>
                      <div>
                        <span className="text-default-600">Matched ({r.matched_count}):</span>
                        <p className="font-semibold text-success-600">{money(r.matched_net)}</p>
                      </div>
                      <div>
                        <span className="text-default-600">Unmatched ({r.unmatched_count}):</span>
                        <p className="font-semibold text-warning-600">{money(r.unmatched_net)}</p>
                      </div>
                      <div>
                        <span className="text-default-600">Duplicates ({r.duplicate_count}):</span>
                        <p className="font-semibold text-danger-600">{money(r.duplicate_net)}</p>
                      </div>
                    </div>

                    {discrepancies.length > 0 && (
                      <div className="mb-3 overflow-x-auto">
                        <div className="flex items-center gap-1.5 mb-2 text-warning-600">
                          <Icon icon="material-symbols:warning-outline" className="w-4 h-4" />
                          <span className="text-sm font-medium">
                            {discrepancies.length} deal{discrepancies.length === 1 ? "" : "s"} where
                            gross − (originator + RB) fees ≠ net
                          </span>
                        </div>
                        <Table
                          aria-label={`Fee discrepancies for ${preview.portfolioName} ${preview.funderName}`}
                          isStriped
                          removeWrapper
                        >
                          <TableHeader>
                            <TableColumn>ADVANCE ID</TableColumn>
                            <TableColumn>MERCHANT</TableColumn>
                            <TableColumn align="end">GROSS</TableColumn>
                            <TableColumn align="end">ORIG. FEE</TableColumn>
                            <TableColumn align="end">RB FEE</TableColumn>
                            <TableColumn align="end">NET</TableColumn>
                            <TableColumn align="end">DISCREPANCY</TableColumn>
                          </TableHeader>
                          <TableBody>
                            {discrepancies.map((row) => (
                              <TableRow key={`disc-${row.advance_id}-${row.merchant_name}`}>
                                <TableCell className="font-mono text-sm">
                                  {row.advance_id || "—"}
                                </TableCell>
                                <TableCell className="font-medium">{row.merchant_name}</TableCell>
                                <TableCell className="text-right font-mono text-sm">
                                  {money(row.gross_amount)}
                                </TableCell>
                                <TableCell className="text-right font-mono text-sm">
                                  {money(row.originator_fee ?? 0)}
                                </TableCell>
                                <TableCell className="text-right font-mono text-sm">
                                  {money(row.rb_fee ?? 0)}
                                </TableCell>
                                <TableCell className="text-right font-mono text-sm">
                                  {money(row.net_amount)}
                                </TableCell>
                                <TableCell className="text-right font-mono text-sm text-warning-600">
                                  {money(row.fee_discrepancy ?? 0)}
                                </TableCell>
                              </TableRow>
                            ))}
                          </TableBody>
                        </Table>
                        <p className="text-xs text-default-500 mt-2">
                          The funder&apos;s stated net is saved as-is. These deals&apos; net does
                          not equal gross minus the two servicing fees — flagged for review.
                        </p>
                      </div>
                    )}

                    {r.unmatched_count > 0 && (
                      <div className="overflow-x-auto">
                        <Table
                          aria-label={`Unmatched rows for ${preview.portfolioName} ${preview.funderName}`}
                          isStriped
                          removeWrapper
                        >
                          <TableHeader>
                            <TableColumn>ADVANCE ID</TableColumn>
                            <TableColumn>MERCHANT</TableColumn>
                            <TableColumn align="end">NET</TableColumn>
                          </TableHeader>
                          <TableBody>
                            {r.unmatched.map((row) => (
                              <TableRow key={row.row_id}>
                                <TableCell className="font-mono text-sm">
                                  {row.advance_id || "—"}
                                </TableCell>
                                <TableCell className="font-medium">{row.merchant_name}</TableCell>
                                <TableCell className="text-right font-mono text-sm">
                                  {money(row.net)}
                                </TableCell>
                              </TableRow>
                            ))}
                          </TableBody>
                        </Table>
                        <p className="text-xs text-default-500 mt-2">
                          Unmatched rows are saved with the pivot — their payments are not written
                          until resolved. Reconcile them any time from the Deal Lookup page&apos;s
                          Unmatched tab.
                        </p>
                      </div>
                    )}
                  </div>
                );
              })}
            </ModalBody>
            <ModalFooter>
              <Button variant="flat" onPress={onClose} isDisabled={isCommitting}>
                Cancel
              </Button>
              <Button
                color="primary"
                onPress={onCommit}
                isLoading={isCommitting}
                startContent={
                  !isCommitting && <Icon icon="material-symbols:cloud-upload" className="w-4 h-4" />
                }
              >
                {isCommitting ? "Saving…" : "Save to Cloud"}
              </Button>
            </ModalFooter>
          </>
        )}
      </ModalContent>
    </Modal>
  );
}

export default PivotReconciliationModal;
