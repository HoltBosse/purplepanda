const GLOBAL_KEY = "__purplepanda_media_path";

export function setMediaPath(path: string) {
  (globalThis as Record<string, unknown>)[GLOBAL_KEY] = path;
}

export function getMediaPath(): string {
  const path = (globalThis as Record<string, unknown>)[GLOBAL_KEY] as string | undefined;
  if (!path) throw new Error("[purplepanda] No media path provided. Pass `mediaPath` to purplePandaIntegration().");
  return path;
}
