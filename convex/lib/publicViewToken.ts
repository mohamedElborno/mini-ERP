/** 32-byte cryptographically secure token, URL-safe base64 (43 chars). */
export function generatePublicViewToken(): string {
  const bytes = new Uint8Array(32);
  crypto.getRandomValues(bytes);
  return bytesToBase64Url(bytes);
}

export function isValidPublicViewToken(token: string): boolean {
  return (
    typeof token === "string" &&
    token.length === 43 &&
    /^[A-Za-z0-9_-]+$/.test(token)
  );
}

function bytesToBase64Url(bytes: Uint8Array): string {
  let binary = "";
  for (let i = 0; i < bytes.length; i++) {
    binary += String.fromCharCode(bytes[i]!);
  }
  return btoa(binary)
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/, "");
}

function base64UrlToBytes(value: string): Uint8Array {
  const padded = value.replace(/-/g, "+").replace(/_/g, "/");
  const padLen = (4 - (padded.length % 4)) % 4;
  const base64 = padded + "=".repeat(padLen);
  const binary = atob(base64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) {
    bytes[i] = binary.charCodeAt(i);
  }
  return bytes;
}

/** SHA-256 hash stored in DB — never store the raw token for public lookup. */
export async function hashPublicViewToken(token: string): Promise<string> {
  const digest = await crypto.subtle.digest(
    "SHA-256",
    new TextEncoder().encode(token),
  );
  return bytesToBase64Url(new Uint8Array(digest));
}

function parseEncryptionKeyHex(): Uint8Array | null {
  const hex = process.env.PUBLIC_VIEW_TOKEN_ENCRYPTION_KEY?.trim();
  if (!hex || !/^[0-9a-fA-F]{64}$/.test(hex)) return null;
  const bytes = new Uint8Array(32);
  for (let i = 0; i < 32; i++) {
    bytes[i] = parseInt(hex.slice(i * 2, i * 2 + 2), 16);
  }
  return bytes;
}

/** Web Crypto expects ArrayBuffer-backed views (not ArrayBufferLike). */
function toBufferSource(bytes: Uint8Array): BufferSource {
  return new Uint8Array(bytes);
}

async function importEncryptionKey(): Promise<CryptoKey | null> {
  const raw = parseEncryptionKeyHex();
  if (!raw) return null;
  return crypto.subtle.importKey("raw", toBufferSource(raw), "AES-GCM", false, [
    "encrypt",
    "decrypt",
  ]);
}

/** Encrypted at rest so authorized staff can re-print the same QR without rotation. */
export async function encryptPublicViewToken(
  token: string,
): Promise<string | null> {
  const key = await importEncryptionKey();
  if (!key) return null;

  const iv = new Uint8Array(12);
  crypto.getRandomValues(iv);
  const ciphertext = await crypto.subtle.encrypt(
    { name: "AES-GCM", iv: toBufferSource(iv) },
    key,
    new TextEncoder().encode(token),
  );
  const combined = new Uint8Array(iv.length + ciphertext.byteLength);
  combined.set(iv, 0);
  combined.set(new Uint8Array(ciphertext), iv.length);
  return bytesToBase64Url(combined);
}

export async function decryptPublicViewToken(
  encrypted: string,
): Promise<string | null> {
  const key = await importEncryptionKey();
  if (!key) return null;

  try {
    const combined = base64UrlToBytes(encrypted);
    const iv = combined.slice(0, 12);
    const data = combined.slice(12);
    const plaintext = await crypto.subtle.decrypt(
      { name: "AES-GCM", iv: toBufferSource(iv) },
      key,
      toBufferSource(data),
    );
    return new TextDecoder().decode(plaintext);
  } catch {
    return null;
  }
}
