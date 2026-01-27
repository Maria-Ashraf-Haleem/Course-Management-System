// src/lib/auth.ts
// Single source of truth for auth token + user cache

export const TOKEN_KEY = "token";
export const USER_KEY = "current_user";
export const REMEMBER_KEY = "remember_me"; // "1" = remember (localStorage), "0" or missing = sessionStorage

/* --------------------------- storage helpers --------------------------- */

const storagePrefersLocal = (): boolean => {
  try {
    return (localStorage.getItem(REMEMBER_KEY) ?? "1") === "1";
  } catch {
    return true;
  }
};

const writeStore = () =>
  storagePrefersLocal() ? localStorage : sessionStorage;
const readToken = (): string | null => {
  try {
    return localStorage.getItem(TOKEN_KEY) ?? sessionStorage.getItem(TOKEN_KEY);
  } catch {
    return null;
  }
};
const readUserRaw = (): string | null => {
  try {
    return localStorage.getItem(USER_KEY) ?? sessionStorage.getItem(USER_KEY);
  } catch {
    return null;
  }
};
const clearBoth = (key: string) => {
  try {
    localStorage.removeItem(key);
  } catch {}
  try {
    sessionStorage.removeItem(key);
  } catch {}
};

/* ------------------------------- token api ------------------------------ */

export function setToken(token: string) {
  try {
    // write to preferred, remove from the other to avoid stale copies
    writeStore().setItem(TOKEN_KEY, token);
    (storagePrefersLocal() ? sessionStorage : localStorage).removeItem(
      TOKEN_KEY
    );
  } catch {}
}

export function getToken(): string | null {
  return readToken();
}

export function clearToken() {
  clearBoth(TOKEN_KEY);
}

/* ------------------------------- user cache ----------------------------- */

export function setUser(user: any) {
  try {
    const json = JSON.stringify(user ?? null);
    writeStore().setItem(USER_KEY, json);
    (storagePrefersLocal() ? sessionStorage : localStorage).removeItem(
      USER_KEY
    );
  } catch {}
}

export function getUser(): any | null {
  try {
    const raw = readUserRaw();
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
}

export function clearUser() {
  clearBoth(USER_KEY);
}

/* ------------------------------ JWT helpers ----------------------------- */

const padBase64 = (b64: string) => {
  const pad = b64.length % 4;
  if (pad === 0) return b64;
  return b64 + "=".repeat(4 - pad);
};

/** Decode a JWT payload safely (no verification; client-side only). */
function decodeJwt(token: string): Record<string, any> | null {
  try {
    const [, payload] = token.split(".");
    if (!payload) return null;
    // base64url -> base64 (+ padding)
    const base64 = padBase64(payload.replace(/-/g, "+").replace(/_/g, "/"));
    const json = decodeURIComponent(
      atob(base64)
        .split("")
        .map((c) => "%" + ("00" + c.charCodeAt(0).toString(16)).slice(-2))
        .join("")
    );
    return JSON.parse(json);
  } catch {
    return null;
  }
}

export const tokenExpSeconds = (): number | null => {
  const t = getToken();
  const exp = t ? decodeJwt(t)?.exp : null;
  return typeof exp === "number" ? exp : null;
};

export const isTokenExpired = (): boolean => {
  const exp = tokenExpSeconds();
  if (exp == null) return false;
  const now = Math.floor(Date.now() / 1000);
  return exp < now;
};

/** Returns true if we have a token and it's not expired. */
export function isAuthed(): boolean {
  const token = getToken();
  if (!token) return false;
  if (isTokenExpired()) {
    clearToken();
    clearUser();
    return false;
  }
  return true;
}

/* -------------------------------- roles -------------------------------- */

export type UserRole = "student" | "doctor" | "admin" | "instructor"; // Added "| "instructor""

/** Try to read role from JWT (or provided token). */
export function getRoleFromToken(token?: string): UserRole | null {
  const t = token ?? getToken();
  if (!t) return null;
  const payload = decodeJwt(t);
  const raw =
    payload?.role ??
    (Array.isArray(payload?.roles) ? payload?.roles[0] : undefined);
  if (!raw) return null;
  const role = String(raw).toLowerCase();
  const allowed = ["student", "doctor", "admin", "instructor"] as const; // Added "instructor"
  return (allowed as readonly string[]).includes(role as any)
    ? (role as UserRole)
    : null;
}

/** Preferred: read role from cached /auth/me; fallback to token. */
export function getRole(): UserRole | null {
  const u = getUser();
  const r = String(u?.role || "").toLowerCase();
  if (["student", "doctor", "admin", "instructor"].includes(r)) return r as UserRole; // Added "instructor"
  return getRoleFromToken();
}

/** Extract numeric user id from token sub claim, if present. */
export function getUserId(): number | null {
  const t = getToken();
  const sub = t ? decodeJwt(t)?.sub : null;
  const n = Number(sub);
  return Number.isFinite(n) ? n : null;
}

/** Helper to persist everything after successful login. */
export function saveAuthBundle(opts: {
  token: string;
  user?: any;
  remember?: boolean;
}) {
  try {
    if (typeof opts.remember === "boolean") {
      localStorage.setItem(REMEMBER_KEY, opts.remember ? "1" : "0");
    }
  } catch {}
  setToken(opts.token);
  if (opts.user) setUser(opts.user);
}

/** Handy for Axios manual calls (most of our code uses interceptors). */
export function authHeader(): Record<string, string> {
  const t = getToken();
  return t ? { Authorization: `Bearer ${t}` } : {};
}

/** Clear and redirect out. */
export function signOut(redirect = "/signin") {
  clearToken();
  clearUser();
  try {
    sessionStorage.removeItem(REMEMBER_KEY);
  } catch {}
  window.location.replace(redirect);
}
