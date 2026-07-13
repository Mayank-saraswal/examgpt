import { z } from "zod";

/** Health check has no input; kept as a schema for symmetry with other procedures. */
export const healthPingInput = z.void().optional();

export const healthPingOutput = z.object({
  ok: z.literal(true),
  service: z.string(),
  timestamp: z.string(),
});

export type HealthPingOutput = z.infer<typeof healthPingOutput>;
