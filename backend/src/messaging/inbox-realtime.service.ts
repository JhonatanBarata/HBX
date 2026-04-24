import { Injectable } from '@nestjs/common';

export type InboxRealtimeEvent = {
  companyId: number;
  kind: 'message' | 'status' | 'conversation';
  conversationId?: number | null;
  messageId?: number | null;
  at: string;
};

type InboxRealtimeListener = (event: InboxRealtimeEvent) => void;

@Injectable()
export class InboxRealtimeService {
  private readonly listenersByCompany = new Map<number, Set<InboxRealtimeListener>>();

  subscribe(companyId: number, listener: InboxRealtimeListener) {
    const normalizedCompanyId = Number(companyId || 0);
    if (!Number.isFinite(normalizedCompanyId) || normalizedCompanyId <= 0) {
      return () => undefined;
    }

    const listeners = this.listenersByCompany.get(normalizedCompanyId) || new Set<InboxRealtimeListener>();
    listeners.add(listener);
    this.listenersByCompany.set(normalizedCompanyId, listeners);

    return () => {
      const current = this.listenersByCompany.get(normalizedCompanyId);
      if (!current) return;
      current.delete(listener);
      if (current.size === 0) {
        this.listenersByCompany.delete(normalizedCompanyId);
      }
    };
  }

  publish(event: InboxRealtimeEvent) {
    const normalizedCompanyId = Number(event?.companyId || 0);
    if (!Number.isFinite(normalizedCompanyId) || normalizedCompanyId <= 0) return;

    const listeners = this.listenersByCompany.get(normalizedCompanyId);
    if (!listeners?.size) return;

    for (const listener of listeners) {
      try {
        listener(event);
      } catch {
        // Ignore listener failures so one connection never breaks the others.
      }
    }
  }
}