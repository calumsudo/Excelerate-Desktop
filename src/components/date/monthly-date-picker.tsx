import React, { useState, useMemo, useEffect } from "react";
import { DatePicker } from "@heroui/react";
import { CalendarDate, getLocalTimeZone, today, DateValue, ZonedDateTime, toZoned } from "@internationalized/date";

interface MonthlyDatePickerProps {
  onDateChange?: (date: DateValue | null) => void;
  label?: string;
  description?: string;
  className?: string;
}

const MonthlyDatePicker: React.FC<MonthlyDatePickerProps> = ({
  onDateChange,
  label = "Select Month",
  description = "Choose a report month",
  className,
}) => {
  const getMostRecentCompletedMonth = (): CalendarDate => {
    const todayDate = today(getLocalTimeZone());
    // Use previous month (most recently completed)
    const firstOfThisMonth = new CalendarDate(todayDate.year, todayDate.month, 1);
    const prevMonth = firstOfThisMonth.subtract({ months: 1 });
    // Return last day of that month
    const firstOfNextMonth = prevMonth.add({ months: 1 });
    return firstOfNextMonth.subtract({ days: 1 });
  };

  const initialDate = toZoned(getMostRecentCompletedMonth(), getLocalTimeZone());
  const [selectedDate, setSelectedDate] = useState<ZonedDateTime | null>(initialDate);

  useEffect(() => {
    if (initialDate && onDateChange) {
      onDateChange(initialDate);
    }
  }, []);

  const isDateUnavailable = (date: DateValue): boolean => {
    // Only allow last day of each month
    const jsDate = date.toDate(getLocalTimeZone());
    const nextDay = new Date(jsDate);
    nextDay.setDate(jsDate.getDate() + 1);
    return nextDay.getMonth() === jsDate.getMonth();
  };

  const handleDateChange = (date: ZonedDateTime | null) => {
    if (date && !isDateUnavailable(date)) {
      setSelectedDate(date);
      onDateChange?.(date);
    }
  };

  const minDate = useMemo((): DateValue => {
    return today(getLocalTimeZone()).subtract({ years: 2 });
  }, []);

  // Max = last day of previous month (no future months)
  const maxDate = useMemo((): DateValue => {
    return getMostRecentCompletedMonth();
  }, []);

  return (
    <div className={`w-full ${className || ""}`}>
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
