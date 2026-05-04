import type { CapacitorConfig } from '@capacitor/cli';

const config: CapacitorConfig = {
  appId: 'us.lunchpad.app',
  appName: 'LunchPad',

  // App loads www/index.html (school-code entry) on first launch.
  // After the parent enters their school code, app.js navigates the
  // WKWebView to https://[code].lunchpad.us and the web app takes over.
  webDir: 'www',

  ios: {
    minVersion: '16.0',
    preferredContentMode: 'mobile',
    // Allow navigation to school subdomains, Google OAuth, and Stripe Checkout
    allowNavigation: [
      '*.lunchpad.us',
      'accounts.google.com',
      '*.googleapis.com',
      'checkout.stripe.com',
      '*.stripe.com',
    ],
  },

  plugins: {
    StatusBar: {
      style: 'Dark',
      backgroundColor: '#0f172a',
    },
    // SplashScreen removed — we use www/index.html as our native entry screen
  },
};

export default config;
