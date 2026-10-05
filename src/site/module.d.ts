declare module "purplepanda:site" {
  // Resolved by the `purple-panda-site` Vite plugin in astro.config.ts — see src/site/resolve.ts.
  const site: import("./index.js").PurplePandaSite;
  export default site;
}
