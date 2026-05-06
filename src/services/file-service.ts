import { invoke } from "@tauri-apps/api/core";
import { toast } from "./toast-service";

export interface UploadResponse {
  success: boolean;
  message: string;
  file_path?: string;
  version_id?: string;
  backup_path?: string;
}

export interface ValidatedUploadResponse extends UploadResponse {
  validation_errors?: string[];
  validation_warnings?: string[];
}

export interface VersionInfo {
  id: string;
  report_date: string;
  original_filename: string;
  upload_timestamp: string;
  file_size: number;
  is_active: boolean;
}

export interface FunderUploadInfo {
  id: string;
  funder_name: string;
  report_date: string;
  upload_type: string;
  original_filename: string;
  upload_timestamp: string;
  file_size: number;
}

export interface UnmatchedDeal {
  portfolio_name: string;
  funder_name: string;
  report_date: string;
  upload_type: string;
  advance_id: string;
  merchant_name: string;
  sum_of_syn_gross_amount: number;
  total_servicing_fee: number;
  sum_of_syn_net_amount: number;
}

export interface UpdateWithNetRtrResponse extends UploadResponse {
  unmatched_deals?: Array<{
    funder_name: string;
    sheet_name: string;
    advance_id: string;
    merchant_name: string;
    gross_amount: number;
    management_fee: number;
    net_amount: number;
  }>;
  unmatched_count?: number;
}

export class FileService {
  static async savePortfolioWorkbookWithVersion(
    portfolioName: string,
    file: File,
    reportDate: string
  ): Promise<UploadResponse> {
    try {
      const arrayBuffer = await file.arrayBuffer();
      const fileData = Array.from(new Uint8Array(arrayBuffer));

      const response = await invoke<UploadResponse>("save_portfolio_workbook_with_version", {
        portfolioName,
        fileData,
        fileName: file.name,
        reportDate,
      });

      return response;
    } catch (error) {
      console.error("Error saving workbook with version:", error);
      throw error;
    }
  }

  static async getPortfolioVersions(portfolioName: string): Promise<VersionInfo[]> {
    try {
      return await invoke<VersionInfo[]>("get_portfolio_versions", {
        portfolioName,
      });
    } catch (error) {
      console.error("Error getting portfolio versions:", error);
      return [];
    }
  }

  static async getVersionsByDate(reportDate: string): Promise<VersionInfo[]> {
    try {
      return await invoke<VersionInfo[]>("get_versions_by_date", {
        reportDate,
      });
    } catch (error) {
      console.error("Error getting versions by date:", error);
      return [];
    }
  }

  static async restoreVersion(versionId: string): Promise<UploadResponse> {
    try {
      return await invoke<UploadResponse>("restore_version", {
        versionId,
      });
    } catch (error) {
      console.error("Error restoring version:", error);
      throw error;
    }
  }

  static async getActiveVersion(portfolioName: string): Promise<VersionInfo | null> {
    try {
      return await invoke<VersionInfo | null>("get_active_version", {
        portfolioName,
      });
    } catch (error) {
      console.error("Error getting active version:", error);
      return null;
    }
  }

  static async checkVersionExists(portfolioName: string, reportDate: string): Promise<boolean> {
    try {
      return await invoke<boolean>("check_version_exists", {
        portfolioName,
        reportDate,
      });
    } catch (error) {
      console.error("Error checking version existence:", error);
      return false;
    }
  }

  static async deleteVersion(versionId: string): Promise<boolean> {
    try {
      return await invoke<boolean>("delete_version", {
        versionId,
      });
    } catch (error) {
      console.error("Error deleting version:", error);
      return false;
    }
  }

  static async deleteFunderUpload(uploadId: string): Promise<boolean> {
    try {
      return await invoke<boolean>("delete_funder_upload", {
        uploadId,
      });
    } catch (error) {
      console.error("Error deleting funder upload:", error);
      return false;
    }
  }

  static async getPortfolioWorkbookPath(portfolioName: string): Promise<string> {
    try {
      return await invoke<string>("get_portfolio_workbook_path", {
        portfolioName,
      });
    } catch (error) {
      console.error("Error getting workbook path:", error);
      throw error;
    }
  }

  static async checkWorkbookExists(portfolioName: string): Promise<boolean> {
    try {
      return await invoke<boolean>("check_workbook_exists", {
        portfolioName,
      });
    } catch (error) {
      console.error("Error checking workbook existence:", error);
      return false;
    }
  }

  static async saveFunderUpload(
    portfolioName: string,
    funderName: string,
    file: File,
    reportDate: string,
    uploadType: "daily" | "weekly" | "monthly"
  ): Promise<UploadResponse> {
    try {
      const arrayBuffer = await file.arrayBuffer();
      const fileData = Array.from(new Uint8Array(arrayBuffer));

      const response = await invoke<UploadResponse>("save_funder_upload", {
        portfolioName,
        funderName,
        fileData,
        fileName: file.name,
        reportDate,
        uploadType,
      });

      return response;
    } catch (error) {
      console.error("Error saving funder upload:", error);
      throw error;
    }
  }

  static async getFunderUploadInfo(
    portfolioName: string,
    funderName: string,
    reportDate: string,
    uploadType: "daily" | "weekly" | "monthly"
  ): Promise<FunderUploadInfo | null> {
    try {
      return await invoke<FunderUploadInfo | null>("get_funder_upload_info", {
        portfolioName,
        funderName,
        reportDate,
        uploadType,
      });
    } catch (error) {
      console.error("Error getting funder upload info:", error);
      return null;
    }
  }

  static async getFunderUploadsForDate(
    portfolioName: string,
    reportDate: string
  ): Promise<FunderUploadInfo[]> {
    try {
      return await invoke<FunderUploadInfo[]>("get_funder_uploads_for_date", {
        portfolioName,
        reportDate,
      });
    } catch (error) {
      console.error("Error getting funder uploads for date:", error);
      return [];
    }
  }

  static async checkFunderUploadExists(
    portfolioName: string,
    funderName: string,
    reportDate: string,
    uploadType: "daily" | "weekly" | "monthly"
  ): Promise<boolean> {
    try {
      return await invoke<boolean>("check_funder_upload_exists", {
        portfolioName,
        funderName,
        reportDate,
        uploadType,
      });
    } catch (error) {
      console.error("Error checking funder upload existence:", error);
      return false;
    }
  }

  static async updatePortfolioWithNetRtr(
    portfolioName: string,
    reportDate: string
  ): Promise<UpdateWithNetRtrResponse> {
    try {
      console.warn(`Updating ${portfolioName} portfolio with Net RTR for ${reportDate}`);

      // Import and use the Pyodide service with openpyxl
      const { PyodideService } = await import("./pyodide-service");

      // Process the workbook using Pyodide/openpyxl
      const result = await PyodideService.updatePortfolioWorkbookWithNetRtr(
        portfolioName,
        reportDate
      );

      // Log unmatched deals if any
      if (result.unmatchedDeals && result.unmatchedDeals.length > 0) {
        console.warn(
          `Found ${result.unmatchedDeals.length} unmatched deals:`,
          result.unmatchedDeals
        );
      }

      // Return success response with unmatched deals info
      return {
        success: true,
        message: `Successfully updated portfolio with Net RTR values for ${reportDate}. File saved successfully.${result.unmatchedDeals.length > 0 ? ` Found ${result.unmatchedDeals.length} unmatched deals.` : ""}`,
        file_path: result.filePath,
        unmatched_deals: result.unmatchedDeals,
        unmatched_count: result.unmatchedDeals.length,
      };
    } catch (error) {
      console.error("Error updating portfolio with Net RTR:", error);
      throw error;
    }
  }
  // Validated versions of upload methods
  static async saveFunderUploadValidated(
    portfolioName: string,
    funderName: string,
    file: File,
    reportDate: string,
    uploadType: "daily" | "weekly" | "monthly"
  ): Promise<ValidatedUploadResponse> {
    try {
      const arrayBuffer = await file.arrayBuffer();
      const fileData = Array.from(new Uint8Array(arrayBuffer));

      const response = await invoke<ValidatedUploadResponse>("save_funder_upload_validated", {
        portfolioName,
        funderName,
        fileData,
        fileName: file.name,
        reportDate,
        uploadType,
      });

      // Don't show duplicate error toast - backend already sends notification
      // Only show error if there's no validation_errors (meaning backend didn't send notification)
      if (
        !response.success &&
        (!response.validation_errors || response.validation_errors.length === 0)
      ) {
        toast.error(`Upload failed: ${file.name}`, response.message);
      }

      return response;
    } catch (error) {
      console.error("Error saving validated funder upload:", error);
      toast.error("Upload failed", String(error));
      throw error;
    }
  }

  static async savePortfolioWorkbookValidated(
    portfolioName: string,
    file: File,
    reportDate: string
  ): Promise<ValidatedUploadResponse> {
    try {
      const arrayBuffer = await file.arrayBuffer();
      const fileData = Array.from(new Uint8Array(arrayBuffer));

      const response = await invoke<ValidatedUploadResponse>("save_portfolio_workbook_validated", {
        portfolioName,
        fileData,
        fileName: file.name,
        reportDate,
      });

      // Don't show duplicate error toast - backend already sends notification
      // Only show error if there's no validation_errors (meaning backend didn't send notification)
      if (
        !response.success &&
        (!response.validation_errors || response.validation_errors.length === 0)
      ) {
        toast.error(`Upload failed: ${file.name}`, response.message);
      }

      return response;
    } catch (error) {
      console.error("Error saving validated portfolio workbook:", error);
      toast.error("Upload failed", String(error));
      throw error;
    }
  }

  /**
   * Find all deals from pivot tables that don't have matching merchants in the database
   * @returns Array of unmatched deals with portfolio, funder, and deal details
   */
  static async findUnmatchedDeals(): Promise<UnmatchedDeal[]> {
    try {
      return await invoke<UnmatchedDeal[]>("find_unmatched_deals");
    } catch (error) {
      console.error("Error finding unmatched deals:", error);
      throw error;
    }
  }

  /**
   * Find unmatched deals for a specific portfolio
   * @param portfolioName - Name of the portfolio (e.g., "Alder" or "White Rabbit")
   * @returns Array of unmatched deals for the specified portfolio
   */
  static async findUnmatchedDealsByPortfolio(portfolioName: string): Promise<UnmatchedDeal[]> {
    try {
      return await invoke<UnmatchedDeal[]>("find_unmatched_deals_by_portfolio", {
        portfolioName,
      });
    } catch (error) {
      console.error("Error finding unmatched deals by portfolio:", error);
      throw error;
    }
  }

  /**
   * Find unmatched deals for a specific report date
   * @param reportDate - Report date in MM/DD/YYYY format
   * @returns Array of unmatched deals for the specified date
   */
  static async findUnmatchedDealsByDate(reportDate: string): Promise<UnmatchedDeal[]> {
    try {
      return await invoke<UnmatchedDeal[]>("find_unmatched_deals_by_date", {
        reportDate,
      });
    } catch (error) {
      console.error("Error finding unmatched deals by date:", error);
      throw error;
    }
  }
}

export default FileService;
