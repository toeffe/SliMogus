/**
 * `lz-string` bundles its own (incomplete/inaccurate) typings without a
 * `types` field in package.json, so TS can't resolve them automatically.
 * This declares only the functions we actually use, with return types that
 * correctly reflect failure cases (the real library returns `null` on
 * decompress failure, which the community typings mis-declare as `string`).
 */
declare module 'lz-string' {
  interface LZStringStatic {
    compressToEncodedURIComponent(input: string): string;
    decompressFromEncodedURIComponent(compressed: string): string | null;
  }

  const LZString: LZStringStatic;
  export default LZString;
}
