/** Server-only environment access. Never import this from browser code. */
export type ServerEnv = {
  plantnetApiKey?: string;
  plantnetProject: string;
  useMockApi: boolean;
  appName: string;
  isProduction: boolean;
};

export function readEnv(source: Record<string, string | undefined> = process.env): ServerEnv {
  const key = source.PLANTNET_API_KEY?.trim();
  return {
    plantnetApiKey: key ? key : undefined,
    plantnetProject: source.PLANTNET_PROJECT?.trim() || 'all',
    useMockApi: /^(1|true|yes)$/i.test(source.USE_MOCK_API ?? ''),
    appName: source.APP_NAME?.trim() || 'FieldLens',
    isProduction: source.NODE_ENV === 'production' || source.VERCEL_ENV === 'production',
  };
}
