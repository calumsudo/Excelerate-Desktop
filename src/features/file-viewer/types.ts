export interface FileMetadata {
  fileName?: string;
  originalFileName?: string;
  reportDate?: string;
  portfolioName?: string;
  funderName?: string;
  uploadType?: 'weekly' | 'monthly';
  fileSize?: number;
  uploadTimestamp?: string;
  totalGross?: number;
  totalFee?: number;
  totalNet?: number;
  rowCount?: number;
}

export interface CSVData {
  headers: string[];
  rows: string[][];
}

export interface CSVViewerProps {
  data: CSVData;
  metadata?: FileMetadata;
  className?: string;
}

export interface ExcelData {
  sheets: {
    name: string;
    data: Array<Array<{ value: string | number | null }>>;
  }[];
  activeSheet?: number;
}

export interface ExcelViewerProps {
  data: ExcelData;
  metadata?: FileMetadata;
  className?: string;
}

export type ViewerType = 'csv' | 'excel' | 'pdf' | 'json';

export interface FileViewerProps {
  type: ViewerType;
  data: any;
  metadata?: FileMetadata;
  className?: string;
}