import type {
  HbxMusicAccessState,
  HbxMusicBillingProviderName,
  HbxMusicSubscription,
  HbxMusicSubscriptionStatus,
  HbxMusicUser,
} from "./types";
import { buildMockSubscription } from "./mock-data";

function addDays(baseIso: string, days: number) {
  const date = new Date(baseIso);
  date.setDate(date.getDate() + days);
  return date.toISOString();
}

export interface BillingProvider {
  readonly providerName: HbxMusicBillingProviderName;
  createTrialAccount(user: HbxMusicUser): Promise<HbxMusicSubscription>;
  getSubscriptionStatus(subscription: HbxMusicSubscription): Promise<HbxMusicSubscriptionStatus>;
  startSubscription(subscription: HbxMusicSubscription): Promise<HbxMusicSubscription>;
  cancelSubscription(subscription: HbxMusicSubscription): Promise<HbxMusicSubscription>;
  verifyEntitlement(subscription: HbxMusicSubscription): Promise<HbxMusicAccessState>;
}

export class MockBillingProvider implements BillingProvider {
  readonly providerName: HbxMusicBillingProviderName = "mock";

  async createTrialAccount(user: HbxMusicUser) {
    return buildMockSubscription(user.id);
  }

  async getSubscriptionStatus(subscription: HbxMusicSubscription) {
    return subscription.status;
  }

  async startSubscription(subscription: HbxMusicSubscription): Promise<HbxMusicSubscription> {
    const currentPeriodStart = new Date().toISOString();
    return {
      ...subscription,
      status: "active" as const,
      currentPeriodStart,
      currentPeriodEnd: addDays(currentPeriodStart, 30),
    };
  }

  async cancelSubscription(subscription: HbxMusicSubscription): Promise<HbxMusicSubscription> {
    return {
      ...subscription,
      status: "canceled" as const,
    };
  }

  async verifyEntitlement(subscription: HbxMusicSubscription) {
    if (subscription.status === "active") return "subscription_active";
    if (subscription.status === "trialing" && new Date(subscription.trialEndAt).getTime() > Date.now()) {
      return "trial_active";
    }
    if (subscription.status === "trialing") return "trial_expired";
    return "subscription_inactive";
  }
}
