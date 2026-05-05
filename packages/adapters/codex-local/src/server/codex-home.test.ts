import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { prepareIsolatedCodexHome } from "./codex-home.js";

describe("prepareIsolatedCodexHome", () => {
  it("sanitizes run ids before using them as path segments", async () => {
    const root = await fs.mkdtemp(path.join(os.tmpdir(), "paperclip-codex-home-"));
    const sourceHome = path.join(root, "source");
    const logs: string[] = [];
    try {
      await fs.mkdir(sourceHome, { recursive: true });

      const targetHome = await prepareIsolatedCodexHome({
        env: {
          PAPERCLIP_HOME: root,
          PAPERCLIP_INSTANCE_ID: "instance",
        },
        onLog: async (_stream, chunk) => {
          logs.push(chunk);
        },
        companyId: "company",
        runId: "..",
        sourceHome,
      });

      expect(targetHome).toBe(
        path.join(root, "instances", "instance", "companies", "company", "codex-home-runs", "run"),
      );
      expect(path.relative(root, targetHome).startsWith("..")).toBe(false);
      expect(logs.join("")).toContain("Using isolated Codex home");
    } finally {
      await fs.rm(root, { recursive: true, force: true });
    }
  });
});
