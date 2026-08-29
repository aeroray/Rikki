import type { ClipboardEntry } from "$lib/commands/types";

export const CLIP_MAX_IMAGES = 200;
const DAY_MS = 86_400_000;

export type ClipRetentionDays = 0 | 7 | 30;

export type ExpirePreview = {
  texts: number;
  images: number;
};

export function parseClipRetentionDays(value: number | null | undefined): ClipRetentionDays {
  if (value === 0 || value === null) return 0;
  if (value === 30) return 30;
  return 7;
}

export function previewExpire(
  entries: ClipboardEntry[],
  days: number,
  now: number,
  maxImages = CLIP_MAX_IMAGES,
): ExpirePreview {
  if (days <= 0) return { texts: 0, images: 0 };
  const cutoff = now - days * DAY_MS;
  const texts = entries.filter(
    (entry) => entry.type !== "image" && !entry.pinned && entry.createdAt < cutoff,
  ).length;
  const kept = entries.filter(
    (entry) => entry.type === "image" || entry.pinned || entry.createdAt >= cutoff,
  );
  const images = kept.filter((entry) => entry.type === "image");
  const excess = Math.max(0, images.length - maxImages);
  const unpinned = images.filter((entry) => !entry.pinned).length;
  return { texts, images: Math.min(excess, unpinned) };
}

export function applyExpire(
  entries: ClipboardEntry[],
  days: number,
  now: number,
  maxImages = CLIP_MAX_IMAGES,
): ClipboardEntry[] {
  const kept =
    days <= 0
      ? entries
      : entries.filter(
          (entry) => entry.type === "image" || entry.pinned || entry.createdAt >= now - days * DAY_MS,
        );
  const texts = kept.filter((entry) => entry.type !== "image");
  let images = kept.filter((entry) => entry.type === "image");
  if (images.length > maxImages) {
    const pinned = images.filter((entry) => entry.pinned);
    const rest = images
      .filter((entry) => !entry.pinned)
      .sort((a, b) => b.createdAt - a.createdAt)
      .slice(0, Math.max(0, maxImages - pinned.length));
    images = [...pinned, ...rest];
  }
  return [...texts, ...images].sort((a, b) => b.createdAt - a.createdAt);
}
