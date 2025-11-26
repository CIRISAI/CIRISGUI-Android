import type { CapacitorConfig } from '@capacitor/cli';

const config: CapacitorConfig = {
  appId: 'ai.ciris.mobile',
  appName: 'CIRIS',
  webDir: 'out',
  server: {
    androidScheme: 'https'
  },
  plugins: {
    GoogleAuth: {
      scopes: ['profile', 'email'],
      // Web Client ID from Google Cloud Console
      serverClientId: '265882853697-l421ndojcs5nm7lkln53jj29kf7kck91.apps.googleusercontent.com',
      forceCodeForRefreshToken: true
    }
  },
  android: {
    allowMixedContent: true,
    webContentsDebuggingEnabled: true
  }
};

export default config;
