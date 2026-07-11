// ===========================================================================
// LEADS-FINAL/06 — E-MAIL v1: presets de provedor (SMTP host/porta/SSL).
//
// Pré-preenche o formulário de conexão e traz uma DICA NOSSA de senha (senha de
// app vs. senha da caixa). Texto autoral — não copiado de concorrente. Os
// valores são só defaults editáveis: host/porta reais podem variar por domínio,
// então o usuário pode sobrescrever. `smtpSecure` segue a convenção do
// nodemailer: `true` = TLS implícito (porta 465); `false` = STARTTLS (587/25).
// ===========================================================================

export type EmailProviderPreset = {
  id: string;
  label: string;
  smtpHost: string | null;
  smtpPort: number | null;
  smtpSecure: boolean;
  // Dica curta NOSSA sobre qual senha usar (senha de app x senha da caixa).
  passwordHint: string;
};

export const EMAIL_PROVIDER_PRESETS: EmailProviderPreset[] = [
  {
    id: 'gmail',
    label: 'Gmail',
    smtpHost: 'smtp.gmail.com',
    smtpPort: 465,
    smtpSecure: true,
    passwordHint:
      'O Gmail não aceita a senha normal aqui. Ligue a verificação em 2 etapas e gere uma "senha de app" em myaccount.google.com/apppasswords — use ela no campo de senha.',
  },
  {
    id: 'outlook',
    label: 'Outlook / Hotmail',
    smtpHost: 'smtp-mail.outlook.com',
    smtpPort: 587,
    smtpSecure: false,
    passwordHint:
      'Com a verificação em 2 etapas ligada, gere uma "senha de app" na conta Microsoft (Segurança → opções avançadas) e use ela aqui.',
  },
  {
    id: 'yahoo',
    label: 'Yahoo',
    smtpHost: 'smtp.mail.yahoo.com',
    smtpPort: 465,
    smtpSecure: true,
    passwordHint:
      'O Yahoo exige "senha de app": em Configurações de conta → Segurança, gere uma senha de app e use ela no lugar da sua senha.',
  },
  {
    id: 'uol',
    label: 'UOL Host',
    smtpHost: 'smtps.uol.com.br',
    smtpPort: 587,
    smtpSecure: false,
    passwordHint: 'Use o e-mail completo como usuário e a senha da sua caixa UOL Host.',
  },
  {
    id: 'hostinger',
    label: 'Hostinger',
    smtpHost: 'smtp.hostinger.com',
    smtpPort: 465,
    smtpSecure: true,
    passwordHint: 'Use a senha da caixa de e-mail que você criou no hPanel da Hostinger (não a senha do painel).',
  },
  {
    id: 'kinghost',
    label: 'KingHost',
    smtpHost: 'smtp.kinghost.net',
    smtpPort: 587,
    smtpSecure: false,
    passwordHint:
      'Use o e-mail completo como usuário e a senha da caixa criada no painel KingHost. Se tiver domínio próprio, o servidor pode ser smtp.seudominio.com.br.',
  },
  {
    id: 'locaweb',
    label: 'Locaweb',
    smtpHost: 'email-ssl.com.br',
    smtpPort: 465,
    smtpSecure: true,
    passwordHint: 'Use o e-mail completo como usuário e a senha da caixa postal (painel de e-mail Locaweb).',
  },
  {
    id: 'outro',
    label: 'Outro provedor',
    smtpHost: null,
    smtpPort: null,
    smtpSecure: true,
    passwordHint:
      'No painel do seu provedor, procure por "SMTP" ou "servidor de saída": copie o servidor, a porta e marque SSL quando a porta for 465. A senha costuma ser a da caixa de e-mail (ou uma senha de app, se o provedor exigir).',
  },
];

export function findPreset(id: string | null | undefined): EmailProviderPreset | null {
  const key = String(id || '').trim().toLowerCase();
  if (!key) return null;
  return EMAIL_PROVIDER_PRESETS.find((p) => p.id === key) || null;
}

/** Provider aceito? (whitelist) — cai em 'outro' quando desconhecido. */
export function normalizeProvider(id: string | null | undefined): string {
  return findPreset(id) ? String(id).trim().toLowerCase() : 'outro';
}
