// src/components/FileUpload.tsx
import { useState, useEffect } from 'react';
import { Card, CardBody, CardHeader, Button, Chip, Divider, Dropdown, DropdownItem, DropdownMenu, DropdownTrigger } from "@heroui/react";
import { Icon } from "@iconify/react";


interface FileUploadProps {
  portfolioId: string;
  onUploadSuccess?: (result: any) => void;
  onUploadError?: (error: string) => void;
}

export function FileUpload({ portfolioId, onUploadSuccess, onUploadError }: FileUploadProps) {
  const [isUploading, setIsUploading] = useState(false);
  const [selectedFunder, setSelectedFunder] = useState<string | null>(null);
  const [funders, setFunders] = useState<Array<{id: string, name: string, supports_multi_file: boolean}>>([]);
  const [processingResults, setProcessingResults] = useState<Array<any>>([]);
  
  // Fetch funders when portfolio changes
  useEffect(() => {
    const fetchFunders = async () => {
      try {
        const response = await fetch(`http://localhost:8000/api/file-processing/funders/${portfolioId}`);
        if (!response.ok) {
          throw new Error('Failed to fetch funders');
        }
        const data = await response.json();
        setFunders(data);
      } catch (error) {
        console.error('Error fetching funders:', error);
      }
    };
    
    fetchFunders();
  }, [portfolioId]);
  
  const handleFileSelect = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const files = event.target.files;
    if (!files || files.length === 0) return;
    
    try {
      setIsUploading(true);
      
      const formData = new FormData();
      formData.append('file', files[0]);
      formData.append('portfolio_id', portfolioId);
      
      if (selectedFunder) {
        formData.append('manual_funder', selectedFunder);
      }
      
      const response = await fetch('http://localhost:8000/api/file-processing/upload', {
        method: 'POST',
        body: formData,
      });
      
      const result = await response.json();
      
      if (result.success) {
        setProcessingResults([...processingResults, result]);
        if (onUploadSuccess) onUploadSuccess(result);
      } else {
        if (onUploadError) onUploadError(result.error || 'Unknown error');
      }
    } catch (error) {
      console.error('Upload error:', error);
      if (onUploadError) onUploadError('Failed to upload file. Please try again.');
    } finally {
      setIsUploading(false);
    }
  };
  
  return (
    <Card className="w-full">
      <CardHeader className="flex justify-between">
        <h3 className="text-lg font-semibold">File Upload</h3>
        <Dropdown>
          <DropdownTrigger>
            <Button 
              variant="flat" 
              endContent={<Icon icon="heroicons-solid:chevron-down" className='w-4 h-4'/>}
            >
              {selectedFunder ? selectedFunder : "Auto Detect"}
            </Button>
          </DropdownTrigger>
          <DropdownMenu aria-label="Funder Selection">
            <DropdownItem key="auto" onClick={() => setSelectedFunder(null)}>
              Auto Detect
            </DropdownItem>
            <Divider />
            {/* Solution 1: Cast the array to any */}
            {(funders as any).map((funder: {id: string, name: string}) => (
              <DropdownItem 
                key={funder.id} 
                onPress={() => setSelectedFunder(funder.id)}
              >
                {funder.name}
              </DropdownItem>
            ))}
          </DropdownMenu>
        </Dropdown>
      </CardHeader>
      
      <CardBody>
        <div className="flex flex-col gap-4">
          <div className="flex justify-center">
            <Button
              color="primary"
              startContent={<Icon icon="line-md:uploading" width="24" height="24" />}
              isLoading={isUploading}
              as="label"
              htmlFor="file-upload"
              className="cursor-pointer"
            >
              {isUploading ? "Uploading..." : "Select File"}
            </Button>
            <input
              id="file-upload"
              type="file"
              className="hidden"
              accept=".csv,.xlsx,.xls"
              onChange={handleFileSelect}
              disabled={isUploading}
            />
          </div>
          
          {processingResults.length > 0 && (
            <div className="mt-4">
              <h4 className="text-md font-medium mb-2">Processing Results</h4>
              <div className="space-y-2">
                {processingResults.map((result, index) => (
                  <div key={index} className="p-2 border rounded-md">
                    <div className="flex items-center gap-2 mb-1">
                    <Icon icon="mingcute:file-line" width="24" height="24" />
                      <Chip color="success" size="sm">{result.funder}</Chip>
                    </div>
                    <div className="text-sm">
                      <p>Gross: ${result.totals.gross.toLocaleString()}</p>
                      <p>Net: ${result.totals.net.toLocaleString()}</p>
                      <p>Fee: ${result.totals.fee.toLocaleString()}</p>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      </CardBody>
    </Card>
  );
}