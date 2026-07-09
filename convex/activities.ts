import { v } from "convex/values";
import { Id } from "./_generated/dataModel";
import { mutation, query } from "./_generated/server";

// ============================================================================
// 1. HELPERS (Helper functions)
// ============================================================================

async function requirePermission(ctx: any, permissionName: string) {
  const identity = await ctx.auth.getUserIdentity();
  if (!identity) throw new Error("Unauthorized");

  const user = await ctx.db
    .query("users")
    .withIndex("by_clerk_id", (q: any) => q.eq("clerkId", identity.subject))
    .unique();

  if (!user || !user.role)
    throw new Error("Unauthorized: Invalid user or role");

  const role = await ctx.db.get(user.role as Id<"roles">);

  // Smart version that supports the global admin permission "admin:all"
  const hasSpecificPermission = role?.permissions.includes(permissionName);
  const isSuperAdmin = role?.permissions.includes("admin:all");

  if (!role || (!hasSpecificPermission && !isSuperAdmin)) {
    throw new Error(`Forbidden: Missing permission [${permissionName}]`);
  }

  return user;
}

/**
 * Helper function to check if the user has access to a specific deal
 */
async function canAccessDeal(ctx: any, dealId: Id<"deals">, currentUser: any) {
  const deal = await ctx.db.get(dealId);
  if (!deal) throw new Error("Deal not found");

  const role = await ctx.db.get(currentUser.role as Id<"roles">);
  const isAdmin = role?.permissions.includes("admin:all");

  // If the user is not an admin, they must be the owner of the deal or in the same group
  if (
    !isAdmin &&
    deal.owner !== currentUser._id &&
    deal.group !== currentUser.group
  ) {
    throw new Error("Forbidden: You don't have access to this deal");
  }

  return deal;
}

// ============================================================================
// 2. POST (Add a new activity to a deal)
// ============================================================================

export const createActivity = mutation({
  args: {
    deal: v.id("deals"),
    activityType: v.union(
      v.literal("call"),
      v.literal("email"),
      v.literal("meeting"),
      v.literal("note"),
      v.literal("task"),
    ),
    activityDate: v.optional(v.number()), // If not passed, consider it as the current date
    activityDescription: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const currentUser = await requirePermission(ctx, "activities:create");

    // Check if the employee has permission to work on this deal
    await canAccessDeal(ctx, args.deal, currentUser);

    const activityId = await ctx.db.insert("activities", {
      deal: args.deal,
      activityType: args.activityType,
      activityDate: args.activityDate || Date.now(),
      activityDescription: args.activityDescription,
      createdBy: currentUser._id,
      updatedAt: Date.now(),
    });

    return activityId;
  },
});

// ============================================================================
// 3. PUT (Update an existing activity)
// ============================================================================

export const updateActivity = mutation({
  args: {
    id: v.id("activities"),
    activityType: v.optional(
      v.union(
        v.literal("call"),
        v.literal("email"),
        v.literal("meeting"),
        v.literal("note"),
        v.literal("task"),
      ),
    ),
    activityDate: v.optional(v.number()),
    activityDescription: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const currentUser = await requirePermission(ctx, "activities:update");

    const activity = await ctx.db.get(args.id);
    if (!activity) throw new Error("Activity not found");

    // Double check: ensure the employee has access to the deal linked to this activity
    await canAccessDeal(ctx, activity.deal, currentUser);

    // Additional protection (optional): should we allow the employee to modify an activity written by another employee in the same group?
    // For simplicity, we only check the group permission.

    await ctx.db.patch(args.id, {
      ...(args.activityType && { activityType: args.activityType }),
      ...(args.activityDate !== undefined && {
        activityDate: args.activityDate,
      }),
      ...(args.activityDescription !== undefined && {
        activityDescription: args.activityDescription,
      }),
      updatedBy: currentUser._id,
      updatedAt: Date.now(),
    });

    return { success: true };
  },
});

// ============================================================================
// 4. GET (Get the activities for a specific deal - Timeline)
// ============================================================================

export const getActivitiesByDeal = query({
  args: {
    dealId: v.id("deals"),
  },
  handler: async (ctx, args) => {
    const currentUser = await requirePermission(ctx, "activities:read");

    // If the employee does not have permission to view the deal, this function will automatically throw an error
    await canAccessDeal(ctx, args.dealId, currentUser);

    // Get the activities and order them in descending order (latest first) to form the Timeline
    const activities = await ctx.db
      .query("activities")
      .withIndex("by_deal", (q) => q.eq("deal", args.dealId))
      .order("desc")
      .collect();

    // (Optional) Get the user who created the activity (name and image)
    // This is very useful for displaying it in the frontend (e.g. "John added a note")
    const populatedActivities = await Promise.all(
      activities.map(async (activity) => {
        const creator = await ctx.db.get(activity.createdBy);
        return {
          ...activity,
          creatorInfo: {
            firstName: creator?.firstName,
            lastName: creator?.lastName,
            imageUrl: creator?.imageUrl,
          },
        };
      }),
    );

    return populatedActivities;
  },
});
