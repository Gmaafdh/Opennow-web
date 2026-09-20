import { describe, expect, it } from "vitest";

import {
  isNvidiaGridBaseUrl,
  normalizeCloudMatchBaseUrl,
  resolveClientStreamingBaseUrl,
} from "./cloudmatchTransport";

const PROVIDER_DEFAULT = "https://prod.cloudmatchbeta.nvidiagrid.net/";
const BULGARIA_ZONE = "https://np-sof-02.cloudmatchbeta.nvidiagrid.net/";

describe("isNvidiaGridBaseUrl", () => {
  it("accepts NVIDIA CloudMatch zone URLs", () => {
    expect(isNvidiaGridBaseUrl(BULGARIA_ZONE)).toBe(true);
    expect(isNvidiaGridBaseUrl(PROVIDER_DEFAULT)).toBe(true);
    expect(isNvidiaGridBaseUrl("https://np-us-west-01.cloudmatch.nvidiagrid.net")).toBe(true);
  });

  it("rejects non-HTTPS and non-NVIDIA hosts", () => {
    expect(isNvidiaGridBaseUrl("http://np-sof-02.cloudmatchbeta.nvidiagrid.net")).toBe(false);
    expect(isNvidiaGridBaseUrl("https://partner.example.com/")).toBe(false);
    expect(isNvidiaGridBaseUrl("https://nvidiagrid.net.evil.example/")).toBe(false);
    expect(isNvidiaGridBaseUrl("http://169.254.169.254/")).toBe(false);
    expect(isNvidiaGridBaseUrl("not a url")).toBe(false);
    expect(isNvidiaGridBaseUrl("")).toBe(false);
  });
});

describe("resolveClientStreamingBaseUrl", () => {
  it("honors a client-selected NVIDIA zone", () => {
    expect(resolveClientStreamingBaseUrl(BULGARIA_ZONE, PROVIDER_DEFAULT)).toBe(
      "https://np-sof-02.cloudmatchbeta.nvidiagrid.net",
    );
  });

  it("normalizes trailing slashes and whitespace", () => {
    expect(resolveClientStreamingBaseUrl("  https://np-sof-02.cloudmatchbeta.nvidiagrid.net  ", PROVIDER_DEFAULT)).toBe(
      "https://np-sof-02.cloudmatchbeta.nvidiagrid.net",
    );
  });

  it("falls back to the provider default for non-NVIDIA hosts", () => {
    expect(resolveClientStreamingBaseUrl("https://evil.example/", PROVIDER_DEFAULT)).toBe(PROVIDER_DEFAULT);
    expect(resolveClientStreamingBaseUrl("http://np-sof-02.cloudmatchbeta.nvidiagrid.net/", PROVIDER_DEFAULT)).toBe(
      PROVIDER_DEFAULT,
    );
  });

  it("falls back for missing or non-string input", () => {
    expect(resolveClientStreamingBaseUrl(undefined, PROVIDER_DEFAULT)).toBe(PROVIDER_DEFAULT);
    expect(resolveClientStreamingBaseUrl(null, PROVIDER_DEFAULT)).toBe(PROVIDER_DEFAULT);
    expect(resolveClientStreamingBaseUrl(42, PROVIDER_DEFAULT)).toBe(PROVIDER_DEFAULT);
    expect(resolveClientStreamingBaseUrl("   ", PROVIDER_DEFAULT)).toBe(PROVIDER_DEFAULT);
  });

  it("passes an alliance provider base through as the fallback unchanged", () => {
    const allianceBase = "https://streaming.partner.example/";
    expect(resolveClientStreamingBaseUrl(allianceBase, allianceBase)).toBe(allianceBase);
  });
});

describe("normalizeCloudMatchBaseUrl", () => {
  it("adds a protocol and strips trailing slashes", () => {
    expect(normalizeCloudMatchBaseUrl("np-sof-02.cloudmatchbeta.nvidiagrid.net/")).toBe(
      "https://np-sof-02.cloudmatchbeta.nvidiagrid.net",
    );
  });
});
