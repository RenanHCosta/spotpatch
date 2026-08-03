import { defineConfig } from "@playwright/test";

export default defineConfig({
  testDir: "./tests/e2e",
  timeout: 30_000,
  fullyParallel: false,
  use: {
    baseURL: "http://localhost:3000",
    trace: "retain-on-failure",
    launchOptions: process.env.SPOTPATCH_E2E_CHROMIUM
      ? { executablePath: process.env.SPOTPATCH_E2E_CHROMIUM }
      : undefined,
  },
  webServer: [
    {
      command: "pnpm.cmd --filter @spotpatch/api dev",
      url: "http://localhost:3001",
      env: {
        SPOTPATCH_ADMIN_TOKEN: "e2e-admin-token",
        SPOTPATCH_AGENT_TOOLS_SECRET: "e2e-agent-secret",
        SPOTPATCH_AGENT_PROVIDER: "demo",
      },
      reuseExistingServer: true,
    },
    {
      command: "pnpm.cmd --filter @spotpatch/dashboard dev",
      url: "http://localhost:3000/demo",
      env: { NEXT_PUBLIC_SPOTPATCH_API_URL: "http://localhost:3001" },
      reuseExistingServer: true,
    },
  ],
});
