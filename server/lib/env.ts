/** Server-only environment access. Never import this from browser code. */
export type ServerEnv = {
  plantnetApiKey?: string;
  plantnetProject: string;
  /** Read-only Hugging Face token for our private BioCLIP Space. */
  hfToken?: string;
  bioclipSpaceUrl?: string;
  useMockApi: boolean;
  appName: string;
  isProduction: boolean;
};

export function readEnv(source: Record<string, string | undefined> = process.env): ServerEnv {
  const key = source.PLANTNET_API_KEY?.trim();
  return {
    plantnetApiKey: key ? key : undefined,
    plantnetProject: source.PLANTNET_PROJECT?.trim() || 'all',
    hfToken: source.HF_TOKEN?.trim() || undefined,
    bioclipSpaceUrl: source.BIOCLIP_SPACE_URL?.trim().replace(/\/+$/, '') || undefined,
    useMockApi: /^(1|true|yes)$/i.test(source.USE_MOCK_API ?? ''),
    appName: source.APP_NAME?.trim() || 'FieldLens',
    isProduction: source.NODE_ENV === 'production' || source.VERCEL_ENV === 'production',
  };
}
