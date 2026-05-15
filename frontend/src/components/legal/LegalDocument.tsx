import Link from "next/link";
import styles from "./LegalDocument.module.css";

export type LegalSection = {
  title: string;
  paragraphs?: string[];
  bullets?: string[];
};

type LegalDocumentProps = {
  title: string;
  updatedAt: string;
  intro: string;
  sections: LegalSection[];
};

export default function LegalDocument({
  title,
  updatedAt,
  intro,
  sections,
}: LegalDocumentProps) {
  return (
    <main className={styles.shell}>
      <article className={styles.document}>
        <header className={styles.hero}>
          <span className={styles.eyebrow}>HBX Solutions</span>
          <h1 className={styles.title}>{title}</h1>
          <p className={styles.updated}>Última atualização: {updatedAt}</p>
          <nav className={styles.actions} aria-label="Navegação legal">
            <Link className={styles.primaryLink} href="/login">
              Voltar ao login
            </Link>
            <Link className={styles.secondaryLink} href="/">
              Ir ao início
            </Link>
          </nav>
        </header>

        <div className={styles.content}>
          <p className={styles.intro}>{intro}</p>
          {sections.map((section) => (
            <section key={section.title} className={styles.section}>
              <h2>{section.title}</h2>
              {section.paragraphs?.map((paragraph) => (
                <p key={paragraph}>{paragraph}</p>
              ))}
              {section.bullets?.length ? (
                <ul>
                  {section.bullets.map((bullet) => (
                    <li key={bullet}>{bullet}</li>
                  ))}
                </ul>
              ) : null}
            </section>
          ))}
        </div>

        <footer className={styles.footer}>
          <span>HBX Solutions</span>
          <span>Documento informativo da plataforma.</span>
        </footer>
      </article>
    </main>
  );
}
