import { Routes, Route, Navigate } from "react-router-dom";
import { useEffect } from "react";
import Layout from "./layout";
import Dashboard from "@pages/dashboard";
import AlderPortfolio from "@pages/alder-portfolio";
import WhiteRabbitPortfolio from "@pages/white-rabbit-portfolio";
import Settings from "@pages/settings";
import Login from "@pages/login";
import { ProtectedRoute } from "@components/auth/protected-route";
import { useAuth } from "@/contexts/auth-context";
import { backendNotifications } from "@services/notification-service";

function App() {
  const { user } = useAuth();

  // Initialize backend notification listener
  useEffect(() => {
    backendNotifications.initialize();

    return () => {
      backendNotifications.destroy();
    };
  }, []);

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
        <Route path="settings" element={<Settings />} />
      </Route>
    </Routes>
  );
}

export default App;
