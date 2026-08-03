const BASE = process.env.NEXT_PUBLIC_SPOTPATCH_API_URL || "http://localhost:3001";
export const tokenKey = "spotpatch_admin_token";
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
  const payload = (await response.json()) as {
    success: boolean;
    data?: T;
    error?: { message: string };
  };
  if (!response.ok || !payload.success)
    throw new Error(payload.error?.message || `HTTP ${response.status}`);
  return payload.data as T;
}
export function publicApiUrl(path: string) {
  return `${BASE}${path}`;
}
