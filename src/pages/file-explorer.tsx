import { useState, useEffect, useMemo } from "react";
import { invoke } from "@tauri-apps/api/core";
import {
  Table,
  TableHeader,
  TableColumn,
  TableBody,
  TableRow,
  TableCell,
  Card,
  CardBody,
  Chip,
  Spinner,
  Input,
  Select,
  SelectItem,
} from "@heroui/react";
import { FileViewer } from "@features/file-viewer";
import type { CSVData, ExcelData, FileMetadata } from "@features/file-viewer";

interface DatabaseFile {
  id: string;
  file_type: string;
  portfolio_name: string;
  funder_name?: string;
  report_date: string;
  upload_type?: string;
  file_name: string;
  file_path: string;
  file_size: number;
  upload_timestamp: string;
  is_active?: boolean;
  total_gross?: number;
  total_fee?: number;
  total_net?: number;
  row_count?: number;
}

function FileExplorer() {
  const [files, setFiles] = useState<DatabaseFile[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedFile, setSelectedFile] = useState<DatabaseFile | null>(null);
  const [fileData, setFileData] = useState<CSVData | ExcelData | null>(null);
  const [loadingFile, setLoadingFile] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState("");
  const [portfolioFilter, setPortfolioFilter] = useState("all");
  const [typeFilter, setTypeFilter] = useState("all");

  useEffect(() => {
    loadFiles();
  }, []);

  const loadFiles = async () => {
    try {
      setLoading(true);
      setError(null);
      const allFiles = await invoke<DatabaseFile[]>("get_all_database_files");
      setFiles(allFiles);
    } catch (err) {
      console.error("Failed to load files:", err);
      setError("Failed to load files from database");
    } finally {
      setLoading(false);
    }
  };

  const handleFileSelect = async (file: DatabaseFile) => {
    try {
      setLoadingFile(true);
      setError(null);
      setSelectedFile(file);

      const isExcel =
        file.file_name.toLowerCase().endsWith(".xlsx") ||
        file.file_name.toLowerCase().endsWith(".xls");

      if (isExcel) {
        const excelData = await invoke<ExcelData>("read_excel_file", {
          filePath: file.file_path,
        });
        setFileData(excelData);
      } else {
        const [headers, rows] = await invoke<[string[], string[][]]>("read_csv_file", {
          filePath: file.file_path,
        });
        setFileData({ headers, rows });
      }
    } catch (err) {
      console.error("Failed to read file:", err);
      setError(`Failed to read file: ${err}`);
      setFileData(null);
    } finally {
      setLoadingFile(false);
    }
  };

  const formatFileSize = (bytes: number) => {
    const sizes = ["Bytes", "KB", "MB", "GB"];
    if (bytes === 0) return "0 Bytes";
    const i = Math.floor(Math.log(bytes) / Math.log(1024));
    return `${(bytes / Math.pow(1024, i)).toFixed(2)} ${sizes[i]}`;
  };

  const formatDate = (dateString: string) => {
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

  const filteredFiles = useMemo(() => {
    return files.filter((file) => {
      const matchesSearch =
        searchQuery === "" ||
        file.file_name.toLowerCase().includes(searchQuery.toLowerCase()) ||
        file.portfolio_name.toLowerCase().includes(searchQuery.toLowerCase()) ||
        (file.funder_name && file.funder_name.toLowerCase().includes(searchQuery.toLowerCase()));

      const matchesPortfolio = portfolioFilter === "all" || file.portfolio_name === portfolioFilter;

      const matchesType = typeFilter === "all" || file.file_type === typeFilter;

      return matchesSearch && matchesPortfolio && matchesType;
    });
  }, [files, searchQuery, portfolioFilter, typeFilter]);

  const portfolios = useMemo(() => {
    return Array.from(new Set(files.map((f) => f.portfolio_name)));
  }, [files]);

  const fileTypes = useMemo(() => {
    return Array.from(new Set(files.map((f) => f.file_type)));
  }, [files]);

  const getFileMetadata = (file: DatabaseFile): FileMetadata => {
    return {
      fileName: file.file_name,
      portfolioName: file.portfolio_name,
      funderName: file.funder_name,
      reportDate: file.report_date,
      uploadType: file.upload_type as "weekly" | "monthly" | undefined,
      fileSize: file.file_size,
      uploadTimestamp: file.upload_timestamp,
      totalGross: file.total_gross,
      totalFee: file.total_fee,
      totalNet: file.total_net,
      rowCount: file.row_count,
    };
  };

  const getFileType = (fileName: string) => {
    const ext = fileName.toLowerCase();
    if (ext.endsWith(".xlsx") || ext.endsWith(".xls")) return "excel";
    if (ext.endsWith(".csv")) return "csv";
    if (ext.endsWith(".pdf")) return "pdf";
    if (ext.endsWith(".json")) return "json";
    return "csv"; // default
  };

  return (
    <div className="p-6 space-y-6">
      <div>
        <h1 className="text-3xl font-bold mb-2">File Explorer</h1>
        <p className="text-default-500">Browse and view files stored in the database</p>
      </div>

      <Card>
        <CardBody>
          <div className="flex gap-4 mb-4">
            <Input
              placeholder="Search files..."
              value={searchQuery}
              onValueChange={setSearchQuery}
              className="max-w-xs"
              isClearable
            />
            <Select
              label="Portfolio"
              placeholder="All portfolios"
              selectedKeys={[portfolioFilter]}
              onSelectionChange={(keys) => setPortfolioFilter(Array.from(keys)[0] as string)}
              className="max-w-xs"
            >
              <>
                <SelectItem key="all">All Portfolios</SelectItem>
                {portfolios.map((p) => (
                  <SelectItem key={p} textValue={p}>
                    {p}
                  </SelectItem>
                ))}
              </>
            </Select>
            <Select
              label="File Type"
              placeholder="All types"
              selectedKeys={[typeFilter]}
              onSelectionChange={(keys) => setTypeFilter(Array.from(keys)[0] as string)}
              className="max-w-xs"
            >
              <>
                <SelectItem key="all">All Types</SelectItem>
                {fileTypes.map((t) => (
                  <SelectItem key={t} textValue={t}>
                    {t.replace("_", " ").charAt(0).toUpperCase() + t.slice(1).replace("_", " ")}
                  </SelectItem>
                ))}
              </>
            </Select>
          </div>

          {loading ? (
            <div className="flex justify-center items-center h-64">
              <Spinner size="lg" />
            </div>
          ) : error ? (
            <div className="text-danger text-center py-8">{error}</div>
          ) : (
            <Table
              aria-label="Database files"
              selectionMode="single"
              onRowAction={(key) => {
                const file = files.find((f) => f.id === key);
                if (file) handleFileSelect(file);
              }}
              classNames={{
                wrapper: "max-h-[400px]",
              }}
            >
              <TableHeader>
                <TableColumn>FILE NAME</TableColumn>
                <TableColumn>PORTFOLIO</TableColumn>
                <TableColumn>TYPE</TableColumn>
                <TableColumn>REPORT DATE</TableColumn>
                <TableColumn>SIZE</TableColumn>
                <TableColumn>STATUS</TableColumn>
                <TableColumn>UPLOADED</TableColumn>
              </TableHeader>
              <TableBody items={filteredFiles} emptyContent="No files found">
                {(item) => (
                  <TableRow key={item.id} className="cursor-pointer hover:bg-default-100">
                    <TableCell>
                      <div>
                        <div className="font-medium">{item.file_name}</div>
                        {item.funder_name && (
                          <div className="text-small text-default-500">
                            Funder: {item.funder_name}
                          </div>
                        )}
                      </div>
                    </TableCell>
                    <TableCell>{item.portfolio_name}</TableCell>
                    <TableCell>
                      <Chip size="sm" variant="flat">
                        {item.file_type.replace("_", " ")}
                      </Chip>
                    </TableCell>
                    <TableCell>{formatDate(item.report_date)}</TableCell>
                    <TableCell>{formatFileSize(item.file_size)}</TableCell>
                    <TableCell>
                      {item.is_active !== undefined && (
                        <Chip
                          size="sm"
                          variant="dot"
                          color={item.is_active ? "success" : "default"}
                        >
                          {item.is_active ? "Active" : "Inactive"}
                        </Chip>
                      )}
                      {item.upload_type && (
                        <Chip
                          size="sm"
                          variant="flat"
                          color={item.upload_type === "monthly" ? "primary" : "secondary"}
                          className="ml-2"
                        >
                          {item.upload_type}
                        </Chip>
                      )}
                    </TableCell>
                    <TableCell>
                      <span className="text-small">{formatDate(item.upload_timestamp)}</span>
                    </TableCell>
                  </TableRow>
                )}
              </TableBody>
            </Table>
          )}
        </CardBody>
      </Card>

      {selectedFile && (
        <Card>
          <CardBody>
            {loadingFile ? (
              <div className="flex justify-center items-center h-64">
                <Spinner size="lg" label="Loading file..." />
              </div>
            ) : fileData ? (
              <FileViewer
                type={getFileType(selectedFile.file_name)}
                data={fileData}
                metadata={getFileMetadata(selectedFile)}
              />
            ) : null}
          </CardBody>
        </Card>
      )}
    </div>
  );
}

export default FileExplorer;
