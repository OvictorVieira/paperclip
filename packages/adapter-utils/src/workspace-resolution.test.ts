import { describe, expect, it } from "vitest";
import {
  looksLikeHostPath,
  mapWorkspacePath,
  readWorkspaceResolutionConfig,
  resolveExecutionWorkspace,
} from "./workspace-resolution.js";

// ---------------------------------------------------------------------------
// looksLikeHostPath
// ---------------------------------------------------------------------------

describe("looksLikeHostPath", () => {
  it("detects macOS /Users/ paths", () => {
    expect(looksLikeHostPath("/Users/victorhugo/Documents/dev")).toBe(true);
  });
  it("detects macOS /Volumes/ paths", () => {
    expect(looksLikeHostPath("/Volumes/Data/projects")).toBe(true);
  });
  it("detects Windows C:\\ paths", () => {
    expect(looksLikeHostPath("C:\\Users\\dev")).toBe(true);
  });
  it("returns false for container paths", () => {
    expect(looksLikeHostPath("/workspace/repo")).toBe(false);
    expect(looksLikeHostPath("/paperclip/instances/default")).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// mapWorkspacePath
// ---------------------------------------------------------------------------

describe("mapWorkspacePath", () => {
  it("returns original when no map provided", () => {
    expect(mapWorkspacePath("/Users/dev/repo")).toBe("/Users/dev/repo");
    expect(mapWorkspacePath("/Users/dev/repo", null)).toBe("/Users/dev/repo");
  });

  it("applies prefix substitution", () => {
    const map = {
      "/Users/victorhugo/Documents/development/projects/Personal": "/workspace",
    };
    expect(
      mapWorkspacePath(
        "/Users/victorhugo/Documents/development/projects/Personal/cipherquant.ai.backend",
        map,
      ),
    ).toBe("/workspace/cipherquant.ai.backend");
  });

  it("longest prefix wins", () => {
    const map = {
      "/Users/victorhugo": "/home/vh",
      "/Users/victorhugo/Documents/development/projects/Personal": "/workspace",
    };
    expect(
      mapWorkspacePath(
        "/Users/victorhugo/Documents/development/projects/Personal/repo",
        map,
      ),
    ).toBe("/workspace/repo");
  });

  it("returns original when no prefix matches", () => {
    const map = { "/other": "/mapped" };
    expect(mapWorkspacePath("/Users/dev/repo", map)).toBe("/Users/dev/repo");
  });
});

// ---------------------------------------------------------------------------
// resolveExecutionWorkspace
// ---------------------------------------------------------------------------

describe("resolveExecutionWorkspace", () => {
  const existingPaths = new Set([
    "/workspace/cipherquant.ai.backend",
    "/workspace/cipherquant.ai.frontend",
    "/paperclip/instances/default/workspaces/abc",
    "/tmp/session-dir",
  ]);
  const mockExists = (p: string) => existingPaths.has(p);

  it("returns configured workspace when it exists", () => {
    expect(
      resolveExecutionWorkspace(
        {
          configuredWorkspace: "/workspace/cipherquant.ai.backend",
          allowFallbackWorkspace: false,
        },
        mockExists,
      ),
    ).toEqual({
      workspacePath: "/workspace/cipherquant.ai.backend",
      source: "configured",
      usedFallback: false,
    });
  });

  it("throws on host/macOS path when abortOnInvalidWorkspace=true", () => {
    expect(() =>
      resolveExecutionWorkspace(
        {
          configuredWorkspace:
            "/Users/victorhugo/Documents/development/projects/Personal/cipherquant.ai.backend",
          allowFallbackWorkspace: false,
          abortOnInvalidWorkspace: true,
        },
        mockExists,
      ),
    ).toThrow(/does not exist inside the Paperclip runtime container/);
  });

  it("error message includes host path hint", () => {
    expect(() =>
      resolveExecutionWorkspace(
        {
          configuredWorkspace: "/Users/victorhugo/dev/repo",
          abortOnInvalidWorkspace: true,
        },
        mockExists,
      ),
    ).toThrow(/looks like a host\/macOS path/);
  });

  it("applies workspacePathMap and returns mapped source", () => {
    expect(
      resolveExecutionWorkspace(
        {
          configuredWorkspace:
            "/Users/victorhugo/Documents/development/projects/Personal/cipherquant.ai.backend",
          workspacePathMap: {
            "/Users/victorhugo/Documents/development/projects/Personal":
              "/workspace",
          },
          allowFallbackWorkspace: false,
        },
        mockExists,
      ),
    ).toMatchObject({
      workspacePath: "/workspace/cipherquant.ai.backend",
      source: "mapped",
      usedFallback: false,
    });
  });

  it("falls back to prior-session workspace", () => {
    expect(
      resolveExecutionWorkspace(
        {
          configuredWorkspace: null,
          priorSessionWorkspace: "/tmp/session-dir",
          allowFallbackWorkspace: false,
        },
        mockExists,
      ),
    ).toMatchObject({
      workspacePath: "/tmp/session-dir",
      source: "prior-session",
      usedFallback: false,
    });
  });

  it("refuses fallback when allowFallbackWorkspace=false (default)", () => {
    expect(() =>
      resolveExecutionWorkspace(
        {
          configuredWorkspace: "/missing/path",
          fallbackWorkspace:
            "/paperclip/instances/default/workspaces/abc",
          allowFallbackWorkspace: false,
          abortOnInvalidWorkspace: false,
        },
        mockExists,
      ),
    ).toThrow(/Refusing to use fallback workspace/);
  });

  it("allows fallback when explicitly enabled", () => {
    expect(
      resolveExecutionWorkspace(
        {
          configuredWorkspace: "/missing/path",
          fallbackWorkspace:
            "/paperclip/instances/default/workspaces/abc",
          allowFallbackWorkspace: true,
          abortOnInvalidWorkspace: false,
        },
        mockExists,
      ),
    ).toMatchObject({
      source: "fallback",
      usedFallback: true,
    });
  });

  it("throws when no workspace can be resolved at all", () => {
    expect(() =>
      resolveExecutionWorkspace(
        {
          configuredWorkspace: null,
          priorSessionWorkspace: null,
          fallbackWorkspace: null,
          allowFallbackWorkspace: false,
        },
        mockExists,
      ),
    ).toThrow(/No valid execution workspace was resolved/);
  });

  it("defaults: allowFallbackWorkspace=false, abortOnInvalidWorkspace=true", () => {
    expect(() =>
      resolveExecutionWorkspace(
        { configuredWorkspace: "/missing" },
        mockExists,
      ),
    ).toThrow(/does not exist/);
  });
});

// ---------------------------------------------------------------------------
// readWorkspaceResolutionConfig
// ---------------------------------------------------------------------------

describe("readWorkspaceResolutionConfig", () => {
  it("returns safe defaults for undefined/null config", () => {
    expect(readWorkspaceResolutionConfig(undefined)).toEqual({
      allowFallbackWorkspace: false,
      abortOnInvalidWorkspace: true,
      workspacePathMap: null,
    });
    expect(readWorkspaceResolutionConfig(null)).toEqual({
      allowFallbackWorkspace: false,
      abortOnInvalidWorkspace: true,
      workspacePathMap: null,
    });
  });

  it("reads boolean flags", () => {
    const result = readWorkspaceResolutionConfig({
      allowFallbackWorkspace: true,
      abortOnInvalidWorkspace: false,
    });
    expect(result.allowFallbackWorkspace).toBe(true);
    expect(result.abortOnInvalidWorkspace).toBe(false);
  });

  it("reads workspacePathMap", () => {
    const result = readWorkspaceResolutionConfig({
      workspacePathMap: {
        "/Users/dev": "/workspace",
        invalidKey: 42, // non-string value should be filtered out
      },
    });
    expect(result.workspacePathMap).toEqual({ "/Users/dev": "/workspace" });
  });

  it("ignores non-object workspacePathMap", () => {
    expect(
      readWorkspaceResolutionConfig({ workspacePathMap: "not-an-object" })
        .workspacePathMap,
    ).toBeNull();
  });
});
