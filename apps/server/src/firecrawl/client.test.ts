import { describe, expect, it, vi, afterEach } from "vitest";
import {
  FirecrawlDisabledError,
  firecrawlConfigured,
  firecrawlScrape,
  firecrawlSearch,
  getFirecrawlApiKey,
} from "./client";

describe("firecrawlConfigured / disabled mode", () => {
  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it("is false when key unset", () => {
    vi.stubEnv("FIRECRAWL_API_KEY", "");
    expect(firecrawlConfigured("")).toBe(false);
    expect(firecrawlConfigured(null)).toBe(false);
    expect(getFirecrawlApiKey()).toBeNull();
  });

  it("is true when key present", () => {
    expect(firecrawlConfigured("fc-test")).toBe(true);
    vi.stubEnv("FIRECRAWL_API_KEY", "fc-test-key");
    expect(getFirecrawlApiKey()).toBe("fc-test-key");
  });

  it("scrape throws FirecrawlDisabledError without key", async () => {
    await expect(firecrawlScrape("https://example.com", { apiKey: null })).rejects.toBeInstanceOf(
      FirecrawlDisabledError,
    );
    await expect(
      firecrawlScrape("https://example.com", { apiKey: null }),
    ).rejects.toMatchObject({
      code: "FIRECRAWL_DISABLED",
      message: expect.stringContaining("FIRECRAWL_API_KEY"),
    });
  });

  it("search throws FirecrawlDisabledError without key", async () => {
    await expect(
      firecrawlSearch("NEET cutoff", { apiKey: "" }),
    ).rejects.toBeInstanceOf(FirecrawlDisabledError);
  });
});
