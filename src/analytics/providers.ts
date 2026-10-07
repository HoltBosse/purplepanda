// The analytics/tracking providers offered under /admin/settings/analytics. Each one declares the
// fields an admin fills in and the markup it adds to every public page: `head` goes in the
// <head>, `body` (usually a <noscript> fallback) right after <body> opens. Adding a provider is
// just adding an entry here — the settings screen, its validation and the page output all follow.
//
// Field values are interpolated into inline scripts and URLs, so every field has a strict
// `pattern`: render.ts only ever passes a provider values that matched it, which is what keeps an
// ID from carrying markup or script of its own. Keep patterns to plain identifier characters.

export interface AnalyticsField {
  name: string;
  label: string;
  placeholder?: string;
  description?: string;
  // Optional fields may be left blank; anything entered must still match `pattern`.
  optional?: boolean;
  pattern: RegExp;
  patternMessage: string;
}

export type AnalyticsValues = Record<string, string>;

export interface AnalyticsProvider {
  id: string;
  name: string;
  description: string;
  docsUrl: string;
  fields: AnalyticsField[];
  head: (values: AnalyticsValues) => string;
  body?: (values: AnalyticsValues) => string;
}

// For values going into an inline script: a JSON string literal. The patterns already rule out
// quotes and `<`, so this is belt and braces. (Only ever undefined for an optional field.)
const js = (value = "") => JSON.stringify(value).replace(/</g, "\\u003c");

export const analyticsProviders: AnalyticsProvider[] = [
  {
    id: "gtm",
    name: "Google Tag Manager",
    description: "Loads a GTM container, which can in turn load any tags configured in Tag Manager.",
    docsUrl: "https://support.google.com/tagmanager/answer/14842164",
    fields: [
      {
        name: "containerId",
        label: "Container ID",
        placeholder: "GTM-XXXXXXX",
        pattern: /^GTM-[A-Z0-9]{4,12}$/,
        patternMessage: "must look like GTM-XXXXXXX",
      },
    ],
    head: ({ containerId }) =>
      `<script>(function(w,d,s,l,i){w[l]=w[l]||[];w[l].push({'gtm.start':new Date().getTime(),event:'gtm.js'});var f=d.getElementsByTagName(s)[0],j=d.createElement(s),dl=l!='dataLayer'?'&l='+l:'';j.async=true;j.src='https://www.googletagmanager.com/gtm.js?id='+i+dl;f.parentNode.insertBefore(j,f);})(window,document,'script','dataLayer',${js(containerId)});</script>`,
    body: ({ containerId }) =>
      `<noscript><iframe src="https://www.googletagmanager.com/ns.html?id=${containerId}" height="0" width="0" style="display:none;visibility:hidden"></iframe></noscript>`,
  },
  {
    id: "ga4",
    name: "Google Analytics 4",
    description: "Loads gtag.js directly. Not needed if GA4 is already set up as a tag inside Tag Manager.",
    docsUrl: "https://support.google.com/analytics/answer/9539598",
    fields: [
      {
        name: "measurementId",
        label: "Measurement ID",
        placeholder: "G-XXXXXXXXXX",
        pattern: /^G-[A-Z0-9]{4,16}$/,
        patternMessage: "must look like G-XXXXXXXXXX",
      },
    ],
    head: ({ measurementId }) =>
      `<script async src="https://www.googletagmanager.com/gtag/js?id=${measurementId}"></script>` +
      `<script>window.dataLayer=window.dataLayer||[];function gtag(){dataLayer.push(arguments);}gtag('js',new Date());gtag('config',${js(measurementId)});</script>`,
  },
  {
    id: "hotjar",
    name: "Hotjar",
    description: "Heatmaps, recordings and feedback widgets.",
    docsUrl: "https://help.hotjar.com/hc/en-us/articles/115009336727",
    fields: [
      {
        name: "siteId",
        label: "Site ID",
        placeholder: "1234567",
        pattern: /^\d{1,12}$/,
        patternMessage: "must be a number",
      },
    ],
    head: ({ siteId }) =>
      `<script>(function(h,o,t,j,a,r){h.hj=h.hj||function(){(h.hj.q=h.hj.q||[]).push(arguments)};h._hjSettings={hjid:${Number(siteId)},hjsv:6};a=o.getElementsByTagName('head')[0];r=o.createElement('script');r.async=1;r.src=t+h._hjSettings.hjid+j+h._hjSettings.hjsv;a.appendChild(r);})(window,document,'https://static.hotjar.com/c/hotjar-','.js?sv=');</script>`,
  },
  {
    id: "sentry",
    name: "Sentry",
    description: "Front-end error and performance monitoring, via Sentry's Loader Script.",
    docsUrl: "https://docs.sentry.io/platforms/javascript/install/loader/",
    fields: [
      {
        name: "publicKey",
        label: "Loader public key",
        placeholder: "0123456789abcdef0123456789abcdef",
        description: "From Project Settings → Client Keys (DSN) → JavaScript Loader Script.",
        pattern: /^[a-f0-9]{32}$/,
        patternMessage: "must be the 32-character key from the loader script URL",
      },
      {
        name: "environment",
        label: "Environment",
        placeholder: "production",
        optional: true,
        pattern: /^[A-Za-z0-9_.-]{1,64}$/,
        patternMessage: "may only contain letters, numbers, dots, dashes and underscores",
      },
    ],
    head: ({ publicKey, environment }) =>
      // sentryOnLoad has to be defined before the loader script runs.
      `${environment
        ? `<script>window.sentryOnLoad=function(){Sentry.init({environment:${js(environment)}});};</script>`
        : ""}<script src="https://js.sentry-cdn.com/${publicKey}.min.js" crossorigin="anonymous"></script>`,
  },
  {
    id: "clarity",
    name: "Microsoft Clarity",
    description: "Free heatmaps and session recordings.",
    docsUrl: "https://learn.microsoft.com/en-us/clarity/setup-and-installation/clarity-setup",
    fields: [
      {
        name: "projectId",
        label: "Project ID",
        placeholder: "abcd1234ef",
        pattern: /^[a-z0-9]{6,16}$/,
        patternMessage: "must be the lowercase project ID from Clarity's setup page",
      },
    ],
    head: ({ projectId }) =>
      `<script>(function(c,l,a,r,i,t,y){c[a]=c[a]||function(){(c[a].q=c[a].q||[]).push(arguments)};t=l.createElement(r);t.async=1;t.src="https://www.clarity.ms/tag/"+i;y=l.getElementsByTagName(r)[0];y.parentNode.insertBefore(t,y);})(window,document,"clarity","script",${js(projectId)});</script>`,
  },
  {
    id: "meta-pixel",
    name: "Meta Pixel",
    description: "Facebook / Instagram ads conversion tracking. Tracks a PageView on every page.",
    docsUrl: "https://developers.facebook.com/docs/meta-pixel/get-started",
    fields: [
      {
        name: "pixelId",
        label: "Pixel ID",
        placeholder: "123456789012345",
        pattern: /^\d{5,20}$/,
        patternMessage: "must be a number",
      },
    ],
    head: ({ pixelId }) =>
      `<script>!function(f,b,e,v,n,t,s){if(f.fbq)return;n=f.fbq=function(){n.callMethod?n.callMethod.apply(n,arguments):n.queue.push(arguments)};if(!f._fbq)f._fbq=n;n.push=n;n.loaded=!0;n.version='2.0';n.queue=[];t=b.createElement(e);t.async=!0;t.src=v;s=b.getElementsByTagName(e)[0];s.parentNode.insertBefore(t,s)}(window,document,'script','https://connect.facebook.net/en_US/fbevents.js');fbq('init',${js(pixelId)});fbq('track','PageView');</script>`,
    body: ({ pixelId }) =>
      `<noscript><img height="1" width="1" style="display:none" alt="" src="https://www.facebook.com/tr?id=${pixelId}&amp;ev=PageView&amp;noscript=1"></noscript>`,
  },
  {
    id: "plausible",
    name: "Plausible",
    description: "Privacy-friendly, cookieless analytics.",
    docsUrl: "https://plausible.io/docs/plausible-script",
    fields: [
      {
        name: "domain",
        label: "Site domain",
        placeholder: "example.com",
        description: "The domain exactly as it's registered in Plausible.",
        pattern: /^[a-z0-9.-]{1,253}$/,
        patternMessage: "must be a lowercase domain, e.g. example.com",
      },
      {
        name: "scriptHost",
        label: "Script host",
        placeholder: "plausible.io",
        description: "Only for self-hosted Plausible. Defaults to plausible.io.",
        optional: true,
        pattern: /^[a-z0-9.-]{1,253}(:\d{1,5})?$/,
        patternMessage: "must be a hostname, e.g. analytics.example.com",
      },
    ],
    head: ({ domain, scriptHost }) =>
      `<script defer data-domain="${domain}" src="https://${scriptHost || "plausible.io"}/js/script.js"></script>`,
  },
];

export function getAnalyticsProvider(id: string): AnalyticsProvider | undefined {
  return analyticsProviders.find((provider) => provider.id === id);
}
