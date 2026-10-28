import { build } from "esbuild";
import { renderToString } from "react-dom/server";
import React from "react";

await build({
  entryPoints: ["src/modules/crm/smokeEntry.jsx"],
  bundle: true,
  outfile: "dist-preview/.smoke.mjs",
  format: "esm",
  jsx: "automatic",
  platform: "node",
  external: ["react", "react-dom", "xlsx", "@supabase/supabase-js", "react/jsx-runtime"],
});
const { default: run } = await import("./dist-preview/.smoke.mjs");
run(React, renderToString);
