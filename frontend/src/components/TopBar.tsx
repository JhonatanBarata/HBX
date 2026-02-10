"use client";

import React, { useEffect, useState, useRef } from "react";
import { useRouter } from "next/navigation";
import { apiFetch, clearToken, getToken } from "../app/dashboard/_lib/api";
import ThemeSwitcher from './ThemeSwitcher';

type User = {
  id: number;
  username: string;
  company?: { id: number; name?: string } | null;
};

export default function TopBar() {
  const [user, setUser] = useState<User | null>(null);
  const [open, setOpen] = useState(false);
  const [curPass, setCurPass] = useState("");
  const [newPass, setNewPass] = useState("");
  const [changing, setChanging] = useState(false);
  const [changeMsg, setChangeMsg] = useState<string | null>(null);
  const router = useRouter();

  useEffect(() => {
    let mounted = true;
    async function load() {
      if (!getToken()) return setUser(null);
      try {
        const u = await apiFetch<User>("/profile/current-user");
        if (mounted) setUser(u);
      } catch (e) {
        setUser(null);
      }
    }
    load();
    function onAuthChange() {
      load();
    }
    window.addEventListener("auth-change", onAuthChange);
    return () => {
      mounted = false;
      window.removeEventListener("auth-change", onAuthChange);
    };
  }, []);

  function handleLogout() {
    clearToken();
    setUser(null);
    try {
      router.push('/login');
    } catch {}
  }

  const containerRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    function onDocClick(e: MouseEvent) {
      if (!containerRef.current) return;
      if (!(e.target instanceof Node)) return;
      if (!containerRef.current.contains(e.target)) {
        setOpen(false);
      }
    }
    document.addEventListener('mousedown', onDocClick);
    return () => document.removeEventListener('mousedown', onDocClick);
  }, []);

  return (
    <header style={{ padding: '8px 16px', borderBottom: '1px solid rgba(0,0,0,0.06)', background: 'var(--header-bg, white)' }}>
      <div style={{ maxWidth: 1100, margin: '0 auto', display: 'flex', alignItems: 'center', gap: 12 }}>
          <div ref={containerRef} style={{ display: 'flex', alignItems: 'center', gap: 12, position: 'relative' }}>
          <div style={{ fontWeight: 700, fontSize: 18, color: 'var(--brand)' }}>HBX solutions</div>
          <div style={{ marginLeft: 8 }}>
            <ThemeSwitcher />
          </div>
          {user ? (
            <>
              <button
                onClick={() => setOpen((v) => !v)}
                style={{
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: 8,
                  padding: '8px 12px',
                  borderRadius: 9999,
                  border: '1px solid rgba(0,0,0,0.08)',
                  background: 'var(--button-bg, #fff)',
                  cursor: 'pointer',
                }}
                aria-label={`Usuário ${user.username}`}
              >
                <span style={{ width: 34, height: 34, borderRadius: 8, background: '#eef2ff', display: 'inline-flex', alignItems: 'center', justifyContent: 'center', fontSize: 14, fontWeight: 700 }}>
                  {user.username.charAt(0).toUpperCase()}
                </span>
                <div style={{ textAlign: 'left' }}>
                  <div style={{ fontSize: 13, fontWeight: 600 }}>{user.username}</div>
                  <div style={{ fontSize: 12, color: 'var(--muted, #666)' }}>{user.company?.name ?? 'Sem empresa'}</div>
                </div>
              </button>

              <div style={{ marginTop: 6 }}>
                <button onClick={() => setOpen(true)} style={{ background: 'transparent', border: 'none', color: '#2563eb', fontSize: 13, cursor: 'pointer' }}>Editar senha</button>
              </div>

              <div style={{ position: 'absolute', top: 'calc(100% + 10px)', left: 0, zIndex: 40, width: 280 }} aria-hidden={!open}>
                <div style={{
                  width: '100%',
                  padding: 12,
                  borderRadius: 12,
                  background: 'white',
                  boxShadow: '0 10px 30px rgba(2,6,23,0.16)',
                  border: '1px solid rgba(0,0,0,0.04)',
                  transform: open ? 'translateY(0)' : 'translateY(-8px)',
                  opacity: open ? 1 : 0,
                  transition: 'transform 180ms cubic-bezier(.2,.9,.2,1), opacity 180ms ease',
                  pointerEvents: open ? 'auto' : 'none'
                }}>
                    <div style={{ fontSize: 13, fontWeight: 700, marginBottom: 8 }}>Conta</div>
                    <div style={{ fontSize: 13, marginBottom: 4 }}>{user.username}</div>
                    <div style={{ fontSize: 12, color: '#666', marginBottom: 8 }}>{user.company?.name ?? 'Sem empresa'}</div>
                    <hr style={{ border: 'none', borderTop: '1px solid #eee', margin: '8px 0' }} />
                    <form onSubmit={async (e) => {
                      e.preventDefault();
                      setChanging(true);
                      setChangeMsg(null);
                      try {
                        await apiFetch('/profile/password', { method: 'PATCH', body: JSON.stringify({ currentPassword: curPass, newPassword: newPass }) });
                        setChangeMsg('Senha atualizada');
                        setCurPass(''); setNewPass('');
                      setOpen(false);
                      } catch (err: any) {
                        setChangeMsg(err?.message ?? 'Erro');
                      } finally { setChanging(false); }
                    }}>
                      <div style={{ marginBottom: 8 }}>
                        <input placeholder="Senha atual" type="password" value={curPass} onChange={(e) => setCurPass(e.target.value)} className="w-full p-2 border rounded" />
                      </div>
                      <div style={{ marginBottom: 8 }}>
                        <input placeholder="Nova senha" type="password" value={newPass} onChange={(e) => setNewPass(e.target.value)} className="w-full p-2 border rounded" />
                      </div>
                      {changeMsg ? <div style={{ fontSize: 12, marginBottom: 8 }}>{changeMsg}</div> : null}
                      <div style={{ display: 'flex', gap: 8 }}>
                        <button type="submit" style={{ padding: '8px 14px', borderRadius: 12, background: '#0f172a', color: '#fff', border: 'none' }} disabled={changing || newPass.length < 8}>Salvar</button>
                        <button type="button" onClick={() => setOpen(false)} style={{ padding: '8px 14px', borderRadius: 12, background: 'transparent', border: '1px solid rgba(0,0,0,0.12)' }}>Fechar</button>
                      </div>
                    </form>
                  </div>
                </div>
            </>
          ) : null}
        </div>

        <div style={{ marginLeft: 'auto' }}>
          {user ? (
            <button onClick={handleLogout} className="px-3 py-2 rounded-xl border" style={{ background: 'transparent' }}>
              Sair
            </button>
          ) : (
            <button onClick={() => router.push('/login')} className="px-3 py-2 rounded-xl border" style={{ background: 'transparent' }}>
              Entrar
            </button>
          )}
        </div>
      </div>
    </header>
  );
}
