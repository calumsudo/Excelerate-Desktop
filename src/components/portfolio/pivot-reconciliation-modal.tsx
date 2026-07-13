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
