import ReactDOM from "react-dom/client";
import { BrowserRouter } from "react-router-dom";
import { HeroUIProvider } from "@heroui/react";
import { AuthProvider } from "@/contexts/auth-context";
import App from "./app";
import "./index.css";

// Prevent default drag and drop behavior at the document level
// This ensures file drops only work in designated drop zones
document.addEventListener(
  "dragover",
  (e) => {
    e.preventDefault();
    e.stopPropagation();
  },
  false
);

document.addEventListener(
  "drop",
  (e) => {
    e.preventDefault();
    e.stopPropagation();
  },
  false
);

ReactDOM.createRoot(document.getElementById("root") as HTMLElement).render(
  <BrowserRouter>
    <HeroUIProvider>
      <AuthProvider>
        <main className="dark text-foreground bg-background">
          <App />
        </main>
      </AuthProvider>
    </HeroUIProvider>
  </BrowserRouter>
);
