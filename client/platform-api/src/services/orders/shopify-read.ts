/**
 * Read-only Shopify Admin helpers for agent skills.
 * NEVER POST/PUT/PATCH/DELETE here — GET only.
 * See `.cursor/rules/agentic-skills-readonly.mdc` and `skills/README.md`.
 */
import { isShopifyConfigured, shopifyAdminFetch } from "./shopify.client.js";

export type ShopifyProductSummary = {
  id: string;
  title: string;
  handle: string;
  status: string;
  productType: string | null;
  vendor: string | null;
  price: string | null;
  currencyHint: string | null;
  urlPath: string;
  /** CDN image URL when present (read-only). */
  imageUrl: string | null;
};

type ShopifyProduct = {
  id?: number | string;
  title?: string;
  handle?: string;
  status?: string;
  product_type?: string | null;
  vendor?: string | null;
  variants?: Array<{ price?: string; presentment_prices?: unknown }>;
  image?: { src?: string | null } | null;
  images?: Array<{ src?: string | null }>;
};

function mapProduct(p: ShopifyProduct): ShopifyProductSummary {
  const price = p.variants?.[0]?.price ?? null;
  const imageUrl =
    p.image?.src?.trim() ||
    p.images?.find((i) => i.src?.trim())?.src?.trim() ||
    null;
  return {
    id: String(p.id ?? ""),
    title: p.title ?? "Product",
    handle: p.handle ?? "",
    status: p.status ?? "unknown",
    productType: p.product_type ?? null,
    vendor: p.vendor ?? null,
    price,
    currencyHint: null,
    urlPath: p.handle ? `/products/${p.handle}` : "",
    imageUrl,
  };
}

/** Extract a short search phrase from the customer message. */
export function productSearchQueryFromMessage(message: string): string {
  const cleaned = message
    .replace(/[?!.,]/g, " ")
    .replace(
      /\b(do you have|have you|looking for|want|need|price of|cost of|tell me about|recommend|suggest|suggestion|best|show me|kya|hai|ka|ki|ke|please|pls|hi|hello)\b/gi,
      " ",
    )
    .replace(/\s+/g, " ")
    .trim();
  const words = cleaned.split(" ").filter(Boolean).slice(0, 6);
  return words.join(" ").slice(0, 80);
}

/**
 * GET /products.json — title filter when possible, else recent active products.
 */
export async function searchProductsReadOnly(
  customerMessage: string,
  limit = 5,
): Promise<{ products: ShopifyProductSummary[]; query: string }> {
  if (!(await isShopifyConfigured())) {
    return { products: [], query: "" };
  }
  const query = productSearchQueryFromMessage(customerMessage);
  const lim = Math.min(Math.max(limit, 1), 10);
  try {
    if (query.length >= 2) {
      const data = await shopifyAdminFetch<{ products?: ShopifyProduct[] }>(
        `/products.json?limit=${lim}&status=active&title=${encodeURIComponent(query)}`,
      );
      const products = (data.products ?? []).map(mapProduct);
      if (products.length) return { products, query };
    }
    const fallback = await shopifyAdminFetch<{ products?: ShopifyProduct[] }>(
      `/products.json?limit=${lim}&status=active`,
    );
    return {
      products: (fallback.products ?? []).map(mapProduct),
      query: query || "(recent active)",
    };
  } catch (err) {
    console.warn(
      "[shopify-read] products:",
      err instanceof Error ? err.message : err,
    );
    return { products: [], query };
  }
}

/** Download a remote product image for outbound media (read-only GET). */
export async function fetchProductImageBuffer(
  imageUrl: string,
): Promise<{ buffer: Buffer; contentType: string; filename: string } | null> {
  try {
    const res = await fetch(imageUrl, {
      method: "GET",
      headers: { Accept: "image/*" },
    });
    if (!res.ok) return null;
    const contentType = (res.headers.get("content-type") || "image/jpeg").split(";")[0]!.trim();
    if (!contentType.startsWith("image/")) return null;
    const ab = await res.arrayBuffer();
    const buffer = Buffer.from(ab);
    if (!buffer.length || buffer.length > 8 * 1024 * 1024) return null;
    const ext =
      contentType.includes("png")
        ? "png"
        : contentType.includes("webp")
          ? "webp"
          : "jpg";
    return { buffer, contentType, filename: `product.${ext}` };
  } catch {
    return null;
  }
}
