import { useState } from "react";
import { PortfolioSelector } from "./components/PortfolioSelector";
import { FileUpload } from "./components/FileUpload";


function App() {
  const [selectedPortfolio, setSelectedPortfolio] = useState<string>("");

  return (
    <div className="min-h-screen bg-gray-50 p-6">
    <header className="mb-6">
      <h1 className="text-2xl font-bold">Excelerate Desktop</h1>
    </header>
    
    <div className="grid grid-cols-1 md:grid-cols-12 gap-6">
      <div className="md:col-span-3">
        <PortfolioSelector onPortfolioSelect={setSelectedPortfolio} />
      </div>
      
      <div className="md:col-span-9">
        {selectedPortfolio && (
          <FileUpload 
            portfolioId={selectedPortfolio}
            onUploadSuccess={(result) => {
              console.log("Upload success:", result);
            }}
            onUploadError={(error) => {
              console.error("Upload error:", error);
              // Add toast notification here
            }}
          />
        )}
      </div>
    </div>
  </div>
  );
}

export default App;
