import { Routes, Route } from "react-router-dom";
import Layout from "./layout";
import Dashboard from "@pages/dashboard";
import AlderPortfolio from "@pages/alder-portfolio";
import WhiteRabbitPortfolio from "@pages/white-rabbit-portfolio";
import FileExplorer from "@pages/file-explorer";
import Settings from "@pages/settings";

function App() {
  return (
    <Routes>
      <Route path="/" element={<Layout />}>
        <Route index element={<Dashboard />} />
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
