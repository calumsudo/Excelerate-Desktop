import React from 'react';
import { DateValue } from '@internationalized/date';
import BasePortfolio from '@components/portfolio/base-portfolio';

function WhiteRabbitPortfolio() {
  const handleDateChange = (date: DateValue | null) => {
    console.log('White Rabbit Portfolio - Date selected:', date?.toString());
    // Add your date handling logic here
  };

  const handleFileUpload = (file: File) => {
    console.log('White Rabbit Portfolio - File uploaded:', file.name);
    // Add your file processing logic here
    // You might want to read the Excel file, parse it, etc.
  };

  return (
    <BasePortfolio
      portfolioName="White Rabbit"
      onDateChange={handleDateChange}
      onFileUpload={handleFileUpload}
    />
  );
}

export default WhiteRabbitPortfolio;