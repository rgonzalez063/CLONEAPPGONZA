/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  // Database drivers load their own files (WebAssembly for PGlite), so they must not be bundled.
  serverExternalPackages: ['@electric-sql/pglite', 'pg'],
}
export default nextConfig
