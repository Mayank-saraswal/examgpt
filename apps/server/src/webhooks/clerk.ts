import type { Request, Response } from "express";
import { Webhook } from "svix";
import { db } from "@examgpt/db";
import { env } from "../env";
import { logger } from "../logger";
import { inngest } from "../inngest/client";

type ClerkWebhookEvent = {
  type: string;
  data: {
    id: string;
    email_addresses?: { email_address: string; id: string }[];
    primary_email_address_id?: string | null;
    phone_numbers?: { phone_number: string; id: string }[];
    primary_phone_number_id?: string | null;
    first_name?: string | null;
    last_name?: string | null;
  };
};

/**
 * Clerk user.created / user.updated / user.deleted webhook.
 * Svix signature verification required.
 * @see https://clerk.com/docs/webhooks/sync-data
 */
export async function clerkWebhookHandler(req: Request, res: Response) {
  const secret = env.CLERK_WEBHOOK_SIGNING_SECRET;
  if (!secret) {
    logger.error("CLERK_WEBHOOK_SIGNING_SECRET not configured");
    res.status(500).json({ error: "Webhook not configured" });
    return;
  }

  const svixId = req.headers["svix-id"];
  const svixTimestamp = req.headers["svix-timestamp"];
  const svixSignature = req.headers["svix-signature"];

  if (
    typeof svixId !== "string" ||
    typeof svixTimestamp !== "string" ||
    typeof svixSignature !== "string"
  ) {
    res.status(400).json({ error: "Missing svix headers" });
    return;
  }

  // express.raw leaves body as Buffer when content-type is application/json
  const payload =
    typeof req.body === "string"
      ? req.body
      : Buffer.isBuffer(req.body)
        ? req.body.toString("utf8")
        : JSON.stringify(req.body);

  let event: ClerkWebhookEvent;
  try {
    const wh = new Webhook(secret);
    event = wh.verify(payload, {
      "svix-id": svixId,
      "svix-timestamp": svixTimestamp,
      "svix-signature": svixSignature,
    }) as ClerkWebhookEvent;
  } catch (err) {
    logger.warn({ err }, "Clerk webhook signature verification failed");
    res.status(400).json({ error: "Invalid signature" });
    return;
  }

  try {
    if (event.type === "user.created" || event.type === "user.updated") {
      const d = event.data;
      const email =
        d.email_addresses?.find((e) => e.id === d.primary_email_address_id)
          ?.email_address ??
        d.email_addresses?.[0]?.email_address ??
        null;
      const phone =
        d.phone_numbers?.find((p) => p.id === d.primary_phone_number_id)
          ?.phone_number ??
        d.phone_numbers?.[0]?.phone_number ??
        null;
      const name = [d.first_name, d.last_name].filter(Boolean).join(" ") || null;

      await db.user.upsert({
        where: { id: d.id },
        create: {
          id: d.id,
          email,
          phone,
          name,
        },
        update: {
          email,
          phone,
          name,
        },
      });
    } else if (event.type === "user.deleted") {
      const id = event.data.id;
      await inngest.send({
        name: "user/deleted",
        data: { userId: id },
      });
      // Best-effort local delete; cleanup job handles R2/Qdrant later
      await db.user.deleteMany({ where: { id } });
    }

    res.json({ received: true });
  } catch (err) {
    logger.error({ err, type: event.type }, "Clerk webhook handler error");
    res.status(500).json({ error: "Handler failed" });
  }
}
