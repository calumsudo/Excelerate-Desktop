import React from "react";
import { DatePicker } from "@heroui/react";
import { getLocalTimeZone, today, DateValue } from "@internationalized/date";
import { getMostRecentCompletedMonth } from "@utils/report-month";

interface MonthlyDatePickerProps {
  value: DateValue | null;
  onDateChange: (date: DateValue | null) => void;
  label?: string;
  description?: string;
  className?: string;
}

const MonthlyDatePicker: React.FC<MonthlyDatePickerProps> = ({
  value,
  onDateChange,
  label = "Select Month",
  description = "Choose a report month",
  className,
}) => {
  const isDateUnavailable = (date: DateValue): boolean => {
    // Only allow the last day of each month.
    const jsDate = date.toDate(getLocalTimeZone());
    const nextDay = new Date(jsDate);
    nextDay.setDate(jsDate.getDate() + 1);
    return nextDay.getMonth() === jsDate.getMonth();
  };

  const handleDateChange = (date: DateValue | null) => {
    if (date && !isDateUnavailable(date)) {
      onDateChange(date);
    }
  };

  const minDate: DateValue = today(getLocalTimeZone()).subtract({ years: 2 });
  // Max = last day of previous month (no future months).
  const maxDate: DateValue = getMostRecentCompletedMonth();

  return (
    <div className={`w-full ${className || ""}`}>
      <DatePicker
        label={label}
        description={description}
        value={value}
        onChange={handleDateChange}
        isDateUnavailable={isDateUnavailable}
        minValue={minDate}
        maxValue={maxDate}
        showMonthAndYearPickers
        classNames={{
          base: "w-full",
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
      />
    </div>
  );
};

export default MonthlyDatePicker;
