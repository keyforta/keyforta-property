// REQ-038 decision 3 (re-confirmed 2026-09-22): malware/content scanning on
// upload is implemented as a pluggable scanner interface. Every environment
// (dev/test/CI/pilot) currently wires the no-op `NoopScanner` below, which
// always reports the upload as clean, because no real Blob+Defender
// infrastructure exists yet (deferred to a separate, focused infrastructure
// project). The call site in the upload API route always calls
// `scanUpload` and always checks its `clean` result before persisting
// anything, so a real scanner implementation can later be swapped in
// (via `AppDependencies.mediaScanner`) without redesigning the upload flow
// or its tests. See docs/product/REQ-038-listing-media-upload.md.

export interface MediaScanResult {
  clean: boolean;
  reason?: string;
}

export interface MediaScanner {
  scanUpload(bytes: Buffer, mediaType: string): Promise<MediaScanResult>;
}

// File-signature ("magic bytes") prefixes for the two media types PROP-028
// allows. This is independent of malware scanning (deferred per REQ-038
// decision 3): it verifies the uploaded bytes are actually the declared
// image format rather than trusting the caller-supplied `mediaType` field
// (Copilot review finding on PR #131 — the no-op scanner alone cannot catch
// this, since it reports any bytes as clean).
const JPEG_SIGNATURE = Buffer.from([0xff, 0xd8, 0xff]);
const PNG_SIGNATURE = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);

export function matchesDeclaredImageSignature(bytes: Buffer, mediaType: string): boolean {
  if (mediaType === "image/jpeg") {
    return bytes.subarray(0, JPEG_SIGNATURE.length).equals(JPEG_SIGNATURE);
  }
  if (mediaType === "image/png") {
    return bytes.subarray(0, PNG_SIGNATURE.length).equals(PNG_SIGNATURE);
  }
  return false;
}

export class NoopScanner implements MediaScanner {
  async scanUpload(_bytes: Buffer, _mediaType: string): Promise<MediaScanResult> {
    return { clean: true };
  }
}
