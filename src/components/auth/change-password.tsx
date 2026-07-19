import { useState } from "react";
import { Button } from "@heroui/react";
import { useAuth } from "@/contexts/auth-context-value";
import { AuthService } from "@services/auth-service";
import { PasswordInput } from "@components/ui/password-input";

// react-doctor-disable-next-line react-doctor/prefer-useReducer -- independent form fields, validation errors, and async submit status that change at different times
export function ChangePassword() {
  const { user } = useAuth();
  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setSuccess(null);

    if (!user?.email) {
      setError("No signed-in user.");
      return;
    }
    if (newPassword.length < 8) {
      setError("New password must be at least 8 characters.");
      return;
    }
    if (newPassword !== confirmPassword) {
      setError("New passwords do not match.");
      return;
    }

    setLoading(true);
    try {
      const currentValid = await AuthService.verifyPassword(user.email, currentPassword);
      if (!currentValid) {
        setError("Current password is incorrect.");
        return;
      }

      const { error: updateError } = await AuthService.updatePassword(newPassword);
      if (updateError) {
        throw updateError;
      }

      setSuccess("Password updated successfully.");
      setCurrentPassword("");
      setNewPassword("");
      setConfirmPassword("");
    } catch (err) {
      console.error("Change password error:", err);
      setError(err instanceof Error ? err.message : "Failed to update password.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <form onSubmit={handleSubmit} className="flex flex-col gap-4">
      {error && <div className="rounded-lg bg-danger-50 p-3 text-sm text-danger">{error}</div>}
      {success && (
        <div className="rounded-lg bg-success-50 p-3 text-sm text-success">{success}</div>
      )}

      <PasswordInput
        label="Current Password"
        value={currentPassword}
        onChange={(e) => setCurrentPassword(e.target.value)}
        isRequired
        variant="bordered"
      />
      <PasswordInput
        label="New Password"
        value={newPassword}
        onChange={(e) => setNewPassword(e.target.value)}
        isRequired
        variant="bordered"
        description="Minimum 8 characters"
      />
      <PasswordInput
        label="Confirm New Password"
        value={confirmPassword}
        onChange={(e) => setConfirmPassword(e.target.value)}
        isRequired
        variant="bordered"
      />

      <Button type="submit" color="primary" isLoading={loading} className="w-fit">
        {loading ? "Updating..." : "Update Password"}
      </Button>
    </form>
  );
}
