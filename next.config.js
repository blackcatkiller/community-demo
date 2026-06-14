/**
 * Run `build` or `dev` with `SKIP_ENV_VALIDATION` to skip env validation. This is especially useful
 * for Docker builds.
 */
import "./src/env.js";
import path from "node:path";

/** @type {import("next").NextConfig} */
const config = {
  reactStrictMode: false,
  webpack: (config) => {
    config.resolve ??= {};
    config.resolve.alias ??= {};
    config.resolve.alias["chili-wasm"] = path.resolve(
      process.cwd(),
      "src/modules/editor/features/modelai/wasm/chili-wasm.js",
    );
    config.module ??= {};
    config.module.rules ??= [];
    config.module.rules.push({
      test: /\.wasm$/i,
      resourceQuery: /url/,
      type: "asset/resource",
    });
    return config;
  },
};

export default config;
