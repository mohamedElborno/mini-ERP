/// <reference types="vite/client" />
import { convexTest } from "convex-test";
import { afterEach, describe, expect, it, vi } from "vitest";
import schema from "./schema";
import { api } from "./_generated/api";
import { filterByOrgGroup } from "./orgGroupHelpers";
import { consumePublicViewBudget } from "./publicViewLimit";
import { assignPublicViewToken, lookupByPublicViewToken, revokePublicViewToken } from "./lib/publicViewTokenStorage";
import { buildQuotePrintData } from "./documentViews";
const modules = import.meta.glob(["./**/*.ts", "!./**/*.test.ts"]);
afterEach(() => vi.unstubAllEnvs());
async function fixture() {
  const t = convexTest(schema, modules);
  const ids = await t.run(async ctx => {
    const a = await ctx.db.insert("groups", { name: "A" });
    const b = await ctx.db.insert("groups", { name: "B" });
    const adminRole = await ctx.db.insert("roles", { name: "Admin", permissions: ["admin:all"] });
    const role = await ctx.db.insert("roles", { name: "Staff", permissions: ["users:update", "users:read", "settings:manage", "products:read", "products:update", "quotes:create", "quotes:read"] });
    const user = await ctx.db.insert("users", { clerkId: "staff", email: "staff@example.test", role, group: a, assignedGroups: [a] });
    await ctx.db.insert("users", { clerkId: "admin", email: "admin@example.test", role: adminRole, group: a, assignedGroups: [a, b] });
    await ctx.db.insert("users", { clerkId: "pending", email: "pending@example.test" });
    await ctx.db.insert("users", { clerkId: "empty", email: "empty@example.test", role });
    const currency = await ctx.db.insert("currencies", { name: "B", symbol: "B", group: b, createdBy: user });
    const bank = await ctx.db.insert("bankAccounts", { bankName: "B", accountNumber: "example", iban: "example", country: "example", city: "example", currency, group: b, createdBy: user });
    const productA = await ctx.db.insert("products", { name: "A", group: a, createdBy: user, status: "active" });
    const productB = await ctx.db.insert("products", { name: "B", group: b, createdBy: user, status: "active" });
    const settings = await ctx.db.insert("settings", { group: b, quoteNumberPrefix: "B", updatedBy: user, updatedAt: 0 });
    const contact = await ctx.db.insert("contacts", { firstName: "Example", group: a, owner: user, createdBy: user });
    const deal = await ctx.db.insert("deals", { title: "Example", group: a, owner: user, contact, createdBy: user });
    const quote = await ctx.db.insert("quotes", { deal, contact, group: a, createdBy: user, total: 1 });
    return { a,b,user,role,adminRole,currency,bank,productA,productB,settings,quote,deal };
  });
  return { t, ids, staff: t.withIdentity({ subject: "staff" }), admin: t.withIdentity({ subject: "admin" }) };
}
describe("security boundaries", () => {
  it("denies anonymous and pending users, while allowing administrators", async () => {
    const { t, admin } = await fixture();
    await expect(t.query(api.users.getUnassignedUsers)).rejects.toThrow("Unauthorized");
    await expect(t.withIdentity({subject:"pending"}).query(api.users.getUnassignedUsers)).rejects.toThrow("Forbidden");
    expect(await admin.query(api.users.getUnassignedUsers)).toHaveLength(1);
  });
  it("rejects self elevation and invitations by delegated user managers", async () => {
    const { staff,ids } = await fixture();
    await expect(staff.mutation(api.users.assignUserRole,{targetUserId:ids.user,roleId:ids.adminRole,groupIds:[ids.a]})).rejects.toThrow("Administrator");
    await expect(staff.action(api.invitations.inviteEmployee,{emailAddress:"new@example.test",roleId:ids.adminRole,groupIds:[ids.a]})).rejects.toThrow("Forbidden");
  });
  it("allows same-company product edits and denies cross-company reads and edits", async () => {
    const { staff,ids,t } = await fixture();
    await staff.mutation(api.products.updateProduct,{id:ids.productA,price:2});
    expect((await staff.query(api.products.getProductById,{id:ids.productA}))?.price).toBe(2);
    await expect(staff.query(api.products.getProductById,{id:ids.productB})).rejects.toThrow("Company access");
    await expect(staff.mutation(api.products.updateProduct,{id:ids.productB,price:9})).rejects.toThrow("Company access");
    expect((await t.run(ctx=>ctx.db.get(ids.productB)))?.price).toBeUndefined();
  });
  it("rejects cross-company bank updates and deletions", async () => {
    const {staff,ids}=await fixture();
    await expect(staff.mutation(api.bankAccounts.updateBankAccount,{id:ids.bank,bankName:"X",accountNumber:"X",iban:"X",country:"X",city:"X",currency:ids.currency})).rejects.toThrow("Company access");
    await expect(staff.mutation(api.bankAccounts.deleteBankAccount,{id:ids.bank})).rejects.toThrow("Company access");
  });
  it("does not reuse another company's settings", async () => {
    const {staff,ids,t}=await fixture();
    expect(await staff.query(api.settings.getSettings,{orgGroupId:ids.a})).toBeNull();
    await staff.mutation(api.settings.updateSettings,{orgGroupId:ids.a,quoteNumberPrefix:"A"});
    expect((await t.run(ctx=>ctx.db.get(ids.settings)))?.group).toBe(ids.b);
    expect((await t.run(ctx=>ctx.db.get(ids.settings)))?.quoteNumberPrefix).toBe("B");
  });
  it("fails closed for users without a company and rows without a group", async () => {
    const {t,ids}=await fixture();
    await expect(t.withIdentity({subject:"empty"}).query(api.products.getProducts,{})).rejects.toThrow("No assigned company");
    expect(filterByOrgGroup([{group:ids.b}],"all",[])).toEqual([]);
    expect(filterByOrgGroup([{}, {group:ids.b}],"all",[ids.a])).toEqual([]);
  });
  it("checks nested product references before creating a quote", async () => {
    const {staff,ids}=await fixture();
    await expect(staff.mutation(api.quotes.createQuote,{deal:ids.deal,lineItems:[{product:ids.productB,quantity:1,price:1}]})).rejects.toThrow("Company access");
  });
  it("requires an explicitly configured bootstrap owner", async () => {
    const t=convexTest(schema,modules);
    vi.stubEnv("BOOTSTRAP_ADMIN_SUBJECT", "owner");
    await expect(t.withIdentity({subject:"other"}).mutation(api.users.bootstrapAdmin,{})).rejects.toThrow("Bootstrap owner");
    await t.withIdentity({subject:"owner"}).mutation(api.users.bootstrapAdmin,{});
    await expect(t.withIdentity({subject:"owner"}).mutation(api.users.bootstrapAdmin,{})).rejects.toThrow("already initialized");
  });
  it("requires encryption, stores no plaintext, expires and revokes bearer links", async () => {
    const {t,ids}=await fixture();
    vi.stubEnv("PUBLIC_VIEW_TOKEN_ENCRYPTION_KEY", "");
    await expect(t.run(ctx=>assignPublicViewToken(ctx,ids.quote))).rejects.toThrow("must be configured");
    vi.stubEnv("PUBLIC_VIEW_TOKEN_ENCRYPTION_KEY", "ab".repeat(32));
    const token=await t.run(ctx=>assignPublicViewToken(ctx,ids.quote));
    const doc=await t.run(ctx=>ctx.db.get(ids.quote));
    expect(doc?.publicViewToken).toBeUndefined();
    expect(doc?.publicViewTokenEnc).toBeTruthy();
    expect(await t.run(ctx=>lookupByPublicViewToken(ctx,"quotes",token))).not.toBeNull();
    await t.run(ctx=>ctx.db.patch(ids.quote,{publicViewTokenExpiresAt:1}));
    expect(await t.run(ctx=>lookupByPublicViewToken(ctx,"quotes",token))).toBeNull();
    await t.run(ctx=>revokePublicViewToken(ctx,ids.quote));
    expect(await t.run(ctx=>lookupByPublicViewToken(ctx,"quotes",token))).toBeNull();
  });
  it("omits internal IDs and credential fields from public print documents", async () => {
    const {t,ids}=await fixture();
    const result=await t.run(async ctx=>buildQuotePrintData(ctx,(await ctx.db.get(ids.quote))!));
    expect(result.quote).not.toHaveProperty("_id");
    expect(result.quote).not.toHaveProperty("createdBy");
    expect(result.quote).not.toHaveProperty("publicViewTokenHash");
  });
  it("enforces a shared budget even when called outside Next middleware", async () => {
    const {t}=await fixture();
    const token="a".repeat(43);
    for(let i=0;i<40;i++) expect(await t.run(ctx=>consumePublicViewBudget(ctx,token))).toBe(true);
    expect(await t.run(ctx=>consumePublicViewBudget(ctx,token))).toBe(false);
    expect(await t.run(ctx=>ctx.db.query("publicViewBudget").collect())).toHaveLength(1);
  });
});
