// Bundles the app into a single .jsx file for Claude's chat preview.
// Source of truth is src/; never edit the bundled output by hand.
import { build } from "esbuild";

await build({
  entryPoints: ["src/preview-entry.jsx"],
  bundle: true,
  format: "esm",
  jsx: "transform",
  banner: { js: 'import React from "react";' },
  external: ["react", "xlsx", "@supabase/supabase-js"],
  outfile: "dist-preview/import-planner.jsx",
});
console.log("built dist-preview/import-planner.jsx");
