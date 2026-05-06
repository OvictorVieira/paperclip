import fs from "node:fs";

// ---------------------------------------------------------------------------
// Workspace resolution helpers for Paperclip adapter execution
//
// Prevents silent fallback to agent-home workspaces that contain stale
// handoff files, old logs, and unrelated context — which causes context
// and token explosion.
// ---------------------------------------------------------------------------

export type ResolveExecutionWorkspaceInput = {
  configuredWorkspace?: string | null;
  priorSessionWorkspace?: string | null;
  fallbackWorkspace?: string | null;
  allowFallbackWorkspace?: boolean;
  abortOnInvalidWorkspace?: boolean;
  workspacePathMap?: Record<string, string> | null;
};

export type ResolveExecutionWorkspaceResult = {
  workspacePath: string;
  source: "configured" | "mapped" | "prior-session" | "fallback";
  usedFallback: boolean;
};

/** Detects macOS / host-only paths that cannot exist inside containers. */
export function looksLikeHostPath(value: string): boolean {
  return (
    value.startsWith("/Users/") ||
    value.startsWith("/Volumes/") ||
    value.startsWith("C:\\") ||
    value.startsWith("D:\\")
  );
}

/**
 * Applies `workspacePathMap` prefix substitution.
 * Longest-prefix-first matching ensures more specific mappings win.
 */
export function mapWorkspacePath(
  original: string,
  workspacePathMap?: Record<string, string> | null,
): string {
  if (!workspacePathMap) return original;

  // Sort by prefix length descending so longest match wins.
  const entries = Object.entries(workspacePathMap).sort(
    (a, b) => b[0].length - a[0].length,
  );

  for (const [hostPrefix, containerPrefix] of entries) {
    if (original.startsWith(hostPrefix)) {
      return containerPrefix + original.slice(hostPrefix.length);
    }
  }

  return original;
}

function pathExists(value: string): boolean {
  try {
    return fs.existsSync(value);
  } catch {
    return false;
  }
}

/**
 * Resolves the execution workspace for an adapter run.
 *
 * Resolution order:
 * 1. Configured workspace (direct or mapped via `workspacePathMap`)
 * 2. Prior session workspace
 * 3. Fallback workspace (only when `allowFallbackWorkspace` is true)
 *
 * Throws when no valid workspace can be resolved.
 *
 * @param pathExistsFn - injectable for testing (defaults to `fs.existsSync`)
 */
export function resolveExecutionWorkspace(
  input: ResolveExecutionWorkspaceInput,
  pathExistsFn: (p: string) => boolean = pathExists,
): ResolveExecutionWorkspaceResult {
  // allowFallbackWorkspace=false only blocks fallback when a configured workspace
  // was provided but invalid. When no workspace is configured at all, the fallback
  // is permitted unconditionally (there is nothing to "silently override").
  const allowFallback = input.allowFallbackWorkspace ?? false;
  const abortOnInvalid = input.abortOnInvalidWorkspace ?? true;
  const hadConfiguredWorkspace = Boolean(input.configuredWorkspace);

  // --- 1. Configured workspace -----------------------------------------
  if (input.configuredWorkspace) {
    const mapped = mapWorkspacePath(input.configuredWorkspace, input.workspacePathMap);

    if (pathExistsFn(mapped)) {
      return {
        workspacePath: mapped,
        source: mapped === input.configuredWorkspace ? "configured" : "mapped",
        usedFallback: false,
      };
    }

    if (abortOnInvalid) {
      const hint = looksLikeHostPath(input.configuredWorkspace)
        ? "\nThe configured path looks like a host/macOS path. Agents run inside the Paperclip container. Use /workspace/<repo> or configure workspacePathMap."
        : "";

      throw new Error(
        [
          "Configured project workspace path does not exist inside the Paperclip runtime container.",
          "",
          `Configured path: ${input.configuredWorkspace}`,
          mapped !== input.configuredWorkspace
            ? `Mapped path: ${mapped}`
            : undefined,
          hint,
        ]
          .filter(Boolean)
          .join("\n"),
      );
    }
  }

  // --- 2. Prior session workspace ---------------------------------------
  if (input.priorSessionWorkspace && pathExistsFn(input.priorSessionWorkspace)) {
    return {
      workspacePath: input.priorSessionWorkspace,
      source: "prior-session",
      usedFallback: false,
    };
  }

  // --- 3. Fallback workspace -------------------------------------------
  // Blocked by allowFallbackWorkspace=false only when a configured workspace
  // was explicitly provided (and was invalid). When no workspace was configured
  // at all, we allow the fallback unconditionally — there is no misconfiguration
  // to protect against.
  const fallbackAllowed = allowFallback || !hadConfiguredWorkspace;
  if (fallbackAllowed && input.fallbackWorkspace && pathExistsFn(input.fallbackWorkspace)) {
    return {
      workspacePath: input.fallbackWorkspace,
      source: "fallback",
      usedFallback: true,
    };
  }

  throw new Error(
    [
      "No valid execution workspace was resolved.",
      allowFallback || !hadConfiguredWorkspace
        ? "Fallback workspace path does not exist."
        : "Refusing to use fallback workspace because allowFallbackWorkspace=false.",
      "Configure a valid project workspace path inside the container.",
    ].join("\n"),
  );
}

/** Reads `allowFallbackWorkspace`, `abortOnInvalidWorkspace`, `workspacePathMap` from adapter config. */
export function readWorkspaceResolutionConfig(adapterConfig: unknown): {
  allowFallbackWorkspace: boolean;
  abortOnInvalidWorkspace: boolean;
  workspacePathMap: Record<string, string> | null;
} {
  const config = (typeof adapterConfig === "object" && adapterConfig !== null ? adapterConfig : {}) as Record<
    string,
    unknown
  >;
  const allowFallbackWorkspace =
    typeof config.allowFallbackWorkspace === "boolean" ? config.allowFallbackWorkspace : false;
  const abortOnInvalidWorkspace =
    typeof config.abortOnInvalidWorkspace === "boolean" ? config.abortOnInvalidWorkspace : true;

  let workspacePathMap: Record<string, string> | null = null;
  if (typeof config.workspacePathMap === "object" && config.workspacePathMap !== null) {
    const raw = config.workspacePathMap as Record<string, unknown>;
    const entries = Object.entries(raw).filter(
      (entry): entry is [string, string] =>
        typeof entry[0] === "string" && typeof entry[1] === "string",
    );
    if (entries.length > 0) {
      workspacePathMap = Object.fromEntries(entries);
    }
  }

  return { allowFallbackWorkspace, abortOnInvalidWorkspace, workspacePathMap };
}
