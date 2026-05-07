import type { MeticulousTrashPurgeJob } from "@/app/atendimento/inbox-model";

export function renderSafeText(value: unknown): string {
  if (value == null) return "";
  if (typeof value === "string" || typeof value === "number" || typeof value === "boolean") return String(value);
  if (Array.isArray(value)) return value.map(renderSafeText).filter(Boolean).join(" · ");
  if (typeof value === "object") {
    const record = value as Record<string, unknown>;
    return String(
      record.note ||
      record.message ||
      record.text ||
      record.description ||
      record.title ||
      record.eventType ||
      ""
    );
  }
  return "";
}

export function normalizeMeticulousTrashJob(job: MeticulousTrashPurgeJob | null): MeticulousTrashPurgeJob | null {
  if (!job) return null;
  try {
    const copy = { ...(job as Record<string, unknown>) } as unknown as MeticulousTrashPurgeJob;

    copy.currentLastCustomerWords = renderSafeText(copy.currentLastCustomerWords) || null;
    copy.currentDetectedReason = renderSafeText(copy.currentDetectedReason) || null;

    copy.candidates = (copy.candidates || []).map((candidate) => {
      const c = candidate as unknown as Record<string, unknown>;
      return {
        ...(candidate as Record<string, unknown>),
        lastCustomerWords: renderSafeText(c.lastCustomerWords) || null,
        detectedReason: renderSafeText(c.detectedReason) || null,
        reason: renderSafeText(c.reason) || null,
      } as MeticulousTrashPurgeJob['candidates'][0];
    });

    copy.errors = (copy.errors || []).map((err) => {
      const e = err as unknown as Record<string, unknown>;
      const message = renderSafeText(e?.message ?? e?.note ?? e?.reason ?? e);
      return ({ ...(err as Record<string, unknown> || {}), message } as Record<string, unknown>);
    });

    return copy;
  } catch {
    return job;
  }
}
