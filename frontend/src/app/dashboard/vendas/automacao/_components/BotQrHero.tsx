import styles from "../page.module.css";

type BotQrHeroProps = {
  connectionLabel: string;
  flowLabel: string;
  publishLabel: string;
  onOpenConnection: () => void;
  onOpenFlow: () => void;
  onOpenPublish: () => void;
};

export default function BotQrHero({
  connectionLabel,
  flowLabel,
  publishLabel,
  onOpenConnection,
  onOpenFlow,
  onOpenPublish,
}: BotQrHeroProps) {
  return (
    <section className={styles.hero}>
      <div className={styles.heroContent}>
        <div className={styles.heroIntro}>
          <span className={styles.heroEyebrow}>HBX</span>
          <span className={styles.heroModule}>Modulo: Vendas</span>
        </div>
        <h1 className={styles.heroTitle}>Automacao WhatsApp</h1>
        <p className={styles.heroText}>
          Uma casca premium, simples e pronta para vender, em cima do bot atual do Atendimento.
          Tudo parte do QR, sem recriar sistema inteiro e sem esconder automacao paralela.
        </p>
        <div className={styles.heroActionRow}>
          <button type="button" className={styles.primaryButton} onClick={onOpenConnection}>
            Abrir conexao QR
          </button>
          <button type="button" className={styles.secondaryButton} onClick={onOpenFlow}>
            Ajustar fluxo
          </button>
          <button type="button" className={styles.ghostButton} onClick={onOpenPublish}>
            Publicar com checklist
          </button>
        </div>
      </div>

      <div className={styles.heroAside}>
        <div className={styles.heroPillStack}>
          <span className={styles.heroPill}>QR CODE</span>
          <span className={styles.heroPill}>unico foco agora</span>
          <span className={styles.heroPill}>simples</span>
          <span className={styles.heroPill}>rapido</span>
          <span className={styles.heroPill}>pronto para vender</span>
        </div>

        <div className={styles.heroLedger}>
          <article className={styles.heroMetricCard}>
            <span>Conexao</span>
            <strong>{connectionLabel}</strong>
          </article>
          <article className={styles.heroMetricCard}>
            <span>Fluxo</span>
            <strong>{flowLabel}</strong>
          </article>
          <article className={styles.heroMetricCard}>
            <span>Publicacao</span>
            <strong>{publishLabel}</strong>
          </article>
        </div>
      </div>
    </section>
  );
}
