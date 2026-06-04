import type { FormEvent, ReactNode } from "react";
import type { UserItem } from "./types";

type PartnerCreateFormProps = {
  onSubmit: (event: FormEvent<HTMLFormElement>) => void;
  referralCandidatesPanel?: ReactNode;
  referralMatchBox?: ReactNode;
  isHbxSellerNetwork: boolean;
  canCreateAdminUsers: boolean;
  newUserRole: "USER" | "ADMIN";
  setNewUserRole: (role: "USER" | "ADMIN") => void;
  roleLabel: (role?: string | null, isSystemMaster?: boolean | null) => string;
  newUserName: string;
  setNewUserName: (value: string) => void;
  newUserEmail: string;
  setNewUserEmail: (value: string) => void;
  newUserPhone: string;
  setNewUserPhone: (value: string) => void;
  newUserCommissionPercent: string;
  setNewUserCommissionPercent: (value: string) => void;
  newUserPassword: string;
  setNewUserPassword: (value: string) => void;
  newUserCpf: string;
  setNewUserCpf: (value: string) => void;
  newUserDeclaredAddress: string;
  setNewUserDeclaredAddress: (value: string) => void;
  newUserCommissionDueBusinessDays: string;
  setNewUserCommissionDueBusinessDays: (value: string) => void;
  newUserSellerReferralCommissionPercent: string;
  setNewUserSellerReferralCommissionPercent: (value: string) => void;
  newUserReferredByUserId: string;
  setNewUserReferredByUserId: (value: string) => void;
  newUserReferredByCommissionPercent: string;
  setNewUserReferredByCommissionPercent: (value: string) => void;
  selectedNewUserReferrer?: UserItem | null;
  hbxReferrers: UserItem[];
  userLabel: (user: Pick<UserItem, "id" | "name" | "username" | "email">) => string;
  formatPercent: (value?: number | null) => string;
  percentInputValue: (value?: number | null) => string;
  creatingUser: boolean;
};

export default function PartnerCreateForm({
  onSubmit,
  referralCandidatesPanel,
  referralMatchBox,
  isHbxSellerNetwork,
  canCreateAdminUsers,
  newUserRole,
  setNewUserRole,
  roleLabel,
  newUserName,
  setNewUserName,
  newUserEmail,
  setNewUserEmail,
  newUserPhone,
  setNewUserPhone,
  newUserCommissionPercent,
  setNewUserCommissionPercent,
  newUserPassword,
  setNewUserPassword,
  newUserCpf,
  setNewUserCpf,
  newUserDeclaredAddress,
  setNewUserDeclaredAddress,
  newUserCommissionDueBusinessDays,
  setNewUserCommissionDueBusinessDays,
  newUserSellerReferralCommissionPercent,
  setNewUserSellerReferralCommissionPercent,
  newUserReferredByUserId,
  setNewUserReferredByUserId,
  newUserReferredByCommissionPercent,
  setNewUserReferredByCommissionPercent,
  selectedNewUserReferrer,
  hbxReferrers,
  userLabel,
  formatPercent,
  percentInputValue,
  creatingUser,
}: PartnerCreateFormProps) {
  const showPartnerFields = isHbxSellerNetwork && newUserRole === "USER";

  return (
    <form onSubmit={onSubmit} autoComplete="off" className="grid gap-3">
      {referralCandidatesPanel}
      <section className="hbx-mobile-card grid gap-3">
        <div className="flex items-center justify-between gap-2">
          <div>
            <span className="text-xs font-bold uppercase text-[var(--hbx-mobile-primary)]">Novo acesso</span>
            <h2 className="text-lg font-semibold">{isHbxSellerNetwork ? "Cadastrar Parceiro HBX" : "Cadastrar usuário"}</h2>
          </div>
          <span className="rounded-full border border-[var(--hbx-mobile-border)] px-3 py-1 text-xs font-bold">
            {isHbxSellerNetwork ? "Parceiro HBX" : newUserRole === "USER" ? "Vendedor" : "Admin"}
          </span>
        </div>
        {canCreateAdminUsers ? (
          <div className="grid grid-cols-2 gap-2">
            {(["USER", "ADMIN"] as const).map((role) => (
              <button
                key={role}
                type="button"
                onClick={() => setNewUserRole(role)}
                className={newUserRole === role ? "hbx-mobile-primary-button" : "hbx-mobile-secondary-button"}
              >
                {roleLabel(role)}
              </button>
            ))}
          </div>
        ) : (
          <div className="rounded-[16px] border border-[var(--hbx-mobile-border)] bg-[var(--hbx-mobile-surface-soft)] p-3 text-sm text-[var(--hbx-mobile-muted)]">
            USERMASTER cria Parceiro HBX. Admin fica fora da rede de parceiros HBX.
          </div>
        )}
        <input className="field" value={newUserName} onChange={(event) => setNewUserName(event.target.value)} placeholder="Nome" />
        <input
          className="field"
          type="email"
          name="hbx-create-seller-login"
          autoComplete="off"
          autoCapitalize="none"
          value={newUserEmail}
          onChange={(event) => setNewUserEmail(event.target.value)}
          placeholder="E-mail"
          required
        />
        <input className="field" type="tel" value={newUserPhone} onChange={(event) => setNewUserPhone(event.target.value)} placeholder="WhatsApp" />
        {showPartnerFields ? referralMatchBox : null}
        <input
          className="field disabled:opacity-60"
          inputMode="decimal"
          disabled={Boolean(selectedNewUserReferrer)}
          value={selectedNewUserReferrer ? percentInputValue(selectedNewUserReferrer.commissionPercent) : newUserCommissionPercent}
          onChange={(event) => setNewUserCommissionPercent(event.target.value)}
          placeholder={selectedNewUserReferrer ? "Comissão herdada" : "Comissão %"}
        />
        <input
          className="field"
          type="password"
          name="hbx-create-seller-password"
          autoComplete="new-password"
          value={newUserPassword}
          onChange={(event) => setNewUserPassword(event.target.value)}
          placeholder="Senha opcional"
        />
        {showPartnerFields ? (
          <div className="grid gap-2 rounded-[16px] border border-[var(--hbx-mobile-border)] bg-[var(--hbx-mobile-surface-soft)] p-3 text-sm">
            <span>
              <strong className="block">Parceiro HBX</strong>
              <small className="text-[var(--hbx-mobile-muted)]">Dados iniciais para gerar o contrato de parceria HBX.</small>
            </span>
            <input className="field" value={newUserCpf} onChange={(event) => setNewUserCpf(event.target.value)} placeholder="CPF" />
            <input className="field" value={newUserDeclaredAddress} onChange={(event) => setNewUserDeclaredAddress(event.target.value)} placeholder="Endereço declarado" />
            <input
              className="field"
              inputMode="numeric"
              value={newUserCommissionDueBusinessDays}
              onChange={(event) => setNewUserCommissionDueBusinessDays(event.target.value)}
              placeholder="Prazo D+ em dias úteis"
            />
          </div>
        ) : null}
      </section>

      {showPartnerFields ? (
        <section className="hbx-mobile-card grid gap-3">
          <div>
            <span className="text-xs font-bold uppercase text-[var(--hbx-mobile-primary)]">Rede HBX</span>
            <h3 className="text-base font-semibold">Indicação e herança</h3>
          </div>
          <input
            className="field disabled:opacity-60"
            inputMode="decimal"
            disabled={Boolean(selectedNewUserReferrer)}
            value={selectedNewUserReferrer ? percentInputValue(selectedNewUserReferrer.sellerReferralCommissionPercent) : newUserSellerReferralCommissionPercent}
            onChange={(event) => setNewUserSellerReferralCommissionPercent(event.target.value)}
            placeholder={selectedNewUserReferrer ? "Herança herdada" : "Herança que ele recebe %"}
          />
          <select
            className="field"
            value={newUserReferredByUserId}
            onChange={(event) => {
              const selectedReferrerId = event.target.value;
              const selectedReferrer = hbxReferrers.find((referrer) => String(referrer.id) === selectedReferrerId);
              setNewUserReferredByUserId(selectedReferrerId);
              if (selectedReferrer) {
                setNewUserCommissionPercent(percentInputValue(selectedReferrer.commissionPercent));
                setNewUserSellerReferralCommissionPercent(percentInputValue(selectedReferrer.sellerReferralCommissionPercent));
                setNewUserReferredByCommissionPercent(percentInputValue(selectedReferrer.sellerReferralCommissionPercent));
              }
              if (!selectedReferrerId) setNewUserReferredByCommissionPercent("");
            }}
          >
            <option value="">Direto HBX</option>
            {hbxReferrers.map((referrer) => (
              <option key={referrer.id} value={referrer.id}>
                {userLabel(referrer)} · {formatPercent(referrer.sellerReferralCommissionPercent)}
              </option>
            ))}
          </select>
          <input
            className="field disabled:opacity-60"
            inputMode="decimal"
            disabled
            value={selectedNewUserReferrer ? percentInputValue(selectedNewUserReferrer.sellerReferralCommissionPercent) : newUserReferredByCommissionPercent}
            onChange={(event) => setNewUserReferredByCommissionPercent(event.target.value)}
            placeholder="Herança automática do indicador"
          />
          {selectedNewUserReferrer ? (
            <p className="text-xs text-[var(--hbx-mobile-muted)]">
              Comissão e herança travadas pelo indicador {userLabel(selectedNewUserReferrer)}.
            </p>
          ) : null}
        </section>
      ) : null}

      <button type="submit" disabled={creatingUser} className="hbx-mobile-primary-button">
        {creatingUser ? "Criando..." : isHbxSellerNetwork ? "Criar Parceiro HBX" : newUserRole === "USER" ? "Criar vendedor" : "Criar admin"}
      </button>
    </form>
  );
}
