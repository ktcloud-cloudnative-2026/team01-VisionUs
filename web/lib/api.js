/**
 * REST API 호출 도우미 (브라우저 전용)
 *  - Access 토큰을 Authorization 헤더에 담는다
 *  - 401 이면 Refresh 토큰으로 한 번 재발급을 시도하고, 실패하면 로그인 화면으로 보낸다
 *  - 실패 응답은 ApiError(status, code, message, details) 로 던진다
 */
const BASE = '/api/v1';
const KEY_ACCESS = 'homeiot.accessToken';
const KEY_REFRESH = 'homeiot.refreshToken';

export class ApiError extends Error {
  constructor(status, code, message, details) {
    super(message);
    this.status = status;
    this.code = code;
    this.details = details;
  }
}

export const tokens = {
  get access() { return typeof window === 'undefined' ? null : localStorage.getItem(KEY_ACCESS); },
  get refresh() { return typeof window === 'undefined' ? null : localStorage.getItem(KEY_REFRESH); },
  save({ accessToken, refreshToken }) {
    localStorage.setItem(KEY_ACCESS, accessToken);
    if (refreshToken) localStorage.setItem(KEY_REFRESH, refreshToken);
  },
  clear() {
    localStorage.removeItem(KEY_ACCESS);
    localStorage.removeItem(KEY_REFRESH);
  },
};

/** JWT payload 에서 이름·이메일 꺼내기 (화면 표시용, 검증 아님) */
export function currentUser() {
  const t = tokens.access;
  if (!t) return null;
  try {
    const json = atob(t.split('.')[1].replace(/-/g, '+').replace(/_/g, '/'));
    const p = JSON.parse(decodeURIComponent(escape(json)));
    return { id: Number(p.sub), name: p.name, email: p.email };
  } catch {
    return null;
  }
}

function send(path, { method = 'GET', body, auth = true } = {}) {
  const headers = {};
  if (body !== undefined) headers['Content-Type'] = 'application/json';
  if (auth && tokens.access) headers.Authorization = `Bearer ${tokens.access}`;
  return fetch(BASE + path, { method, headers, body: body === undefined ? undefined : JSON.stringify(body) });
}

let refreshing = null;
async function tryRefresh() {
  if (!tokens.refresh) return false;
  refreshing ??= (async () => {
    const res = await send('/auth/refresh', { method: 'POST', body: { refreshToken: tokens.refresh }, auth: false });
    const json = await res.json().catch(() => null);
    if (res.ok && json?.success) { tokens.save(json.data); return true; }
    return false;
  })().finally(() => { setTimeout(() => { refreshing = null; }, 0); });
  return refreshing;
}

export function goLogin() {
  tokens.clear();
  if (typeof window !== 'undefined' && window.location.pathname !== '/login') window.location.href = '/login';
}

export async function api(path, opts = {}) {
  let res = await send(path, opts);
  if (res.status === 401 && opts.auth !== false && (await tryRefresh())) res = await send(path, opts);
  const json = await res.json().catch(() => null);
  if (res.status === 401 && opts.auth !== false) {
    goLogin();
    throw new ApiError(401, 'UNAUTHORIZED', '다시 로그인하세요.');
  }
  if (!json?.success) {
    throw new ApiError(res.status, json?.error?.code ?? 'UNKNOWN', json?.error?.message ?? `요청 실패 (${res.status})`, json?.error?.details);
  }
  return json.data;
}

export const sendCommand = (deviceId, command, params = {}) =>
  api(`/devices/${encodeURIComponent(deviceId)}/commands`, { method: 'POST', body: { command, params } });
