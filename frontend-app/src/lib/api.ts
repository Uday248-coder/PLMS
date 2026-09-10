import { getToken } from "./auth";

export class ApiError extends Error {
  status: number;
  constructor(status: number, message: string) {
    super(message);
    this.status = status;
    this.name = "ApiError";
  }
}

let _redirecting = false;

// Split-deploy: when the frontend (Vercel) and backend (Render) are on
// different origins, set VITE_API_URL to the Render backend URL
// (e.g. https://parking-backend.onrender.com). Falls back to same-origin.
const API_BASE = (import.meta.env.VITE_API_URL as string | undefined)?.replace(/\/$/, "") ?? "";

export async function api<T = unknown>(
  path: string,
  method: string = "GET",
  body?: unknown
): Promise<T> {
  const token = getToken();
  const headers: Record<string, string> = {
    "Content-Type": "application/json",
  };
  if (token) headers["Authorization"] = `Bearer ${token}`;

  const url = `${API_BASE}${path}`;
  const r = await fetch(url, {
    method,
    headers,
    body: body ? JSON.stringify(body) : undefined,
  });

  if (r.status === 401) {
    localStorage.removeItem("park_token");
    localStorage.removeItem("park_who");
    if (!_redirecting) {
      _redirecting = true;
      window.location.assign("/");
    }
    throw new ApiError(401, "Session expired — please log in again.");
  }

  if (!r.ok) {
    let message = `Request failed (${r.status})`;
    try {
      const data = await r.json();
      message = data?.detail ?? JSON.stringify(data);
    } catch {
      const text = await r.text().catch(() => "");
      if (text) message = text;
    }
    throw new ApiError(r.status, message);
  }

  return r.json();
}
