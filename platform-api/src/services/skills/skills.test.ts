import { describe, expect, it } from "vitest";
import { PREMADE_SKILLS } from "./catalog.js";
import { productSearchQueryFromMessage } from "../orders/shopify-read.js";

describe("premade skills catalog", () => {
  it("covers the full read-only skill set", () => {
    const keys = PREMADE_SKILLS.map((s) => s.key);
    expect(keys).toEqual(
      expect.arrayContaining([
        "noise_resolve",
        "order_status",
        "delivery_status",
        "payment_status",
        "product_info",
        "product_suggestions",
      ]),
    );
    expect(keys).not.toContain("return_policy");
    expect(keys).not.toContain("shipping_info");
  });

  it("noise_resolve only covers thanks/greeting/spam", () => {
    const noise = PREMADE_SKILLS.find((s) => s.key === "noise_resolve");
    expect(noise?.intents).toEqual(["noise/thanks", "noise/greeting", "noise/spam"]);
    expect(PREMADE_SKILLS.find((s) => s.key === "escalate_human")).toBeUndefined();
  });

  it("product_info covers product + availability", () => {
    const s = PREMADE_SKILLS.find((x) => x.key === "product_info");
    expect(s?.tools).toContain("getProducts");
    expect(s?.intents).toEqual(
      expect.arrayContaining([
        "pre_purchase/product",
        "pre_purchase/availability",
      ]),
    );
  });

  it("order_status covers status + tracking", () => {
    const s = PREMADE_SKILLS.find((x) => x.key === "order_status");
    expect(s?.intents).toEqual(
      expect.arrayContaining(["order/status", "order/tracking"]),
    );
    expect(s?.tools).toContain("getTracking");
  });

  it("product_suggestions sends cards for suggestions intent", () => {
    const s = PREMADE_SKILLS.find((x) => x.key === "product_suggestions");
    expect(s?.intents).toContain("pre_purchase/suggestions");
    expect(s?.sendProductCards).toBe(true);
    expect(s?.tools).toContain("getProducts");
  });
});

describe("productSearchQueryFromMessage", () => {
  it("strips filler words", () => {
    const q = productSearchQueryFromMessage("Hi do you have blue cotton shirts please?");
    expect(q.toLowerCase()).toContain("blue");
    expect(q.toLowerCase()).not.toMatch(/\bhi\b/);
  });
});
