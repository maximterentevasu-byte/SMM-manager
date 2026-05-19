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
        <meta name="viewport" content="width=device-width, initial-scale=1, maximum-scale=1" />
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
          h1, h2, h3 { font-family: 'Manrope', sans-serif; }
          @keyframes spin { from { transform: rotate(0deg); } to { transform: rotate(360deg); } }
          @keyframes slideIn { from { transform: translateX(-100%); } to { transform: translateX(0); } }

          /* ── Responsive utilities ─────────────────────────────────── */
          @media (max-width: 768px) {
            .desk-only { display: none !important; }
            .mob-col-1 { grid-template-columns: 1fr !important; }
            .mob-stack { flex-direction: column !important; }
            .mob-full  { width: 100% !important; max-width: 100% !important; }
            .mob-p-sm  { padding: 12px !important; }
            .mob-gap-sm { gap: 10px !important; }
            .mob-text-sm { font-size: 13px !important; }
          }
          @media (min-width: 769px) {
            .mob-only { display: none !important; }
          }

          /* ── Scrollbar slim ───────────────────────────────────────── */
          ::-webkit-scrollbar { width: 4px; height: 4px; }
          ::-webkit-scrollbar-track { background: transparent; }
          ::-webkit-scrollbar-thumb { background: #D1D5DB; border-radius: 4px; }

          /* ── Touch-friendly tap targets ───────────────────────────── */
          @media (max-width: 768px) {
            button, a, [role="button"] { min-height: 40px; }
          }
        `}</style>
      </head>
      <body>{children}</body>
    </html>
  );
}
