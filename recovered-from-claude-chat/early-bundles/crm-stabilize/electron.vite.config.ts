import { resolve } from 'node:path'
import { defineConfig, externalizeDepsPlugin } from 'electron-vite'
import react from '@vitejs/plugin-react'

export default defineConfig({
  main: {
    resolve: {
      alias: {
        '@shared': resolve('src/shared'),
        '@main': resolve('src/main')
      }
    },
    plugins: [externalizeDepsPlugin()],
    build: {
      rollupOptions: {
        // Native modules must not be bundled. electron-builder `install-app-deps`
        // installs them into the right ABI at postinstall time.
        external: ['electron', 'better-sqlite3-multiple-ciphers', 'argon2']
      }
    }
  },
  preload: {
    resolve: {
      alias: {
        '@shared': resolve('src/shared'),
        '@preload': resolve('src/preload')
      }
    },
    plugins: [externalizeDepsPlugin()]
  },
  renderer: {
    resolve: {
      alias: {
        '@renderer': resolve('src/renderer/src'),
        '@aether': resolve('src/renderer/src/aether-theme'),
        '@shared': resolve('src/shared')
      }
    },
    plugins: [react()],
    build: {
      sourcemap: false,
      rollupOptions: {
        input: {
          index: resolve(__dirname, 'src/renderer/index.html')
        },
        output: {}
      }
    }
  }
})
