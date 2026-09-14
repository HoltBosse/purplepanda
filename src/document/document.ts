import documentPath from "virtual:purplepanda/document-path";

export function getDocumentPath(): string {
  if (!documentPath) throw new Error("[purplepanda] No document path provided. Pass `documentPath` to purplePandaIntegration().");
  return documentPath;
}
