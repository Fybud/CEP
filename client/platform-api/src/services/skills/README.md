# Premade agent skills (CEP)

Skills are **code-defined** in `catalog.ts`. Tenants enable them via Platform Admin → Agentic Replies → Customize.

## Hard rule: Shopify / commerce tools are READ-ONLY

See also: `.cursor/rules/agentic-skills-readonly.mdc` (always applied for Cursor agents).

| Do | Do not |
|----|--------|
| GET customer, orders, products, fulfillments, tracking | Create/update/cancel orders |
| Escalate mutations to a human agent | Refund, capture, void, fulfill via skills |
| | Write metafields, tags, inventory, customer records |

OAuth install scopes: `read_customers,read_orders,read_products` (no write scopes).
`shopifyAdminFetch` rejects any non-GET Admin API method.

---

## Tools (logical)

| Tool | Status | Shopify |
|------|--------|---------|
| `getCustomer` | Live | Commerce lookup (GET) |
| `getRecentOrder` / `getOrders` | Live | Customer orders (GET) |
| `getTracking` | Live | Fulfillment tracking on orders (GET) |
| `getInvoice` | Stub | No PDF URL yet |
| `getProducts` | Live | `GET /products.json` |

---

## Skills

| Key | Flag | Intent | Behavior |
|-----|------|--------|----------|
| `noise_resolve` | `skill_noise_resolve` | thanks / greeting / spam | Resolve only |
| `order_status` | `skill_order_status` | `order/status`, `order/tracking` | Read → LLM → send → resolve |
| `delivery_status` | `skill_delivery_status` | `post_purchase/delivery` | Orders + tracking → LLM → resolve |
| `payment_status` | `skill_payment_status` | `order/payment` | Orders → LLM → resolve |
| `product_info` | `skill_product_info` | `pre_purchase/product`, `pre_purchase/availability` | Products → LLM → resolve |
| `product_suggestions` | `skill_product_suggestions` | `pre_purchase/suggestions` | Product cards (image + price) → resolve |

**Not automated (human only):** `pre_purchase/shipping`, `pre_purchase/price`, `post_purchase/return`, `post_purchase/complaint`, `post_purchase/feedback`, `order/change`, refunds, cancellations, address edits.

---

## Runtime flow

1. Intent classifier  
2. `agentic_replies_enabled` master on  
3. Matching skill flag on  
4. Gather **read** tools → LLM (tenant `llm_config`) → send → optional resolve  
5. Audit `agent_skill_runs`
