import { useState, useCallback } from "react";

export interface FileErrorState {
  hasError: boolean;
  message?: string;
}

export function useFileErrorState() {
  const [monthlyErrorStates, setMonthlyErrorStates] = useState<Record<string, FileErrorState>>({});

  const setFunderErrorState = useCallback(
    (funderName: string, hasError: boolean, message?: string) => {
      // Simplify the message for display in the UI component
      const simplifiedMessage = message && message.length > 50 ? "Invalid file format" : message;

      setMonthlyErrorStates((prev) => ({
        ...prev,
        [funderName]: { hasError, message: simplifiedMessage },
      }));

      if (!hasError) {
        // Clear error after a moment when it's resolved
        setTimeout(() => {
          setMonthlyErrorStates((prev) => {
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
    setMonthlyErrorStates({});
  }, []);

  return {
    monthlyErrorStates,
    setFunderErrorState,
    clearAllErrors,
  };
}
