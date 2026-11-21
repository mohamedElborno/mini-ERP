import type { MutationCtx } from "./_generated/server";
import { hashPublicViewToken } from "./lib/publicViewToken";

/** A bounded, shared budget at the data endpoint (not process-local middleware).
 * At most one row and 600 token hashes per minute. No raw bearer tokens stored.
 */
export async function consumePublicViewBudget(ctx: MutationCtx, token: string) {
  const key = await hashPublicViewToken(token);
  const now = Date.now();
  const row = await ctx.db.query("publicViewBudget").first();
  const fresh = !row || row.resetAt <= now;
  const counts = fresh ? {} : row.counts;
  const total = fresh ? 0 : row.total;
  if (total >= 600 || (counts[key] ?? 0) >= 40) return false;
  const data = { resetAt: fresh ? now + 60_000 : row.resetAt, total: total + 1, counts: { ...counts, [key]: (counts[key] ?? 0) + 1 } };
  if (row) await ctx.db.patch(row._id, data);
  else await ctx.db.insert("publicViewBudget", data);
  return true;
}
