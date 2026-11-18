/** @type {import('next').NextConfig} */
const nextConfig = {
  typescript: {
    ignoreBuildErrors: true,
  },
  // /api/mcp (lib/mcp/guide.ts) reads lib/mcp/guides/candidate-summary.md at request time via
  // fs.readFileSync() — a path built from process.cwd() isn't guaranteed to be auto-detected by
  // Next's static file tracing, so it's included explicitly for the Vercel function bundle.
  outputFileTracingIncludes: {
    "/api/mcp": ["./lib/mcp/guides/**/*.md"],
  },
}

export default nextConfig
