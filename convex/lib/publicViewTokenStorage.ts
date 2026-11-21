import type { Doc, Id } from "../_generated/dataModel";
import type { MutationCtx, QueryCtx } from "../_generated/server";
import {
  decryptPublicViewToken,
  encryptPublicViewToken,
  generatePublicViewToken,
  hashPublicViewToken,
  isValidPublicViewToken,
} from "./publicViewToken";

type PublicViewDoc = Doc<"quotes"> | Doc<"invoices">;

type PublicViewFields = {
  publicViewToken?: string;
  publicViewTokenHash?: string;
  publicViewTokenEnc?: string;
};

export function hasPublicViewLink(doc: PublicViewFields): boolean {
  return Boolean(
    doc.publicViewTokenHash ??
      doc.publicViewTokenEnc ??
      doc.publicViewToken,
  );
}

async function lookupByTokenHash(
  ctx: QueryCtx,
  table: "quotes" | "invoices",
  tokenHash: string,
): Promise<PublicViewDoc | null> {
  if (table === "quotes") {
    return await ctx.db
      .query("quotes")
      .withIndex("by_publicViewTokenHash", (q) =>
        q.eq("publicViewTokenHash", tokenHash),
      )
      .unique();
  }

  return await ctx.db
    .query("invoices")
    .withIndex("by_publicViewTokenHash", (q) =>
      q.eq("publicViewTokenHash", tokenHash),
    )
    .unique();
}

export async function lookupByPublicViewToken(
  ctx: QueryCtx,
  table: "quotes",
  token: string,
): Promise<Doc<"quotes"> | null>;
export async function lookupByPublicViewToken(
  ctx: QueryCtx,
  table: "invoices",
  token: string,
): Promise<Doc<"invoices"> | null>;
export async function lookupByPublicViewToken(
  ctx: QueryCtx,
  table: "quotes" | "invoices",
  token: string,
): Promise<PublicViewDoc | null> {
  if (!isValidPublicViewToken(token)) return null;

  const tokenHash = await hashPublicViewToken(token);
  const byHash = await lookupByTokenHash(ctx, table, tokenHash);
  if (byHash) return byHash.publicViewTokenExpiresAt && byHash.publicViewTokenExpiresAt > Date.now() ? byHash : null;

  return null; // Legacy links must be rotated by authorized staff.
}

export async function assignPublicViewToken(
  ctx: MutationCtx,
  id: Id<"quotes"> | Id<"invoices">,
): Promise<string> {
  const token = generatePublicViewToken();
  const tokenHash = await hashPublicViewToken(token);
  const tokenEnc = await encryptPublicViewToken(token);
  if (!tokenEnc) throw new Error("PUBLIC_VIEW_TOKEN_ENCRYPTION_KEY must be configured");
  await ctx.db.patch(id, {
    publicViewTokenExpiresAt: Date.now() + 30 * 24 * 60 * 60 * 1000,
    publicViewTokenHash: tokenHash,
    publicViewTokenEnc: tokenEnc,
    publicViewToken: undefined,
    updatedAt: Date.now(),
  });

  return token;
}

export async function resolveStaffPublicViewToken(
  doc: PublicViewFields,
): Promise<string | null> {
  if (doc.publicViewTokenEnc) {
    const decrypted = await decryptPublicViewToken(doc.publicViewTokenEnc);
    if (decrypted && isValidPublicViewToken(decrypted)) {
      return decrypted;
    }
  }

  if (doc.publicViewToken && isValidPublicViewToken(doc.publicViewToken)) {
    return doc.publicViewToken;
  }

  return null;
}

export async function ensureStaffPublicViewToken<
  T extends "quotes" | "invoices",
>(
  ctx: MutationCtx,
  table: T,
  doc: PublicViewDoc & PublicViewFields,
): Promise<string> {
  const fresh = (await ctx.db.get(doc._id)) as
    | (PublicViewDoc & PublicViewFields)
    | null;
  if (!fresh) throw new Error("Document not found.");
  doc = fresh;

  if (!doc.publicViewTokenExpiresAt || doc.publicViewTokenExpiresAt <= Date.now() || !doc.publicViewTokenEnc) return await assignPublicViewToken(ctx, doc._id);
  const existing = await resolveStaffPublicViewToken(doc);
  if (existing) return existing;

  // Legacy rows: hash stored without a recoverable copy — establish one once.
  if (
    doc.publicViewTokenHash &&
    !doc.publicViewTokenEnc &&
    !doc.publicViewToken
  ) {
    return await assignPublicViewToken(ctx, doc._id);
  }

  if (hasPublicViewLink(doc)) {
    throw new Error(
      "Public view link exists but the token cannot be recovered. Regenerate the link from document settings.",
    );
  }

  return await assignPublicViewToken(ctx, doc._id);
}

export async function revokePublicViewToken(
  ctx: MutationCtx,
  id: Id<"quotes"> | Id<"invoices">,
): Promise<void> {
  await ctx.db.patch(id, {
    publicViewTokenExpiresAt: undefined,
    publicViewTokenHash: undefined,
    publicViewTokenEnc: undefined,
    publicViewToken: undefined,
    updatedAt: Date.now(),
  });
}

export async function rotatePublicViewToken(
  ctx: MutationCtx,
  id: Id<"quotes"> | Id<"invoices">,
): Promise<string> {
  return await assignPublicViewToken(ctx, id);
}
