/**
 * Type shim for deep-importing individual lucide-react icons.
 * We import icons from their concrete dist path (e.g. "lucide-react/dist/esm/icons/link.mjs")
 * instead of the package barrel, because Vite's dev dependency pre-bundler bundles the
 * entire barrel (3,988 icons, ~1.1MB unminified) as a single chunk regardless of which
 * named exports are actually used. lucide-react ships no .d.ts next to these files, so
 * TypeScript can't resolve them without this shim.
 */
declare module "lucide-react/dist/esm/icons/*.mjs" {
  import type { LucideIcon } from "lucide-react";

  const icon: LucideIcon;
  export default icon;
}
