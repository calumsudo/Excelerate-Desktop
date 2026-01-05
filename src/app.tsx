import { Routes, Route, Navigate } from "react-router-dom";
import { useEffect } from "react";
import Layout from "./layout";
import Dashboard from "@pages/dashboard";
import AlderPortfolio from "@pages/alder-portfolio";
import WhiteRabbitPortfolio from "@pages/white-rabbit-portfolio";
import FileExplorer from "@pages/file-explorer";
import Settings from "@pages/settings";
import Login from "@pages/login";
import { ProtectedRoute } from "@components/auth/protected-route";
import { useAuth } from "@/contexts/auth-context";
import { backendNotifications } from "@services/notification-service";

function App() {
  const { user, loading } = useAuth();

  // Initialize backend notification listener
  useEffect(() => {
    backendNotifications.initialize();

    return () => {
      backendNotifications.destroy();
    };
  }, []);

  // Preload Pyodide on app startup for better performance
  useEffect(() => {
    // Only preload if user is authenticated
    if (!user || loading) return;

    const preloadPyodide = async () => {
      try {
        console.log("Preloading Pyodide in background...");
        // Dynamically import to avoid blocking initial render
        const { PyodideService } = await import("./services/pyodide-service");
        await PyodideService.preload();
        console.log("Pyodide preloaded and ready");
      } catch (error) {
        console.error("Failed to preload Pyodide (non-critical):", error);
      }
    };

    // Delay preload slightly to prioritize initial UI render
    const timer = setTimeout(preloadPyodide, 2000);

    return () => clearTimeout(timer);
  }, [user, loading]);

  return (
    <Routes>
      {/* Public routes */}
      <Route path="/login" element={!user ? <Login /> : <Navigate to="/dashboard" replace />} />

      {/* Protected routes */}
      <Route
        path="/"
        element={
          <ProtectedRoute>
            <Layout />
          </ProtectedRoute>
        }
      >
        <Route index element={<Navigate to="/dashboard" replace />} />
        <Route path="dashboard" element={<Dashboard />} />
        <Route path="alder-portfolio" element={<AlderPortfolio />} />
        <Route path="white-rabbit-portfolio" element={<WhiteRabbitPortfolio />} />
        <Route path="file-explorer" element={<FileExplorer />} />
        <Route path="settings" element={<Settings />} />
      </Route>
    </Routes>
  );
}

export default App;
