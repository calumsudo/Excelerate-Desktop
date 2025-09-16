import { invoke } from '@tauri-apps/api/core';

export interface UploadResponse {
  success: boolean;
  message: string;
  file_path?: string;
}

export class FileService {
  static async savePortfolioWorkbook(
    portfolioName: string,
    file: File
  ): Promise<UploadResponse> {
    try {
      const arrayBuffer = await file.arrayBuffer();
      const fileData = Array.from(new Uint8Array(arrayBuffer));
      
      const response = await invoke<UploadResponse>('save_portfolio_workbook', {
        portfolioName,
        fileData,
        fileName: file.name,
      });
      
      return response;
    } catch (error) {
      console.error('Error saving workbook:', error);
      throw error;
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
  
  static async getExistingWorkbookInfo(portfolioName: string): Promise<{
    fileName: string;
    filePath: string;
    fileSize: number;
  } | null> {
    try {
      const [fileName, filePath, fileSize] = await invoke<[string, string, number]>(
        'get_existing_workbook_info',
        { portfolioName }
      );
      return { fileName, filePath, fileSize };
    } catch (error) {
      console.error('Error getting workbook info:', error);
      return null;
    }
  }
}

export default FileService;