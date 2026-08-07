const BASE = (process.env.NEXT_PUBLIC_SPOTPATCH_API_URL || "http://localhost:3001").replace(
  /\/+$/,
  "",
);
export const tokenKey = "spotpatch_admin_token";

export class ApiError extends Error {
  constructor(
    message: string,
    readonly status: number,
    readonly code?: string,
  ) {
    super(message);
    this.name = "ApiError";
  }
}

export async function api<T>(path: string, init: RequestInit = {}) {
  const token = typeof window !== "undefined" ? sessionStorage.getItem(tokenKey) : null;
  const response = await fetch(`${BASE}${path}`, {
    ...init,
    headers: {
      "Content-Type": "application/json",
      ...(token ? { "X-SpotPatch-Admin-Token": token } : {}),
      ...init.headers,
    },
    cache: "no-store",
  });
  const payload = (await response.json().catch(() => null)) as {
    success: boolean;
    data?: T;
    error?: { code?: string; message: string };
  } | null;
  if (!response.ok || !payload?.success)
    throw new ApiError(
      payload?.error?.message || `HTTP ${response.status}`,
      response.status,
      payload?.error?.code,
    );
  return payload.data as T;
}
export function publicApiUrl(path: string) {
  return `${BASE}${path}`;
}
