import { redirect } from "next/navigation";

// MODO PUXAR (02/08): o link do convite de equipe (e-mail/WhatsApp) cai aqui e
// vira o card da landing com o convite ativo (?criar&invite=<token>) — mesmo
// padrão de alias do /register. Quem já tem conta alterna pra "Entrar" no
// próprio card: ao logar, o banner de convite aparece e o aceite é lá.
export default async function ConvitePage({
  params,
}: {
  params: Promise<{ token: string }>;
}) {
  const { token } = await params;
  redirect(`/?criar&invite=${encodeURIComponent(token)}`);
}
