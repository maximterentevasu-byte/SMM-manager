"use client";

export default function HomePage() {
  const cards = [
    { icon: "📈", title: "Аналитика", desc: "Охваты, лайки, вовлечённость по каждому посту" },
    { icon: "📅", title: "Ближайшие посты", desc: "Посты на следующие 7 дней с предпросмотром" },
    { icon: "✅", title: "Выполнено за месяц", desc: "Опубликовано vs запланировано" },
    { icon: "🔥", title: "Топ контент", desc: "Лучшие посты по вовлечённости" },
  ];

  return (
    <div style={{ minHeight: "100vh", background: "#F5F7FA", fontFamily: "'Inter', sans-serif" }}>
      <div style={{ background: "#fff", borderBottom: "1px solid #E5E7EB", padding: "0 2rem" }}>
        <div style={{ maxWidth: 900, margin: "0 auto", height: 64, display: "flex", alignItems: "center" }}>
          <h1 style={{ fontFamily: "'Manrope', sans-serif", fontSize: 20, fontWeight: 700,
            color: "#0D1B2A", margin: 0 }}>Главная</h1>
        </div>
      </div>

      <div style={{ maxWidth: 900, margin: "0 auto", padding: "2rem" }}>
        <div style={{ background: "#fff", border: "1px solid #E5E7EB", borderRadius: 16,
          boxShadow: "0 1px 4px rgba(13,27,42,0.05)",
          padding: "32px", textAlign: "center", marginBottom: 24 }}>
          <div style={{ fontSize: 48, marginBottom: 12 }}>🐦</div>
          <h2 style={{ fontFamily: "'Manrope', sans-serif", fontSize: 22, fontWeight: 700,
            color: "#0D1B2A", margin: "0 0 8px" }}>
            Дашборд в разработке
          </h2>
          <p style={{ color: "#9CA3AF", fontSize: 14, margin: 0 }}>
            АИСТ готовит общую сводку по всем вашим площадкам
          </p>
        </div>

        <div style={{ display: "grid", gridTemplateColumns: "repeat(2, 1fr)", gap: 16 }}>
          {cards.map((card) => (
            <div key={card.title} style={{ background: "#fff", border: "1px solid #E5E7EB",
              borderRadius: 14, padding: "20px 24px", display: "flex", gap: 16,
              alignItems: "flex-start", boxShadow: "0 1px 4px rgba(13,27,42,0.04)" }}>
              <span style={{ fontSize: 28, flexShrink: 0 }}>{card.icon}</span>
              <div>
                <div style={{ fontFamily: "'Manrope', sans-serif", fontWeight: 700,
                  fontSize: 15, color: "#0D1B2A", marginBottom: 4 }}>
                  {card.title}
                </div>
                <div style={{ fontSize: 13, color: "#6B7280", lineHeight: 1.5 }}>{card.desc}</div>
                <div style={{ marginTop: 8, fontSize: 12, color: "#3478F6",
                  fontWeight: 500 }}>Скоро</div>
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
