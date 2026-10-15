/** Ein Leser für QR-Codes: ein Bild der Kamera hinein, der Text heraus — oder `null`. */
export type Leser = (video: HTMLVideoElement, leinwand: HTMLCanvasElement) => Promise<string | null>

interface BarcodeDetectorArt {
  new (opts: { formats: string[] }): { detect: (bild: CanvasImageSource) => Promise<Array<{ rawValue?: string }>> }
  getSupportedFormats?: () => Promise<string[]>
}

/**
 * Der Leser, den das Gerät hat: Android und Chrome lesen QR-Codes selbst
 * (`BarcodeDetector`), alles andere — vor allem das iPhone — mit `jsqr`, das
 * erst hier nachgeladen wird.
 */
export async function leserFuer(): Promise<Leser> {
  const Detektor = (globalThis as { BarcodeDetector?: BarcodeDetectorArt }).BarcodeDetector
  const formate: string[] = (await Detektor?.getSupportedFormats?.().catch((): string[] => [])) ?? []
  if (Detektor && formate.includes('qr_code')) {
    const detektor = new Detektor({ formats: ['qr_code'] })
    return async (video) => (await detektor.detect(video).catch(() => []))[0]?.rawValue ?? null
  }
  const { default: jsQR } = await import('jsqr')
  return async (video, leinwand) => {
    const breite = video.videoWidth
    const hoehe = video.videoHeight
    if (!breite || !hoehe) return null
    // Verkleinert: Ein Zettel vor der Kamera braucht keine volle Auflösung.
    const mass = Math.min(1, 640 / Math.max(breite, hoehe))
    leinwand.width = Math.round(breite * mass)
    leinwand.height = Math.round(hoehe * mass)
    const ctx = leinwand.getContext('2d', { willReadFrequently: true })
    if (!ctx) return null
    ctx.drawImage(video, 0, 0, leinwand.width, leinwand.height)
    const bild = ctx.getImageData(0, 0, leinwand.width, leinwand.height)
    return jsQR(bild.data, bild.width, bild.height, { inversionAttempts: 'dontInvert' })?.data ?? null
  }
}
