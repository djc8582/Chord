/**
 * Chord tier definitions and feature gating.
 */

export type Tier = 'free' | 'pro' | 'studio';

export interface TierLimits {
  maxNodesPerPatch: number | 'unlimited';
  visibility: 'public_only' | 'user_choice';
  license: 'CC-BY-4.0' | 'user_choice';
  exportTargets: string[];
  exportWatermark: boolean;
  collaboration: false | { maxEditors: number | 'unlimited' };
  soundIntelligence: boolean;
  communityPublish: boolean;
  communityPrivate: boolean;
  maxPatches: number | 'unlimited';
}

export const TIER_LIMITS: Record<Tier, TierLimits> = {
  free: {
    maxNodesPerPatch: 50,
    visibility: 'public_only',
    license: 'CC-BY-4.0',
    exportTargets: ['web'],
    exportWatermark: true,
    collaboration: false,
    soundIntelligence: false,
    communityPublish: true,
    communityPrivate: false,
    maxPatches: 'unlimited',
  },
  pro: {
    maxNodesPerPatch: 'unlimited',
    visibility: 'user_choice',
    license: 'user_choice',
    exportTargets: ['web', 'desktop', 'plugin', 'mobile', 'game'],
    exportWatermark: false,
    collaboration: { maxEditors: 5 },
    soundIntelligence: true,
    communityPublish: true,
    communityPrivate: true,
    maxPatches: 'unlimited',
  },
  studio: {
    maxNodesPerPatch: 'unlimited',
    visibility: 'user_choice',
    license: 'user_choice',
    exportTargets: ['web', 'desktop', 'plugin', 'mobile', 'game'],
    exportWatermark: false,
    collaboration: { maxEditors: 'unlimited' },
    soundIntelligence: true,
    communityPublish: true,
    communityPrivate: true,
    maxPatches: 'unlimited',
  },
};

export const TIER_PRICING: Record<Tier, { monthly: number; yearly: number; label: string }> = {
  free: { monthly: 0, yearly: 0, label: 'Free' },
  pro: { monthly: 15, yearly: 144, label: 'Pro' },
  studio: { monthly: 40, yearly: 384, label: 'Studio' },
};

/**
 * Check if a feature is available for the given tier.
 */
export function checkTierAccess(tier: Tier, feature: keyof TierLimits): boolean {
  const limits = TIER_LIMITS[tier];
  const value = limits[feature];
  if (typeof value === 'boolean') return value;
  if (value === 'unlimited') return true;
  return true;
}

/**
 * Check if a node count is within tier limits.
 */
export function checkNodeLimit(tier: Tier, nodeCount: number): boolean {
  const max = TIER_LIMITS[tier].maxNodesPerPatch;
  if (max === 'unlimited') return true;
  return nodeCount <= max;
}
