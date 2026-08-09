import React from "react";
import ReactDOM from "react-dom/client";
import { BrowserRouter, Routes, Route } from "react-router-dom";
import App from "./App.jsx";
import Dashboard from "./components/Dashboard.jsx";
import Analytics from "./components/Analytics.jsx";
import KnowledgeHealth from "./components/KnowledgeHealth.jsx";
import "./index.css";

ReactDOM.createRoot(document.getElementById("root")).render(
  <React.StrictMode>
    <BrowserRouter>
      <Routes>
        <Route path="/" element={<App />} />
        <Route path="/dashboard" element={<Dashboard />} />
        <Route path="/analytics" element={<Analytics />} />
        <Route path="/knowledge-health" element={<KnowledgeHealth />} />
      </Routes>
    </BrowserRouter>
  </React.StrictMode>
);