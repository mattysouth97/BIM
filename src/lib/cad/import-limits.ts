/**
 * Drawing import limits shared by browser readers and the DWG server fallback.
 *
 * These are intentionally different capabilities:
 *
 * - Browser readers may process drawings up to 50 MiB.
 * - The production server fallback sits behind a multipart request limit of
 *   roughly 4.5 MB, so a 4 MiB file ceiling leaves room for multipart headers.
 *
 * Keeping both values here prevents the route from promising a payload size
 * that its deployment platform cannot actually receive.
 */
export const CAD_CLIENT_MAX_FILE_BYTES = 50 * 1024 * 1024;

export const CAD_SERVER_FALLBACK_MAX_FILE_BYTES = 4 * 1024 * 1024;

/** File ceiling plus conservative multipart headers/boundary allowance. */
export const CAD_SERVER_FALLBACK_MAX_REQUEST_BYTES =
  CAD_SERVER_FALLBACK_MAX_FILE_BYTES + 64 * 1024;

export function formatFileSizeMiB(bytes: number): string {
  const mib = bytes / (1024 * 1024);
  // Round upward so a file one byte over a limit never appears equal to it
  // (for example, 50 MiB + 1 byte reads as 50.1 MB, not 50 MB).
  const tenths = Math.ceil(mib * 10) / 10;
  return `${Number.isInteger(tenths) ? tenths.toFixed(0) : tenths.toFixed(1)} MB`;
}
