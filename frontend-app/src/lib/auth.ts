import type { LoginResponse } from "../types";

const TOKEN_KEY = "park_token";
const WHO_KEY = "park_who";

export function getToken(): string | null {
  return localStorage.getItem(TOKEN_KEY);
}

export function setToken(token: string, role: string, name: string) {
  localStorage.setItem(TOKEN_KEY, token);
  localStorage.setItem(WHO_KEY, `${role}:${name}`);
}

export function clearToken() {
  localStorage.removeItem(TOKEN_KEY);
  localStorage.removeItem(WHO_KEY);
}

export function getWho(): { role: string; name: string } | null {
  const raw = localStorage.getItem(WHO_KEY);
  if (!raw) return null;
  const [role, ...rest] = raw.split(":");
  return { role, name: rest.join(":") };
}

export function isLoggedIn(): boolean {
  return !!getToken();
}

export async function login(
  name: string,
  password: string,
  role: string
): Promise<LoginResponse> {
  const r = await fetch("/api/auth/login", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ name, password, role }),
  });
  if (!r.ok) throw new Error(await r.text());
  const data: LoginResponse = await r.json();
  setToken(data.token, data.role, data.name);
  return data;
}

export async function quickLogin(role: "admin" | "guard"): Promise<LoginResponse> {
  const credentials =
    role === "admin"
      ? { name: "admin", password: "admin123", role: "admin" }
      : { name: "guard1", password: "guard123", role: "guard" };
  return login(credentials.name, credentials.password, credentials.role);
}

export function logout() {
  clearToken();
}
