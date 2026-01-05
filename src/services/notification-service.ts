import { listen } from "@tauri-apps/api/event";
import { toast } from "./toast-service";

export type NotificationType = "success" | "error" | "warning" | "info";

export interface NotificationPayload {
  notification_type: NotificationType;
  title: string;
  description?: string;
  duration?: number;
}

export class BackendNotificationService {
  private static instance: BackendNotificationService;
  private unlistenFn: (() => void) | null = null;

  private constructor() {}

  static getInstance(): BackendNotificationService {
    if (!BackendNotificationService.instance) {
      BackendNotificationService.instance = new BackendNotificationService();
    }
    return BackendNotificationService.instance;
  }

  async initialize() {
    // Set up listener for backend notifications
    this.unlistenFn = await listen<NotificationPayload>("backend-notification", (event) => {
      this.handleNotification(event.payload);
    });
  }

  private handleNotification(payload: NotificationPayload) {
    const { notification_type, title, description } = payload;

    switch (notification_type) {
      case "success":
        toast.success(title, description);
        break;
      case "error":
        toast.error(title, description);
        break;
      case "warning":
        toast.warning(title, description);
        break;
      case "info":
        toast.info(title, description);
        break;
      default:
        toast.info(title, description);
    }
  }

  destroy() {
    if (this.unlistenFn) {
      this.unlistenFn();
      this.unlistenFn = null;
    }
  }
}

// Export a singleton instance
export const backendNotifications = BackendNotificationService.getInstance();