// src/components/PortfolioSelector.tsx
import { useEffect, useState } from 'react';
import { Card, CardBody, Radio, RadioGroup } from "@heroui/react";

interface Portfolio {
  id: string;
  name: string;
}

interface PortfolioSelectorProps {
  onPortfolioSelect: (portfolioId: string) => void;
}

export function PortfolioSelector({ onPortfolioSelect }: PortfolioSelectorProps) {
  const [portfolios, setPortfolios] = useState<Portfolio[]>([]);
  const [selectedPortfolio, setSelectedPortfolio] = useState<string>("");
  
  useEffect(() => {
    // Fetch available portfolios
    async function fetchPortfolios() {
      try {
        const response = await fetch('http://localhost:8000/api/portfolio/');
        if (!response.ok) {
          throw new Error('Failed to fetch portfolios');
        }
        const data = await response.json();
        setPortfolios(data);
        
        // Select first portfolio by default
        if (data.length > 0 && !selectedPortfolio) {
          setSelectedPortfolio(data[0].id);
          onPortfolioSelect(data[0].id);
        }
      } catch (error) {
        console.error('Error fetching portfolios:', error);
      }
    }
    
    fetchPortfolios();
  }, []);
  
  const handlePortfolioChange = (value: string) => {
    setSelectedPortfolio(value);
    onPortfolioSelect(value);
  };
  
  return (
    <Card>
      <CardBody>
        <h3 className="text-lg font-semibold mb-4">Select Portfolio</h3>
        <RadioGroup
          value={selectedPortfolio}
          onValueChange={handlePortfolioChange}
        >
          {portfolios.map((portfolio) => (
            <Radio key={portfolio.id} value={portfolio.id}>{portfolio.name}</Radio>
          ))}
        </RadioGroup>
      </CardBody>
    </Card>
  );
}