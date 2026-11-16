import path from "path";
import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // A stray lockfile in the user's home dir confuses root inference; pin it to this project.
  outputFileTracingRoot: path.join(__dirname),
  // postgres + sharp must stay server-side, never bundled for the client
  serverExternalPackages: ["postgres"],
};

export default nextConfig;
