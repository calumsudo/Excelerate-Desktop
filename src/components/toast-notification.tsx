import { motion } from "framer-motion";
import { Card, CardBody, Button } from "@heroui/react";
import { Icon } from "@iconify/react";
import { Toast } from "@/contexts/toast-context";

interface ToastNotificationProps extends Toast {
  onClose: () => void;
}

const icons = {
  success: "heroicons:check-circle-20-solid",
  error: "heroicons:x-circle-20-solid",
  warning: "heroicons:exclamation-triangle-20-solid",
  info: "heroicons:information-circle-20-solid",
};

const colors = {
  success: "bg-success-50 border-success-200 text-success-900",
  error: "bg-danger-50 border-danger-200 text-danger-900",
  warning: "bg-warning-50 border-warning-200 text-warning-900",
  info: "bg-primary-50 border-primary-200 text-primary-900",
};

const iconColors = {
  success: "text-success-500",
  error: "text-danger-500",
  warning: "text-warning-500",
  info: "text-primary-500",
};

export default function ToastNotification({
  title,
  description,
  type,
  onClose,
}: ToastNotificationProps) {
  const iconName = icons[type];

  return (
    <motion.div
      initial={{ opacity: 0, y: -20, scale: 0.95 }}
      animate={{ opacity: 1, y: 0, scale: 1 }}
      exit={{ opacity: 0, x: 100, scale: 0.95 }}
      transition={{ duration: 0.2, ease: "easeOut" }}
      className="pointer-events-auto"
    >
      <Card
        className={`min-w-[320px] max-w-[400px] border-1 ${colors[type]} shadow-lg`}
        isBlurred
      >
        <CardBody className="p-4">
          <div className="flex items-start gap-3">
            <Icon icon={iconName} className={`w-5 h-5 mt-0.5 flex-shrink-0 ${iconColors[type]}`} />
            <div className="flex-1 min-w-0">
              <p className="font-semibold text-sm">{title}</p>
              {description && (
                <p className="text-xs mt-1 opacity-90">{description}</p>
              )}
            </div>
            <Button
              isIconOnly
              size="sm"
              variant="light"
              onPress={onClose}
              className="min-w-unit-6 w-unit-6 h-unit-6 -mr-1 -mt-1"
            >
              <Icon icon="heroicons:x-mark-20-solid" className="w-4 h-4" />
            </Button>
          </div>
        </CardBody>
      </Card>
    </motion.div>
  );
}