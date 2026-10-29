/**
 * Typen zu `pngjs`, soweit die Proben es brauchen — das Paket bringt keine
 * mit. Gelesen wird nur: Maße und die Pixel als RGBA-Folge.
 */
declare module 'pngjs' {
  export const PNG: {
    sync: {
      read(buffer: Buffer): { width: number; height: number; data: Buffer }
    }
  }
}
