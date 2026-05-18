/** @type {import('next').NextConfig} */
const nextConfig = {
  output: 'standalone',
  // Не раскрываем исходный код в продакшене
  productionBrowserSourceMaps: false,
  // Убираем заголовок X-Powered-By: Next.js
  poweredByHeader: false,
}

module.exports = nextConfig