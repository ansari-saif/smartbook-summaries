import type { CSSProperties } from "react";

export const CLOTHS = [
  { name: "madder", cloth: "#7A2E2A", band: "#3B1513" },
  { name: "bottle", cloth: "#1F4A3A", band: "#0E241B" },
  { name: "oxford", cloth: "#26365E", band: "#111A30" },
  { name: "plum", cloth: "#4E2A45", band: "#26121F" },
  { name: "umber", cloth: "#5A3A22", band: "#2B1A0E" },
  { name: "slate", cloth: "#24555A", band: "#10292C" },
] as const;

export type Cloth = (typeof CLOTHS)[number];

export function clothFor(bookName: string): Cloth {
  let hash = 0;
  for (let i = 0; i < bookName.length; i++) {
    hash = (hash * 31 + bookName.charCodeAt(i)) >>> 0;
  }
  return CLOTHS[hash % CLOTHS.length];
}

export function clothStyle(cloth: Cloth): CSSProperties {
  return { "--cloth": cloth.cloth, "--band": cloth.band } as CSSProperties;
}

export function scrollStorageKey(book: string, chapter: string) {
  return `smartbook-scroll:${book}::${chapter}`;
}

export function chapterStorageKey(book: string) {
  return `smartbook-chapter:${book}`;
}

export function focusStorageKey(book: string) {
  return `smartbook-fs:${book}`;
}

export const place = {
  get(key: string) {
    try {
      return localStorage.getItem(key);
    } catch {
      return null;
    }
  },
  set(key: string, value: string) {
    try {
      localStorage.setItem(key, value);
    } catch {
      // storage full or disabled; the reading place is a convenience
    }
  },
};

/** Chapter index the reader stopped in, or null when the book was never opened. */
export function storedChapter(book: string): number | null {
  const raw = place.get(chapterStorageKey(book));
  if (raw == null) return null;
  const n = Number(raw);
  return Number.isInteger(n) && n >= 0 ? n : null;
}
