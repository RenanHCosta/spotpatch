import { defineConfig } from "wxt";
export default defineConfig({
  modules: ["@wxt-dev/module-react"],
  webExt: { disabled: true },
  manifest: {
    name: "SpotPatch",
    description: "Clique no site e transforme feedback visual em investigação técnica.",
    permissions: ["activeTab", "storage", "tabs", "scripting"],
    host_permissions: ["http://localhost:3001/*", "https://*/api/public/*"],
    action: { default_title: "SpotPatch" },
  },
});
