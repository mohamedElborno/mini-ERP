import { v } from "convex/values";
import { action } from "./_generated/server";

// ============================================================================
// Send invitation to new employees through Clerk API
// ============================================================================

export const inviteEmployee = action({
  args: {
    emailAddress: v.string(), // Email of the employee to invite
  },
  handler: async (ctx, args) => {
    // 1. Verify the identity of the sender (must be logged in to the system)
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) {
      throw new Error(
        "Unauthorized: You must be logged in to send invitations.",
      );
    }

    // (Note: In production, it is recommended to check the Convex database
    // to ensure that this user has the 'admin' permission before completing the process)

    // 2. Get the secret key for Clerk from the Convex environment settings
    const clerkSecretKey = process.env.CLERK_SECRET_KEY;
    if (!clerkSecretKey) {
      throw new Error("Server configuration error: Missing CLERK_SECRET_KEY");
    }

    // 3. Communicate with Clerk servers to create and send the invitation
    try {
      const response = await fetch("https://api.clerk.com/v1/invitations", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${clerkSecretKey}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          email_address: args.emailAddress,
          ignore_existing: true, // Ignore if the email is already invited
          // You can enable the following option if you want to redirect the employee to a specific page after accepting the invitation
          redirect_url: "https://your-app.com/dashboard",
        }),
      });

      if (!response.ok) {
        const errorData = await response.json();
        console.error("Clerk Invitation Error:", errorData);
        throw new Error("Failed to send invitation through Clerk.");
      }

      const invitation = await response.json();

      return {
        success: true,
        message: "Invitation sent successfully",
        invitationId: invitation.id,
      };
    } catch (error) {
      console.error("Error creating invitation:", error);
      throw new Error(
        "An internal error occurred while sending the invitation.",
      );
    }
  },
});
