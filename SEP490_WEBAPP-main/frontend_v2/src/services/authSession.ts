export type AuthSessionUser = {
  id?: string;
  _id?: string;
  userId?: string;
  name?: string;
  email?: string;
  role?: string;
};

const TOKEN_KEY = 'token';
const USER_KEY = 'user';

function safeParseUser(raw: string | null): AuthSessionUser | null {
  if (!raw) {
    return null;
  }

  try {
    return JSON.parse(raw) as AuthSessionUser;
  } catch {
    return null;
  }
}

function migrateLegacySessionStorageSession() {
  const localToken = localStorage.getItem(TOKEN_KEY);
  const localUser = localStorage.getItem(USER_KEY);
  if (localToken || localUser) {
    return;
  }

  const sessionToken = sessionStorage.getItem(TOKEN_KEY);
  const sessionUser = sessionStorage.getItem(USER_KEY);
  if (sessionToken) {
    localStorage.setItem(TOKEN_KEY, sessionToken);
  }
  if (sessionUser) {
    localStorage.setItem(USER_KEY, sessionUser);
  }
  if (sessionToken || sessionUser) {
    sessionStorage.removeItem(TOKEN_KEY);
    sessionStorage.removeItem(USER_KEY);
  }
}

export function getAuthToken(): string | null {
  migrateLegacySessionStorageSession();
  return localStorage.getItem(TOKEN_KEY);
}

export function getAuthUser(): AuthSessionUser | null {
  migrateLegacySessionStorageSession();
  return safeParseUser(localStorage.getItem(USER_KEY));
}

export function getAuthUserId(): string {
  const user = getAuthUser();
  return String(user?.id || user?._id || user?.userId || '');
}

export function setAuthSession(user: AuthSessionUser, token: string): void {
  localStorage.setItem(TOKEN_KEY, token);
  localStorage.setItem(USER_KEY, JSON.stringify(user));
  sessionStorage.removeItem(TOKEN_KEY);
  sessionStorage.removeItem(USER_KEY);
}

export function clearAuthSession(): void {
  localStorage.removeItem(TOKEN_KEY);
  localStorage.removeItem(USER_KEY);
  sessionStorage.removeItem(TOKEN_KEY);
  sessionStorage.removeItem(USER_KEY);
}
