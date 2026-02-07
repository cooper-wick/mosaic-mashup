import { defineConfig } from 'vite';

export default defineConfig({
    build: {
        target: 'esnext',
        minify: 'esbuild', // Use esbuild for now as it's built-in and very efficient
        polyfillModulePreload: false, // Save a bit of space
        reportCompressedSize: false,
        cssCodeSplit: false, // Inline CSS might be better for single file, or keep separate to avoid JS bloat? Actually single file is not required by user, just total zip size.
        assetsInlineLimit: 4096,
        rollupOptions: {
            output: {
                manualChunks: undefined, // Default chunking
            }
        }
    },
    esbuild: {
        drop: ['console', 'debugger'],
        legalComments: 'none',
        minifyIdentifiers: true,
        minifyWhitespace: true,
        minifySyntax: true,
    }
});
