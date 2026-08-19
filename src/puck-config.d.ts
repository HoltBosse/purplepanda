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
