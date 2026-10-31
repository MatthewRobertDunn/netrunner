/**
 * DOM bridge for `deno test`.
 *
 * Installs happy-dom on `globalThis` so Vue's runtime and
 * `@vue/test-utils` can mount components without a real browser or network.
 *
 * Import this module first in every UI test file.
 */

import { Window } from "happy-dom";

const win = new Window();

// Vue's esm-bundler build reads these compile-time flags from globalThis.
const flags = globalThis as unknown as Record<string, boolean>;
flags.__VUE_OPTIONS_API__ = true;
flags.__VUE_PROD_DEVTOOLS__ = false;
flags.__VUE_PROD_HYDRATION_MISMATCH_DETAILS__ = false;

// Bridge the DOM globals (index signature via `Record` so `deno check` stays
// happy). Values come straight from happy-dom's Window.
const g = globalThis as unknown as Record<string, unknown>;
g.window = win;
g.document = win.document;
g.navigator = win.navigator;
g.HTMLElement = win.HTMLElement;
g.Node = win.Node;
g.Element = win.Element;
g.Text = win.Text;
g.Comment = win.Comment;
g.DocumentFragment = win.DocumentFragment;
g.customElements = win.customElements;
g.SVGElement = win.SVGElement;
g.Event = win.Event;
g.MouseEvent = win.MouseEvent;
g.requestAnimationFrame = win.requestAnimationFrame.bind(win);
if (win.cancelAnimationFrame) {
  g.cancelAnimationFrame = win.cancelAnimationFrame.bind(win);
}
