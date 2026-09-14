declare module "virtual:purplepanda/puck-config" {
  import type { Config } from "@puckeditor/core";
  import type { ContentType } from "./puck/index.js";

  const config: (Partial<Config> & { contentTypes?: ContentType[]; fontFamilies?: string[] }) | undefined;
  export default config;
}

declare module "virtual:purplepanda/has-404" {
  export const has404Page: boolean;
}

declare module "virtual:purplepanda/islands" {
  import type { ComponentConfig } from "@puckeditor/core";

  const loaders: Record<string, () => Promise<ComponentConfig>>;
  export default loaders;
}

declare module "virtual:purplepanda/db" {
  import type { NodePgDatabase } from "drizzle-orm/node-postgres";
  import type { Pool } from "pg";

  // `$client` (the raw pg Pool) is drizzle's own property on the object returned by
  // `drizzle(pool)` — needed for LISTEN/NOTIFY-based cache invalidation across cluster workers
  // (see db/content-cache.ts) and for handing rate-limiter-flexible a real Postgres connection.
  const db: NodePgDatabase<Record<string, unknown>> & { $client: Pool };
  export default db;
}

declare module "virtual:purplepanda/media-path" {
  const mediaPath: string;
  export default mediaPath;
}

declare module "virtual:purplepanda/document-path" {
  const documentPath: string | null;
  export default documentPath;
}

declare module "virtual:purplepanda/plugins" {
  import type { PurplePandaPlugin } from "./hooks/index.js";

  const plugins: PurplePandaPlugin[];
  export default plugins;
}
