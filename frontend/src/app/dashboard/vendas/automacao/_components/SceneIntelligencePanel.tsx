import type { AtendimentoBotConfig } from "../../../inbox/inbox-model";
import type { ConversationScene } from "./ConversationBuilder";
import styles from "./ConversationBuilder.module.css";

type Props = {
  scene: ConversationScene;
  config: AtendimentoBotConfig;
  channelLabel: string;
  recoveryEnabled: boolean;
  onConfigChange: (config: AtendimentoBotConfig) => void;
  onSceneRuleChange: (conditionType: string, enabled: boolean, metadata?: Record<string, unknown>) => void;
};

function findSceneRule(config: AtendimentoBotConfig, scene: ConversationScene) {
  return (config.sceneRules || []).find(
    (rule) => rule.sceneId === scene.id && rule.conditionType === scene.conditionType,
  ) || null;
}

export default function SceneIntelligencePanel({
  scene,
  config,
  channelLabel,
  recoveryEnabled,
  onConfigChange,
  onSceneRuleChange,
}: Props) {
  const rule = findSceneRule(config, scene);
  const ruleEnabled = rule?.enabled ?? scene.enabled;
  const metadata = rule?.metadata || {};
  const startHour = Number(metadata.startHour ?? 8);
  const endHour = Number(metadata.endHour ?? 18);

  const updateRouting = (patch: Partial<AtendimentoBotConfig["routingRules"]>) => {
    onConfigChange({
      ...config,
      routingRules: {
        ...config.routingRules,
        ...patch,
      },
    });
  };

  const updateHours = (key: "startHour" | "endHour", value: string) => {
    const parsed = Math.max(0, Math.min(23, Math.trunc(Number(value))));
    onSceneRuleChange(scene.conditionType, ruleEnabled, { ...metadata, [key]: parsed });
  };

  return (
    <section className={styles.intelligencePanel}>
      <label className={styles.toggleRow}>
        <input
          type="checkbox"
          checked={ruleEnabled}
          onChange={(event) => onSceneRuleChange(scene.conditionType, event.target.checked, metadata)}
        />
        <span>
          <strong>Condicao de entrada</strong>
          <small>{scene.condition}</small>
        </span>
      </label>

      <div className={styles.intelligenceGrid}>
        <label className={styles.toggleRow}>
          <input type="checkbox" checked={scene.id === "new_customer"} readOnly />
          <span>
            <strong>Cliente novo</strong>
            <small>Telefone nao localizado</small>
          </span>
        </label>
        <label className={styles.toggleRow}>
          <input type="checkbox" checked={scene.id === "located_customer"} readOnly />
          <span>
            <strong>Cliente localizado</strong>
            <small>Telefone ja existe</small>
          </span>
        </label>
        <label className={styles.toggleRow} data-disabled={!recoveryEnabled ? "true" : "false"}>
          <input
            type="checkbox"
            disabled={!recoveryEnabled}
            checked={recoveryEnabled && config.routingRules.checkRecoveryBeforeReply}
            onChange={(event) => updateRouting({ checkRecoveryBeforeReply: event.target.checked })}
          />
          <span>
            <strong>Tem debito</strong>
            <small>{recoveryEnabled ? "Recovery disponivel" : "Recovery bloqueado"}</small>
          </span>
        </label>
        <label className={styles.toggleRow}>
          <input
            type="checkbox"
            checked={!config.routingRules.globalBotEnabled}
            onChange={(event) => updateRouting({ globalBotEnabled: !event.target.checked })}
          />
          <span>
            <strong>BOT_OFF</strong>
            <small>Desliga resposta automatica</small>
          </span>
        </label>
        <label className={styles.toggleRow}>
          <input
            type="checkbox"
            checked={config.routingRules.autoReopenClosedConversation}
            onChange={(event) => updateRouting({ autoReopenClosedConversation: event.target.checked })}
          />
          <span>
            <strong>Fallback</strong>
            <small>Reabrir conversa fechada</small>
          </span>
        </label>
        <label className={styles.toggleRow}>
          <input
            type="checkbox"
            checked={config.routingRules.notifyOnNewInbound}
            onChange={(event) => updateRouting({ notifyOnNewInbound: event.target.checked })}
          />
          <span>
            <strong>Humano</strong>
            <small>Notificar nova entrada</small>
          </span>
        </label>
      </div>

      <div className={styles.hourRule}>
        <strong>Fora de horario</strong>
        <label>
          inicio
          <input type="number" min={0} max={23} value={startHour} onChange={(event) => updateHours("startHour", event.target.value)} />
        </label>
        <label>
          fim
          <input type="number" min={0} max={23} value={endHour} onChange={(event) => updateHours("endHour", event.target.value)} />
        </label>
      </div>

      <div className={styles.intelligenceTags}>
        <span>canal: {channelLabel}</span>
        <span>modulo Vendas</span>
        <span>recoveryEnabled: {recoveryEnabled ? "sim" : "nao"}</span>
      </div>
    </section>
  );
}
