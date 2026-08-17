// src/test/server-only-stub.ts
//
// `server-only` deliberately throws when imported outside a React Server
// Component environment — that guard is what stops a server module (and its
// API key) being pulled into the client bundle.
//
// Vitest runs in plain Node, which trips that guard, so vitest.config.ts aliases
// the package to this no-op. The real guard still applies to the Next.js build,
// which is where it matters.
export {};
