// @vitest-environment jsdom

import { act } from "react";
import { createRoot } from "react-dom/client";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import type { Agent } from "@paperclipai/shared";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  AgentConfigForm,
  readCheapProfileFromRuntimeConfig,
} from "./AgentConfigForm";
import { TooltipProvider } from "./ui/tooltip";

const mockAgentsApi = vi.hoisted(() => ({
  adapterModels: vi.fn(),
  adapterModelProfiles: vi.fn(),
  detectModel: vi.fn(),
  testEnvironment: vi.fn(),
  list: vi.fn(),
}));

const mockSecretsApi = vi.hoisted(() => ({
  list: vi.fn(),
  create: vi.fn(),
}));

const mockEnvironmentsApi = vi.hoisted(() => ({
  list: vi.fn(),
}));

const mockInstanceSettingsApi = vi.hoisted(() => ({
  getExperimental: vi.fn(),
}));

const mockAssetsApi = vi.hoisted(() => ({
  uploadImage: vi.fn(),
}));

vi.mock("../context/CompanyContext", () => ({
  useCompany: () => ({ selectedCompanyId: "company-1" }),
}));

vi.mock("../api/agents", () => ({
  agentsApi: mockAgentsApi,
}));

vi.mock("../api/secrets", () => ({
  secretsApi: mockSecretsApi,
}));

vi.mock("../api/environments", () => ({
  environmentsApi: mockEnvironmentsApi,
}));

vi.mock("../api/instanceSettings", () => ({
  instanceSettingsApi: mockInstanceSettingsApi,
}));

vi.mock("../api/assets", () => ({
  assetsApi: mockAssetsApi,
}));

vi.mock("./MarkdownEditor", () => ({
  MarkdownEditor: ({
    value,
    onChange,
    placeholder,
  }: {
    value: string;
    onChange: (value: string) => void;
    placeholder?: string;
  }) => (
    <textarea
      value={value}
      placeholder={placeholder}
      onChange={(event) => onChange(event.currentTarget.value)}
    />
  ),
}));

vi.mock("./PathInstructionsModal", () => ({
  ChoosePathButton: () => <button type="button">Choose path</button>,
}));

// eslint-disable-next-line @typescript-eslint/no-explicit-any
(globalThis as any).IS_REACT_ACT_ENVIRONMENT = true;

function makeAgent(overrides: Partial<Agent> = {}): Agent {
  return {
    id: "agent-1",
    companyId: "company-1",
    name: "Codex Agent",
    urlKey: "codex-agent",
    role: "engineer",
    title: null,
    icon: null,
    status: "active",
    reportsTo: null,
    capabilities: null,
    adapterType: "codex_local",
    adapterConfig: {
      model: "gpt-5.4",
      sessionPolicy: "resume",
    },
    runtimeConfig: {},
    budgetMonthlyCents: 0,
    spentMonthlyCents: 0,
    pauseReason: null,
    pausedAt: null,
    permissions: { canCreateAgents: false },
    lastHeartbeatAt: null,
    metadata: null,
    defaultEnvironmentId: null,
    createdAt: new Date("2026-01-01T00:00:00Z"),
    updatedAt: new Date("2026-01-01T00:00:00Z"),
    ...overrides,
  } as Agent;
}

function findSessionPolicySelect(): HTMLSelectElement {
  const select = Array.from(document.body.querySelectorAll("select"))
    .find((element) => Array.from(element.options).some((option) => option.value === "summarized"));
  expect(select).toBeTruthy();
  return select as HTMLSelectElement;
}

function renderForm(
  queryClient: QueryClient,
  agent: Agent,
  onSave: (patch: Record<string, unknown>) => void,
) {
  return (
    <QueryClientProvider client={queryClient}>
      <TooltipProvider>
        <AgentConfigForm mode="edit" agent={agent} onSave={onSave} />
      </TooltipProvider>
    </QueryClientProvider>
  );
}

async function flushReact() {
  await act(async () => {
    await Promise.resolve();
    await new Promise((resolve) => window.setTimeout(resolve, 0));
  });
}

describe("AgentConfigForm", () => {
  let container: HTMLDivElement;
  let root: ReturnType<typeof createRoot> | null;
  let queryClient: QueryClient;

  beforeEach(() => {
    container = document.createElement("div");
    document.body.appendChild(container);
    root = null;
    queryClient = new QueryClient({
      defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
    });

    mockAgentsApi.adapterModels.mockResolvedValue([]);
    mockAgentsApi.adapterModelProfiles.mockResolvedValue([]);
    mockAgentsApi.detectModel.mockResolvedValue({ model: null, candidates: [] });
    mockAgentsApi.testEnvironment.mockResolvedValue({ status: "pass", testedAt: new Date().toISOString(), checks: [] });
    mockAgentsApi.list.mockResolvedValue([]);
    mockSecretsApi.list.mockResolvedValue([]);
    mockEnvironmentsApi.list.mockResolvedValue([]);
    mockInstanceSettingsApi.getExperimental.mockResolvedValue({ enableEnvironments: false });
    mockAssetsApi.uploadImage.mockResolvedValue({ contentPath: "/assets/test.png" });
  });

  afterEach(async () => {
    const currentRoot = root;
    if (currentRoot) {
      await act(async () => {
        currentRoot.unmount();
      });
    }
    queryClient.clear();
    container.remove();
    document.body.innerHTML = "";
    vi.clearAllMocks();
  });

  it("keeps edit overlay values across same-agent refreshes before save", async () => {
    const onSave = vi.fn();
    const agent = makeAgent();
    const currentRoot = createRoot(container);
    root = currentRoot;

    await act(async () => {
      currentRoot.render(
        renderForm(queryClient, agent, onSave),
      );
    });
    await flushReact();

    const sessionPolicySelect = findSessionPolicySelect();
    await act(async () => {
      sessionPolicySelect.value = "fresh";
      sessionPolicySelect.dispatchEvent(new Event("change", { bubbles: true }));
    });
    await flushReact();

    await act(async () => {
      currentRoot.render(
        renderForm(queryClient, { ...agent }, onSave),
      );
    });
    await flushReact();

    expect(findSessionPolicySelect().value).toBe("fresh");

    const saveButton = Array.from(document.body.querySelectorAll("button"))
      .find((button) => button.textContent === "Save");
    expect(saveButton).toBeTruthy();

    await act(async () => {
      saveButton?.dispatchEvent(new MouseEvent("click", { bubbles: true }));
    });

    expect(onSave).toHaveBeenCalledWith(
      expect.objectContaining({
        adapterConfig: expect.objectContaining({ sessionPolicy: "fresh" }),
      }),
    );
  });

  it("treats a missing cheap profile as disabled instead of default-enabled", () => {
    expect(readCheapProfileFromRuntimeConfig({})).toEqual({
      enabled: false,
      model: "",
    });
  });
});
