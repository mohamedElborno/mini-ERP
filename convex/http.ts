import { httpRouter } from "convex/server";
import { httpAction } from "./_generated/server";
import { internal } from "./_generated/api";
import { Webhook } from "svix";

const http = httpRouter();

http.route({
  path: "/clerk-webhook",
  method: "POST",
  handler: httpAction(async (ctx, request) => {
    const payloadString = await request.text();
    const headerPayload = request.headers;

    // Get the encryption key from Convex settings
    const svixSecret = process.env.CLERK_WEBHOOK_SECRET;
    if (!svixSecret) {
      throw new Error("Missing CLERK_WEBHOOK_SECRET");
    }

    const svixHeaders = {
      "svix-id": headerPayload.get("svix-id")!,
      "svix-timestamp": headerPayload.get("svix-timestamp")!,
      "svix-signature": headerPayload.get("svix-signature")!,
    };

    const wh = new Webhook(svixSecret);
    let event: any;

    try {
      event = wh.verify(payloadString, svixHeaders);
    } catch (err) {
      return new Response("Error verifying webhook", { status: 400 });
    }

    const eventType = event.type;

    // Catch the login or update event
    if (eventType === "user.created" || eventType === "user.updated") {
      const { id, email_addresses, primary_email_address_id, first_name, last_name, image_url } =
        event.data;
      const primary = email_addresses.find((entry: { id: string }) => entry.id === primary_email_address_id);
      if (!primary || primary.verification?.status !== "verified") {
        return new Response("Verified primary email required", { status: 200 });
      }
      const email = primary.email_address;

      await ctx.runMutation(internal.users.upsertUser, {
        clerkId: id,
        email: email,
        firstName: first_name || undefined,
        lastName: last_name || undefined,
        imageUrl: image_url || undefined,
      });
    }

    return new Response("Webhook processed", { status: 200 });
  }),
});

export default http;
