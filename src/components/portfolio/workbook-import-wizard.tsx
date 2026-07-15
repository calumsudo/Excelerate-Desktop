import { useState } from "react";
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
  Progress,
} from "@heroui/react";
import { Icon } from "@iconify/react";
import { open } from "@tauri-apps/plugin-dialog";
import WorkbookImportService, {
  WorkbookImportPreview,
  SheetImportResult,
} from "@services/workbook-import-service";

interface WorkbookImportWizardProps {
  portfolioName: string;
}

type WizardStep = "idle" | "parsing" | "preview" | "importing" | "summary";

const money = (value: number) =>
  `$${value.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

const pct = (value: number | null) => (value === null ? "—" : `${(value * 100).toFixed(1)}%`);

interface ImportPreviewBodyProps {
  preview: WorkbookImportPreview;
  totalDeals: number;
  totalPayments: number;
  totalNet: number;
  allWarnings: string[];
}

// "preview" step: parsed per-sheet counts shown before anything is written.
function ImportPreviewBody({
  preview,
  totalDeals,
  totalPayments,
  totalNet,
  allWarnings,
}: ImportPreviewBodyProps) {
  return (
    <>
      <Table aria-label="Parsed funder sheets" isStriped removeWrapper>
        <TableHeader>
          <TableColumn>SHEET</TableColumn>
          <TableColumn>FUNDER</TableColumn>
          <TableColumn align="end">MGMT FEE</TableColumn>
          <TableColumn align="end">DEALS</TableColumn>
          <TableColumn align="end">PAYMENTS</TableColumn>
          <TableColumn align="end">NET RTR TOTAL</TableColumn>
        </TableHeader>
        <TableBody>
          {preview.sheets.map((s) => (
            <TableRow key={s.sheet.sheet_name}>
              <TableCell className="font-mono text-sm">{s.sheet.sheet_name}</TableCell>
              <TableCell className="font-medium">{s.funderName}</TableCell>
              <TableCell className="text-right font-mono text-sm">
                {pct(s.sheet.management_fee_rate)}
                {s.currentFeeRate !== null &&
                  s.sheet.management_fee_rate !== null &&
                  s.currentFeeRate !== s.sheet.management_fee_rate && (
                    <span className="text-warning-600"> (was {pct(s.currentFeeRate)})</span>
                  )}
              </TableCell>
              <TableCell className="text-right font-mono text-sm">{s.sheet.deals.length}</TableCell>
              <TableCell className="text-right font-mono text-sm">
                {s.sheet.payment_count}
              </TableCell>
              <TableCell className="text-right font-mono text-sm">
                {money(s.sheet.total_net_payments)}
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>

      <div className="flex items-center gap-4 text-sm font-medium px-1">
        <span>Total: {totalDeals} deals</span>
        <span>{totalPayments} payments</span>
        <span>{money(totalNet)} net RTR</span>
      </div>

      {preview.missingSheets.length > 0 && (
        <p className="text-xs text-default-500">
          Not in this workbook: {preview.missingSheets.join(", ")}
        </p>
      )}
      {allWarnings.length > 0 && (
        <div className="p-3 bg-warning-50 border border-warning-200 rounded-lg">
          <p className="text-sm font-medium text-warning-700 mb-1">
            {allWarnings.length} parser warning{allWarnings.length === 1 ? "" : "s"}
          </p>
          <ul className="text-xs text-warning-700 list-disc pl-4 max-h-24 overflow-y-auto">
            {allWarnings.map((w) => (
              <li key={w}>{w}</li>
            ))}
          </ul>
        </div>
      )}
    </>
  );
}

interface ImportSummaryBodyProps {
  results: Map<string, SheetImportResult>;
  unmatchedIndustries: string[];
  unmatchedStates: string[];
  error: string | null;
}

// "summary" step: per-sheet import results plus any unmatched lookups.
function ImportSummaryBody({
  results,
  unmatchedIndustries,
  unmatchedStates,
  error,
}: ImportSummaryBodyProps) {
  return (
    <>
      <Table aria-label="Import results" isStriped removeWrapper>
        <TableHeader>
          <TableColumn>SHEET</TableColumn>
          <TableColumn align="end">DEALS</TableColumn>
          <TableColumn align="end">MERCHANTS</TableColumn>
          <TableColumn align="end">PAYMENTS</TableColumn>
          <TableColumn align="end">NET WRITTEN</TableColumn>
          <TableColumn align="end">SKIPPED</TableColumn>
        </TableHeader>
        <TableBody>
          {[...results.entries()].map(([sheetName, r]) => (
            <TableRow key={sheetName}>
              <TableCell className="font-mono text-sm">{sheetName}</TableCell>
              <TableCell className="text-right font-mono text-sm">{r.deals_imported}</TableCell>
              <TableCell className="text-right font-mono text-sm">{r.merchants_upserted}</TableCell>
              <TableCell className="text-right font-mono text-sm">{r.payments_inserted}</TableCell>
              <TableCell className="text-right font-mono text-sm">
                {money(r.payments_net_inserted)}
              </TableCell>
              <TableCell className="text-right font-mono text-sm">
                {r.rows_skipped + r.duplicate_rows_dropped || ""}
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>

      {(unmatchedIndustries.length > 0 || unmatchedStates.length > 0) && (
        <div className="p-3 bg-default-100 rounded-lg text-xs text-default-600 space-y-2">
          {unmatchedIndustries.length > 0 && (
            <p>
              <span className="font-medium">{unmatchedIndustries.length} industries</span> had no
              match in the lookup table (merchants imported without an industry):{" "}
              {unmatchedIndustries.slice(0, 12).join(", ")}
              {unmatchedIndustries.length > 12 && " …"}
            </p>
          )}
          {unmatchedStates.length > 0 && (
            <p>
              <span className="font-medium">{unmatchedStates.length} states</span> unmatched:{" "}
              {unmatchedStates.slice(0, 12).join(", ")}
              {unmatchedStates.length > 12 && " …"}
            </p>
          )}
        </div>
      )}
      {!error && (
        <div className="flex items-center gap-2 text-success-600 text-sm">
          <Icon icon="material-symbols:check-circle" className="w-5 h-5" />
          Workbook imported. Monthly funder uploads take it from here.
        </div>
      )}
    </>
  );
}

/**
 * Phase 3 one-time onboarding: parse a portfolio workbook locally (Rust),
 * preview per-sheet deal/payment counts, then import each funder sheet into
 * Supabase via the import_funder_sheet RPC. Safe to re-run — imports are
 * idempotent per (advance id, funder advance id).
 */
export function WorkbookImportWizard({ portfolioName }: WorkbookImportWizardProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [step, setStep] = useState<WizardStep>("idle");
  const [preview, setPreview] = useState<WorkbookImportPreview | null>(null);
  const [results, setResults] = useState<Map<string, SheetImportResult>>(new Map());
  const [currentSheet, setCurrentSheet] = useState<string | null>(null);
  const [completedSheets, setCompletedSheets] = useState(0);
  const [error, setError] = useState<string | null>(null);

  const reset = () => {
    setStep("idle");
    setPreview(null);
    setResults(new Map());
    setCurrentSheet(null);
    setCompletedSheets(0);
    setError(null);
  };

  const handleOpenChange = (open: boolean) => {
    // Don't allow closing mid-import; a per-sheet transaction is running
    if (!open && step === "importing") return;
    setIsOpen(open);
    if (!open) reset();
  };

  const pickAndParse = async () => {
    setError(null);
    try {
      const filePath = await open({
        multiple: false,
        directory: false,
        filters: [{ name: "Excel Workbook", extensions: ["xlsx", "xlsm"] }],
      });
      if (typeof filePath !== "string") return; // cancelled
      setStep("parsing");
      setPreview(await WorkbookImportService.preview(portfolioName, filePath));
      setStep("preview");
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
      setStep("idle");
    }
  };

  const runImport = async () => {
    if (!preview) return;
    setStep("importing");
    setError(null);
    setCompletedSheets(0);
    const collected = new Map<string, SheetImportResult>();
    try {
      await WorkbookImportService.importAll(preview, (progress) => {
        setCurrentSheet(progress.sheetName);
        if (progress.phase === "done") {
          collected.set(progress.sheetName, progress.result);
          setResults(new Map(collected));
          setCompletedSheets(progress.index + 1);
        }
      });
      setStep("summary");
    } catch (e) {
      // Per-sheet transactions: completed sheets are saved, re-running skips
      // nothing but is idempotent. Show what landed alongside the error.
      setError(e instanceof Error ? e.message : String(e));
      setResults(new Map(collected));
      setStep("summary");
    } finally {
      setCurrentSheet(null);
    }
  };

  const totalDeals = preview?.sheets.reduce((n, s) => n + s.sheet.deals.length, 0) ?? 0;
  const totalPayments = preview?.sheets.reduce((n, s) => n + s.sheet.payment_count, 0) ?? 0;
  const totalNet = preview?.sheets.reduce((n, s) => n + s.sheet.total_net_payments, 0) ?? 0;
  const allWarnings = preview?.sheets.flatMap((s) => s.sheet.warnings) ?? [];
  const unmatchedIndustries = [
    ...new Set([...results.values()].flatMap((r) => r.unmatched_industries)),
  ];
  const unmatchedStates = [...new Set([...results.values()].flatMap((r) => r.unmatched_states))];

  return (
    <>
      <div className="max-w-6xl mx-auto mt-6 p-6 bg-default-50 rounded-lg border border-default-200">
        <div className="flex items-center justify-between">
          <div>
            <h3 className="text-xl font-semibold text-foreground">Import Portfolio Workbook</h3>
            <p className="text-sm text-default-500 mt-1">
              One-time onboarding: load every deal and historical Net RTR payment from the{" "}
              {portfolioName} workbook into the cloud database.
            </p>
          </div>
          <Button
            color="primary"
            variant="flat"
            onPress={() => setIsOpen(true)}
            startContent={<Icon icon="material-symbols:database-upload" className="w-5 h-5" />}
          >
            Import Workbook
          </Button>
        </div>
      </div>

      <Modal isOpen={isOpen} onOpenChange={handleOpenChange} size="4xl" scrollBehavior="inside">
        <ModalContent>
          {(onClose) => (
            <>
              <ModalHeader className="flex flex-col gap-1">
                <h2 className="text-2xl font-bold">Import {portfolioName} Workbook</h2>
                <p className="text-sm text-default-500 font-normal">
                  {step === "preview"
                    ? "Review what was parsed before anything is written to the database."
                    : step === "summary"
                      ? "Import results per funder sheet."
                      : "Select the portfolio workbook (.xlsx) to import deals and payment history."}
                </p>
              </ModalHeader>
              <ModalBody>
                {error && (
                  <div className="p-3 bg-danger-50 border border-danger-200 rounded-lg text-sm text-danger-700">
                    {error}
                  </div>
                )}

                {(step === "idle" || step === "parsing") && (
                  <div className="flex flex-col items-center gap-4 py-10">
                    <Icon
                      icon="material-symbols:table-chart-view"
                      className="w-12 h-12 text-default-400"
                    />
                    <Button
                      color="primary"
                      onPress={pickAndParse}
                      isLoading={step === "parsing"}
                      startContent={
                        step !== "parsing" && (
                          <Icon icon="material-symbols:folder-open" className="w-4 h-4" />
                        )
                      }
                    >
                      {step === "parsing" ? "Parsing workbook…" : "Choose Workbook File"}
                    </Button>
                  </div>
                )}

                {step === "preview" && preview && (
                  <ImportPreviewBody
                    preview={preview}
                    totalDeals={totalDeals}
                    totalPayments={totalPayments}
                    totalNet={totalNet}
                    allWarnings={allWarnings}
                  />
                )}

                {step === "importing" && preview && (
                  <div className="flex flex-col gap-3 py-6">
                    <Progress
                      aria-label="Import progress"
                      value={(completedSheets / preview.sheets.length) * 100}
                      showValueLabel
                    />
                    <p className="text-sm text-default-600 text-center">
                      {currentSheet
                        ? `Importing ${currentSheet}… (${completedSheets}/${preview.sheets.length} sheets done)`
                        : `${completedSheets}/${preview.sheets.length} sheets done`}
                    </p>
                  </div>
                )}

                {step === "summary" && (
                  <ImportSummaryBody
                    results={results}
                    unmatchedIndustries={unmatchedIndustries}
                    unmatchedStates={unmatchedStates}
                    error={error}
                  />
                )}
              </ModalBody>
              <ModalFooter>
                {step === "preview" && (
                  <>
                    <Button variant="flat" onPress={onClose}>
                      Cancel
                    </Button>
                    <Button
                      color="primary"
                      onPress={runImport}
                      startContent={
                        <Icon icon="material-symbols:cloud-upload" className="w-4 h-4" />
                      }
                    >
                      Import {preview?.sheets.length ?? 0} Sheets
                    </Button>
                  </>
                )}
                {step === "summary" && (
                  <Button color="primary" onPress={onClose}>
                    Done
                  </Button>
                )}
                {(step === "idle" || step === "parsing") && (
                  <Button variant="flat" onPress={onClose} isDisabled={step === "parsing"}>
                    Cancel
                  </Button>
                )}
              </ModalFooter>
            </>
          )}
        </ModalContent>
      </Modal>
    </>
  );
}

export default WorkbookImportWizard;
