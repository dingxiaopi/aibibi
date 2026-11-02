import { mkdirSync, writeFileSync } from "node:fs";
import { fromRoot, loadSiteConfig } from "./lib/instance.mjs";

mkdirSync(fromRoot("cloudflare/.local"), { recursive: true });
writeFileSync(fromRoot("cloudflare/.local/site.json"), JSON.stringify(loadSiteConfig(), null, 2) + "\n");
