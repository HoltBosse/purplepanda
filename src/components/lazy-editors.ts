import { lazy } from "react";

// Mounted as client:only islands in place of the Puck editors themselves. Astro hydrates an island by
// importing its module directly, and the browser only discovers a chunk's imports once that chunk
// has arrived — so the editor's ~50 chunks would otherwise load four levels deep, one round trip
// per level. Behind a dynamic import, Vite emits modulepreload hints for the whole graph at once.
export const LazyPagePuckEditor = lazy(() => import("./PagePuckEditor.js"));
export const LazyContentPuckEditor = lazy(() => import("./ContentPuckEditor.js"));
export const LazyTemplatePuckEditor = lazy(() => import("./TemplatePuckEditor.js"));
export const LazyFormPuckEditor = lazy(() => import("./FormPuckEditor.js"));
export const LazyPrefabPuckEditor = lazy(() => import("./PrefabPuckEditor.js"));
export const LazyNotFoundPuckEditor = lazy(() => import("./NotFoundPuckEditor.js"));
