import type { NextConfig } from "next";

const API_TARGET =
  process.env.LEXHAITI_API_INTERNAL_URL ?? "http://localhost:8000";

const nextConfig: NextConfig = {
  reactCompiler: true,
  output: "standalone",
  // Builds are now type-checked. The codebase passes ``npx tsc
  // --noEmit`` on every save; flipping ``ignoreBuildErrors`` off
  // makes that contract enforceable in CI / production builds too.
  // If a type error sneaks in, ``npm run build`` will fail rather
  // than ship a broken bundle.
  typescript: {
    ignoreBuildErrors: false,
  },
  // Don't rewrite trailing slashes — FastAPI's collection routes end with `/`
  // and the proxy must pass URLs through verbatim.
  skipTrailingSlashRedirect: true,
  // Proxy /api/v1/* to the FastAPI backend so the browser sees one origin
  // (localhost:3000). This lets Auth.js cookies travel to backend requests
  // without CORS gymnastics.
  async rewrites() {
    return [
      {
        source: "/api/v1/:path*",
        destination: `${API_TARGET}/api/v1/:path*`,
      },
    ];
  },
};

export default nextConfig;
