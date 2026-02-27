import { defineConfig } from 'tsup'
import { resolve } from 'node:path'

export default defineConfig({
  // -----------------------------------------------------------------------
  // Entry points — one per component module.
  // The barrel `index` re-exports everything; deep-import entries allow
  // consumers to pull in only what they need (better tree-shaking).
  //
  // To add a new component later:
  //   1. Create src/<category>/<component>.tsx
  //   2. Add a new key here:  '<category>/<component>': 'src/<category>/<component>.tsx'
  //   3. Re-export from src/index.ts
  //   4. Add an "exports" entry in package.json
  // -----------------------------------------------------------------------
  entry: {
    index: 'src/index.ts',
    'layout/select': 'src/layout/select.tsx',
    'layout/cat-editor': 'src/layout/cat-editor/index.ts',
    'utils/detect-quotes': 'src/utils/detect-quotes.ts',
  },

  // Output both ESM (.js) and CJS (.cjs) so the library works everywhere.
  format: ['esm', 'cjs'],

  // Generate .d.ts (and .d.cts) declaration files alongside the JS output.
  dts: true,

  // Emit source maps for easier debugging by consumers.
  sourcemap: true,

  // Wipe the dist/ folder before each build so stale artefacts don't linger.
  clean: true,

  // Do NOT bundle these — they are listed as dependencies / peerDependencies
  // and will be resolved from the consumer's node_modules at runtime.
  external: [
    'react',
    'react-dom',
    'react/jsx-runtime',
    '@base-ui/react',
    '@dnd-kit/core',
    '@dnd-kit/sortable',
    '@dnd-kit/modifiers',
    '@tanstack/react-virtual',
    'cmdk',
    'lucide-react',
    'clsx',
    'tailwind-merge',
    'class-variance-authority',
    'lexical',
    /^@lexical\//,
    '@popperjs/core',
    'zod',
  ],

  // Resolve the `@/*` path alias used throughout the source to `./src/*`.
  esbuildOptions(options) {
    options.alias = {
      '@': resolve('src'),
    }
  },

  // Use the library-specific tsconfig (enables declaration emit, scopes
  // includes to library source only).
  tsconfig: 'tsconfig.build.json',
})
