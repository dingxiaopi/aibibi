import test from "node:test";
import assert from "node:assert/strict";
import { normalizePath, readRoute, routePath, navigate } from "../web/lib/navigation";
test("legacy hash links become canonical paths; navigation preserves queries and dispatches history updates", () => {
  const names = [
    "location",
    "history",
    "dispatchEvent",
    "PopStateEvent",
  ] as const;
  const original = names.map((name) =>
    Object.getOwnPropertyDescriptor(globalThis, name),
  );
  const location = { pathname: "/", search: "", hash: "#/shop/S1" };
  let replaced = "",
    pushed = "",
    events = 0;
  try {
    Object.defineProperties(globalThis, {
      location: { configurable: true, value: location },
      history: {
        configurable: true,
        value: {
          state: null,
          replaceState: (_s: unknown, _t: string, path: string) => {
            replaced = path;
          },
          pushState: (_s: unknown, _t: string, path: string) => {
            pushed = path;
          },
        },
      },
      dispatchEvent: {
        configurable: true,
        value: () => {
          events++;
        },
      },
      PopStateEvent: { configurable: true, value: class {} },
    });
    assert.equal(readRoute(), "/shops/S1");
    assert.equal(replaced, "/shops/S1");
    location.hash = "";
    location.pathname = "/search";
    location.search = "?q=Plus";
    assert.equal(readRoute(), "/search?q=Plus");
    navigate("/search?q=Plus");
    assert.equal(events, 0);
    navigate("/sku/plus");
    assert.equal(pushed, "/sku/plus");
    assert.equal(events, 1);
    assert.equal(normalizePath("#/admin/reviews?id=x"), "/admin/reviews?id=x");
    for (const pathname of ["/", "/shops", "/shops/S1", "/sku/plus", "/c/gpt", "/favorites", "/official"]) {
      location.pathname = pathname;
      location.search = "?utm_source=campaign&verify=release";
      assert.equal(routePath(readRoute()), pathname);
      assert.equal(readRoute(), pathname + location.search);
    }
    assert.equal(routePath("/search?q=Plus%3F"), "/search");
    assert.equal(new URLSearchParams("/search?q=Plus%3F".split("?")[1]).get("q"), "Plus?");
    assert.equal(routePath("/admin/reviews?id=x"), "/admin/reviews");
  } finally {
    names.forEach((name, index) => {
      if (original[index])
        Object.defineProperty(globalThis, name, original[index]!);
      else Reflect.deleteProperty(globalThis, name);
    });
  }
});
