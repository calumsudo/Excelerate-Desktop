import React from 'react';
import { FileViewerProps } from './types';
import { CSVViewer } from './csv-viewer';
import { ExcelViewer } from './excel-viewer';

export const FileViewer: React.FC<FileViewerProps> = ({ 
  type, 
  data, 
  metadata, 
  className 
}) => {
  switch (type) {
    case 'csv':
      return (
        <CSVViewer 
          data={data} 
          metadata={metadata} 
          className={className} 
        />
      );
    
    case 'excel':
      return (
        <ExcelViewer 
          data={data} 
          metadata={metadata} 
          className={className} 
        />
      );
    
    case 'pdf':
      return (
        <div className={`p-4 ${className}`}>
          <p className="text-default-500">PDF viewer coming soon...</p>
        </div>
      );
    
    case 'json':
      return (
        <div className={`p-4 ${className}`}>
          <p className="text-default-500">JSON viewer coming soon...</p>
        </div>
      );
    
    default:
      return (
        <div className={`p-4 ${className}`}>
          <p className="text-danger">Unsupported file type: {type}</p>
        </div>
      );
  }
};