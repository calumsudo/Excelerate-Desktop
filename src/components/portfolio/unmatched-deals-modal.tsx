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
  Chip,
  Select,
  SelectItem,
  Spinner,
} from "@heroui/react";
import { Icon } from "@iconify/react";
import { save } from "@tauri-apps/plugin-dialog";
import { writeTextFile } from "@tauri-apps/plugin-fs";
import FileService, { UnmatchedDeal } from "@/services/file-service";
import { toast } from "@/services/toast-service";

interface UnmatchedDealsModalProps {
  isOpen: boolean;
  onOpenChange: (open: boolean) => void;
  defaultPortfolio?: string;
  defaultDate?: string;
}

export function UnmatchedDealsModal({
  isOpen,
  onOpenChange,
  defaultPortfolio,
  defaultDate,
}: UnmatchedDealsModalProps) {
  const [unmatchedDeals, setUnmatchedDeals] = useState<UnmatchedDeal[]>([]);
  const [loading, setLoading] = useState(false);
  const [selectedPortfolio, setSelectedPortfolio] = useState<string>(defaultPortfolio || "all");
  const [selectedDate, setSelectedDate] = useState<string>(defaultDate || "");
  const [hasSearched, setHasSearched] = useState(false);

  const handleCheckUnmatchedDeals = async () => {
    setLoading(true);
    setHasSearched(true);
    try {
      let deals: UnmatchedDeal[];

      if (selectedDate) {
        deals = await FileService.findUnmatchedDealsByDate(selectedDate);
      } else if (selectedPortfolio === "all") {
        deals = await FileService.findUnmatchedDeals();
      } else {
        deals = await FileService.findUnmatchedDealsByPortfolio(selectedPortfolio);
      }

      setUnmatchedDeals(deals);
    } catch (error) {
      console.error("Error checking unmatched deals:", error);
      alert(`Error: ${error}`);
    } finally {
      setLoading(false);
    }
  };

  const exportToCSV = async () => {
    try {
      const headers = [
        "Portfolio",
        "Funder",
        "Report Date",
        "Upload Type",
        "Advance ID",
        "Merchant Name",
        "Gross Amount",
        "Servicing Fee",
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
        escapeCSV(deal.portfolio_name),
        escapeCSV(deal.funder_name),
        escapeCSV(deal.report_date),
        escapeCSV(deal.upload_type),
        escapeCSV(deal.advance_id),
        escapeCSV(deal.merchant_name),
        deal.sum_of_syn_gross_amount.toFixed(2),
        deal.total_servicing_fee.toFixed(2),
        deal.sum_of_syn_net_amount.toFixed(2),
      ]);

      const csvContent = [headers.join(","), ...rows.map((row) => row.join(","))].join("\n");

      // Use Tauri's save dialog
      const defaultFileName = `unmatched_deals_${new Date().toISOString().split("T")[0]}.csv`;
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

  const totalGross = unmatchedDeals.reduce((sum, deal) => sum + deal.sum_of_syn_gross_amount, 0);
  const totalFees = unmatchedDeals.reduce((sum, deal) => sum + deal.total_servicing_fee, 0);
  const totalNet = unmatchedDeals.reduce((sum, deal) => sum + deal.sum_of_syn_net_amount, 0);

  return (
    <Modal isOpen={isOpen} onOpenChange={onOpenChange} size="5xl" scrollBehavior="inside">
      <ModalContent>
        {(onClose) => (
          <>
            <ModalHeader className="flex flex-col gap-1">
              <h2 className="text-2xl font-bold">Unmatched Deals Detection</h2>
              <p className="text-sm text-default-500 font-normal">
                Find deals from pivot tables that don&apos;t have matching merchant records
              </p>
            </ModalHeader>
            <ModalBody>
              {/* Filters */}
              <div className="flex gap-4 mb-4">
                <Select
                  label="Portfolio"
                  selectedKeys={[selectedPortfolio]}
                  onChange={(e) => setSelectedPortfolio(e.target.value)}
                  className="max-w-xs"
                >
                  <SelectItem key="all">All Portfolios</SelectItem>
                  <SelectItem key="Alder">Alder</SelectItem>
                  <SelectItem key="White Rabbit">White Rabbit</SelectItem>
                </Select>

                <div className="flex flex-col gap-2 flex-1">
                  <label className="text-sm">Report Date (Optional)</label>
                  <input
                    type="text"
                    placeholder="MM/DD/YYYY"
                    value={selectedDate}
                    onChange={(e) => setSelectedDate(e.target.value)}
                    className="px-3 py-2 border rounded-lg bg-default-100 hover:bg-default-200 focus:outline-none focus:ring-2 focus:ring-primary"
                  />
                </div>

                <Button
                  color="primary"
                  onPress={handleCheckUnmatchedDeals}
                  isLoading={loading}
                  startContent={<Icon icon="mdi:search" width={20} />}
                  className="self-end"
                >
                  Search
                </Button>
              </div>

              {/* Loading State */}
              {loading && (
                <div className="flex justify-center items-center py-12">
                  <Spinner size="lg" label="Searching for unmatched deals..." />
                </div>
              )}

              {/* Results Summary */}
              {!loading && hasSearched && unmatchedDeals.length > 0 && (
                <div className="mb-4 p-4 bg-warning-50 dark:bg-warning-100/10 border border-warning-200 dark:border-warning-200/20 rounded-lg">
                  <div className="flex justify-between items-start mb-3">
                    <div>
                      <h3 className="text-lg font-semibold mb-2 flex items-center gap-2">
                        <Icon icon="mdi:alert-circle" className="text-warning" width={24} />
                        Found {unmatchedDeals.length} Unmatched Deal
                        {unmatchedDeals.length !== 1 ? "s" : ""}
                      </h3>
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
              )}

              {/* No Results */}
              {!loading && hasSearched && unmatchedDeals.length === 0 && (
                <div className="p-8 bg-success-50 dark:bg-success-100/10 border border-success-200 dark:border-success-200/20 rounded-lg text-center">
                  <Icon icon="mdi:check-circle" className="text-success mx-auto mb-2" width={48} />
                  <p className="text-success-700 dark:text-success-500 text-lg font-semibold">
                    All deals have matching merchant records!
                  </p>
                  <p className="text-default-600 text-sm mt-1">No unmatched deals found.</p>
                </div>
              )}

              {/* Results Table */}
              {!loading && unmatchedDeals.length > 0 && (
                <div className="overflow-x-auto">
                  <Table aria-label="Unmatched deals table" isStriped>
                    <TableHeader>
                      <TableColumn>PORTFOLIO</TableColumn>
                      <TableColumn>FUNDER</TableColumn>
                      <TableColumn>DATE</TableColumn>
                      <TableColumn>TYPE</TableColumn>
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
                            <Chip
                              size="sm"
                              variant="flat"
                              color={deal.portfolio_name === "Alder" ? "primary" : "secondary"}
                            >
                              {deal.portfolio_name}
                            </Chip>
                          </TableCell>
                          <TableCell>{deal.funder_name}</TableCell>
                          <TableCell className="text-sm">{deal.report_date}</TableCell>
                          <TableCell>
                            <Chip size="sm" variant="flat">
                              {deal.upload_type}
                            </Chip>
                          </TableCell>
                          <TableCell className="font-mono text-sm">{deal.advance_id}</TableCell>
                          <TableCell className="font-medium">{deal.merchant_name}</TableCell>
                          <TableCell className="text-right font-mono text-sm">
                            $
                            {deal.sum_of_syn_gross_amount.toLocaleString(undefined, {
                              minimumFractionDigits: 2,
                              maximumFractionDigits: 2,
                            })}
                          </TableCell>
                          <TableCell className="text-right font-mono text-sm">
                            $
                            {deal.total_servicing_fee.toLocaleString(undefined, {
                              minimumFractionDigits: 2,
                              maximumFractionDigits: 2,
                            })}
                          </TableCell>
                          <TableCell className="text-right font-mono text-sm">
                            $
                            {deal.sum_of_syn_net_amount.toLocaleString(undefined, {
                              minimumFractionDigits: 2,
                              maximumFractionDigits: 2,
                            })}
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </div>
              )}

              {/* Initial State */}
              {!loading && !hasSearched && (
                <div className="py-12 text-center text-default-500">
                  <Icon icon="mdi:magnify" className="mx-auto mb-3" width={64} />
                  <p className="text-lg">Select filters and click Search to find unmatched deals</p>
                </div>
              )}
            </ModalBody>
            <ModalFooter>
              <Button color="danger" variant="light" onPress={onClose}>
                Close
              </Button>
            </ModalFooter>
          </>
        )}
      </ModalContent>
    </Modal>
  );
}
