/**
 * Chord Community Library API
 *
 * REST API for patch sharing, discovery, and collaboration.
 *
 * Endpoints:
 *   GET    /api/patches              Search/list patches
 *   GET    /api/patches/:slug        Get patch details
 *   POST   /api/patches              Publish a new patch
 *   PUT    /api/patches/:slug        Update a patch
 *   DELETE /api/patches/:slug        Unpublish
 *   POST   /api/patches/:slug/fork   Fork a patch
 *   POST   /api/patches/:slug/rate   Rate a patch
 *   GET    /api/users/:username      User profile
 *   GET    /api/search?q=...         Full-text + vibe search
 */

export interface PatchListResponse {
  patches: PatchSummary[];
  total: number;
  page: number;
  pageSize: number;
}

export interface PatchSummary {
  slug: string;
  name: string;
  description: string;
  author: string;
  version: string;
  category: string;
  tags: string[];
  tempo: number;
  key: string;
  nodeCount: number;
  downloads: number;
  rating: number;
  ratingCount: number;
  previewUrl: string | null;
  createdAt: string;
}

export interface PatchDetail extends PatchSummary {
  patchJson: string;
  readme: string;
  license: string;
  forkedFrom: string | null;
  forkCount: number;
  versions: PatchVersion[];
}

export interface PatchVersion {
  version: string;
  changelog: string;
  createdAt: string;
}

export interface PublishRequest {
  name: string;
  description: string;
  patchJson: string;
  tags?: string[];
  category?: string;
  readme?: string;
  license?: string;
}

export interface SearchParams {
  query?: string;
  category?: string;
  minTempo?: number;
  maxTempo?: number;
  key?: string;
  minRating?: number;
  sort?: 'downloads' | 'rating' | 'newest' | 'name';
  page?: number;
  pageSize?: number;
}

export interface ForkRequest {
  name?: string;
  description?: string;
}

export interface RatingRequest {
  score: number;
  review?: string;
}

// Categories for browsing
export const PATCH_CATEGORIES = [
  'ambient', 'beats', 'bass', 'drums', 'effects', 'generative',
  'instruments', 'lo-fi', 'meditation', 'notification', 'ui-sounds',
  'game-audio', 'cinematic', 'experimental', 'texture', 'other',
] as const;

export type PatchCategory = typeof PATCH_CATEGORIES[number];
