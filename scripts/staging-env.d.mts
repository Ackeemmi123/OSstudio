export declare const ANTHROPIC_API_URL: string;
export declare const DEFAULT_MODEL: string;
export declare function stagingEnv(env?: Record<string, string | undefined>): {
  url?: string;
  anonKey?: string;
  serviceKey?: string;
  databaseUrl?: string;
  anthropicKey?: string;
  model: string;
  appUrl?: string;
  smokeAccounts: { owner?: string; viewer?: string; outsider?: string; password?: string };
};
export declare function keyKind(key: string | undefined): string;
export declare function isLocalUrl(url: string | undefined): boolean;
