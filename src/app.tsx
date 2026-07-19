import { Routes, Route, Navigate } from "react-router-dom";
import { useEffect } from "react";
import Layout from "./layout";
import Dashboard from "@pages/dashboard";
import AlderPortfolio from "@pages/alder-portfolio";
import WhiteRabbitPortfolio from "@pages/white-rabbit-portfolio";
import DealLookup from "@pages/deal-lookup";
import PivotTables from "@pages/pivot-tables";
import DatabasePage from "@pages/database";
import AiChat from "@pages/ai-chat";
import Settings from "@pages/settings";
import Users from "@pages/users";
import Login from "@pages/login";
import { ProtectedRoute } from "@components/auth/protected-route";
import { useAuth } from "@/contexts/auth-context-value";
import { backendNotifications } from "@services/notification-service";
import ErrorBoundary from "@components/error-boundary";

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
    <ErrorBoundary title="The app ran into a problem">
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
          <Route path="deal-lookup" element={<DealLookup />} />
          <Route path="pivot-tables" element={<PivotTables />} />
          <Route path="database" element={<DatabasePage />} />
          <Route path="ai-chat" element={<AiChat />} />
          <Route path="users" element={<Users />} />
          <Route path="settings" element={<Settings />} />
        </Route>
      </Routes>
    </ErrorBoundary>
  );
}

export default App;
