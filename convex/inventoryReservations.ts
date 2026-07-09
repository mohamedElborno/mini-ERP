import type { Id } from "./_generated/dataModel";
import type { MutationCtx } from "./_generated/server";

type LineRef = { product: Id<"products">; quantity: number };

export function recomputeQuoteShortage(
  stock: number,
  quoteReserved: number,
): number {
  return Math.max(0, quoteReserved - stock);
}

export async function canOversellQuotes(
  ctx: MutationCtx,
  userId: Id<"users">,
): Promise<boolean> {
  const user = await ctx.db.get(userId);
  if (!user?.role) return false;
  const role = await ctx.db.get(user.role);
  if (!role) return false;
  if (role.permissions.includes("admin:all")) return true;
  return role.permissions.includes("quotes:oversell");
}

/**
 * When creating a quote: increase quoteReserved, recompute quoteShortage.
 * Throws if available stock is insufficient and user cannot oversell.
 */
export async function addReservationsForQuoteProductLines(
  ctx: MutationCtx,
  lines: LineRef[] | undefined,
  allowOversell: boolean,
) {
  if (!lines?.length) return;
  for (const li of lines) {
    const p = await ctx.db.get(li.product);
    if (!p) throw new Error("Product not found");
    const q = li.quantity;
    if (q <= 0) continue;
    const stock = p.stock ?? 0;
    const reserved = p.reserved ?? 0;
    const available = stock - reserved;
    if (q > available && !allowOversell) {
      throw new Error(
        `Insufficient available quantity for "${p.name}": need ${q}, available ${available} (on hand ${stock}, already reserved for quotes ${reserved}).`,
      );
    }
    const newReserved = reserved + q;
    const newShortage = recomputeQuoteShortage(stock, newReserved);
    await ctx.db.patch(li.product, {
      reserved: newReserved,
      shortage: newShortage,
      updatedAt: Date.now(),
    });
  }
}

/**
 * When a quote is rejected/expired (or similar): return reserved quantities to the pool.
 */
export async function releaseReservationsForQuoteProductLines(
  ctx: MutationCtx,
  lines: LineRef[] | undefined,
) {
  if (!lines?.length) return;
  for (const li of lines) {
    const p = await ctx.db.get(li.product);
    if (!p) continue;
    const q = li.quantity;
    if (q <= 0) continue;
    const stock = p.stock ?? 0;
    const reserved = Math.max(0, (p.reserved ?? 0) - q);
    const newShortage = recomputeQuoteShortage(stock, reserved);
    await ctx.db.patch(li.product, {
      reserved: reserved,
      shortage: newShortage,
      updatedAt: Date.now(),
    });
  }
}

/**
 * When an invoice is issued for product lines: un-reserve and deduct physical stock.
 */
export async function fulfillQuoteLinesOnInvoice(
  ctx: MutationCtx,
  lines: LineRef[] | undefined,
  updatedBy: Id<"users">,
) {
  if (!lines?.length) return;
  for (const li of lines) {
    const p = await ctx.db.get(li.product);
    if (!p) throw new Error("Product not found");
    const q = li.quantity;
    if (q <= 0) continue;
    const stock = p.stock ?? 0;
    const reserved = p.reserved ?? 0;
    const newReserved = Math.max(0, reserved - q);
    const newStock = Math.max(0, stock - q);
    const newShortage = recomputeQuoteShortage(newStock, newReserved);
    await ctx.db.patch(li.product, {
      stock: newStock,
      reserved: newReserved,
      shortage: newShortage,
      updatedBy,
      updatedAt: Date.now(),
    });
  }
}

export function toProductLineRefs(
  lines: { product: Id<"products">; quantity: number }[] | undefined,
): LineRef[] | undefined {
  return lines?.map((l) => ({ product: l.product, quantity: l.quantity }));
}
