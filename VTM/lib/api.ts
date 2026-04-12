// VTM/lib/api.ts
import { getToken, clearSession } from "./session";
import i18n from "./i18n";

export const LOCAL_API_BASE =
  (process.env.EXPO_PUBLIC_LOCAL_API_BASE || "").trim();


// If you want reset to hit your tunnel, set this to https://api-dev.yapme.io
export const RESET_API_BASE =
  (process.env.EXPO_PUBLIC_RESET_API_BASE || "https://api-dev.yapme.io").trim();


export const PUBLIC_API_BASE =
  (process.env.EXPO_PUBLIC_PUBLIC_API_BASE || "https://api-dev.yapme.io").trim();


export const API_BASE =
  (process.env.EXPO_PUBLIC_API_BASE || "").trim() ||
  (__DEV__ ? LOCAL_API_BASE : PUBLIC_API_BASE);


type ApiFetchOptions = RequestInit & {
  json?: unknown;
};


function isResetEndpoint(path: string) {
  return (
    path.startsWith("/api/auth/forgot-password") ||
    path.startsWith("/api/auth/reset-password")
  );
}


function pickBase(path: string) {
  // Only reset endpoints go to the public tunnel in dev
  if (__DEV__ && isResetEndpoint(path)) return RESET_API_BASE;


  const base = API_BASE.trim();


  if (!base) {
    throw new Error(
      __DEV__
        ? "Missing EXPO_PUBLIC_LOCAL_API_BASE or EXPO_PUBLIC_API_BASE"
        : "Missing EXPO_PUBLIC_PUBLIC_API_BASE or EXPO_PUBLIC_API_BASE"
    );
  }

  return base;
}


function isAuthRoute(path: string) {
  return path.startsWith("/api/auth/");
}


function looksLikeJson(contentType: string | null) {
  return !!contentType && contentType.toLowerCase().includes("application/json");
}


async function safeReadText(res: Response) {
  try {
    return await res.text();
  } catch {
    return "";
  }
}


function extractErrorCode(payload: any): string | undefined {
  const code = payload?.code;
  if (typeof code === "string" && code.trim()) return code.trim();
  return undefined;
}


function defaultMessageForStatus(status: number): string {
  if (status === 400) return i18n.t("errors.badRequest");
  if (status === 401) return i18n.t("errors.unauthorized");
  if (status === 403) return i18n.t("errors.forbidden");
  if (status === 404) return i18n.t("errors.notFound");
  if (status === 429) return i18n.t("errors.rateLimited");
  if (status >= 500) return i18n.t("errors.serverError");
  return i18n.t("errors.requestFailed");
}


function safeUserMessage(status: number, payload: any): string {
  const code = extractErrorCode(payload);


  switch (code) {
    case "REJOIN_PENDING":
      return i18n.t("errors.rejoinPending");
    case "CHAT_REQUEST_CANCEL_INVALID":
      return i18n.t("errors.chatRequestCancelInvalid");
    case "REJOIN_REQUEST_CANCEL_INVALID":
      return i18n.t("errors.rejoinRequestCancelInvalid");
    case "CONTACT_REQUEST_CANCEL_INVALID":
      return i18n.t("errors.contactRequestCancelInvalid");
      
    default:
      return defaultMessageForStatus(status);
  }
}


export class ApiError extends Error {
  status: number;
  payload: any;
  code?: string;


  constructor(message: string, status: number, payload: any, code?: string) {
    super(message);
    this.name = "ApiError";
    this.status = status;
    this.payload = payload;
    this.code = code;
  }
}


export async function apiFetch(path: string, options: ApiFetchOptions = {}) {
  const token = await getToken();


  const headers: Record<string, string> = {
    Accept: "application/json",
    ...(options.headers as any),
  };


  // Usually don’t send Authorization for auth routes
  if (token && !isAuthRoute(path)) {
    headers.Authorization = `Bearer ${token}`;
  }


  let body = options.body;


  if (options.json !== undefined) {
    headers["Content-Type"] = "application/json";
    body = JSON.stringify(options.json);
  }


  const base = pickBase(path);


  const res = await fetch(`${base}${path}`, {
    ...options,
    headers,
    body,
  });


  if (res.status === 401) {
    await clearSession().catch(() => {});
  }


  if (!res.ok) {
    const ct = res.headers.get("content-type");
    const text = await safeReadText(res);


    let payload: any = null;


    if (looksLikeJson(ct)) {
      try {
        payload = text.trim() ? JSON.parse(text) : null;
      } catch {
        payload = null;
      }
    }


    const code = extractErrorCode(payload);
    const message = safeUserMessage(res.status, payload);


    throw new ApiError(message, res.status, payload, code);
  }


  if (res.status === 204) return null;


  const ct = res.headers.get("content-type");
  if (looksLikeJson(ct)) {
    const text = await safeReadText(res);
    if (!text.trim()) return null;
    return JSON.parse(text);
  }


  return safeReadText(res);
}


export function isApiError(err: any): err is ApiError {
  return (
    !!err &&
    typeof err === "object" &&
    err.name === "ApiError" &&
    typeof err.status === "number"
  );
}


export async function apiJson<T>(path: string, options: ApiFetchOptions = {}) {
  return (await apiFetch(path, options)) as T;
}


/**
 * Example: voice sample upload (FormData)
 * NOTE: do NOT set Content-Type manually for multipart.
 */
export async function uploadVoiceSample(uri: string, durationMs?: number) {
  const form = new FormData();


  if (typeof durationMs === "number") {
    form.append("durationMs", String(durationMs));
  }


  form.append(
    "file",
    {
      uri,
      type: "audio/mp4",
      name: "voice.m4a",
    } as any
  );


    const token = await getToken();
    const base = pickBase("/api/me/voice/sample");


    const res = await fetch(`${base}/api/me/voice/sample`, {
      method: "POST",
      headers: {
        Accept: "application/json",
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
        },
        body: form,
      });


  if (res.status === 401) {
    await clearSession().catch(() => {});
  }


  const ct = res.headers.get("content-type");
  const text = await safeReadText(res);


  if (!res.ok) {
    let payload: any = null;


    if (looksLikeJson(ct)) {
      try {
        payload = text.trim() ? JSON.parse(text) : null;
      } catch {
        payload = null;
      }
    }


    const code = extractErrorCode(payload);
    const message = safeUserMessage(res.status, payload);


    throw new ApiError(message, res.status, payload, code);
  }


  if (looksLikeJson(ct)) {
    return text.trim() ? JSON.parse(text) : null;
  }


  return text;
}
