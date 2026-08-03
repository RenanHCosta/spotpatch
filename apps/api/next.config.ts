import type { NextConfig } from "next";
const config: NextConfig = {
  transpilePackages: [
    "@spotpatch/database",
    "@spotpatch/deco-studio",
    "@spotpatch/security",
    "@spotpatch/shared",
    "@spotpatch/workflow",
  ],
  experimental: { serverActions: { bodySizeLimit: "12mb" } },
};
export default config;
