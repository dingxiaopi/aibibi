import { readFile, writeFile, mkdir } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { isDeepStrictEqual } from "node:util";

const [mode = "compare", ...args] = process.argv.slice(2);
const option = (name, fallback) => {
  const index = args.indexOf(name);
  return index < 0 ? fallback : args[index + 1];
};
const origin = new URL(option("--base", "http://127.0.0.1:8787"));
if (!["localhost", "127.0.0.1", "[::1]"].includes(origin.hostname))
  throw Error("API snapshots are restricted to local development servers");
const destination = resolve(
  option(
    "--output",
    fileURLToPath(
      new URL("../../../output/api-baseline/public.json", import.meta.url),
    ),
  ),
);
if (
  destination
    .split(/[\\/]/)
    .some((part) => [".runtime", ".generated"].includes(part))
)
  throw Error(
    "Keep snapshots outside the protected runtime/generated directories",
  );
async function request(path) {
  const response = await fetch(new URL(path, origin), {
    signal: AbortSignal.timeout(20000),
  });
  return { status: response.status, body: await response.json() };
}
function canonical(value) {
  if (Array.isArray(value)) return value.map(canonical);
  if (value && typeof value === "object")
    return Object.fromEntries(
      Object.keys(value)
        .sort()
        .map((key) => [key, canonical(value[key])]),
    );
  return value;
}
if (mode === "record") {
  const catalog = (await request("/api/products")).body;
  const stores = (await request("/api/shops")).body;
  const paths = [
    "/api/products",
    "/api/products?category=gpt",
    "/api/products?q=Plus",
    "/api/products?platform=wzyp",
    "/api/shops",
    "/api/sponsors",
    "/api/sponsors?page=home&category=all",
  ];
  for (const product of catalog.products.slice(0, 3))
    for (const query of ["", "?sort=low", "?sort=high", "?ready=1"])
      paths.push(`/api/products/${encodeURIComponent(product.id)}${query}`);
  if (catalog.products[0])
    paths.push(`/api/history/${encodeURIComponent(catalog.products[0].id)}`);
  for (const shop of stores.shops.slice(0, 3))
    paths.push(`/api/shops/${encodeURIComponent(shop.id)}`);
  const responses = {};
  for (const path of paths) responses[path] = canonical(await request(path));
  await mkdir(dirname(destination), { recursive: true });
  await writeFile(
    destination,
    JSON.stringify(
      { recordedAt: new Date().toISOString(), responses },
      null,
      2,
    ) + "\n",
  );
  console.log(`Recorded ${paths.length} local API responses: ${destination}`);
} else if (mode === "compare") {
  const baseline = JSON.parse(await readFile(destination, "utf8"));
  const differences = [];
  for (const [path, expected] of Object.entries(baseline.responses))
    if (!isDeepStrictEqual(canonical(await request(path)), expected))
      differences.push(path);
  if (differences.length) {
    console.error("API differences:", differences);
    process.exitCode = 1;
  } else
    console.log(
      `All ${Object.keys(baseline.responses).length} API responses match`,
    );
} else
  throw Error(
    "Usage: node scripts/api-snapshot.mjs record|compare [--base URL] [--output FILE]",
  );
