import ReactDOM from "react-dom/client";
import { BrowserRouter } from "react-router-dom";
import { HeroUIProvider } from "@heroui/react";
import { ToastProvider } from "@/contexts/toast-context";
import { ThemeProvider } from "@/contexts/theme-context";
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
    <ThemeProvider>
      <HeroUIProvider>
        <ToastProvider>
          <main className="text-foreground bg-background">
            <App />
          </main>
        </ToastProvider>
      </HeroUIProvider>
    </ThemeProvider>
  </BrowserRouter>
);
