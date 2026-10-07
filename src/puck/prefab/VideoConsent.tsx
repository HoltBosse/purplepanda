import { type ReactNode, useEffect, useState } from "react";
import { REPLACEMENT_DEFAULTS } from "../../theme/index.js";
import { variantClass } from "../component-fields/ThemeFields.js";
import { EMBED_PROVIDERS, type EmbedProvider } from "./video-providers.js";
import type { VideoConsentOptions } from "./video-settings.js";

const STORAGE_PREFIX = "purplepanda:embed-consent:";

// Storage can be unavailable (privacy modes, blocked site data); a failure just means asking again.
function hasStoredConsent(provider: EmbedProvider): boolean {
  try {
    return window.localStorage.getItem(STORAGE_PREFIX + provider) === "1";
  } catch {
    return false;
  }
}

function storeConsent(provider: EmbedProvider): void {
  try {
    window.localStorage.setItem(STORAGE_PREFIX + provider, "1");
  } catch {
    // Not remembered; the visitor is asked again next time.
  }
}

// Text mixing a variable is built as one string throughout: islands are server-rendered with
// renderToStaticMarkup, which merges adjacent text nodes, so `Always allow {name}` would hydrate
// against one node where the client expects two.
//
// Stands in for a third-party player until the visitor agrees to load it, so nothing is requested
// from the service before then. Always renders the notice first — on the server and on hydration
// alike, so the two match — and only then checks for a remembered "always allow".
export default function VideoConsent({
  provider,
  options,
  children,
}: {
  provider: EmbedProvider;
  options: VideoConsentOptions;
  children: ReactNode;
}) {
  const [allowed, setAllowed] = useState(false);
  const [remember, setRemember] = useState(false);

  useEffect(() => {
    if (hasStoredConsent(provider)) setAllowed(true);
  }, [provider]);

  if (allowed) return children;

  const { name, privacyUrl } = EMBED_PROVIDERS[provider];
  const play = () => {
    if (options.remember && remember) storeConsent(provider);
    setAllowed(true);
  };

  return (
    <div
      className="flex flex-col items-center justify-center gap-4 bg-neutral p-6 text-center text-neutral-content"
      style={provider === "spotify" ? undefined : { aspectRatio: "16 / 9" }}
      data-video-consent={provider}
    >
      <p className="max-w-prose text-sm">{options.message.replaceAll("{service}", name)}</p>
      <button type="button" className={variantClass(REPLACEMENT_DEFAULTS.variant)} onClick={play}>
        {options.button}
      </button>
      {options.remember && (
        <label className="flex cursor-pointer items-center gap-2 text-sm">
          <input
            type="checkbox"
            className="checkbox checkbox-sm border-neutral-content/60"
            checked={remember}
            onChange={(event) => setRemember(event.target.checked)}
          />
          {`Always allow ${name}`}
        </label>
      )}
      <a className="link text-xs opacity-70" href={privacyUrl} target="_blank" rel="noopener noreferrer">
        {`${name} privacy policy`}
      </a>
    </div>
  );
}
