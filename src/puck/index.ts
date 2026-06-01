import type { Config } from "@puckeditor/core";
export { ClientComponentDataWrapper, wrapConfigWithClientDataResolvers } from "./client-data-wrapper.js";

export type { Config as PurplePandaPuckConfig } from "@puckeditor/core";

type Awaitable<TValue> = TValue | Promise<TValue>;

type DataFieldsForComponent<TComponent> = TComponent extends { defaultProps?: infer TDefaultProps }
  ? TDefaultProps
  : TComponent extends { render: (props: infer TRenderProps) => unknown }
    ? Partial<TRenderProps>
    : never;

type RenderArgsForComponent<TComponent> = TComponent extends { render: (props: infer TRenderProps) => unknown }
  ? Partial<TRenderProps>
  : never;

type ComponentWithDataResolver<TComponent> = Omit<TComponent, "data"> & {
  data?: (fields: DataFieldsForComponent<TComponent>) => Awaitable<RenderArgsForComponent<TComponent>>;
};

type ConfigWithDataResolvers<TConfig extends Config> = Omit<TConfig, "components"> & {
  components: {
    [TName in keyof TConfig["components"]]: ComponentWithDataResolver<TConfig["components"][TName]>;
  };
};

declare module "@puckeditor/core" {
  interface ComponentConfigExtensions {
    data?: (fields: any) => Awaitable<Record<string, unknown>>;
  }
}

export function definePuckConfig<TConfig extends Config>(config: ConfigWithDataResolvers<TConfig>): ConfigWithDataResolvers<TConfig> {
  return config;
}
