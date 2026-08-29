export type Base64Mode = "encode" | "decode";

export type Base64Inspect =
  | { ok: true; mode: Base64Mode; output: string }
  | { ok: false; empty: true; mode: Base64Mode }
  | { ok: false; empty?: false; mode: Base64Mode; error: "invalid" };

const DECODE_PREFIXES = ["base64d", "b64d"] as const;

export function base64Mode(searchText: string): Base64Mode {
  const lower = searchText.trimStart().toLowerCase();
  for (const prefix of DECODE_PREFIXES) {
    if (matchesPrefix(lower, prefix)) return "decode";
  }
  return "encode";
}

export function toggleBase64Search(searchText: string, rest: string): string {
  const mode = base64Mode(searchText);
  const value = rest.trim();
  if (mode === "decode") return value ? `b64 ${value}` : "b64 ";
  return value ? `b64d ${value}` : "b64d ";
}

export function inspectBase64(searchText: string, rest: string): Base64Inspect {
  const mode = base64Mode(searchText);
  const input = rest.trim();
  if (!input) return { ok: false, empty: true, mode };
  if (mode === "encode") {
    return { ok: true, mode, output: encodeBase64(input) };
  }
  try {
    return { ok: true, mode, output: decodeBase64(input) };
  } catch {
    return { ok: false, mode, error: "invalid" };
  }
}

export function encodeBase64(text: string): string {
  const bytes = new TextEncoder().encode(text);
  let binary = "";
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary);
}

export function decodeBase64(encoded: string): string {
  const binary = atob(encoded.trim());
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i += 1) bytes[i] = binary.charCodeAt(i);
  return new TextDecoder().decode(bytes);
}

function matchesPrefix(lower: string, prefix: string): boolean {
  return lower === prefix || lower.startsWith(`${prefix} `);
}
