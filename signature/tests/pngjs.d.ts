/** The little of pngjs (a dev dependency without types of its own) that the tests use: reading a screenshot's pixels. */
declare module "pngjs" {
  export const PNG: {
    sync: { read(buffer: Buffer): { width: number; height: number; data: Buffer } };
  };
}
