"use client";

// Moldura das telas de autenticação sem template dedicado no handoff
// (reset de senha, confirmação de e-mail): reusa 1:1 o lado de marca e a
// estrutura do corporate/Login.html — só o conteúdo do card muda.
// Controles de tema (claro/escuro + Friendly↔Corporativo) idênticos ao login.

import { AuthThemeControls } from "@/components/hbx/auth-theme-controls";

export function AuthSplit({ children }: { children: React.ReactNode }) {
  return (
    <>
      <AuthThemeControls />
      <div className="login-split">
        <aside className="brand-side">
          <div className="bl">
            <svg width="30" height="30" viewBox="0 0 24 24" fill="none" stroke="var(--hbx-brand)" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round"><path d="M4 6l6 6-6 6M11 6l6 6-6 6"></path></svg>
            <strong>HBX</strong>
          </div>
          <div className="pitch">
            <h1>Sua operação comercial em um só lugar.</h1>
            <p>Leads, vendas, atendimento e automação — conectados do primeiro contato ao fechamento.</p>
            <div className="feat">
              <div className="it"><span className="ic"><svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round"><path d="M7 17l4-6 3 3 4-7"></path><path d="M3 3v18h18"></path></svg></span>Pipeline de vendas com funil em tempo real</div>
              <div className="it"><span className="ic"><svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round"><path d="M21 11.5a8.4 8.4 0 0 1-9 8.4 8.6 8.6 0 0 1-3.8-.9L3 20l1-5.2a8.4 8.4 0 1 1 17-3.3Z"></path></svg></span>Atendimento omnichannel: WhatsApp, e-mail e Instagram</div>
              <div className="it"><span className="ic"><svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round"><path d="M12 6V3"></path><path d="M7 9h10a2 2 0 0 1 2 2v5a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2v-5a2 2 0 0 1 2-2Z"></path><path d="M9.5 13h.01M14.5 13h.01"></path></svg></span>Bot de qualificação com construtor visual</div>
            </div>
          </div>
          <div className="foot">© 2026 HBX System · Termos de uso · Política de privacidade</div>
        </aside>

        <main className="form-side">
          {children}
        </main>
      </div>
    </>
  );
}
