export type PublicDocumentType = "quote" | "invoice";

/**
 * Fixed path locale for public document URLs (not the print language).
 * AR and EN PDFs must share one QR/link per document.
 */
export const PUBLIC_VIEW_PATH_LOCALE = "ar" as const;

export function buildPublicDocumentUrl(
  type: PublicDocumentType,
  token: string,
  origin?: string,
): string {
  const base =
    origin ??
    (typeof window !== "undefined" ? window.location.origin : "");
  const path = `/${PUBLIC_VIEW_PATH_LOCALE}/view/${type}/${encodeURIComponent(token)}`;
  return base ? `${base.replace(/\/$/, "")}${path}` : path;
}
