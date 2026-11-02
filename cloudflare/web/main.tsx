import * as ReactDOM from "react-dom/client";
import "./styles.css";
import { App } from "./app";
import { seedQueries } from "./lib/query-cache";
const initial = document.getElementById("initial-data");
if (initial?.textContent) {
  try {
    seedQueries(JSON.parse(initial.textContent));
  } catch {
    /* Fetch normally on malformed bootstrap. */
  }
  initial.remove();
}
// A deploy removes the previous build's chunks; an open tab then reloads once
// to pick up the new index.html instead of failing the lazy page.
addEventListener("vite:preloadError", (event) => {
  try {
    const last = Number(sessionStorage.getItem("bijia-chunk-reload"));
    if (Date.now() - last < 10_000) return;
    sessionStorage.setItem("bijia-chunk-reload", String(Date.now()));
  } catch {
    return;
  }
  event.preventDefault();
  location.reload();
});
ReactDOM.createRoot(document.getElementById("root")!).render(<App />);
