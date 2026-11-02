export const stamp = (x: unknown) =>
  typeof x === "string" &&
  Number.isFinite(Date.parse(x)) &&
  Date.parse(x) <= Date.now() + 300000 &&
  Date.now() - Date.parse(x) < 60 * 86400000;
