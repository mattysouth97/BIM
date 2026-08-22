/** Browser/server-safe SHA-256 helper. It never stores or returns source bytes. */
export async function sha256Hex(
  content: string | ArrayBuffer | Uint8Array,
): Promise<string> {
  const bytes = toBytes(content);
  const subtle = globalThis.crypto?.subtle;
  if (!subtle) {
    throw new Error("SHA-256 is unavailable because Web Crypto is not present.");
  }

  const digest = await subtle.digest("SHA-256", bytes);
  return Array.from(new Uint8Array(digest), (byte) =>
    byte.toString(16).padStart(2, "0"),
  ).join("");
}

export function toBytes(
  content: string | ArrayBuffer | Uint8Array,
): Uint8Array<ArrayBuffer> {
  if (typeof content === "string") return new TextEncoder().encode(content);
  if (content instanceof Uint8Array) {
    const copy = new Uint8Array(content.byteLength);
    copy.set(content);
    return copy;
  }
  return new Uint8Array(content.slice(0));
}
