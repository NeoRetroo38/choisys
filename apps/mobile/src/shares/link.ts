/** Public web address of choisys (decision 0005). Native builds share the web link: participants need no app. */
export const PUBLIC_ORIGIN = 'https://neowebdevsolutions.com';
export const PUBLIC_BASE = '/choisys';

export function shareUrl(token: string, origin: string, baseUrl = ''): string {
  return `${origin}${baseUrl}/c/${encodeURIComponent(token)}`;
}
