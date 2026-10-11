import tailwindcss from '@tailwindcss/vite';
import react from '@vitejs/plugin-react';
import path from 'path';
import fs from 'fs';
import { defineConfig, loadEnv } from 'vite';

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), '');

  // Read provisioned Firebase configuration if present
  let appletConfig: any = {};
  const configPath = path.resolve(import.meta.dirname || '.', 'firebase-applet-config.json');
  if (fs.existsSync(configPath)) {
    try {
      appletConfig = JSON.parse(fs.readFileSync(configPath, 'utf-8'));
    } catch {}
  }

  const apiKey = env.VITE_FIREBASE_API_KEY || appletConfig.apiKey || '';
  const authDomain = env.VITE_FIREBASE_AUTH_DOMAIN || appletConfig.authDomain || '';
  const projectId = env.VITE_FIREBASE_PROJECT_ID || appletConfig.projectId || '';
  const storageBucket = env.VITE_FIREBASE_STORAGE_BUCKET || appletConfig.storageBucket || '';
  const messagingSenderId = env.VITE_FIREBASE_MESSAGING_SENDER_ID || appletConfig.messagingSenderId || '';
  const appId = env.VITE_FIREBASE_APP_ID || appletConfig.appId || '';
  const measurementId = env.VITE_FIREBASE_MEASUREMENT_ID || appletConfig.measurementId || '';

  return {
    plugins: [react(), tailwindcss()],
    define: {
      'import.meta.env.VITE_FIREBASE_API_KEY': JSON.stringify(apiKey),
      'import.meta.env.VITE_FIREBASE_AUTH_DOMAIN': JSON.stringify(authDomain),
      'import.meta.env.VITE_FIREBASE_PROJECT_ID': JSON.stringify(projectId),
      'import.meta.env.VITE_FIREBASE_STORAGE_BUCKET': JSON.stringify(storageBucket),
      'import.meta.env.VITE_FIREBASE_MESSAGING_SENDER_ID': JSON.stringify(messagingSenderId),
      'import.meta.env.VITE_FIREBASE_APP_ID': JSON.stringify(appId),
      'import.meta.env.VITE_FIREBASE_MEASUREMENT_ID': JSON.stringify(measurementId),
    },
    resolve: {
      alias: {
        '@': path.resolve(import.meta.dirname || '.', '.'),
      },
    },
    server: {
      // HMR WebSockets are disabled in AI Studio cloud preview environment
      hmr: false,
      watch: null,
    },
    build: {
      chunkSizeWarningLimit: 800,
      rollupOptions: {
        output: {
          manualChunks(id) {
            if (id.includes('node_modules/recharts')) {
              return 'vendor-charts';
            }
            if (id.includes('node_modules/firebase')) {
              return 'vendor-firebase';
            }
            if (id.includes('node_modules/lucide-react')) {
              return 'vendor-icons';
            }
            if (id.includes('node_modules/react') || id.includes('node_modules/react-dom')) {
              return 'vendor-react';
            }
          },
        },
      },
    },
  };
});
