import React, { useMemo } from "react";
import {
  Table,
  TableHeader,
  TableColumn,
  TableBody,
  TableRow,
  TableCell,
  Card,
  CardHeader,
  CardBody,
  Chip,
  Divider,
} from "@heroui/react";
import { CSVViewerProps } from "./types";

export const CSVViewer: React.FC<CSVViewerProps> = ({ data, metadata, className = "" }) => {
  const formatFileSize = (bytes?: number) => {
    if (!bytes) return "";
    const sizes = ["Bytes", "KB", "MB", "GB"];
    const i = Math.floor(Math.log(bytes) / Math.log(1024));
    return `${(bytes / Math.pow(1024, i)).toFixed(2)} ${sizes[i]}`;
  };

  const formatDate = (dateString?: string) => {
    if (!dateString) return "";
    try {
      const date = new Date(dateString);
      return date.toLocaleDateString("en-US", {
        year: "numeric",
        month: "short",
        day: "numeric",
      });
    } catch {
      return dateString;
    }
  };

  const formatCurrency = (value?: number) => {
    if (value === undefined || value === null) return "";
    return new Intl.NumberFormat("en-US", {
      style: "currency",
      currency: "USD",
    }).format(value);
  };

  const hasMetadata = useMemo(() => {
    return metadata && Object.values(metadata).some((value) => value !== undefined);
  }, [metadata]);

  const tableRows = useMemo(() => {
    return data.rows.map((row, index) => ({
      key: index,
      cells: row,
    }));
  }, [data.rows]);

  return (
    <Card className={`w-full ${className}`}>
      {hasMetadata && metadata && (
        <>
          <CardHeader className="flex flex-col gap-3 p-6">
            <div className="flex flex-wrap gap-4 items-start">
              {metadata.fileName && (
                <div className="flex flex-col">
                  <span className="text-small text-default-500">File Name</span>
                  <span className="text-medium font-semibold">{metadata.fileName}</span>
                </div>
              )}

              {metadata.originalFileName && metadata.originalFileName !== metadata.fileName && (
                <div className="flex flex-col">
                  <span className="text-small text-default-500">Original File</span>
                  <span className="text-medium">{metadata.originalFileName}</span>
                </div>
              )}

              {metadata.portfolioName && (
                <div className="flex flex-col">
                  <span className="text-small text-default-500">Portfolio</span>
                  <span className="text-medium font-semibold">{metadata.portfolioName}</span>
                </div>
              )}

              {metadata.funderName && (
                <div className="flex flex-col">
                  <span className="text-small text-default-500">Funder</span>
                  <span className="text-medium font-semibold">{metadata.funderName}</span>
                </div>
              )}

              {metadata.reportDate && (
                <div className="flex flex-col">
                  <span className="text-small text-default-500">Report Date</span>
                  <span className="text-medium">{formatDate(metadata.reportDate)}</span>
                </div>
              )}

              {metadata.uploadType && (
                <div className="flex flex-col">
                  <span className="text-small text-default-500">Type</span>
                  <Chip
                    color={metadata.uploadType === "monthly" ? "primary" : "secondary"}
                    size="sm"
                    variant="flat"
                  >
                    {metadata.uploadType.charAt(0).toUpperCase() + metadata.uploadType.slice(1)}
                  </Chip>
                </div>
              )}

              {metadata.fileSize && (
                <div className="flex flex-col">
                  <span className="text-small text-default-500">File Size</span>
                  <span className="text-medium">{formatFileSize(metadata.fileSize)}</span>
                </div>
              )}

              {metadata.rowCount !== undefined && metadata.rowCount !== null && (
                <div className="flex flex-col">
                  <span className="text-small text-default-500">Rows</span>
                  <span className="text-medium">{metadata.rowCount.toLocaleString()}</span>
                </div>
              )}
            </div>

            {((metadata.totalGross !== undefined && metadata.totalGross !== null) ||
              (metadata.totalFee !== undefined && metadata.totalFee !== null) ||
              (metadata.totalNet !== undefined && metadata.totalNet !== null)) && (
              <div className="flex flex-wrap gap-6 mt-2 pt-3 border-t border-divider">
                {metadata.totalGross !== undefined && metadata.totalGross !== null && (
                  <div className="flex flex-col">
                    <span className="text-small text-default-500">Total Gross</span>
                    <span className="text-large font-semibold text-success">
                      {formatCurrency(metadata.totalGross)}
                    </span>
                  </div>
                )}

                {metadata.totalFee !== undefined && metadata.totalFee !== null && (
                  <div className="flex flex-col">
                    <span className="text-small text-default-500">Total Fee</span>
                    <span className="text-large font-semibold text-warning">
                      {formatCurrency(metadata.totalFee)}
                    </span>
                  </div>
                )}

                {metadata.totalNet !== undefined && metadata.totalNet !== null && (
                  <div className="flex flex-col">
                    <span className="text-small text-default-500">Total Net</span>
                    <span className="text-large font-semibold text-primary">
                      {formatCurrency(metadata.totalNet)}
                    </span>
                  </div>
                )}
              </div>
            )}

            {metadata.uploadTimestamp && (
              <div className="flex flex-col mt-2 pt-2 border-t border-divider">
                <span className="text-small text-default-500">Uploaded</span>
                <span className="text-small">{formatDate(metadata.uploadTimestamp)}</span>
              </div>
            )}
          </CardHeader>
          <Divider />
        </>
      )}

      <CardBody className="p-0">
        <Table
          aria-label="CSV data table"
          classNames={{
            wrapper: "max-h-[600px]",
            th: "bg-default-100 text-default-600",
          }}
        >
          <TableHeader>
            {data.headers.map((header, index) => (
              <TableColumn key={index} className="min-w-[100px]">
                {header}
              </TableColumn>
            ))}
          </TableHeader>
          <TableBody items={tableRows}>
            {(item) => (
              <TableRow key={item.key}>
                {item.cells.map((cell, cellIndex) => (
                  <TableCell key={cellIndex}>{cell}</TableCell>
                ))}
              </TableRow>
            )}
          </TableBody>
        </Table>
      </CardBody>
    </Card>
  );
};
