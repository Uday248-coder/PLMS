import AsyncStorage from "@react-native-async-storage/async-storage";

export class ApiError extends Error {
  status: number;
  constructor(status: number, message: string) {
    super(message);
    this.status = status;
    this.name = "ApiError";
  }
}

// Render backend URL is injected at build time via EXPO_PUBLIC_API_URL.
// Falls back to the local dev server for `expo start --web` / simulators.
const API_BASE_URL =
  (process.env.EXPO_PUBLIC_API_URL as string | undefined)?.replace(/\/$/, "") ||
  "http://localhost:8000";

export async function api<T = unknown>(
  path: string,
  method: string = "GET",
  body?: unknown
): Promise<T> {
  const token = await AsyncStorage.getItem("park_token");
  const headers: Record<string, string> = {
    "Content-Type": "application/json",
  };
  
  if (token) {
    headers["Authorization"] = `Bearer ${token}`;
  }

  const url = `${API_BASE_URL}${path}`;

  try {
    const r = await fetch(url, {
      method,
      headers,
      body: body ? JSON.stringify(body) : undefined,
    });

    if (r.status === 401) {
      await AsyncStorage.removeItem("park_token");
      await AsyncStorage.removeItem("park_who");
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
  } catch (err) {
    if (err instanceof ApiError) throw err;
    // Network or parse error (offline scenario)
    throw new Error("Network error. Please check your connection.");
  }
}
