/** Firestore doc ids cannot contain `/`. */
export function sanitizeDocId(raw: string): string {
  return raw
    .replace(/\//g, "_")
    .replace(/[^\w.-]+/g, "_")
    .replace(/_+/g, "_")
    .replace(/^_|_$/g, "")
    .slice(0, 700);
}

export function listingDocId(nicheId: string, licenseOrId: string): string {
  return sanitizeDocId(`${nicheId}_${licenseOrId}`);
}
