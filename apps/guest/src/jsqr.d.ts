declare module "jsqr" {
  interface QRCodeResult {
    readonly data: string
  }

  const jsQR: (
    data: Uint8ClampedArray,
    width: number,
    height: number,
    options?: { readonly inversionAttempts?: "dontInvert" | "onlyInvert" | "attemptBoth" | "invertFirst" }
  ) => QRCodeResult | null

  export default jsQR
}
