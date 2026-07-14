import React, { useState, useCallback, useEffect, useMemo } from "react";
import { AnimatePresence } from "framer-motion";
import ToastNotification from "@components/toast-notification";
import { toast } from "@services/toast-service";
import { ToastContext, type Toast } from "./toast-context-value";

export const ToastProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [toasts, setToasts] = useState<Toast[]>([]);

  const hideToast = useCallback((id: string) => {
    setToasts((prev) => prev.filter((toast) => toast.id !== id));
  }, []);

  const showToast = useCallback(
    (toast: Omit<Toast, "id">) => {
      const id = Date.now().toString();
      const newToast = { ...toast, id };

      setToasts((prev) => [...prev, newToast]);

      // Don't auto-dismiss error toasts - require manual dismissal
      if (toast.type !== "error") {
        const duration = toast.duration ?? 5000;
        if (duration > 0) {
          setTimeout(() => {
            hideToast(id);
          }, duration);
        }
      }
    },
    [hideToast]
  );

  useEffect(() => {
    toast.setToastFunction(showToast);
  }, [showToast]);

  const value = useMemo(() => ({ showToast, hideToast }), [showToast, hideToast]);

  return (
    <ToastContext.Provider value={value}>
      {children}
      <div className="fixed top-4 right-4 z-50 flex flex-col gap-2 pointer-events-none">
        <AnimatePresence>
          {toasts.map((toast) => (
            <ToastNotification key={toast.id} {...toast} onClose={() => hideToast(toast.id)} />
          ))}
        </AnimatePresence>
      </div>
    </ToastContext.Provider>
  );
};
