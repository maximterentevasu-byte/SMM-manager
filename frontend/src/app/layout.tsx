import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "smmplatform — AI-платформа для системного SMM",
  description: "Стратегия, контент, планирование и аналитика в одном месте. Powered by АИСТ.",
  icons: {
    icon: "/icon.svg",
  },
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="ru">
      <head>
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="anonymous" />
        <link
          href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600&family=Manrope:wght@600;700;800&display=swap"
          rel="stylesheet"
        />
        <style>{`
          *, *::before, *::after { box-sizing: border-box; }
          body {
            margin: 0;
            font-family: 'Inter', -apple-system, BlinkMacSystemFont, sans-serif;
            -webkit-font-smoothing: antialiased;
            background: #F5F7FA;
            color: #1F2937;
          }
          h1, h2, h3 {
            font-family: 'Manrope', sans-serif;
          }
          @keyframes spin {
            from { transform: rotate(0deg); }
            to { transform: rotate(360deg); }
          }
        `}</style>
      </head>
      <body>{children}</body>
    </html>
  );
}
