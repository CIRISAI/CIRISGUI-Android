/** @type {import('next').NextConfig} */
const nextConfig = {
  output: "export",
  trailingSlash: true, // Required for static file servers - generates /page/index.html instead of /page.html
  images: {
    unoptimized: true,
  },
  // Skip OAuth routes during static export (only needed in managed mode)
  // In standalone mode, users log in with local credentials
  skipTrailingSlashRedirect: true,
};

module.exports = nextConfig;
