import type { ComponentConfig } from "@puckeditor/core";
import * as z from "zod";
import { type TurnstileWidgetOptions, turnstileSiteSettings } from "./turnstile-settings.js";

// `_turnstile` isn't an editable field — it's resolved server-side by `data` below from the site's
// Turnstile settings (Admin → Settings), mirroring FormEmbed.tsx's `_html`. Undefined until both
// keys are set.
export type TurnstileProps = {
  _turnstile?: TurnstileWidgetOptions;
};

type TurnstileRenderProps = TurnstileProps & { id: string; puck?: { isEditing?: boolean } };

function toSubmissionSchema() {
  return z
    .string()
    .min(1, "Verification required")
    .refine(async (token) => {
      // Dynamically imported so the server-only DB/fetch code in turnstile.server.js never gets
      // pulled into the client editor bundle that also imports this component (see FormEmbed.tsx
      // for the same pattern). The SSR guard is what actually keeps it out: without it Vite still
      // emits the server module as a fetchable client chunk.
      if (!import.meta.env.SSR) return false;
      const { verifyTurnstileToken } = await import("./turnstile.server.js");
      return verifyTurnstileToken(token);
    }, "Verification failed, please try again");
}

const Turnstile: ComponentConfig<TurnstileProps> = {
  label: "Turnstile",
  locations: "form",
  submissionDisplay: false,
  toSubmissionSchema,
  siteSettings: turnstileSiteSettings,
  data: async () => {
    if (!import.meta.env.SSR) return {};
    const { getTurnstileWidgetOptions } = await import("./turnstile.server.js");
    return { _turnstile: await getTurnstileWidgetOptions() };
  },
  fields: {},
  defaultProps: {},
  render: ({ id, puck, _turnstile: options }: TurnstileRenderProps) => {
    if (puck?.isEditing) {
      return (
        <div className="w-full rounded-md border border-dashed border-base-content/30 bg-base-200 px-4 py-6 text-center text-sm text-base-content/60">
          Turnstile widget (placeholder while editing — renders live on the published form)
        </div>
      );
    }

    if (!options) {
      return (
        <p className="w-full text-sm text-error">
          Turnstile is not configured. Set its site key and secret key under Settings → Turnstile.
        </p>
      );
    }

    return (
      <div className="w-full">
        <div
          className="cf-turnstile"
          data-sitekey={options.siteKey}
          data-theme={options.theme}
          data-size={options.size}
          data-appearance={options.appearance}
          data-language={options.language}
          data-response-field-name={`field-${id}`}
        />
        <script src="https://challenges.cloudflare.com/turnstile/v0/api.js" async defer />
      </div>
    );
  },
};

export default Turnstile;
