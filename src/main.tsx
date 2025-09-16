import React from "react";
import ReactDOM from "react-dom/client";
import { BrowserRouter } from "react-router-dom";
import { HeroUIProvider } from "@heroui/react";
import App from "./app";
import './index.css';

ReactDOM.createRoot(document.getElementById("root") as HTMLElement).render(
  <React.StrictMode>
    <BrowserRouter>
      <HeroUIProvider>
        <main className="dark text-foreground bg-background">
          <App />
        </main>
      </HeroUIProvider>
    </BrowserRouter>
  </React.StrictMode>,
);
