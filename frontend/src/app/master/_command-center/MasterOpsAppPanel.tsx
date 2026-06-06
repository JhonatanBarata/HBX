"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import type { ReactNode } from "react";
import {
  checkoutPullRequest,
  getGitBranches,
  getGitChangedFiles,
  getGitCurrent,
  getGitLastCommit,
  getGitStatus,
  getLocalAgentBaseUrl,
  getLocalAgentCommands,
  getLocalAgentHealth,
  getLocalAgentRuns,
  getLocalAgentToken,
  getOpsControlBaseUrl,
  getOpsControlToken,
  getOpsOverview,
  runLocalAgentCommand,
  runOpsRadarAudit,
  runTestArea,
  saveLocalAgentConfig,
  saveOpsControlConfig,
  verifyProduction,
  type GitReadResult,
  type LocalAgentCommand,
  type LocalAgentHealth,
  type LocalAgentRun,
  type OpsOverview,
} from "./localAgentClient";
import styles from "./MasterCommandCenter.module.css";

export type MasterOpsPanelId = "morning" | "automations" | "git" | "tests" | "ops" | "deploy" | "support" | "config";

type MasterOpsAppPanelProps = {
  panel: MasterOpsPanelId;
  onOpenPanel: (panel: MasterOpsPanelId) => void;
};

type GitSnapshot = {
  current?: GitReadResult;
  status?: GitReadResult;
  branches?: GitReadResult;
  lastCommit?: GitReadResult;
  changedFiles?: GitReadResult;
};

const AUTOMATION_CARDS = [
  {
    id: "night-factory",
    title: "Night Factory",
    status: "manual-first",
    detail: "Status real quando a API estiver ligada; ações críticas ficam travadas.",
    actions: ["Status", "Rodar agora", "Pausar", "Ativar"],
  },
  {
    id: "codex-queue",
    title: "Codex Queue Runner",
    status: "manual",
    detail: "Executa `npm run codex:next` e deixa o bloco em revisão.",
    actions: ["Mostrar fila", "Próxima tarefa"],
  },
  {
    id: "ops-health",
    title: "Ops Health Watcher",
    status: "leitura",
    detail: "Consulta Ops Control para VPS, local, containers e Radar Audit.",
    actions: ["Atualizar Ops", "Auditar Radar"],
  },
  {
    id: "support-classifier",
    title: "Support Bot Classifier",
    status: "planejado",
    detail: "Classifica tickets e manda auth/billing/plans para HOLD humano.",
    actions: ["Classificar", "Encaminhar humano"],
  },
];

const HOLD_ITEMS = ["auth", "billing", "plans", "secrets", "migrations", "deploy", "dados sensíveis"];

function trimOutput(value?: string) {
  const normalized = String(value || "").trim();
  if (!normalized) return "Sem saída.";
  return normalized.length > 2200 ? `${normalized.slice(0, 2200)}\n...` : normalized;
}

function statusTone(value?: string | null): "good" | "warn" | "danger" | "neutral" {
  if (!value) return "neutral";
  if (["passed", "ok", "healthy", "online"].includes(value)) return "good";
  if (["running", "manual", "manual-first", "leitura", "planejado"].includes(value)) return "warn";
  if (["failed", "offline", "erro"].includes(value)) return "danger";
  return "neutral";
}

function detectTestAreas(filesOutput?: string) {
  const files = String(filesOutput || "")
    .split(/\r?\n/)
    .map((item) => item.trim())
    .filter(Boolean);
  const areas = new Set<string>();
  const hold = files.some((file) => /(^|\/)(\.env|secrets|migrations|auth|billing|commercial-plans|deploy|docker-compose|scripts\/ops)/i.test(file));
  for (const file of files) {
    if (file.startsWith("frontend/")) areas.add("frontend");
    if (file.startsWith("backend/")) areas.add("backend");
    if (file.startsWith("Webwhats/")) areas.add("webwhats");
    if (file.startsWith("tests/e2e/")) areas.add("e2e");
  }
  return {
    files,
    areas: Array.from(areas),
    hold,
  };
}

export default function MasterOpsAppPanel({ panel, onOpenPanel }: MasterOpsAppPanelProps) {
  const [agentHealth, setAgentHealth] = useState<LocalAgentHealth | null>(null);
  const [commands, setCommands] = useState<LocalAgentCommand[]>([]);
  const [runs, setRuns] = useState<LocalAgentRun[]>([]);
  const [git, setGit] = useState<GitSnapshot>({});
  const [opsOverview, setOpsOverview] = useState<OpsOverview | null>(null);
  const [message, setMessage] = useState<string>("");
  const [busy, setBusy] = useState<string | null>(null);
  const [prNumber, setPrNumber] = useState("");
  const [agentToken, setAgentToken] = useState(() => getLocalAgentToken());
  const [agentUrl, setAgentUrl] = useState(() => getLocalAgentBaseUrl());
  const [opsToken, setOpsToken] = useState(() => getOpsControlToken());
  const [opsUrl, setOpsUrl] = useState(() => getOpsControlBaseUrl());
  const [auditResult, setAuditResult] = useState<string>("");

  const loadAgent = useCallback(async () => {
    const [healthResult, commandsResult, runsResult] = await Promise.all([
      getLocalAgentHealth(),
      getLocalAgentCommands(),
      getLocalAgentRuns(),
    ]);
    setAgentHealth(healthResult.ok ? healthResult.data || null : null);
    setCommands(commandsResult.ok ? commandsResult.data?.commands || [] : []);
    setRuns(runsResult.ok ? runsResult.data?.runs || [] : []);
    if (!healthResult.ok) setMessage(healthResult.error || "Local Agent offline.");
  }, []);

  const loadGit = useCallback(async () => {
    const [current, status, branches, lastCommit, changedFiles] = await Promise.all([
      getGitCurrent(),
      getGitStatus(),
      getGitBranches(),
      getGitLastCommit(),
      getGitChangedFiles(),
    ]);
    setGit({
      current: current.data?.result,
      status: status.data?.result,
      branches: branches.data?.result,
      lastCommit: lastCommit.data?.result,
      changedFiles: changedFiles.data?.result,
    });
    if (!current.ok) setMessage(current.error || "Git indisponível pelo Local Agent.");
  }, []);

  const loadOps = useCallback(async () => {
    const result = await getOpsOverview();
    setOpsOverview(result.ok ? result.data || null : null);
    if (!result.ok) setMessage(result.error || "Ops Control offline.");
  }, []);

  const refreshAll = useCallback(async () => {
    setMessage("");
    await Promise.all([loadAgent(), loadGit(), loadOps()]);
  }, [loadAgent, loadGit, loadOps]);

  useEffect(() => {
    const timer = window.setTimeout(() => {
      void refreshAll();
    }, 0);
    return () => window.clearTimeout(timer);
  }, [refreshAll]);

  const latestRun = runs[0] || null;
  const workspaceDirty = Boolean(git.status?.stdout.trim());
  const currentBranch = git.current?.stdout.trim() || "-";
  const lastCommitLines = useMemo(() => trimOutput(git.lastCommit?.stdout).split(/\r?\n/), [git.lastCommit?.stdout]);
  const changedFilePlan = useMemo(() => detectTestAreas(git.changedFiles?.stdout), [git.changedFiles?.stdout]);

  async function runCommand(commandId: string, confirm = false) {
    setBusy(commandId);
    setMessage("");
    const result = await runLocalAgentCommand(commandId, confirm);
    setBusy(null);
    setMessage(result.ok ? `Execução iniciada: ${result.data?.run.label}` : result.error || "Falha ao iniciar comando.");
    await loadAgent();
  }

  async function runTest(area: "frontend" | "backend" | "webwhats" | "e2e") {
    setBusy(`test-${area}`);
    setMessage("");
    const result = await runTestArea(area);
    setBusy(null);
    setMessage(result.ok ? `Pacote de testes iniciado: ${area}` : result.error || "Falha ao iniciar testes.");
    await loadAgent();
  }

  async function checkoutPr() {
    const parsed = Number(prNumber);
    if (!Number.isInteger(parsed) || parsed <= 0) {
      setMessage("Informe um número de PR válido.");
      return;
    }
    setBusy("checkout-pr");
    const result = await checkoutPullRequest(parsed);
    setBusy(null);
    setMessage(result.ok ? `Checkout do PR ${parsed} iniciado.` : result.error || "Falha ao baixar PR.");
    await Promise.all([loadAgent(), loadGit()]);
  }

  async function runVerifyProd() {
    setBusy("verify-prod");
    const result = await verifyProduction();
    setBusy(null);
    setMessage(result.ok ? "Verificação de produção iniciada." : result.error || "Falha ao verificar produção.");
    await loadAgent();
  }

  async function runAudit(target: "vps" | "localhost") {
    setBusy(`audit-${target}`);
    const result = await runOpsRadarAudit(target);
    setBusy(null);
    setAuditResult(result.ok ? JSON.stringify(result.data, null, 2) : result.error || "Falha no Radar Audit.");
  }

  function saveConfig() {
    saveLocalAgentConfig({ token: agentToken, url: agentUrl });
    saveOpsControlConfig({ token: opsToken, url: opsUrl });
    setMessage("Configuração local salva.");
    void refreshAll();
  }

  const safeCommands = commands.filter((command) => ["up", "down", "frontend-lint", "frontend-build"].includes(command.id));

  if (panel === "morning") {
    return (
      <OpsSurface title="Morning Desk" eyebrow="HBX Master" action={<OpsButton onClick={refreshAll}>Atualizar</OpsButton>}>
        <div className={styles.opsMetricGrid}>
          <MetricCard label="Local Agent" value={agentHealth ? "Online" : "Offline"} tone={agentHealth ? "good" : "danger"} />
          <MetricCard label="Branch" value={currentBranch} tone={workspaceDirty ? "warn" : "good"} />
          <MetricCard label="Workspace" value={workspaceDirty ? "Sujo" : "Limpo"} tone={workspaceDirty ? "warn" : "good"} />
          <MetricCard label="Último teste" value={latestRun ? latestRun.status : "Sem execução"} tone={statusTone(latestRun?.status)} />
        </div>
        <div className={styles.opsGrid}>
          <OpsCard title="Próximo passo recomendado" tone={workspaceDirty ? "warn" : "good"}>
            <p>{workspaceDirty ? "Revise alterações locais antes de baixar PR ou rodar fluxo automático." : "Baixar PR, rodar testes por área e registrar resultado no Morning Desk."}</p>
            <div className={styles.opsButtonRow}>
              <OpsButton onClick={() => onOpenPanel("git")}>Abrir Git</OpsButton>
              <OpsButton onClick={() => onOpenPanel("tests")} variant="secondary">Abrir Testes</OpsButton>
              <OpsButton onClick={() => onOpenPanel("automations")} variant="secondary">Abrir Autos</OpsButton>
            </div>
          </OpsCard>
          <OpsCard title="HOLDs aguardando dono" tone="warn">
            <TagList items={HOLD_ITEMS} />
          </OpsCard>
          <OpsCard title="Clientes aguardando retorno" tone="neutral">
            <p>Support Ops está preparado para classificar, mas persistência de tickets fica para a próxima fase de banco.</p>
          </OpsCard>
        </div>
        <MessageLine message={message} />
      </OpsSurface>
    );
  }

  if (panel === "automations") {
    return (
      <OpsSurface title="Automatizadores" eyebrow="HBX Master" action={<OpsButton onClick={loadAgent}>Atualizar agent</OpsButton>}>
        <div className={styles.opsGrid}>
          {AUTOMATION_CARDS.map((item) => (
            <OpsCard key={item.id} title={item.title} tone={statusTone(item.status)}>
              <StatusPill tone={statusTone(item.status)}>{item.status}</StatusPill>
              <p>{item.detail}</p>
              <TagList items={item.actions} />
            </OpsCard>
          ))}
        </div>
        <OpsCard title="Comandos locais seguros" tone={agentHealth ? "good" : "warn"}>
          <div className={styles.opsButtonRow}>
            {safeCommands.map((command) => (
              <OpsButton key={command.id} onClick={() => void runCommand(command.id, command.confirm)} disabled={busy === command.id}>
                {busy === command.id ? "Rodando" : command.label}
              </OpsButton>
            ))}
            {!safeCommands.length ? <span className={styles.opsMuted}>Configure o token local para listar comandos.</span> : null}
          </div>
        </OpsCard>
        <MessageLine message={message} />
      </OpsSurface>
    );
  }

  if (panel === "git") {
    return (
      <OpsSurface title="Git / PR" eyebrow="Somente seguro" action={<OpsButton onClick={loadGit}>Atualizar Git</OpsButton>}>
        <div className={styles.opsGrid}>
          <OpsCard title="Branch atual" tone={workspaceDirty ? "warn" : "good"}>
            <strong className={styles.opsValue}>{currentBranch}</strong>
            <p>{workspaceDirty ? "Workspace sujo: checkout de PR fica bloqueado." : "Workspace limpo para baixar PR."}</p>
          </OpsCard>
          <OpsCard title="Último commit" tone="neutral">
            <pre className={styles.opsPre}>{lastCommitLines.slice(0, 3).join("\n")}</pre>
          </OpsCard>
        </div>
        <div className={styles.opsSplit}>
          <OpsCard title="Status curto" tone={workspaceDirty ? "warn" : "good"}>
            <pre className={styles.opsPre}>{trimOutput(git.status?.stdout)}</pre>
          </OpsCard>
          <OpsCard title="Baixar PR" tone="warn">
            <label className={styles.opsField}>
              <span>Número do PR</span>
              <input value={prNumber} onChange={(event) => setPrNumber(event.target.value)} inputMode="numeric" placeholder="128" />
            </label>
            <OpsButton onClick={checkoutPr} disabled={busy === "checkout-pr" || workspaceDirty}>
              {busy === "checkout-pr" ? "Baixando" : "Baixar PR"}
            </OpsButton>
          </OpsCard>
        </div>
        <OpsCard title="Branches" tone="neutral">
          <pre className={styles.opsPre}>{trimOutput(git.branches?.stdout)}</pre>
        </OpsCard>
        <OpsCard title="Arquivos alterados e testes sugeridos" tone={changedFilePlan.hold ? "danger" : changedFilePlan.areas.length ? "warn" : "neutral"}>
          {changedFilePlan.files.length ? <pre className={styles.opsPre}>{changedFilePlan.files.join("\n")}</pre> : <span className={styles.opsMuted}>Sem diff contra master ou branch equivalente.</span>}
          <div className={styles.opsTags}>
            {changedFilePlan.hold ? <span>HOLD</span> : null}
            {changedFilePlan.areas.map((area) => <span key={area}>{area}</span>)}
            {!changedFilePlan.areas.length && !changedFilePlan.hold ? <span>sem teste detectado</span> : null}
          </div>
        </OpsCard>
        <MessageLine message={message} />
      </OpsSurface>
    );
  }

  if (panel === "tests") {
    return (
      <OpsSurface title="Testes" eyebrow="Allowlist local" action={<OpsButton onClick={loadAgent}>Atualizar execuções</OpsButton>}>
        <div className={styles.opsGrid}>
          {[
            ["frontend", "Frontend", "Lint + build"],
            ["backend", "Backend", "Prisma validate + build"],
            ["webwhats", "Webwhats", "Typecheck + build"],
            ["e2e", "E2E", "Playwright"],
          ].map(([area, title, detail]) => (
            <OpsCard key={area} title={title} tone="neutral">
              <p>{detail}</p>
              <OpsButton onClick={() => void runTest(area as "frontend" | "backend" | "webwhats" | "e2e")} disabled={busy === `test-${area}`}>
                {busy === `test-${area}` ? "Rodando" : "Rodar pacote"}
              </OpsButton>
            </OpsCard>
          ))}
        </div>
        <OpsCard title="Últimas execuções" tone={statusTone(latestRun?.status)}>
          <RunList runs={runs} />
        </OpsCard>
        <MessageLine message={message} />
      </OpsSurface>
    );
  }

  if (panel === "ops") {
    return (
      <OpsSurface title="Ops Control" eyebrow="Leitura primeiro" action={<OpsButton onClick={loadOps}>Atualizar Ops</OpsButton>}>
        <div className={styles.opsGrid}>
          <OpsCard title="Status" tone={opsOverview ? "good" : "warn"}>
            <pre className={styles.opsPre}>{opsOverview ? JSON.stringify(opsOverview, null, 2).slice(0, 1200) : "Ops Control offline ou token ausente."}</pre>
          </OpsCard>
          <OpsCard title="Radar Audit" tone="warn">
            <div className={styles.opsButtonRow}>
              <OpsButton onClick={() => void runAudit("vps")} disabled={busy === "audit-vps"}>Auditar VPS</OpsButton>
              <OpsButton onClick={() => void runAudit("localhost")} disabled={busy === "audit-localhost"} variant="secondary">Auditar localhost</OpsButton>
            </div>
            <pre className={styles.opsPre}>{auditResult || "Sem auditoria rodada nesta sessão."}</pre>
          </OpsCard>
        </div>
        <MessageLine message={message} />
      </OpsSurface>
    );
  }

  if (panel === "deploy") {
    return (
      <OpsSurface title="Deploy Control" eyebrow="Produção travada" action={<OpsButton onClick={loadGit}>Atualizar Git</OpsButton>}>
        <div className={styles.opsGrid}>
          <OpsCard title="Verificar produção" tone="warn">
            <p>Executa apenas `npm run verify:prod` pelo Local Agent com confirmação local.</p>
            <OpsButton onClick={runVerifyProd} disabled={busy === "verify-prod"}>
              {busy === "verify-prod" ? "Verificando" : "Verificar produção"}
            </OpsButton>
          </OpsCard>
          <OpsCard title="Publicação" tone="danger">
            <p>Deploy seletivo e deploy normal ficam desabilitados nesta fase. `new`, `publish` e `force` não existem no Local Agent.</p>
            <div className={styles.opsButtonRow}>
              <OpsButton disabled>Deploy seletivo</OpsButton>
              <OpsButton disabled>Deploy normal</OpsButton>
            </div>
          </OpsCard>
        </div>
        <MessageLine message={message} />
      </OpsSurface>
    );
  }

  if (panel === "support") {
    return (
      <OpsSurface title="Support Ops" eyebrow="Classificação segura">
        <div className={styles.opsGrid}>
          <OpsCard title="Entradas" tone="neutral">
            <TagList items={["Webwhats", "Chat HBX", "Reportar problema", "Vendedor interno"]} />
          </OpsCard>
          <OpsCard title="Classificações HOLD" tone="warn">
            <TagList items={["COMMERCIAL_ACCESS", "AUTH_SECURITY", "BUG_RISKY", "NEEDS_HUMAN"]} />
          </OpsCard>
          <OpsCard title="Codex PR Worker" tone="warn">
            <p>Somente BUG_SAFE vira tarefa Codex. Auth, billing, plans, secrets, migrations e deploy ficam bloqueados.</p>
          </OpsCard>
        </div>
      </OpsSurface>
    );
  }

  return (
    <OpsSurface title="Config" eyebrow="Tokens locais" action={<OpsButton onClick={saveConfig}>Salvar</OpsButton>}>
      <div className={styles.opsSplit}>
        <OpsCard title="Local Agent" tone={agentHealth ? "good" : "warn"}>
          <label className={styles.opsField}>
            <span>URL</span>
            <input value={agentUrl} onChange={(event) => setAgentUrl(event.target.value)} />
          </label>
          <label className={styles.opsField}>
            <span>Token local</span>
            <input value={agentToken} onChange={(event) => setAgentToken(event.target.value)} type="password" />
          </label>
          <OpsButton onClick={loadAgent}>Testar Local Agent</OpsButton>
        </OpsCard>
        <OpsCard title="Ops Control" tone={opsOverview ? "good" : "warn"}>
          <label className={styles.opsField}>
            <span>URL</span>
            <input value={opsUrl} onChange={(event) => setOpsUrl(event.target.value)} />
          </label>
          <label className={styles.opsField}>
            <span>Token local</span>
            <input value={opsToken} onChange={(event) => setOpsToken(event.target.value)} type="password" />
          </label>
          <OpsButton onClick={loadOps}>Testar Ops Control</OpsButton>
        </OpsCard>
      </div>
      <MessageLine message={message} />
    </OpsSurface>
  );
}

function OpsSurface({ eyebrow, title, action, children }: { eyebrow: string; title: string; action?: ReactNode; children: ReactNode }) {
  return (
    <section className={`${styles.primaryWorkspace} ${styles.opsWorkspace} hbx-page-mobile-enter`}>
      <div className={styles.opsHeader}>
        <div>
          <span>{eyebrow}</span>
          <h3>{title}</h3>
        </div>
        {action ? <div className={styles.opsHeaderAction}>{action}</div> : null}
      </div>
      {children}
    </section>
  );
}

function OpsCard({ title, tone, children }: { title: string; tone: "good" | "warn" | "danger" | "neutral"; children: ReactNode }) {
  return (
    <article className={styles.opsCard} data-tone={tone}>
      <h4>{title}</h4>
      {children}
    </article>
  );
}

function MetricCard({ label, value, tone }: { label: string; value: string; tone: "good" | "warn" | "danger" | "neutral" }) {
  return (
    <article className={styles.opsMetric} data-tone={tone}>
      <span>{label}</span>
      <strong>{value}</strong>
    </article>
  );
}

function StatusPill({ tone, children }: { tone: "good" | "warn" | "danger" | "neutral"; children: ReactNode }) {
  return <span className={styles.opsPill} data-tone={tone}>{children}</span>;
}

function TagList({ items }: { items: string[] }) {
  return (
    <div className={styles.opsTags}>
      {items.map((item) => <span key={item}>{item}</span>)}
    </div>
  );
}

function RunList({ runs }: { runs: LocalAgentRun[] }) {
  if (!runs.length) return <span className={styles.opsMuted}>Sem execuções nesta sessão do Local Agent.</span>;
  return (
    <div className={styles.opsRunList}>
      {runs.slice(0, 8).map((run) => (
        <div key={run.id} className={styles.opsRun}>
          <strong>{run.label}</strong>
          <StatusPill tone={statusTone(run.status)}>{run.status}</StatusPill>
          <span>{run.logPath}</span>
        </div>
      ))}
    </div>
  );
}

function OpsButton({ children, disabled, variant = "primary", onClick }: { children: ReactNode; disabled?: boolean; variant?: "primary" | "secondary"; onClick?: () => void }) {
  return (
    <button type="button" className={styles.actionButton} data-variant={variant === "secondary" ? "secondary" : "primary"} disabled={disabled} onClick={onClick}>
      {children}
    </button>
  );
}

function MessageLine({ message }: { message: string }) {
  if (!message) return null;
  return <div className={styles.alertInfo}>{message}</div>;
}
