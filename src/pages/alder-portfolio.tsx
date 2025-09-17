import { useState, useEffect } from 'react';
import { DateValue } from '@internationalized/date';
import BasePortfolio from '@components/portfolio/base-portfolio';
import { FunderData } from '@components/portfolio/funder-upload-section';
import FileService, { VersionInfo, FunderUploadInfo } from '@services/file-service';

function AlderPortfolio() {
  const [weeklyFiles, setWeeklyFiles] = useState<Record<string, File>>({});
  const [monthlyFiles, setMonthlyFiles] = useState<Record<string, File>>({});
  const [clearViewDailyFiles, setClearViewDailyFiles] = useState<File[]>([]);
  const [existingWorkbook, setExistingWorkbook] = useState<File | null>(null);
  const [selectedDate, setSelectedDate] = useState<DateValue | null>(null);
  const [versions, setVersions] = useState<VersionInfo[]>([]);
  const [funderUploads, setFunderUploads] = useState<FunderUploadInfo[]>([]);
  const [clearViewDailyFilesList, setClearViewDailyFilesList] = useState<string[]>([]);

  useEffect(() => {
    const loadActiveVersion = async () => {
      const activeVersion = await FileService.getActiveVersion('Alder');
      if (activeVersion) {
        const file = new File([], activeVersion.original_filename, {
          type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
        });
        Object.defineProperty(file, 'size', {
          value: activeVersion.file_size,
          writable: false
        });
        setExistingWorkbook(file);
      }
    };

    const loadVersions = async () => {
      const portfolioVersions = await FileService.getPortfolioVersions('Alder');
      setVersions(portfolioVersions);
    };

    loadActiveVersion();
    loadVersions();
  }, []);
  
  // Load funder uploads when date changes
  useEffect(() => {
    const loadFunderUploads = async () => {
      if (selectedDate) {
        const reportDate = selectedDate.toString();
        const uploads = await FileService.getFunderUploadsForDate('Alder', reportDate);
        setFunderUploads(uploads);
        
        // Load Clear View daily files for the week
        const dailyFiles = await FileService.getClearViewDailyFilesForWeek('Alder', reportDate);
        setClearViewDailyFilesList(dailyFiles);
        
        // Create File objects for Clear View daily files to show in upload component
        const clearViewFiles: File[] = dailyFiles.map((filePath, index) => {
          const filename = filePath.split('/').pop() || `daily_file_${index + 1}.csv`;
          const file = new File([], filename, { type: 'text/csv' });
          // Add a custom property to indicate this is from backend
          Object.defineProperty(file, 'isFromBackend', {
            value: true,
            writable: false
          });
          return file;
        });
        setClearViewDailyFiles(clearViewFiles);
        
        // Create File objects for existing uploads to show in UI
        const weeklyFilesMap: Record<string, File> = {};
        const monthlyFilesMap: Record<string, File> = {};
        
        uploads.forEach(upload => {
          const file = new File([], upload.original_filename, {
            type: upload.original_filename.endsWith('.csv') ? 'text/csv' : 
                  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
          });
          Object.defineProperty(file, 'size', {
            value: upload.file_size,
            writable: false
          });
          
          if (upload.funder_name.includes('Monthly')) {
            monthlyFilesMap[upload.funder_name] = file;
          } else {
            weeklyFilesMap[upload.funder_name] = file;
          }
        });
        
        setWeeklyFiles(weeklyFilesMap);
        setMonthlyFiles(monthlyFilesMap);
      } else {
        setFunderUploads([]);
        setClearViewDailyFilesList([]);
        setClearViewDailyFiles([]);
        setWeeklyFiles({});
        setMonthlyFiles({});
      }
    };
    
    loadFunderUploads();
  }, [selectedDate]);

  const weeklyFunders: FunderData[] = [
    {
      name: "BHB",
      acceptedTypes: ['text/csv'],
      acceptedExtensions: ['.csv'],
      maxSizeKB: 5120
    },
    {
      name: "BIG",
      acceptedTypes: ['application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'],
      acceptedExtensions: ['.xlsx'],
      maxSizeKB: 5120
    },
    {
      name: "Clear View",
      acceptedTypes: ['text/csv'],
      acceptedExtensions: ['.csv'],
      maxSizeKB: 5120
    },
    {
      name: "eFin",
      acceptedTypes: ['text/csv'],
      acceptedExtensions: ['.csv'],
      maxSizeKB: 5120
    },
    {
      name: "InAdvance",
      acceptedTypes: ['text/csv'],
      acceptedExtensions: ['.csv'],
      maxSizeKB: 5120
    }
  ];

  const monthlyFunders: FunderData[] = [
    {
      name: "Monthly Funder Gamma",
      acceptedTypes: ['application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'],
      acceptedExtensions: ['.xlsx'],
      maxSizeKB: 15360
    }
  ];

  const handleDateChange = (date: DateValue | null) => {
    console.log('Alder Portfolio - Date selected:', date?.toString());
    setSelectedDate(date);
  };

  const handleFileUpload = async (file: File) => {
    console.log('Alder Portfolio - File uploaded:', file.name);
    
    if (!selectedDate) {
      console.error('No report date selected. Please select a Friday date first.');
      return;
    }

    const reportDate = selectedDate.toString();
    
    try {
      const versionExists = await FileService.checkVersionExists('Alder', reportDate);
      if (versionExists) {
        const confirmOverwrite = window.confirm(
          `A version already exists for ${reportDate}. Do you want to overwrite it?`
        );
        if (!confirmOverwrite) {
          return;
        }
      }
      
      const response = await FileService.savePortfolioWorkbookWithVersion(
        'Alder', 
        file, 
        reportDate
      );
      
      if (response.success) {
        console.log('Workbook saved successfully:', response.file_path);
        console.log('Version backup created:', response.backup_path);
        setExistingWorkbook(file);
        
        const updatedVersions = await FileService.getPortfolioVersions('Alder');
        setVersions(updatedVersions);
      } else {
        console.error('Failed to save workbook:', response.message);
      }
    } catch (error) {
      console.error('Error saving workbook:', error);
    }
  };
  
  const handleClearMainFile = async () => {
    console.log('Alder Portfolio - Clearing main workbook');
    setExistingWorkbook(null);
  };

  const handleWeeklyFunderUpload = async (funderName: string, file: File) => {
    console.log(`Alder Portfolio - Weekly upload for ${funderName}:`, file.name);
    
    if (!selectedDate) {
      console.error('No report date selected. Please select a Friday date first.');
      return;
    }

    const reportDate = selectedDate.toString();
    
    try {
      const exists = await FileService.checkFunderUploadExists(
        'Alder',
        funderName,
        reportDate,
        'weekly'
      );
      
      if (exists) {
        const confirmOverwrite = window.confirm(
          `A file already exists for ${funderName} on ${reportDate}. Do you want to overwrite it?`
        );
        if (!confirmOverwrite) {
          return;
        }
      }
      
      const response = await FileService.saveFunderUpload(
        'Alder',
        funderName,
        file,
        reportDate,
        'weekly'
      );
      
      if (response.success) {
        console.log(`Funder file saved: ${response.file_path}`);
        setWeeklyFiles(prev => ({ ...prev, [funderName]: file }));
        
        // Refresh funder uploads list
        const uploads = await FileService.getFunderUploadsForDate('Alder', reportDate);
        setFunderUploads(uploads);
      }
    } catch (error) {
      console.error(`Error uploading funder file for ${funderName}:`, error);
    }
  };

  const handleMonthlyFunderUpload = async (funderName: string, file: File) => {
    console.log(`Alder Portfolio - Monthly upload for ${funderName}:`, file.name);
    
    if (!selectedDate) {
      console.error('No report date selected. Please select a Friday date first.');
      return;
    }

    const reportDate = selectedDate.toString();
    
    try {
      const exists = await FileService.checkFunderUploadExists(
        'Alder',
        funderName,
        reportDate,
        'monthly'
      );
      
      if (exists) {
        const confirmOverwrite = window.confirm(
          `A file already exists for ${funderName} on ${reportDate}. Do you want to overwrite it?`
        );
        if (!confirmOverwrite) {
          return;
        }
      }
      
      const response = await FileService.saveFunderUpload(
        'Alder',
        funderName,
        file,
        reportDate,
        'monthly'
      );
      
      if (response.success) {
        console.log(`Funder file saved: ${response.file_path}`);
        setMonthlyFiles(prev => ({ ...prev, [funderName]: file }));
        
        // Refresh funder uploads list
        const uploads = await FileService.getFunderUploadsForDate('Alder', reportDate);
        setFunderUploads(uploads);
      }
    } catch (error) {
      console.error(`Error uploading funder file for ${funderName}:`, error);
    }
  };

  const handleWeeklyClearFile = (funderName: string) => {
    console.log(`Alder Portfolio - Clearing weekly file for ${funderName}`);
    setWeeklyFiles(prev => {
      const updated = { ...prev };
      delete updated[funderName];
      return updated;
    });
  };

  const handleMonthlyClearFile = (funderName: string) => {
    console.log(`Alder Portfolio - Clearing monthly file for ${funderName}`);
    setMonthlyFiles(prev => {
      const updated = { ...prev };
      delete updated[funderName];
      return updated;
    });
  };

  const handleClearViewDailyUpload = async (files: File[]) => {
    console.log(`Alder Portfolio - Clear View Daily upload, ${files.length} files`);
    
    if (!selectedDate) {
      console.error('No report date selected. Please select a Friday date first.');
      return;
    }

    const reportDate = selectedDate.toString();
    setClearViewDailyFiles(files);
    
    // Save each file
    for (let i = 0; i < files.length; i++) {
      const file = files[i];
      try {
        const funderName = `ClearView_Daily_${i + 1}`;
        
        const exists = await FileService.checkFunderUploadExists(
          'Alder',
          funderName,
          reportDate,
          'daily'
        );
        
        if (exists) {
          const confirmOverwrite = window.confirm(
            `A Clear View daily file ${i + 1} already exists for ${reportDate}. Do you want to overwrite it?`
          );
          if (!confirmOverwrite) {
            continue;
          }
        }
        
        const response = await FileService.saveFunderUpload(
          'Alder',
          funderName,
          file,
          reportDate,
          'daily'
        );
        
        if (response.success) {
          console.log(`Clear View daily file ${i + 1} saved: ${response.file_path}`);
        }
      } catch (error) {
        console.error(`Error uploading Clear View daily file ${i + 1}:`, error);
      }
    }
    
    // After all files are uploaded, process the pivot table
    if (files.length > 0) {
      try {
        console.log('Processing Clear View daily pivot table...');
        const pivotResponse = await FileService.processClearViewDailyPivot('Alder', reportDate);
        if (pivotResponse.success) {
          console.log('Clear View daily pivot table created successfully:', pivotResponse.message);
        } else {
          console.error('Failed to create Clear View daily pivot table:', pivotResponse.message);
        }
      } catch (error) {
        console.error('Error processing Clear View daily pivot:', error);
      }
    }
    
    // Refresh funder uploads list and Clear View daily files
    const uploads = await FileService.getFunderUploadsForDate('Alder', reportDate);
    setFunderUploads(uploads);
    
    const dailyFiles = await FileService.getClearViewDailyFilesForWeek('Alder', reportDate);
    setClearViewDailyFilesList(dailyFiles);
    
    // Update the Clear View daily files for the upload component
    const clearViewFiles: File[] = dailyFiles.map((filePath, index) => {
      const filename = filePath.split('/').pop() || `daily_file_${index + 1}.csv`;
      const file = new File([], filename, { type: 'text/csv' });
      Object.defineProperty(file, 'isFromBackend', {
        value: true,
        writable: false
      });
      return file;
    });
    setClearViewDailyFiles(clearViewFiles);
  };

  const handleClearViewDailyRemove = (index: number) => {
    console.log(`Alder Portfolio - Removing Clear View daily file ${index + 1}`);
    const newFiles = clearViewDailyFiles.filter((_, i) => i !== index);
    setClearViewDailyFiles(newFiles);
  };

  return (
    <>
      <BasePortfolio
        portfolioName="Alder"
        onDateChange={handleDateChange}
        onFileUpload={handleFileUpload}
        onClearMainFile={handleClearMainFile}
        weeklyFunders={weeklyFunders}
        monthlyFunders={monthlyFunders}
        onWeeklyFunderUpload={handleWeeklyFunderUpload}
        onMonthlyFunderUpload={handleMonthlyFunderUpload}
        onWeeklyClearFile={handleWeeklyClearFile}
        onMonthlyClearFile={handleMonthlyClearFile}
        weeklyUploadedFiles={weeklyFiles}
        monthlyUploadedFiles={monthlyFiles}
        existingWorkbookFile={existingWorkbook}
        showClearViewDaily={true}
        onClearViewDailyUpload={handleClearViewDailyUpload}
        onClearViewDailyRemove={handleClearViewDailyRemove}
        clearViewDailyFiles={clearViewDailyFiles}
      />
      {selectedDate && (funderUploads.length > 0 || clearViewDailyFilesList.length > 0) && (
        <div className="max-w-6xl mx-auto mt-6 p-6 bg-default-50 rounded-lg border border-default-200">
          <h3 className="text-xl font-semibold mb-4">
            Uploaded Files for {selectedDate.toString()}
          </h3>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <h4 className="font-medium text-sm text-default-600 mb-2">Weekly Funders</h4>
              <div className="space-y-2">
                {weeklyFunders.map(funder => {
                  const uploaded = funderUploads.find(
                    u => u.funder_name === funder.name && !u.funder_name.includes('Monthly')
                  );
                  return (
                    <div key={funder.name} className="flex items-center justify-between p-2 bg-default-100 rounded">
                      <span className="text-sm">{funder.name}</span>
                      {uploaded ? (
                        <span className="text-xs text-success-600 flex items-center gap-1">
                          ✓ {uploaded.original_filename}
                        </span>
                      ) : (
                        <span className="text-xs text-default-400">Not uploaded</span>
                      )}
                    </div>
                  );
                })}
              </div>
            </div>
            {monthlyFunders.length > 0 && (
              <div>
                <h4 className="font-medium text-sm text-default-600 mb-2">Monthly Funders</h4>
                <div className="space-y-2">
                  {monthlyFunders.map(funder => {
                    const uploaded = funderUploads.find(u => u.funder_name === funder.name);
                    return (
                      <div key={funder.name} className="flex items-center justify-between p-2 bg-default-100 rounded">
                        <span className="text-sm">{funder.name}</span>
                        {uploaded ? (
                          <span className="text-xs text-success-600 flex items-center gap-1">
                            ✓ {uploaded.original_filename}
                          </span>
                        ) : (
                          <span className="text-xs text-default-400">Not uploaded</span>
                        )}
                      </div>
                    );
                  })}
                </div>
              </div>
            )}
            {clearViewDailyFilesList.length > 0 && (
              <div className="md:col-span-2">
                <h4 className="font-medium text-sm text-default-600 mb-2">Clear View Daily Files</h4>
                <div className="space-y-2">
                  {clearViewDailyFilesList.map((filePath, index) => {
                    const filename = filePath.split('/').pop() || filePath;
                    return (
                      <div key={index} className="flex items-center justify-between p-2 bg-default-100 rounded">
                        <span className="text-sm">Daily File {index + 1}</span>
                        <span className="text-xs text-success-600 flex items-center gap-1">
                          ✓ {filename}
                        </span>
                      </div>
                    );
                  })}
                </div>
              </div>
            )}
          </div>
        </div>
      )}
      {versions.length > 0 && (
        <div className="max-w-6xl mx-auto mt-6 p-6 bg-default-50 rounded-lg border border-default-200">
          <h3 className="text-xl font-semibold mb-4">Version History</h3>
          <div className="space-y-2">
            {versions.slice(0, 5).map(version => (
              <div key={version.id} className="flex justify-between items-center p-3 bg-default-100 rounded">
                <div>
                  <span className="font-medium">{version.report_date}</span>
                  <span className="text-sm text-default-500 ml-2">
                    {version.original_filename}
                  </span>
                  {version.is_active && (
                    <span className="ml-2 text-xs bg-success-100 text-success-700 px-2 py-1 rounded">
                      Active
                    </span>
                  )}
                </div>
                <span className="text-sm text-default-500">
                  {new Date(version.upload_timestamp).toLocaleString()}
                </span>
              </div>
            ))}
          </div>
        </div>
      )}
    </>
  );
}

export default AlderPortfolio;