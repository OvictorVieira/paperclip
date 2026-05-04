export type SessionPolicy = "resume" | "fresh" | "summarized";

export function getSessionPolicy(adapterConfig: unknown): SessionPolicy {
  const record =
    typeof adapterConfig === "object" && adapterConfig !== null && !Array.isArray(adapterConfig)
      ? adapterConfig as Record<string, unknown>
      : {};
  const policy = record.sessionPolicy;
  if (policy === "fresh" || policy === "summarized" || policy === "resume") {
    return policy;
  }
  return "resume";
}

export function shouldResumeSession(adapterConfig: unknown): boolean {
  return getSessionPolicy(adapterConfig) === "resume";
}

export function shouldPersistSession(adapterConfig: unknown): boolean {
  return getSessionPolicy(adapterConfig) === "resume";
}

export function shouldInjectSummary(adapterConfig: unknown): boolean {
  return getSessionPolicy(adapterConfig) === "summarized";
}
