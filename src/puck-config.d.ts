declare module "virtual:purplepanda/puck-config" {
  import type { Config } from "@puckeditor/core";

  const config: Partial<Config> | undefined;
  export default config;
}

declare module "virtual:purplepanda/has-404" {
  export const has404Page: boolean;
}
