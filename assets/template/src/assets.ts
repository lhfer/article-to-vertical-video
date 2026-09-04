// Presence checks for files under public/. getStaticFiles() is filled by the bundler at build time, so scenes can
// decide (deterministically) whether to mount <Audio>/<Video>/<Img> for optional assets and never crash on a miss.
import { getStaticFiles, staticFile } from "remotion";

let cache: Set<string> | null = null;

const names = (): Set<string> => {
  if (cache) return cache;
  let list: string[] = [];
  try {
    list = getStaticFiles().map((f) => f.name.replace(/\\/g, "/"));
  } catch {
    list = [];
  }
  cache = new Set(list);
  return cache;
};

/** True when `public/<rel>` exists (rel is relative to public/, forward slashes). */
export const hasStatic = (rel: string | undefined | null): boolean => {
  if (!rel) return false;
  return names().has(rel.replace(/^\/+/, ""));
};

export const staticIfPresent = (rel: string | undefined | null): string | null => (hasStatic(rel) ? staticFile(rel as string) : null);

/** clips/01.mp4 → clips/01.bg.mp4 (pre-blurred twin written by download_media.sh / media_provider.py). */
export const bgTwinOf = (src: string): string => src.replace(/\.mp4$/i, ".bg.mp4");

export const narrationFile = (beatId: string) => `narration/${beatId}.mp3`;
export const sfxFile = (name: string) => `sfx/${name}.wav`;
export const BGM_FILE = "bgm.wav";
export const COVER_FILE = "gen/cover.png";
