import { getToken } from "./auth";

export class ApiError extends Error {
  status: number;
  constructor(status: number, message: string) {
    super(message);
    this.status = status;
    this.name = "ApiError";
  }
}

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

  const r = await fetch(path, {
    method,
    headers,
    body: body ? JSON.stringify(body) : undefined,
  });

  if (r.status === 401) {
    localStorage.removeItem("park_token");
    localStorage.removeItem("park_who");
    window.location.reload();
    throw new ApiError(401, "Session expired — please log in again.");
  }

  if (!r.ok) {
    const text = await r.text();
    throw new ApiError(r.status, text || `Request failed (${r.status})`);
  }

  return r.json();
}
