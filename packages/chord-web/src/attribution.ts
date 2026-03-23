/**
 * Chord Attribution System
 * Tracks patch lineage (fork chains) and credits original authors.
 */

export interface PatchLineage {
  patchId: string;
  name: string;
  author: string;
  version: string;
  forkedFrom: PatchLineage | null;
  forks: PatchLineageSummary[];
}

export interface PatchLineageSummary {
  patchId: string;
  name: string;
  author: string;
  downloads: number;
}

/**
 * Generate an attribution string for a patch and all its ancestors.
 */
export function generateAttribution(lineage: PatchLineage): string {
  const authors: string[] = [];
  let current: PatchLineage | null = lineage;

  while (current) {
    if (!authors.includes(current.author)) {
      authors.push(current.author);
    }
    current = current.forkedFrom;
  }

  if (authors.length === 1) {
    return `♪ ${lineage.name} by ${authors[0]} — Made with Chord`;
  }

  const original = authors[authors.length - 1];
  const modifiers = authors.slice(0, -1).reverse();
  return `♪ ${lineage.name} by ${modifiers.join(', ')} (based on work by ${original}) — Made with Chord`;
}

/**
 * Generate an HTML attribution badge for embedding.
 */
export function generateBadgeHTML(lineage: PatchLineage, options?: { size?: 'small' | 'medium' | 'large' }): string {
  const size = options?.size ?? 'small';
  const fontSize = size === 'small' ? 10 : size === 'medium' ? 12 : 14;
  const padding = size === 'small' ? '2px 6px' : size === 'medium' ? '4px 10px' : '6px 14px';

  return `<div style="display:inline-flex;align-items:center;gap:4px;padding:${padding};background:#000;color:#c8ff00;border-radius:4px;font-family:monospace;font-size:${fontSize}px;font-weight:700;">
    <span>♪</span>
    <span>${lineage.name}</span>
    <span style="color:#888;font-weight:400;">by ${lineage.author}</span>
    <span style="color:#666;">· Chord</span>
  </div>`;
}

/**
 * Embed configuration for patches.
 */
export interface AttributionConfig {
  /** Show attribution badge (default: true for free tier) */
  showBadge: boolean;
  /** Badge position */
  position: 'bottom-left' | 'bottom-right' | 'top-left' | 'top-right';
  /** Badge size */
  size: 'small' | 'medium' | 'large';
  /** Link to community page */
  linkToCommunity: boolean;
}

export const DEFAULT_ATTRIBUTION: AttributionConfig = {
  showBadge: true,
  position: 'bottom-right',
  size: 'small',
  linkToCommunity: true,
};
