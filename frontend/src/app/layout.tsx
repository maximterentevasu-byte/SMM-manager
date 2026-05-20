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
          :root {
            --c-dark:      #0D1B2A;
            --c-graphite:  #1F2937;
            --c-blue:      #3478F6;
            --c-sky:       #EAF4FF;
            --c-teal:      #00B5A6;
            --c-teal-lt:   #E0F7F6;
            --c-coral:     #FF6B5E;
            --c-coral-lt:  #FFF0EF;
            --c-sand:      #F2E8D5;
            --c-bg:        #F5F7FA;
            --c-white:     #FFFFFF;
            --c-border:    #E5E7EB;
            --c-muted:     #9CA3AF;
            --c-gray:      #6B7280;
            --ff-h: 'Manrope', -apple-system, BlinkMacSystemFont, sans-serif;
            --ff-b: 'Inter',   -apple-system, BlinkMacSystemFont, sans-serif;
            --sh-card:  0 2px 12px rgba(13,27,42,0.06);
            --sh-hover: 0 4px 20px rgba(13,27,42,0.10);
            --sh-modal: 0 8px 40px rgba(13,27,42,0.12);
          }
          *, *::before, *::after { box-sizing: border-box; }
          body {
            margin: 0;
            font-family: var(--ff-b);
            -webkit-font-smoothing: antialiased;
            background: var(--c-bg);
            color: var(--c-graphite);
          }
          h1, h2, h3, h4 { font-family: var(--ff-h); }
          :focus-visible { outline: 2px solid var(--c-blue); outline-offset: 2px; }
          @keyframes spin        { from { transform: rotate(0deg); } to { transform: rotate(360deg); } }
          @keyframes slideIn     { from { transform: translateX(-100%); } to { transform: translateX(0); } }
          @keyframes fadeInUp    { from { opacity: 0; transform: translateY(12px); } to { opacity: 1; transform: translateY(0); } }
          @keyframes skeletonPulse { 0%,100% { opacity: 0.45; } 50% { opacity: 0.9; } }
          .fade-in { animation: fadeInUp 0.3s ease both; }
          .skeleton { background: linear-gradient(90deg, #E5E7EB 25%, #F3F4F6 50%, #E5E7EB 75%); background-size: 200% 100%; animation: skeletonPulse 1.4s ease infinite; border-radius: 6px; }

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
