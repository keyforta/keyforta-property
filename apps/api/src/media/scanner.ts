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

export class NoopScanner implements MediaScanner {
  async scanUpload(_bytes: Buffer, _mediaType: string): Promise<MediaScanResult> {
    return { clean: true };
  }
}
