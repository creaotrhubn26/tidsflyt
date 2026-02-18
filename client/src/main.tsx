import { createRoot } from "react-dom/client";
import App from "./App";
import "./index.css";

// Remove the SEO-only H1 once React takes over (prevents duplicate H1 with page-level H1)
document.getElementById("seo-h1")?.remove();

createRoot(document.getElementById("root")!).render(<App />);
