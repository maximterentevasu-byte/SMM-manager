"use client";

export default function AnalyticsPage() {
  return (
    <div style={{ minHeight: "100vh", background: "#F8F7F4" }}>
      <div style={{ background: "#fff", borderBottom: "1px solid #EAE8E2", padding: "0 2rem" }}>
        <div style={{ maxWidth: 900, margin: "0 auto", height: 64, display: "flex", alignItems: "center" }}>
          <h1 style={{ fontSize: 20, fontWeight: 700, color: "#1a1a1a", margin: 0 }}>Аналитика</h1>
        </div>
      </div>

      <div style={{ maxWidth: 900, margin: "0 auto", padding: "2rem" }}>
        <div style={{ background: "#fff", border: "1px solid #EAE8E2", borderRadius: 16,
          padding: "48px", textAlign: "center" }}>
          <div style={{ fontSize: 56, marginBottom: 16 }}>📊</div>
          <h2 style={{ fontSize: 22, fontWeight: 700, color: "#1a1a1a", margin: "0 0 12px" }}>
            Аналитика в разработке
          </h2>
          <p style={{ color: "#888", fontSize: 14, margin: 0, lineHeight: 1.6 }}>
            Здесь будут охваты, ER, динамика подписчиков<br />и сравнение площадок
          </p>
        </div>
      </div>
    </div>
  );
}
