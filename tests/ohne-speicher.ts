/**
 * **Ein Browser, der den Gerätespeicher sperrt**: Schon der Zugriff auf
 * `localStorage` wirft — wie in Safari mit gesperrten Website-Daten. Damit
 * wirft auch jedes `setItem`, so wie bei vollem Kontingent.
 *
 * Gibt die Freigabe zurück; sie gehört in ein `finally`.
 */
export function speicherSperren(): () => void {
  const vorher = Object.getOwnPropertyDescriptor(globalThis, 'localStorage')
  Object.defineProperty(globalThis, 'localStorage', {
    configurable: true,
    get: () => {
      throw new DOMException('Der Speicher ist gesperrt', 'SecurityError')
    },
  })
  return () => {
    if (vorher) Object.defineProperty(globalThis, 'localStorage', vorher)
    else Reflect.deleteProperty(globalThis, 'localStorage')
  }
}
