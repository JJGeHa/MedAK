/** Which optional sign-in methods this installation has set up. Email always works. */
export type OAuthProvider = "google" | "azure";

const KNOWN: readonly OAuthProvider[] = ["google", "azure"];

/** Reads a comma-separated list such as "google,azure", ignoring anything unknown. */
export function parseOAuthProviders(value: string | undefined): OAuthProvider[] {
  const wanted = (value ?? "").split(",").map((s) => s.trim().toLowerCase());
  return KNOWN.filter((p) => wanted.includes(p));
}

/** The domain to look up single sign-on for, or null if this isn't an email address. */
export function ssoDomain(email: string): string | null {
  const match = /^[^\s@]+@([^\s@]+\.[^\s@]+)$/.exec(email.trim());
  return match ? match[1]!.toLowerCase() : null;
}

export const oauthProviders = parseOAuthProviders(process.env.NEXT_PUBLIC_MEDAK_OAUTH);
export const ssoEnabled = process.env.NEXT_PUBLIC_MEDAK_SSO === "1";
/**
 * Whether sign-in emails carry a code. Supabase only allows our templates, which include one, once
 * an installation has its own email provider. Set to "0" until then.
 */
export const emailCodes = process.env.NEXT_PUBLIC_MEDAK_EMAIL_CODES !== "0";
