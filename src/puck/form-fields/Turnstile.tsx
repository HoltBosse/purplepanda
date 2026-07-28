import type { ComponentConfig } from "@puckeditor/core";
import * as z from "zod";

// `siteKey` isn't an editable field — it's resolved server-side by `data` below from the
// turnstile_site_key setting, mirroring FormEmbed.tsx's `_html`.
export type TurnstileProps = {
  siteKey?: string;
};

type TurnstileRenderProps = TurnstileProps & { id: string; puck?: { isEditing?: boolean } };

function toSubmissionSchema() {
  return z
    .string()
    .min(1, "Verification required")
    .refine(async (token) => {
      // Dynamically imported so the server-only DB/fetch code in turnstile.server.js never gets
      // pulled into the client editor bundle that also imports this component (see FormEmbed.tsx
      // for the same pattern).
      const { verifyTurnstileToken } = await import("./turnstile.server.js");
      return verifyTurnstileToken(token);
    }, "Verification failed, please try again");
}

const Turnstile: ComponentConfig<TurnstileProps> = {
  label: "Turnstile",
  locations: "form",
  toSubmissionSchema,
  data: async () => {
    if (!import.meta.env.SSR) return {};
    const { getTurnstileSiteKey } = await import("./turnstile.server.js");
    return { siteKey: await getTurnstileSiteKey() };
  },
  fields: {},
  defaultProps: {},
  render: ({ id, puck, siteKey }: TurnstileRenderProps) => {
    if (puck?.isEditing) {
      return (
        <div className="w-full rounded-md border border-dashed border-base-content/30 bg-base-200 px-4 py-6 text-center text-sm text-base-content/60">
          Turnstile widget (placeholder while editing — renders live on the published form)
        </div>
      );
    }

    if (!siteKey) {
      return (
        <p className="w-full text-sm text-error">
          Turnstile is not configured. Set turnstile_site_key and turnstile_secret_key in settings.
        </p>
      );
    }

    return (
      <div className="w-full">
        <div className="cf-turnstile" data-sitekey={siteKey} data-response-field-name={`field-${id}`} />
        <script src="https://challenges.cloudflare.com/turnstile/v0/api.js" async defer />
      </div>
    );
  },
};

export default Turnstile;
