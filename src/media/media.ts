import "dotenv/config";
import { resolve } from "node:path";

// Uploaded originals are user data rather than build input, so they live outside src/ -- ./media
// under the project root by default. MEDIA_PATH (absolute) overrides that for a deployment that
// keeps them on a mounted volume, or that starts the server from somewhere other than the project
// root. Resolved per call rather than at module load so a test can point it elsewhere.
export function getMediaPath(): string {
  return resolve(process.env.MEDIA_PATH ?? "media");
}
