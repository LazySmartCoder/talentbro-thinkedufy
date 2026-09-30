/**
 * A stored company website made safe to put in an href.
 *
 * The backend stores exactly what staff typed, so a relative or `javascript:`
 * value would otherwise turn a company link into something running on our own
 * origin. This applies the same http(s)-only rule the server uses when it
 * reduces the value to an origin for the favicon lookup, so what is linked here
 * and what the icon was fetched from can never disagree.
 *
 * Returns null when the value cannot be resolved, and callers render no link at
 * all rather than a dead or unsafe href.
 */
export function companyWebsiteHref(website: string): string | null {
  const raw = website.trim();
  if (!raw) return null;
  const candidate = /^[a-z][a-z0-9+.-]*:\/\//i.test(raw) ? raw : `https://${raw}`;
  try {
    const url = new URL(candidate);
    return url.protocol === "http:" || url.protocol === "https:" ? url.toString() : null;
  } catch {
    return null;
  }
}
