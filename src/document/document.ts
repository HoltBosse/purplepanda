import "dotenv/config";
import { resolve } from "node:path";

// Same arrangement as getMediaPath() in ../media/media.ts: ./documents under the project root by
// default, DOCUMENT_PATH (absolute) to override.
export function getDocumentPath(): string {
  return resolve(process.env.DOCUMENT_PATH ?? "documents");
}
