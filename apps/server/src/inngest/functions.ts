import { inngest } from "./client";

/**
 * Phase 0 placeholder function so the serve endpoint has something registered.
 * Real pipelines land in later phases (document/ingest, paper/extract, etc.).
 */
export const helloWorld = inngest.createFunction(
  { id: "hello-world" },
  { event: "examgpt/hello" },
  async ({ event, step }) => {
    await step.run("log", async () => {
      return { received: event.name };
    });
    return { ok: true };
  },
);

export const functions = [helloWorld];
