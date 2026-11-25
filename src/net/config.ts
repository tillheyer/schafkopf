import { Platform } from 'react-native';

/** Standard-Adresse des Online-Servers (Render.com, siehe render.yaml). */
const DEFAULT_SERVER = 'wss://schafkopf-server-f2la.onrender.com';

/**
 * Adresse des Online-Servers. Beim Bauen über EXPO_PUBLIC_SERVER_URL überschreibbar.
 * Im Browser auf localhost wird der lokale Testserver (npm run server) verwendet.
 */
function serverUrl(): string {
  if (process.env.EXPO_PUBLIC_SERVER_URL) return process.env.EXPO_PUBLIC_SERVER_URL;
  const host = Platform.OS === 'web' && typeof location !== 'undefined' ? location.hostname : '';
  if (host === 'localhost' || host === '127.0.0.1') return 'ws://localhost:8787';
  return DEFAULT_SERVER;
}

export const SERVER_URL = serverUrl();
