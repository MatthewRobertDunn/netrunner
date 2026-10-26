/**
 * Browser entry point.
 *
 * Bundles the engine and the Vue app into a single ES module for `index.html`.
 * A debug handle (`window.__netrunner`) exposes the underlying engine API so
 * the app can be driven and inspected from the browser console or via
 * Playwright — useful for automated front-end tests.
 */

import { createApp } from "npm:vue@3.5.13/dist/vue.esm-bundler.js";
import App from "./app.ts";
import * as engineApi from "../mod.ts";

// Vue's esm-bundler build expects these compile-time flags to be defined.
const flags = globalThis as unknown as Record<string, boolean>;
flags.__VUE_OPTIONS_API__ = true;
flags.__VUE_PROD_DEVTOOLS__ = false;
flags.__VUE_PROD_HYDRATION_MISMATCH_DETAILS__ = false;

const app = createApp(App);
app.mount("#app");

// Debug/manual-testing handle.
const g = globalThis as unknown as Record<string, unknown>;
g.__netrunner = {
  ...engineApi,
  app,
};
