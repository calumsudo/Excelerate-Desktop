import { invoke } from '@tauri-apps/api/core';

export interface UploadResponse {
  success: boolean;
  message: string;
  file_path?: string;
  version_id?: string;
  backup_path?: string;
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
  original_filename: string;
  upload_timestamp: string;
  file_size: number;
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
      
      const response = await invoke<UploadResponse>('save_portfolio_workbook_with_version', {
        portfolioName,
        fileData,
        fileName: file.name,
        reportDate,
      });
      
      return response;
    } catch (error) {
      console.error('Error saving workbook with version:', error);
      throw error;
    }
  }
  
  static async getPortfolioVersions(portfolioName: string): Promise<VersionInfo[]> {
    try {
      return await invoke<VersionInfo[]>('get_portfolio_versions', {
        portfolioName,
      });
    } catch (error) {
      console.error('Error getting portfolio versions:', error);
      return [];
    }
  }
  
  static async getVersionsByDate(reportDate: string): Promise<VersionInfo[]> {
    try {
      return await invoke<VersionInfo[]>('get_versions_by_date', {
        reportDate,
      });
    } catch (error) {
      console.error('Error getting versions by date:', error);
      return [];
    }
  }
  
  static async restoreVersion(versionId: string): Promise<UploadResponse> {
    try {
      return await invoke<UploadResponse>('restore_version', {
        versionId,
      });
    } catch (error) {
      console.error('Error restoring version:', error);
      throw error;
    }
  }
  
  static async getActiveVersion(portfolioName: string): Promise<VersionInfo | null> {
    try {
      return await invoke<VersionInfo | null>('get_active_version', {
        portfolioName,
      });
    } catch (error) {
      console.error('Error getting active version:', error);
      return null;
    }
  }
  
  static async checkVersionExists(portfolioName: string, reportDate: string): Promise<boolean> {
    try {
      return await invoke<boolean>('check_version_exists', {
        portfolioName,
        reportDate,
      });
    } catch (error) {
      console.error('Error checking version existence:', error);
      return false;
    }
  }
  
  static async deleteVersion(versionId: string): Promise<boolean> {
    try {
      return await invoke<boolean>('delete_version', {
        versionId,
      });
    } catch (error) {
      console.error('Error deleting version:', error);
      return false;
    }
  }
  
  static async getPortfolioWorkbookPath(portfolioName: string): Promise<string> {
    try {
      return await invoke<string>('get_portfolio_workbook_path', {
        portfolioName,
      });
    } catch (error) {
      console.error('Error getting workbook path:', error);
      throw error;
    }
  }
  
  static async checkWorkbookExists(portfolioName: string): Promise<boolean> {
    try {
      return await invoke<boolean>('check_workbook_exists', {
        portfolioName,
      });
    } catch (error) {
      console.error('Error checking workbook existence:', error);
      return false;
    }
  }
  
  static async saveFunderUpload(
    portfolioName: string,
    funderName: string,
    file: File,
    reportDate: string,
    uploadType: 'daily' | 'weekly' | 'monthly'
  ): Promise<UploadResponse> {
    try {
      const arrayBuffer = await file.arrayBuffer();
      const fileData = Array.from(new Uint8Array(arrayBuffer));
      
      const response = await invoke<UploadResponse>('save_funder_upload', {
        portfolioName,
        funderName,
        fileData,
        fileName: file.name,
        reportDate,
        uploadType,
      });
      
      return response;
    } catch (error) {
      console.error('Error saving funder upload:', error);
      throw error;
    }
  }
  
  static async getFunderUploadInfo(
    portfolioName: string,
    funderName: string,
    reportDate: string,
    uploadType: 'daily' | 'weekly' | 'monthly'
  ): Promise<FunderUploadInfo | null> {
    try {
      return await invoke<FunderUploadInfo | null>('get_funder_upload_info', {
        portfolioName,
        funderName,
        reportDate,
        uploadType,
      });
    } catch (error) {
      console.error('Error getting funder upload info:', error);
      return null;
    }
  }
  
  static async getFunderUploadsForDate(
    portfolioName: string,
    reportDate: string
  ): Promise<FunderUploadInfo[]> {
    try {
      return await invoke<FunderUploadInfo[]>('get_funder_uploads_for_date', {
        portfolioName,
        reportDate,
      });
    } catch (error) {
      console.error('Error getting funder uploads for date:', error);
      return [];
    }
  }
  
  static async checkFunderUploadExists(
    portfolioName: string,
    funderName: string,
    reportDate: string,
    uploadType: 'daily' | 'weekly' | 'monthly'
  ): Promise<boolean> {
    try {
      return await invoke<boolean>('check_funder_upload_exists', {
        portfolioName,
        funderName,
        reportDate,
        uploadType,
      });
    } catch (error) {
      console.error('Error checking funder upload existence:', error);
      return false;
    }
  }
}

export default FileService;