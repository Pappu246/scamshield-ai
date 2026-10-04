import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

describe("email OTP secret handling", () => {
  it("does not embed the provider API key in source", () => {
    const source = readFileSync("src/convex/auth/emailOtp.ts", "utf8");
    expect(source).not.toContain("fb_email_");
    expect(source).toContain("VLY_EMAIL_API_KEY");
  });
});
