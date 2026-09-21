export const IS_PUBLIC_KEY = 'is_public';

export const AuthProvider = {
  LOCAL: 'local',
  KEYCLOAK: 'keycloak',
} as const;

export type AuthProviderType = (typeof AuthProvider)[keyof typeof AuthProvider];

export const ACCESS_TOKEN_EXPIRES_IN_SEC = 900; // 15 minutes
export const REFRESH_TOKEN_EXPIRES_IN_DAYS = 7; // 7 days
