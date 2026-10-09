import { readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

function sourceFiles(root: string): string[] {
  return readdirSync(root, { withFileTypes: true }).flatMap((entry) => {
    const path = join(root, entry.name);
    if (entry.isDirectory()) return sourceFiles(path);
    return /\.(ts|tsx|js|jsx|mjs|cjs|json)$/.test(entry.name) ? [path] : [];
  });
}

describe("email OTP secret handling", () => {
  it("does not embed the provider API key anywhere in current source", () => {
    const files = [...sourceFiles("src"), ".env.example"].filter((path) =>
      statSync(path).isFile(),
    );
    const source = files.map((path) => readFileSync(path, "utf8")).join("\n");
    expect(source).not.toContain("fb_email_");
    expect(readFileSync("src/convex/auth/emailOtp.ts", "utf8")).toContain(
      "VLY_EMAIL_API_KEY",
    );
  });
});
