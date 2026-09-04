import { useState, type FormEvent } from "react";
import { login, logout as authLogout, getWho } from "../lib/auth";
import { Button } from "./ui/Button";
import { Input } from "./ui/Input";

interface Props {
  role: string;
  onAuth: () => void;
}

export function AuthBar({ role, onAuth }: Props) {
  const who = getWho();
  const [name, setName] = useState("");
  const [pass, setPass] = useState("");
  const [error, setError] = useState("");

  async function handleLogin(e: FormEvent) {
    e.preventDefault();
    setError("");
    try {
      await login(name, pass, role);
      onAuth();
    } catch (err: any) {
      setError(err.message || "Login failed");
    }
  }

  function handleLogout() {
    authLogout();
    onAuth();
  }

  return (
    <div className="bg-white border border-slate-200 rounded-xl p-4 flex flex-wrap gap-3 items-center text-sm">
      <span className="text-slate-500">
        {who ? (
          <>
            Logged in as{" "}
            <span className="font-medium text-slate-700">
              {who.role}:{who.name}
            </span>
          </>
        ) : (
          <span className="text-slate-400">
            Not logged in{" "}
            <span className="text-xs">
              (demo: {role}1 / {role}123)
            </span>
          </span>
        )}
      </span>

      {!who ? (
        <form onSubmit={handleLogin} className="flex gap-2 items-center">
          <Input
            placeholder={role + "1"}
            value={name}
            onChange={(e) => setName(e.target.value)}
            className="w-24"
          />
          <Input
            type="password"
            placeholder={role + "123"}
            value={pass}
            onChange={(e) => setPass(e.target.value)}
            className="w-28"
          />
          <Button type="submit" size="sm">
            Login
          </Button>
        </form>
      ) : (
        <Button variant="secondary" size="sm" onClick={handleLogout}>
          Logout
        </Button>
      )}
      {error && <span className="text-xs text-red-600">{error}</span>}
    </div>
  );
}
