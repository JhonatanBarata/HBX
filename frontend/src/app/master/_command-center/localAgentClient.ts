"use client";

export type LocalAgentResult<T> = {
  ok: boolean;
  data?: T;
  error?: string;
};

export type LocalAgentCommand = {
  id: string;
  label: string;
  command: string[];
  risk: "low" | "medium" | "high";
  confirm: boolean;
};

export type LocalAgentRun = {
  id: string;
  commandId: string;
  label: string;
  status: "running" | "passed" | "failed";
  startedAt: string;
  finishedAt: string | null;
  exitCode: number | null;
  logPath: string;
  commands?: string[];
};

export type LocalAgentHealth = {
  ok: boolean;
  app: string;
  host: string;
  port: number;
  cwd: string;
  commands: number;
  runs: number;
  now: string;
};

export type GitReadResult = {
  command: string;
  exitCode: number;
  stdout: string;
  stderr: string;
  ok: boolean;
};

export type OpsOverview = {
  ok?: boolean;
  status?: string;
  cpu?: unknown;
  memory?: unknown;
  disk?: unknown;
  containers?: unknown;
  [key: string]: unknown;
};

const DEFAULT_AGENT_URL = "http://127.0.0.1:3107";
const DEFAULT_OPS_URL = "http://127.0.0.1:3099";

function storageValue(key: string, fallback = "") {
  if (typeof window === "undefined") return fallback;
  return window.localStorage.getItem(key) || fallback;
}

export function getLocalAgentBaseUrl() {
  return storageValue("hbx_master_local_agent_url", DEFAULT_AGENT_URL).replace(/\/$/, "");
}

export function getOpsControlBaseUrl() {
  return storageValue("hbx_ops_control_url", DEFAULT_OPS_URL).replace(/\/$/, "");
}

export function getLocalAgentToken() {
  return storageValue("hbx_master_local_token", "");
}

export function getOpsControlToken() {
  return storageValue("hbx_ops_control_token", "");
}

export function saveLocalAgentConfig(input: { token?: string; url?: string }) {
  if (typeof window === "undefined") return;
  if (input.token !== undefined) window.localStorage.setItem("hbx_master_local_token", input.token.trim());
  if (input.url !== undefined) window.localStorage.setItem("hbx_master_local_agent_url", input.url.trim() || DEFAULT_AGENT_URL);
}

export function saveOpsControlConfig(input: { token?: string; url?: string }) {
  if (typeof window === "undefined") return;
  if (input.token !== undefined) window.localStorage.setItem("hbx_ops_control_token", input.token.trim());
  if (input.url !== undefined) window.localStorage.setItem("hbx_ops_control_url", input.url.trim() || DEFAULT_OPS_URL);
}

async function requestJson<T>(url: string, init: RequestInit, missingTokenMessage: string): Promise<LocalAgentResult<T>> {
  const token = String(init.headers && "Authorization" in init.headers ? init.headers.Authorization : "").replace(/^Bearer\s+/i, "");
  if (!token) return { ok: false, error: missingTokenMessage };
  try {
    const response = await fetch(url, init);
    const data = await response.json().catch(() => ({}));
    if (!response.ok || data?.ok === false) {
      return { ok: false, data, error: data?.error || `Falha local HTTP ${response.status}.` };
    }
    return { ok: true, data };
  } catch {
    return { ok: false, error: "Servico local offline ou inacessivel." };
  }
}

function agentHeaders() {
  return {
    Authorization: `Bearer ${getLocalAgentToken()}`,
    "Content-Type": "application/json",
  };
}

function opsHeaders() {
  return {
    Authorization: `Bearer ${getOpsControlToken()}`,
    "Content-Type": "application/json",
  };
}

export function getLocalAgentHealth() {
  return requestJson<LocalAgentHealth>(`${getLocalAgentBaseUrl()}/health`, { headers: agentHeaders() }, "Configure o token local do HBX Master.");
}

export function getLocalAgentCommands() {
  return requestJson<{ commands: LocalAgentCommand[] }>(`${getLocalAgentBaseUrl()}/commands`, { headers: agentHeaders() }, "Configure o token local do HBX Master.");
}

export function getLocalAgentRuns() {
  return requestJson<{ runs: LocalAgentRun[] }>(`${getLocalAgentBaseUrl()}/runs`, { headers: agentHeaders() }, "Configure o token local do HBX Master.");
}

export function getLocalAgentRun(runId: string) {
  return requestJson<{ run: LocalAgentRun; log: string }>(`${getLocalAgentBaseUrl()}/runs/${encodeURIComponent(runId)}`, { headers: agentHeaders() }, "Configure o token local do HBX Master.");
}

export function runLocalAgentCommand(commandId: string, confirm = false) {
  return requestJson<{ run: LocalAgentRun }>(
    `${getLocalAgentBaseUrl()}/commands/${encodeURIComponent(commandId)}/run`,
    {
      method: "POST",
      headers: agentHeaders(),
      body: JSON.stringify(confirm ? { confirm: true, confirmation: "CONFIRMAR" } : {}),
    },
    "Configure o token local do HBX Master.",
  );
}

export function getGitStatus() {
  return requestJson<{ result: GitReadResult }>(`${getLocalAgentBaseUrl()}/git/status`, { headers: agentHeaders() }, "Configure o token local do HBX Master.");
}

export function getGitBranches() {
  return requestJson<{ result: GitReadResult }>(`${getLocalAgentBaseUrl()}/git/branches`, { headers: agentHeaders() }, "Configure o token local do HBX Master.");
}

export function getGitCurrent() {
  return requestJson<{ result: GitReadResult }>(`${getLocalAgentBaseUrl()}/git/current`, { headers: agentHeaders() }, "Configure o token local do HBX Master.");
}

export function getGitLastCommit() {
  return requestJson<{ result: GitReadResult }>(`${getLocalAgentBaseUrl()}/git/last-commit`, { headers: agentHeaders() }, "Configure o token local do HBX Master.");
}

export function getGitChangedFiles() {
  return requestJson<{ result: GitReadResult }>(`${getLocalAgentBaseUrl()}/git/changed-files`, { headers: agentHeaders() }, "Configure o token local do HBX Master.");
}

export function checkoutPullRequest(prNumber: number) {
  return requestJson<{ run: LocalAgentRun }>(
    `${getLocalAgentBaseUrl()}/git/checkout-pr`,
    {
      method: "POST",
      headers: agentHeaders(),
      body: JSON.stringify({ prNumber }),
    },
    "Configure o token local do HBX Master.",
  );
}

export function runTestArea(area: "frontend" | "backend" | "webwhats" | "e2e") {
  return requestJson<{ run: LocalAgentRun }>(
    `${getLocalAgentBaseUrl()}/test/${area}`,
    { method: "POST", headers: agentHeaders(), body: "{}" },
    "Configure o token local do HBX Master.",
  );
}

export function verifyProduction() {
  return requestJson<{ run: LocalAgentRun }>(
    `${getLocalAgentBaseUrl()}/deploy/verify-prod`,
    { method: "POST", headers: agentHeaders(), body: JSON.stringify({ confirm: true, confirmation: "CONFIRMAR" }) },
    "Configure o token local do HBX Master.",
  );
}

async function opsGet<T>(path: string) {
  return requestJson<T>(`${getOpsControlBaseUrl()}${path}`, { headers: opsHeaders() }, "Configure o token local do Ops Control.");
}

export function getOpsOverview() {
  return opsGet<OpsOverview>("/api/overview");
}

export function runOpsRadarAudit(target: "vps" | "localhost") {
  return opsGet<unknown>(`/api/radar-audit/${target}`);
}
