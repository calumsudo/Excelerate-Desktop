import { useState, useCallback } from "react";

export interface FileErrorState {
  hasError: boolean;
  message?: string;
}

export function useFileErrorState() {
  const [workbookError, setWorkbookError] = useState<FileErrorState | undefined>();
  const [weeklyErrorStates, setWeeklyErrorStates] = useState<Record<string, FileErrorState>>({});
  const [monthlyErrorStates, setMonthlyErrorStates] = useState<Record<string, FileErrorState>>({});
  const [dailyErrorStates, setDailyErrorStates] = useState<Record<string, FileErrorState>>({});

  const setWorkbookErrorState = useCallback((hasError: boolean, message?: string) => {
    // Simplify the message for display in the UI component
    const simplifiedMessage = message && message.length > 50 
      ? "Invalid file format" 
      : message;
    setWorkbookError({ hasError, message: simplifiedMessage });
    if (!hasError) {
      // Clear error after a moment when it's resolved
      setTimeout(() => setWorkbookError(undefined), 100);
    }
  }, []);

  const setFunderErrorState = useCallback(
    (type: "weekly" | "monthly" | "daily", funderName: string, hasError: boolean, message?: string) => {
      const setter = type === "weekly" 
        ? setWeeklyErrorStates 
        : type === "monthly" 
        ? setMonthlyErrorStates 
        : setDailyErrorStates;

      // Simplify the message for display in the UI component
      const simplifiedMessage = message && message.length > 50 
        ? "Invalid file format" 
        : message;

      setter((prev) => ({
        ...prev,
        [funderName]: { hasError, message: simplifiedMessage },
      }));

      if (!hasError) {
        // Clear error after a moment when it's resolved
        setTimeout(() => {
          setter((prev) => {
            const updated = { ...prev };
            delete updated[funderName];
            return updated;
          });
        }, 100);
      }
    },
    []
  );

  const clearAllErrors = useCallback(() => {
    setWorkbookError(undefined);
    setWeeklyErrorStates({});
    setMonthlyErrorStates({});
    setDailyErrorStates({});
  }, []);

  return {
    workbookError,
    weeklyErrorStates,
    monthlyErrorStates,
    dailyErrorStates,
    setWorkbookErrorState,
    setFunderErrorState,
    clearAllErrors,
  };
}