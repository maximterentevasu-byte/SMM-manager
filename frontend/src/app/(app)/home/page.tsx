"use client";

export default function HomePage() {
  const cards = [
    { icon: "📈", title: "Аналитика", desc: "Охваты, лайки, вовлечённость по каждому посту" },
    { icon: "📅", title: "Ближайшие посты", desc: "Посты на следующие 7 дней с предпросмотром" },
    { icon: "✅", title: "Выполнено за месяц", desc: "Опубликовано vs запланировано" },
    { icon: "🔥", title: "Топ контент", desc: "Лучшие посты по вовлечённости" },
  ];

  return (
    <div style={{ minHeight: "100vh", background: "#F8F7F4" }}>
      <div style={{ background: "#fff", borderBottom: "1px solid #EAE8E2", padding: "0 2rem" }}>
        <div style={{ maxWidth: 900, margin: "0 auto", height: 64, display: "flex", alignItems: "center" }}>
          <h1 style={{ fontSize: 20, fontWeight: 700, color: "#1a1a1a", margin: 0 }}>Главная</h1>
        </div>
      </div>

      <div style={{ maxWidth: 900, margin: "0 auto", padding: "2rem" }}>
        <div style={{ background: "#fff", border: "1px solid #EAE8E2", borderRadius: 16,
          padding: "32px", textAlign: "center", marginBottom: 24 }}>
          <div style={{ fontSize: 48, marginBottom: 12 }}>🚀</div>
          <h2 style={{ fontSize: 22, fontWeight: 700, color: "#1a1a1a", margin: "0 0 8px" }}>
            Дашборд в разработке
          </h2>
          <p style={{ color: "#888", fontSize: 14, margin: 0 }}>
            Здесь будет общая сводка по всем вашим площадкам
          </p>
        </div>

        <div style={{ display: "grid", gridTemplateColumns: "repeat(2, 1fr)", gap: 16 }}>
          {cards.map((card) => (
            <div key={card.title} style={{ background: "#fff", border: "1px solid #EAE8E2",
              borderRadius: 14, padding: "20px 24px", display: "flex", gap: 16, alignItems: "flex-start" }}>
              <span style={{ fontSize: 28, flexShrink: 0 }}>{card.icon}</span>
              <div>
                <div style={{ fontWeight: 600, fontSize: 15, color: "#1a1a1a", marginBottom: 4 }}>
                  {card.title}
                </div>
                <div style={{ fontSize: 13, color: "#888", lineHeight: 1.5 }}>{card.desc}</div>
                <div style={{ marginTop: 8, fontSize: 12, color: "#bbb" }}>Скоро</div>
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
