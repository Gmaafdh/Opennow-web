import type { ComponentProps } from "react";
import { describe, expect, it } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";

import type { AuthDeviceLoginChallenge, LoginProvider } from "@shared/gfn";

import { LoginScreen } from "./LoginScreen";

const providers: LoginProvider[] = [
  {
    idpId: "idp-nvidia",
    code: "NVIDIA",
    displayName: "NVIDIA",
    streamingServiceUrl: "https://prod.cloudmatchbeta.nvidiagrid.net/",
    priority: 0,
  },
];

const challenge: AuthDeviceLoginChallenge = {
  attemptId: "attempt-1",
  deviceCode: "attempt-1",
  userCode: "WKJB-MHTG",
  verificationUri: "https://login.nvidia.com/device",
  verificationUriComplete: "https://login.nvidia.com/device?user_code=WKJB-MHTG",
  expiresAt: Date.now() + 8 * 60 * 1000,
  intervalSeconds: 5,
};

function render(overrides: Partial<ComponentProps<typeof LoginScreen>> = {}): string {
  return renderToStaticMarkup(
    <LoginScreen
      providers={providers}
      selectedProviderId={providers[0].idpId}
      onProviderChange={() => {}}
      onStartDeviceLogin={() => {}}
      onCancelDeviceLogin={() => {}}
      isLoading={false}
      error={null}
      deviceLoginChallenge={challenge}
      {...overrides}
    />,
  );
}

describe("LoginScreen", () => {
  it("offers link-based sign-in as the primary action", () => {
    const markup = render({ deviceLoginChallenge: null });
    expect(markup).toContain("Sign in with a link");
    expect(markup).not.toContain("login-device-panel");
  });

  it("links straight to the NVIDIA verification URL with the user code prefilled", () => {
    const markup = render();
    expect(markup).toContain(`href="${challenge.verificationUriComplete}"`);
    expect(markup).toContain('target="_blank"');
    expect(markup).toContain('rel="noopener noreferrer"');
    expect(markup).toContain("WKJB-MHTG");
    expect(markup).toContain("Open NVIDIA sign-in");
  });

  it("keeps the QR code hidden until the visitor asks for it", () => {
    const markup = render();
    expect(markup).toContain("Show QR code");
    expect(markup).not.toContain("login-qr-panel");
    expect(markup).not.toContain("Scan to sign in");
  });

  it("shows a preparing state while the sign-in link is requested", () => {
    const markup = render({ deviceLoginChallenge: null, isDeviceLoginPending: true });
    expect(markup).toContain("Preparing sign-in");
    expect(markup).toContain("Cancel sign-in");
  });
});
