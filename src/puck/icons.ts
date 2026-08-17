/**
 * Curated re-export of the lucide-react icons actually used in this package.
 *
 * Import icons from here instead of "lucide-react" directly. The vendor barrel
 * re-exports all ~4,000 icons from one entry point, and Vite's dev dependency
 * pre-bundler bundles that entire barrel as a single ~1.1MB chunk regardless of
 * which named exports are used, even though production (Rollup) tree-shakes it
 * fine. Deep-importing each icon from its own file avoids that dev-only cost.
 *
 * To add an icon: find its kebab-case filename under
 * node_modules/lucide-react/dist/esm/icons/ and add one line below.
 */
export { default as ChevronDown } from "lucide-react/dist/esm/icons/chevron-down.mjs";
export { default as CircleCheckBig } from "lucide-react/dist/esm/icons/circle-check-big.mjs";
export { default as CircleX } from "lucide-react/dist/esm/icons/circle-x.mjs";
export { default as Info } from "lucide-react/dist/esm/icons/info.mjs";
export { default as Link } from "lucide-react/dist/esm/icons/link.mjs";
export { default as Monitor } from "lucide-react/dist/esm/icons/monitor.mjs";
export { default as Save } from "lucide-react/dist/esm/icons/save.mjs";
export { default as Smartphone } from "lucide-react/dist/esm/icons/smartphone.mjs";
export { default as Subscript } from "lucide-react/dist/esm/icons/subscript.mjs";
export { default as Superscript } from "lucide-react/dist/esm/icons/superscript.mjs";
export { default as Tablet } from "lucide-react/dist/esm/icons/tablet.mjs";
export { default as TriangleAlert } from "lucide-react/dist/esm/icons/triangle-alert.mjs";
export { default as Type } from "lucide-react/dist/esm/icons/type.mjs";
