import type { Id } from "./_generated/dataModel";
import type { MutationCtx } from "./_generated/server";

/**
 * يسجّل حدثاً في `auditLogs` (يُستدعى من mutations فقط)
 */
export async function logAudit(
  ctx: MutationCtx,
  p: {
    entityId: string;
    entityType: string;
    action: string;
    changes?: unknown;
    performedBy: Id<"users">;
  },
) {
  await ctx.db.insert("auditLogs", {
    entityId: p.entityId,
    entityType: p.entityType,
    action: p.action,
    changes: p.changes,
    performedBy: p.performedBy,
    timestamp: Date.now(),
  });
}
