import React, { useState, useMemo } from 'react';
import { DatePicker } from '@heroui/react';
import { 
  CalendarDate, 
  getLocalTimeZone, 
  today, 
  DateValue
} from '@internationalized/date';

interface FridayDatePickerProps {
  onDateChange?: (date: DateValue | null) => void;
  label?: string;
  description?: string;
}

const FridayDatePicker: React.FC<FridayDatePickerProps> = ({
  onDateChange,
  label = "Select Friday",
  description = "Choose a Friday date"
}) => {
  // Function to get the most recent Friday
  const getMostRecentFriday = (): CalendarDate => {
    const todayDate = today(getLocalTimeZone());
    const currentDay = todayDate.toDate(getLocalTimeZone()).getDay();
    
    let daysToSubtract = 0;
    if (currentDay === 5) {
      daysToSubtract = 0; // Today is Friday
    } else if (currentDay > 5) {
      daysToSubtract = currentDay - 5; // Saturday (6) -> subtract 1
    } else {
      daysToSubtract = currentDay + 2; // Thursday (4) -> subtract 6, etc.
    }
    
    return todayDate.subtract({ days: daysToSubtract });
  };

  // Initialize with most recent Friday
  const [selectedDate, setSelectedDate] = useState<DateValue | null>(getMostRecentFriday());

  // Function to check if a date is Friday
  const isFriday = (date: DateValue): boolean => {
    const jsDate = date.toDate(getLocalTimeZone());
    return jsDate.getDay() === 5;
  };

  // Date validation function for the DatePicker
  const isDateUnavailable = (date: DateValue): boolean => {
    // Make all non-Friday dates unavailable
    return !isFriday(date);
  };

  // Handle date change
  const handleDateChange = (date: DateValue | null) => {
    if (date && isFriday(date)) {
      setSelectedDate(date);
      onDateChange?.(date);
    }
  };

  // Get the minimum date (e.g., 1 year ago from today)
  const minDate = useMemo((): DateValue => {
    return today(getLocalTimeZone()).subtract({ years: 1 });
  }, []);

  // Get the maximum date (current date)
  const maxDate = useMemo((): DateValue => {
    return today(getLocalTimeZone());
  }, []);

  return (
    <div className="w-full max-w-xl">
      <DatePicker
        label={label}
        description={description}
        value={selectedDate}
        onChange={handleDateChange}
        isDateUnavailable={isDateUnavailable}
        minValue={minDate}
        maxValue={maxDate}
        showMonthAndYearPickers
        classNames={{
          base: "max-w-xs",
          inputWrapper: "rounded-lg",
          calendar: "bg-background",
          calendarContent: "bg-background",
        }}
        calendarProps={{
          classNames: {
            cellButton: [
              "data-[unavailable=true]:text-default-300",
              "data-[unavailable=true]:line-through",
              "data-[selected=true]:bg-primary",
              "data-[selected=true]:text-primary-foreground",
            ],
          },
        }}
        errorMessage={selectedDate && !isFriday(selectedDate) ? "Please select a Friday" : undefined}
      />
      
      {/* Display selected date information */}
      {selectedDate && (
        <div className="mt-4 text-sm text-default-500">
          <p>Selected: {selectedDate.toDate(getLocalTimeZone()).toLocaleDateString('en-US', { 
            weekday: 'long', 
            year: 'numeric', 
            month: 'long', 
            day: 'numeric' 
          })}</p>
        </div>
      )}
    </div>
  );
};

export default FridayDatePicker;