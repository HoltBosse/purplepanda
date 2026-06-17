const GLOBAL_KEY = "__purplepanda_document_path";

export function setDocumentPath(path: string) {
  (globalThis as Record<string, unknown>)[GLOBAL_KEY] = path;
}

export function getDocumentPath(): string {
  const path = (globalThis as Record<string, unknown>)[GLOBAL_KEY] as string | undefined;
  if (!path) throw new Error("[purplepanda] No document path provided. Pass `documentPath` to purplePandaIntegration().");
  return path;
}
