import { Toast } from "@/contexts/toast-context";

type ShowToastFn = (toast: Omit<Toast, "id">) => void;

class ToastService {
  private showToast: ShowToastFn | null = null;

  setToastFunction(fn: ShowToastFn) {
    this.showToast = fn;
  }

  success(title: string, description?: string) {
    this.showToast?.({
      title,
      description,
      type: "success",
    });
  }

  error(title: string, description?: string) {
    this.showToast?.({
      title,
      description,
      type: "error",
    });
  }

  warning(title: string, description?: string) {
    this.showToast?.({
      title,
      description,
      type: "warning",
    });
  }

  info(title: string, description?: string) {
    this.showToast?.({
      title,
      description,
      type: "info",
    });
  }

  promise<T>(
    promise: Promise<T>,
    messages: {
      loading?: string;
      success?: string | ((data: T) => string);
      error?: string | ((error: any) => string);
    }
  ): Promise<T> {
    if (messages.loading) {
      this.info(messages.loading);
    }

    return promise
      .then((data) => {
        if (messages.success) {
          const successMsg = typeof messages.success === "function" 
            ? messages.success(data) 
            : messages.success;
          this.success(successMsg);
        }
        return data;
      })
      .catch((error) => {
        if (messages.error) {
          const errorMsg = typeof messages.error === "function" 
            ? messages.error(error) 
            : messages.error;
          this.error(errorMsg);
        }
        throw error;
      });
  }
}

export const toast = new ToastService();