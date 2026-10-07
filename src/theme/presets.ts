import { buildFontLink } from "../form/fields/font-utils.js";
import { BORDER_SIDES, type BorderPreset, type ButtonVariant, NO_FONT, type TextStyle, type Theme } from "./types.js";

// Starter themes, shared by every tenant. A site without a `theme` settings row renders
// DEFAULT_THEME (see ./server.ts), and the theme screen can start over from any of these.

const BUILTIN_VARIANTS: ButtonVariant[] = [
  { id: "primary", name: "Primary", builtin: true, bg: "scheme.btnBg", fg: "scheme.btnFg", border: "none" },
  { id: "secondary", name: "Secondary", builtin: true, bg: "transparent", fg: "scheme.fg", border: "scheme.border" },
  { id: "ghost", name: "Ghost", builtin: true, bg: "transparent", fg: "scheme.fg", border: "none" },
];

const BUILTIN_BORDERS: BorderPreset[] = [
  { id: "subtle", name: "Subtle", builtin: true, width: 1, color: "scheme.border" },
  { id: "strong", name: "Strong", builtin: true, width: 2, color: "scheme.fg" },
];

// Reproduces what sites looked like before themes existed: daisyUI's light theme (white page,
// `btn btn-primary` buttons, 0.25rem button corners) and Tailwind Typography's heading sizes, so
// an existing site looks the same until someone edits its theme. Dark values match the light ones
// for the same reason: visitors with a dark system setting see no change until a site sets them.
export const DEFAULT_THEME: Theme = {
  version: 1,
  colors: [
    { id: "canvas", name: "Canvas", light: "#ffffff", dark: "#ffffff" },
    { id: "canvas-muted", name: "Canvas muted", light: "#f8f8f8", dark: "#f8f8f8" },
    { id: "ink", name: "Ink", light: "#18181b", dark: "#18181b" },
    { id: "ink-soft", name: "Ink soft", light: "#52525b", dark: "#52525b" },
    { id: "line", name: "Line", light: "#e4e4e7", dark: "#e4e4e7" },
    { id: "primary", name: "Primary", light: "#422ad5", dark: "#422ad5" },
    { id: "primary-content", name: "Primary content", light: "#e0e7ff", dark: "#e0e7ff" },
    { id: "neutral", name: "Neutral", light: "#09090b", dark: "#09090b" },
    { id: "neutral-content", name: "Neutral content", light: "#e4e4e7", dark: "#e4e4e7" },
    { id: "neutral-soft", name: "Neutral soft", light: "#a1a1aa", dark: "#a1a1aa" },
  ],
  gradients: [],
  schemes: [
    {
      id: "default",
      name: "Default",
      builtin: true,
      roles: { bg: "canvas", fg: "ink", muted: "ink-soft", btnBg: "primary", btnFg: "primary-content", border: "line" },
    },
    {
      id: "muted",
      name: "Muted",
      roles: { bg: "canvas-muted", fg: "ink", muted: "ink-soft", btnBg: "primary", btnFg: "primary-content", border: "line" },
    },
    {
      id: "inverted",
      name: "Inverted",
      roles: { bg: "neutral", fg: "neutral-content", muted: "neutral-soft", btnBg: "canvas", btnFg: "ink", border: "ink-soft" },
    },
  ],
  fonts: [
    { id: "heading", name: "Heading", builtin: true, ...NO_FONT },
    { id: "body", name: "Body", builtin: true, ...NO_FONT },
  ],
  textStyles: [
    { id: "display", name: "Display", builtin: true, font: "heading", size: 12, weight: 800, lineHeight: 1.1 },
    { id: "h1", name: "Heading 1", builtin: true, font: "heading", size: 9, weight: 800, lineHeight: 1.11 },
    { id: "h2", name: "Heading 2", builtin: true, font: "heading", size: 6, weight: 700, lineHeight: 1.33 },
    { id: "h3", name: "Heading 3", builtin: true, font: "heading", size: 5, weight: 600, lineHeight: 1.6 },
    { id: "body", name: "Body", builtin: true, font: "body", size: 4, weight: 400, lineHeight: 1.75 },
    { id: "small", name: "Small", builtin: true, font: "body", size: 3.5, weight: 400, lineHeight: 1.5 },
  ],
  radii: { sm: 1, md: 2, lg: 4, full: "full" },
  buttons: { radius: "sm", weight: 600, size: "default", variants: BUILTIN_VARIANTS },
  borders: BUILTIN_BORDERS,
  card: { border: "subtle", sides: [...BORDER_SIDES], radius: "md", shadow: "none", padding: "comfortable" },
  replaced: {},
};

const ALL_WEIGHTS = [100, 200, 300, 400, 500, 600, 700, 800, 900];

const GRAPE_TEXT_STYLES: TextStyle[] = [
  { id: "display", name: "Display", builtin: true, font: "heading", size: 14, weight: 600, lineHeight: 1.05 },
  { id: "h1", name: "Heading 1", builtin: true, font: "heading", size: 10, weight: 600, lineHeight: 1.1 },
  { id: "h2", name: "Heading 2", builtin: true, font: "heading", size: 7.5, weight: 600, lineHeight: 1.2 },
  { id: "h3", name: "Heading 3", builtin: true, font: "body", size: 4.75, weight: 600, lineHeight: 1.3 },
  { id: "body", name: "Body", builtin: true, font: "body", size: 4, weight: 400, lineHeight: 1.6 },
  { id: "small", name: "Small", builtin: true, font: "body", size: 3.5, weight: 400, lineHeight: 1.5 },
];

// A fuller example: brand and gradient schemes, real dark values, Bunny fonts.
export const GRAPE_THEME: Theme = {
  version: 1,
  colors: [
    { id: "canvas", name: "Canvas", light: "#ffffff", dark: "#15131d" },
    { id: "canvas-muted", name: "Canvas muted", light: "#f5f3fa", dark: "#1e1b29" },
    { id: "ink", name: "Ink", light: "#1d1a27", dark: "#f1eef8" },
    { id: "ink-soft", name: "Ink soft", light: "#5e5a6e", dark: "#aba6bd" },
    { id: "mist", name: "Mist", light: "#b9b4c9", dark: "#5e5a6e" },
    { id: "line", name: "Line", light: "#e3e0ec", dark: "#322d42" },
    { id: "grape", name: "Grape", light: "#5b3fd0", dark: "#7059e3" },
    { id: "grape-deep", name: "Grape deep", light: "#47309f", dark: "#4a34b5" },
    { id: "grape-tint", name: "Grape tint", light: "#d9d1fa", dark: "#d9d1fa" },
    { id: "white", name: "White", light: "#ffffff", dark: "#ffffff" },
    { id: "leaf", name: "Leaf", light: "#17784f", dark: "#1f8f5f" },
  ],
  gradients: [
    { id: "dusk", name: "Dusk", type: "linear", angle: 135, stops: [{ color: "grape-deep", at: 0 }, { color: "grape", at: 100 }] },
  ],
  schemes: [
    {
      id: "default",
      name: "Default",
      builtin: true,
      roles: { bg: "canvas", fg: "ink", muted: "ink-soft", btnBg: "grape", btnFg: "white", border: "line" },
    },
    {
      id: "muted",
      name: "Muted",
      roles: { bg: "canvas-muted", fg: "ink", muted: "ink-soft", btnBg: "grape", btnFg: "white", border: "line" },
    },
    {
      id: "brand",
      name: "Brand",
      roles: { bg: "grape", fg: "white", muted: "grape-tint", btnBg: "white", btnFg: "grape-deep", border: "grape-tint" },
    },
    {
      id: "inverted",
      name: "Inverted",
      roles: { bg: "ink", fg: "canvas", muted: "mist", btnBg: "canvas", btnFg: "ink", border: "ink-soft" },
    },
    {
      id: "dusk",
      name: "Dusk",
      gradient: "dusk",
      roles: { bg: "grape-deep", fg: "white", muted: "grape-tint", btnBg: "white", btnFg: "grape-deep", border: "grape-tint" },
    },
  ],
  fonts: [
    { id: "heading", name: "Heading", builtin: true, family: "Fraunces", link: buildFontLink("Fraunces", [400, 600]), category: "serif", weights: ALL_WEIGHTS },
    { id: "body", name: "Body", builtin: true, family: "Inter", link: buildFontLink("Inter", [400, 600, 700]), category: "sans-serif", weights: ALL_WEIGHTS },
  ],
  textStyles: GRAPE_TEXT_STYLES,
  radii: { sm: 1, md: 2, lg: 3.5, full: "full" },
  buttons: {
    radius: "md",
    weight: 600,
    size: "default",
    variants: [...BUILTIN_VARIANTS, { id: "accent", name: "Accent", bg: "color.leaf", fg: "color.white", border: "none" }],
  },
  borders: BUILTIN_BORDERS,
  card: { border: "subtle", sides: [...BORDER_SIDES], radius: "lg", shadow: "none", padding: "comfortable" },
  replaced: {},
};

export const THEME_PRESETS: { id: string; name: string; theme: Theme }[] = [
  { id: "default", name: "Default", theme: DEFAULT_THEME },
  { id: "grape", name: "Grape", theme: GRAPE_THEME },
];
