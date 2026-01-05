import { InviteUser } from '@components/auth/invite-user';
import { useAuth } from '@/contexts/auth-context';
import { Card, CardBody, CardHeader, Select, SelectItem, Checkbox, Button } from "@heroui/react";
import { useTheme } from "@/contexts/theme-context";
import { Icon } from "@iconify/react";
import { useState } from "react";

function Settings() {
  const { profile } = useAuth();
  const { theme, toggleTheme } = useTheme();
  const [exportFormat, setExportFormat] = useState("csv");
  const [autoSave, setAutoSave] = useState(false);

  const exportFormats = [
    { value: "csv", label: "CSV" },
    { value: "excel", label: "Excel" },
    { value: "json", label: "JSON" }
  ];

  return (
    <div className="p-6">
      <h1 className="text-3xl font-bold mb-6">Settings</h1>
      <div className="space-y-6 max-w-2xl">
        {/* User Management - Only visible to admins */}
        {profile?.role === 'admin' && (
          <Card>
            <CardHeader className="pb-3">
              <h2 className="text-xl font-semibold">User Management</h2>
            </CardHeader>
            <CardBody>
              <InviteUser />
            </CardBody>
          </Card>
        )}

        <Card>
          <CardHeader className="pb-3">
            <h2 className="text-xl font-semibold">General Settings</h2>
          </CardHeader>
          <CardBody className="gap-4">
            <div>
              <p className="text-sm font-medium mb-3">Theme</p>
              <div className="flex items-center gap-3">
                <Button
                  variant={theme === "dark" ? "flat" : "bordered"}
                  startContent={<Icon icon="heroicons:moon" width={20} />}
                  onPress={() => theme === "light" && toggleTheme()}
                  className="font-medium"
                >
                  Dark
                </Button>
                <Button
                  variant={theme === "light" ? "flat" : "bordered"}
                  startContent={<Icon icon="heroicons:sun" width={20} />}
                  onPress={() => theme === "dark" && toggleTheme()}
                  className="font-medium"
                >
                  Light
                </Button>
              </div>
            </div>
          </CardBody>
        </Card>

        <Card>
          <CardHeader className="pb-3">
            <h2 className="text-xl font-semibold">Data Management</h2>
          </CardHeader>
          <CardBody className="gap-4">
            <Select
              label="Default Export Format"
              selectedKeys={[exportFormat]}
              onSelectionChange={(keys) => setExportFormat(Array.from(keys)[0] as string)}
              className="max-w-xs"
            >
              {exportFormats.map((format) => (
                <SelectItem key={format.value}>
                  {format.label}
                </SelectItem>
              ))}
            </Select>
            <Checkbox
              isSelected={autoSave}
              onValueChange={setAutoSave}
              className="max-w-full"
            >
              <span className="text-sm">Auto-save processed files</span>
            </Checkbox>
          </CardBody>
        </Card>

        <Card>
          <CardHeader className="pb-3">
            <h2 className="text-xl font-semibold">About</h2>
          </CardHeader>
          <CardBody>
            <div className="space-y-2 text-sm text-default-600">
              <p>Version: 0.1.0</p>
              <p>Excelerate</p>
            </div>
          </CardBody>
        </Card>
      </div>
    </div>
  );
}

export default Settings;
