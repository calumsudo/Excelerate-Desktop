import { InviteUser } from '@components/auth/invite-user';
import { useAuth } from '@/contexts/auth-context';

function Settings() {
  const { profile } = useAuth();

  return (
    <div className="p-6">
      <h1 className="text-3xl font-bold mb-4">Settings</h1>
      <div className="space-y-6 max-w-2xl">
        {/* User Management - Only visible to admins */}
        {profile?.role === 'admin' && (
          <div>
            <InviteUser />
          </div>
        )}
        <div className="bg-content2 rounded-lg p-6">
          <h2 className="text-xl font-semibold mb-4">General Settings</h2>
          <div className="space-y-4">
            <div>
              <label className="block text-sm font-medium mb-2">Theme</label>
              <select className="w-full px-3 py-2 bg-content1 rounded-lg border border-divider">
                <option>Dark</option>
                <option>Light</option>
                <option>System</option>
              </select>
            </div>
            <div>
              <label className="block text-sm font-medium mb-2">Language</label>
              <select className="w-full px-3 py-2 bg-content1 rounded-lg border border-divider">
                <option>English</option>
              </select>
            </div>
          </div>
        </div>

        <div className="bg-content2 rounded-lg p-6">
          <h2 className="text-xl font-semibold mb-4">Data Management</h2>
          <div className="space-y-4">
            <div>
              <label className="block text-sm font-medium mb-2">Default Export Format</label>
              <select className="w-full px-3 py-2 bg-content1 rounded-lg border border-divider">
                <option>CSV</option>
                <option>Excel</option>
                <option>JSON</option>
              </select>
            </div>
            <div>
              <label className="flex items-center space-x-2">
                <input type="checkbox" className="rounded" />
                <span className="text-sm">Auto-save processed files</span>
              </label>
            </div>
          </div>
        </div>

        <div className="bg-content2 rounded-lg p-6">
          <h2 className="text-xl font-semibold mb-4">About</h2>
          <div className="space-y-2 text-sm">
            <p>Version: 0.1.0</p>
            <p>Built with Tauri + React</p>
          </div>
        </div>
      </div>
    </div>
  );
}

export default Settings;
