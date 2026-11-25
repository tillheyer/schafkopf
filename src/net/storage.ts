/** Kleine Merkhilfe (nur im Browser), z.B. für den eigenen Namen. Fehler werden ignoriert. */
export function load(key: string): string {
  try {
    return (globalThis as any).localStorage?.getItem(key) ?? '';
  } catch {
    return '';
  }
}

export function save(key: string, value: string) {
  try {
    (globalThis as any).localStorage?.setItem(key, value);
  } catch {
    /* egal */
  }
}

/** Tisch-Code aus der Adresse (?tisch=ABCD), falls vorhanden. */
export function codeFromUrl(): string {
  try {
    const m = /[?&#]tisch=([A-Za-z0-9]{4})/.exec((globalThis as any).location?.href ?? '');
    return m ? m[1].toUpperCase() : '';
  } catch {
    return '';
  }
}
