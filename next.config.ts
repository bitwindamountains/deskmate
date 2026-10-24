import type { NextConfig } from 'next';

// pdf.js, sql.js, tesseract.js and transformers.js (with sharp/onnxruntime-node) are browser-only and lazily imported from client code;
// alias them to an empty stub everywhere except the browser so server bundles and file traces never include them.
const browserOnly = (pkg: string) => ({ browser: pkg, default: './src/lib/server-stub.ts' });

const nextConfig: NextConfig = {
  turbopack: {
    resolveAlias: {
      'pdfjs-dist/legacy/build/pdf.mjs': browserOnly('pdfjs-dist/legacy/build/pdf.mjs'),
      '@huggingface/transformers': browserOnly('@huggingface/transformers'),
      'sql.js': browserOnly('sql.js'),
      'tesseract.js': browserOnly('tesseract.js'),
    },
  },
};

export default nextConfig;
