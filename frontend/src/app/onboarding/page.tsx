"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import api from "@/lib/api";

const STEPS = [
  { id: "business",   label: "Бизнес",       icon: "🏢" },
  { id: "audience",   label: "Аудитория",     icon: "👥" },
  { id: "platforms",  label: "Площадки",      icon: "📱" },
  { id: "voice",      label: "Голос бренда",  icon: "🎯" },
  { id: "clarify",    label: "Уточнения",     icon: "🤖" },
  { id: "launch",     label: "Запуск",        icon: "🚀" },
];

const PRICE_SEGMENTS = [
  { value: "economy", label: "Эконом",  desc: "до 1000 ₽ средний чек" },
  { value: "middle",  label: "Средний", desc: "1000–5000 ₽ средний чек" },
  { value: "premium", label: "Премиум", desc: "от 5000 ₽ средний чек" },
];

const BRAND_VOICES = [
  { value: "friendly",  label: "Дружелюбный сосед", desc: "Тепло, просто, с юмором" },
  { value: "expert",    label: "Серьёзный эксперт",  desc: "Авторитетно, профессионально" },
  { value: "innovator", label: "Инноватор",          desc: "Современно, динамично" },
  { value: "family",    label: "Семейный бренд",     desc: "Заботливо, душевно" },
  { value: "luxury",    label: "Люксовый",           desc: "Элегантно, изысканно" },
  { value: "fun",       label: "Весёлый и дерзкий",  desc: "Ярко, с иронией и мемами" },
];

type FormData = {
  name: string; niche: string; usp: string; price_segment: string; geo: string;
  audience_primary: string; audience_pains: string[]; audience_objections: string[];
  competitors: { name: string; url: string }[];
  platforms: string[]; platform_goals: Record<string, string>;
  brand_voice: string; visual_style: string; content_restrictions: string[];
  brand_colors: string[]; logo_url: string;
};

const INITIAL: FormData = {
  name: "", niche: "", usp: "", price_segment: "middle", geo: "",
  audience_primary: "", audience_pains: ["", "", ""], audience_objections: ["", ""],
  competitors: [{ name: "", url: "" }],
  platforms: ["telegram"], platform_goals: { telegram: "loyalty", vk: "sales" },
  brand_voice: "friendly", visual_style: "", content_restrictions: [],
  brand_colors: [], logo_url: "",
};

export default function OnboardingPage() {
  const router = useRouter();
  const [step, setStep] = useState(0);
  const [form, setForm] = useState<FormData>(INITIAL);
  const [businessId, setBusinessId] = useState<string | null>(null);
  const [clarifyQs, setClarifyQs] = useState<{ question: string; field: string }[]>([]);
  const [clarifyAs, setClarifyAs] = useState<Record<string, string>>({});
  const [loading, setLoading] = useState(false);
  const [launching, setLaunching] = useState(false);
  const [error, setError] = useState("");

  const set = (key: keyof FormData, val: unknown) =>
    setForm((f) => ({ ...f, [key]: val }));

  const setPain = (i: number, v: string) => {
    const pains = [...form.audience_pains];
    pains[i] = v;
    set("audience_pains", pains);
  };

  const setObj = (i: number, v: string) => {
    const objs = [...form.audience_objections];
    objs[i] = v;
    set("audience_objections", objs);
  };

  const togglePlatform = (p: string) => {
    const curr = form.platforms;
    set("platforms", curr.includes(p) ? curr.filter((x) => x !== p) : [...curr, p]);
  };

  const saveAndClarify = async () => {
    setLoading(true);
    setError("");
    try {
      const payload = {
        ...form,
        audience_pains: form.audience_pains.filter(Boolean),
        audience_objections: form.audience_objections.filter(Boolean),
        competitors: form.competitors
          .filter((c) => c.name || c.url)
          .map((c) => ({ name: c.name, url: c.url, pros: "", cons: "" })),
        brand_voice_examples: [],
      };

      const { data } = await api.post(`/onboarding/save-profile/new`, payload);
      const bId = data.business_id;
      setBusinessId(bId);
      if (typeof window !== "undefined") {
        localStorage.setItem("businessId", bId);
      }

      const { data: qs } = await api.post(`/onboarding/clarify/${bId}`);
      setClarifyQs(qs.questions || []);
      setStep(4);
    } catch {
      setError("Ошибка сохранения. Проверьте что все поля заполнены.");
    } finally {
      setLoading(false);
    }
  };

  const launch = async () => {
    setLaunching(true);
    setError("");
    try {
      // Сохраняем ответы на уточнения
      for (const q of clarifyQs) {
        const answer = clarifyAs[q.field];
        if (answer) {
          await api.post(`/onboarding/answer-clarification/${businessId}`, {
            question: q.question,
            answer,
          });
        }
      }

      // Запускаем генерацию стратегии
      // Контент-план запустится автоматически после стратегии через Celery
      await api.post(`/businesses/${businessId}/generate-strategy`);

      setStep(5);
    } catch {
      setError("Ошибка запуска. Попробуйте ещё раз.");
    } finally {
      setLaunching(false);
    }
  };

  const inputStyle: React.CSSProperties = {
    width: "100%", padding: "10px 14px", border: "1px solid #E0DED8",
    borderRadius: 10, fontSize: 14, fontFamily: "inherit",
    outline: "none", boxSizing: "border-box", background: "#fff",
  };

  const labelStyle: React.CSSProperties = {
    fontSize: 13, fontWeight: 500, color: "#444", display: "block", marginBottom: 6,
  };

  const hintStyle: React.CSSProperties = {
    fontSize: 12, color: "#999", marginTop: 4,
  };

  return (
    <div style={{ minHeight: "100vh", background: "#F8F7F4", fontFamily: "'Segoe UI', sans-serif" }}>
      <div style={{ background: "#fff", borderBottom: "1px solid #EAE8E2", padding: "0 2rem" }}>
        <div style={{ maxWidth: 680, margin: "0 auto", display: "flex", alignItems: "center", height: 60, gap: 12 }}>
          <span style={{ fontSize: 20, fontWeight: 700, color: "#1a1a1a" }}>🍕 SMM Platform</span>
          <span style={{ fontSize: 13, color: "#aaa" }}>/ Настройка бизнеса</span>
        </div>
      </div>

      <div style={{ maxWidth: 680, margin: "0 auto", padding: "2rem 1rem" }}>
        {/* Progress */}
        <div style={{ display: "flex", gap: 4, marginBottom: 32 }}>
          {STEPS.map((s, i) => (
            <div key={s.id} style={{ flex: 1, display: "flex", flexDirection: "column", alignItems: "center", gap: 6 }}>
              <div style={{ width: "100%", height: 3, borderRadius: 2,
                background: i <= step ? "#1a1a1a" : "#E0DED8", transition: "background 0.3s" }} />
              <span style={{ fontSize: 10, color: i <= step ? "#1a1a1a" : "#bbb", fontWeight: i === step ? 600 : 400 }}>
                {s.icon} {s.label}
              </span>
            </div>
          ))}
        </div>

        {/* STEP 0: Бизнес */}
        {step === 0 && (
          <div style={{ display: "flex", flexDirection: "column", gap: 20 }}>
            <div>
              <h2 style={{ fontSize: 22, fontWeight: 700, margin: "0 0 6px" }}>Расскажите о вашем бизнесе</h2>
              <p style={{ color: "#888", margin: 0, fontSize: 14 }}>Эта информация поможет AI создать персональную стратегию</p>
            </div>
            <div>
              <label style={labelStyle}>Название бизнеса *</label>
              <input value={form.name} onChange={(e) => set("name", e.target.value)}
                placeholder="Пиццерия Маэстро" style={inputStyle} />
            </div>
            <div>
              <label style={labelStyle}>Ниша / сфера деятельности *</label>
              <input value={form.niche} onChange={(e) => set("niche", e.target.value)}
                placeholder="Ресторан, доставка пиццы" style={inputStyle} />
            </div>
            <div>
              <label style={labelStyle}>Уникальное торговое предложение *</label>
              <textarea value={form.usp} onChange={(e) => set("usp", e.target.value)}
                placeholder="Чем вы отличаетесь от конкурентов?"
                style={{ ...inputStyle, minHeight: 80, resize: "vertical" }} />
              <p style={hintStyle}>Одним-двумя предложениями</p>
            </div>
            <div>
              <label style={labelStyle}>Город / район *</label>
              <input value={form.geo} onChange={(e) => set("geo", e.target.value)}
                placeholder="Москва, Марьино" style={inputStyle} />
            </div>
            <div>
              <label style={labelStyle}>Ценовой сегмент</label>
              <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 10 }}>
                {PRICE_SEGMENTS.map((ps) => (
                  <div key={ps.value} onClick={() => set("price_segment", ps.value)}
                    style={{ padding: 12, border: `1.5px solid ${form.price_segment === ps.value ? "#1a1a1a" : "#E0DED8"}`,
                      borderRadius: 10, cursor: "pointer", background: form.price_segment === ps.value ? "#F8F7F4" : "#fff" }}>
                    <div style={{ fontWeight: 600, fontSize: 14, marginBottom: 2 }}>{ps.label}</div>
                    <div style={{ fontSize: 11, color: "#999" }}>{ps.desc}</div>
                  </div>
                ))}
              </div>
            </div>
            <button onClick={() => setStep(1)} disabled={!form.name || !form.niche || !form.usp || !form.geo}
              style={{ padding: 13, background: "#1a1a1a", color: "#fff", border: "none",
                borderRadius: 12, cursor: "pointer", fontSize: 15, fontWeight: 600,
                opacity: (!form.name || !form.niche || !form.usp || !form.geo) ? 0.4 : 1 }}>
              Далее →
            </button>
          </div>
        )}

        {/* STEP 1: Аудитория */}
        {step === 1 && (
          <div style={{ display: "flex", flexDirection: "column", gap: 20 }}>
            <div>
              <h2 style={{ fontSize: 22, fontWeight: 700, margin: "0 0 6px" }}>Кто ваши клиенты?</h2>
              <p style={{ color: "#888", margin: 0, fontSize: 14 }}>AI будет писать посты именно для этих людей</p>
            </div>
            <div>
              <label style={labelStyle}>Основная аудитория *</label>
              <input value={form.audience_primary} onChange={(e) => set("audience_primary", e.target.value)}
                placeholder="Семьи с детьми 28-45 лет" style={inputStyle} />
            </div>
            <div>
              <label style={labelStyle}>Главные боли клиентов</label>
              {form.audience_pains.map((p, i) => (
                <input key={i} value={p} onChange={(e) => setPain(i, e.target.value)}
                  placeholder={["Не знают что заказать на ужин", "Хочется быстро и вкусно", "Устали готовить"][i]}
                  style={{ ...inputStyle, marginBottom: 8 }} />
              ))}
            </div>
            <div>
              <label style={labelStyle}>Типичные возражения</label>
              {form.audience_objections.map((o, i) => (
                <input key={i} value={o} onChange={(e) => setObj(i, e.target.value)}
                  placeholder={["Дорого", "Долго доставляют"][i]}
                  style={{ ...inputStyle, marginBottom: 8 }} />
              ))}
            </div>
            <div style={{ display: "flex", gap: 10 }}>
              <button onClick={() => setStep(0)}
                style={{ flex: 1, padding: 13, background: "#F1EFE8", color: "#444",
                  border: "none", borderRadius: 12, cursor: "pointer", fontSize: 15 }}>
                ← Назад
              </button>
              <button onClick={() => setStep(2)} disabled={!form.audience_primary}
                style={{ flex: 2, padding: 13, background: "#1a1a1a", color: "#fff", border: "none",
                  borderRadius: 12, cursor: "pointer", fontSize: 15, fontWeight: 600,
                  opacity: !form.audience_primary ? 0.4 : 1 }}>
                Далее →
              </button>
            </div>
          </div>
        )}

        {/* STEP 2: Площадки */}
        {step === 2 && (
          <div style={{ display: "flex", flexDirection: "column", gap: 20 }}>
            <div>
              <h2 style={{ fontSize: 22, fontWeight: 700, margin: "0 0 6px" }}>Где продвигаемся?</h2>
              <p style={{ color: "#888", margin: 0, fontSize: 14 }}>Выберите площадки и цель для каждой</p>
            </div>
            {[
              { id: "telegram", label: "Telegram",      icon: "✈", desc: "Канал / группа" },
              { id: "vk",       label: "ВКонтакте",     icon: "В", desc: "Группа / публичная страница" },
              { id: "ok",       label: "Одноклассники", icon: "О", desc: "Группа" },
            ].map((pl) => (
              <div key={pl.id} style={{ border: `1.5px solid ${form.platforms.includes(pl.id) ? "#1a1a1a" : "#E0DED8"}`,
                borderRadius: 12, overflow: "hidden" }}>
                <div onClick={() => togglePlatform(pl.id)}
                  style={{ display: "flex", alignItems: "center", gap: 12, padding: "14px 16px",
                    cursor: "pointer", background: form.platforms.includes(pl.id) ? "#F8F7F4" : "#fff" }}>
                  <span style={{ width: 36, height: 36, borderRadius: 8, background: "#1a1a1a", color: "#fff",
                    display: "flex", alignItems: "center", justifyContent: "center", fontSize: 16, fontWeight: 700 }}>
                    {pl.icon}
                  </span>
                  <div style={{ flex: 1 }}>
                    <div style={{ fontWeight: 600, fontSize: 15 }}>{pl.label}</div>
                    <div style={{ fontSize: 12, color: "#999" }}>{pl.desc}</div>
                  </div>
                  <div style={{ width: 22, height: 22, borderRadius: "50%",
                    border: `2px solid ${form.platforms.includes(pl.id) ? "#1a1a1a" : "#ccc"}`,
                    background: form.platforms.includes(pl.id) ? "#1a1a1a" : "transparent",
                    display: "flex", alignItems: "center", justifyContent: "center" }}>
                    {form.platforms.includes(pl.id) && <span style={{ color: "#fff", fontSize: 12 }}>✓</span>}
                  </div>
                </div>
                {form.platforms.includes(pl.id) && (
                  <div style={{ padding: "12px 16px", borderTop: "1px solid #EAE8E2", background: "#fff" }}>
                    <label style={{ ...labelStyle, marginBottom: 8 }}>Цель для {pl.label}</label>
                    <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                      {[{ v: "sales", l: "Продажи" }, { v: "loyalty", l: "Лояльность" }, { v: "reach", l: "Охват" }].map((g) => (
                        <button key={g.v}
                          onClick={() => set("platform_goals", { ...form.platform_goals, [pl.id]: g.v })}
                          style={{ padding: "6px 14px", borderRadius: 20, border: "1px solid", cursor: "pointer", fontSize: 13,
                            borderColor: form.platform_goals[pl.id] === g.v ? "#1a1a1a" : "#E0DED8",
                            background: form.platform_goals[pl.id] === g.v ? "#1a1a1a" : "#fff",
                            color: form.platform_goals[pl.id] === g.v ? "#fff" : "#555" }}>
                          {g.l}
                        </button>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            ))}
            <div style={{ display: "flex", gap: 10 }}>
              <button onClick={() => setStep(1)}
                style={{ flex: 1, padding: 13, background: "#F1EFE8", color: "#444",
                  border: "none", borderRadius: 12, cursor: "pointer", fontSize: 15 }}>
                ← Назад
              </button>
              <button onClick={() => setStep(3)} disabled={form.platforms.length === 0}
                style={{ flex: 2, padding: 13, background: "#1a1a1a", color: "#fff", border: "none",
                  borderRadius: 12, cursor: "pointer", fontSize: 15, fontWeight: 600,
                  opacity: form.platforms.length === 0 ? 0.4 : 1 }}>
                Далее →
              </button>
            </div>
          </div>
        )}

        {/* STEP 3: Голос бренда */}
        {step === 3 && (
          <div style={{ display: "flex", flexDirection: "column", gap: 20 }}>
            <div>
              <h2 style={{ fontSize: 22, fontWeight: 700, margin: "0 0 6px" }}>Голос вашего бренда</h2>
              <p style={{ color: "#888", margin: 0, fontSize: 14 }}>Как вы общаетесь с клиентами?</p>
            </div>
            <div>
              <label style={labelStyle}>Тональность общения</label>
              <div style={{ display: "grid", gridTemplateColumns: "repeat(2, 1fr)", gap: 10 }}>
                {BRAND_VOICES.map((bv) => (
                  <div key={bv.value} onClick={() => set("brand_voice", bv.value)}
                    style={{ padding: "12px 14px",
                      border: `1.5px solid ${form.brand_voice === bv.value ? "#1a1a1a" : "#E0DED8"}`,
                      borderRadius: 10, cursor: "pointer",
                      background: form.brand_voice === bv.value ? "#F8F7F4" : "#fff" }}>
                    <div style={{ fontWeight: 600, fontSize: 14 }}>{bv.label}</div>
                    <div style={{ fontSize: 11, color: "#999", marginTop: 2 }}>{bv.desc}</div>
                  </div>
                ))}
              </div>
            </div>
            <div>
              <label style={labelStyle}>Визуальный стиль *</label>
              <textarea value={form.visual_style} onChange={(e) => set("visual_style", e.target.value)}
                placeholder="Тёплые тона, фото еды крупным планом, уютная атмосфера"
                style={{ ...inputStyle, minHeight: 80, resize: "vertical" }} />
              <p style={hintStyle}>Опишите как должны выглядеть картинки к постам</p>
            </div>
            <div>
              <label style={labelStyle}>Что нельзя публиковать?</label>
              <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
                {["алкоголь", "политика", "конкуренты", "скидки", "агрессивные продажи"].map((r) => (
                  <button key={r}
                    onClick={() => {
                      const curr = form.content_restrictions;
                      set("content_restrictions", curr.includes(r) ? curr.filter((x) => x !== r) : [...curr, r]);
                    }}
                    style={{ padding: "6px 14px", borderRadius: 20, border: "1px solid", cursor: "pointer", fontSize: 13,
                      borderColor: form.content_restrictions.includes(r) ? "#A32D2D" : "#E0DED8",
                      background: form.content_restrictions.includes(r) ? "#FCEBEB" : "#fff",
                      color: form.content_restrictions.includes(r) ? "#A32D2D" : "#555" }}>
                    {r}
                  </button>
                ))}
              </div>
            </div>
            {error && <p style={{ color: "#A32D2D", fontSize: 13 }}>{error}</p>}
            <div style={{ display: "flex", gap: 10 }}>
              <button onClick={() => setStep(2)}
                style={{ flex: 1, padding: 13, background: "#F1EFE8", color: "#444",
                  border: "none", borderRadius: 12, cursor: "pointer", fontSize: 15 }}>
                ← Назад
              </button>
              <button onClick={saveAndClarify} disabled={loading || !form.visual_style}
                style={{ flex: 2, padding: 13, background: "#1a1a1a", color: "#fff", border: "none",
                  borderRadius: 12, cursor: "pointer", fontSize: 15, fontWeight: 600,
                  opacity: (loading || !form.visual_style) ? 0.6 : 1 }}>
                {loading ? "Сохраняю..." : "Далее →"}
              </button>
            </div>
          </div>
        )}

        {/* STEP 4: Уточнения */}
        {step === 4 && (
          <div style={{ display: "flex", flexDirection: "column", gap: 20 }}>
            <div>
              <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 6 }}>
                <span style={{ fontSize: 28 }}>🤖</span>
                <h2 style={{ fontSize: 22, fontWeight: 700, margin: 0 }}>AI изучил ваш профиль</h2>
              </div>
              <p style={{ color: "#888", margin: 0, fontSize: 14 }}>
                Чтобы создать точную стратегию, уточните несколько деталей
              </p>
            </div>
            {clarifyQs.length === 0 ? (
              <div style={{ padding: "2rem", textAlign: "center", color: "#888",
                background: "#F8F7F4", borderRadius: 12 }}>
                <p>AI не нашёл пробелов — профиль заполнен отлично!</p>
              </div>
            ) : (
              clarifyQs.map((q, i) => (
                <div key={i} style={{ background: "#fff", border: "1px solid #EAE8E2", borderRadius: 12, padding: 16 }}>
                  <label style={{ ...labelStyle, fontSize: 14, lineHeight: 1.5, marginBottom: 10 }}>
                    {i + 1}. {q.question}
                  </label>
                  <textarea
                    value={clarifyAs[q.field] || ""}
                    onChange={(e) => setClarifyAs({ ...clarifyAs, [q.field]: e.target.value })}
                    placeholder="Ваш ответ..."
                    style={{ ...inputStyle, minHeight: 70, resize: "vertical" }} />
                </div>
              ))
            )}
            {error && <p style={{ color: "#A32D2D", fontSize: 13 }}>{error}</p>}
            <button onClick={launch} disabled={launching}
              style={{ padding: 15, background: "#1a1a1a", color: "#fff", border: "none",
                borderRadius: 12, cursor: "pointer", fontSize: 16, fontWeight: 700,
                opacity: launching ? 0.6 : 1 }}>
              {launching ? "Запускаю AI... ⏳" : "🚀 Запустить платформу"}
            </button>
          </div>
        )}

        {/* STEP 5: Запущено */}
        {step === 5 && (
          <div style={{ textAlign: "center", padding: "3rem 0" }}>
            <div style={{ fontSize: 72, marginBottom: 16 }}>🎉</div>
            <h2 style={{ fontSize: 26, fontWeight: 700, margin: "0 0 12px" }}>Платформа запущена!</h2>
            <p style={{ color: "#666", fontSize: 15, maxWidth: 400, margin: "0 auto 32px", lineHeight: 1.6 }}>
              AI генерирует контент-стратегию и контент-план на этот месяц.
              Обычно это занимает 1-2 минуты.
            </p>
            <div style={{ display: "flex", flexDirection: "column", gap: 12, maxWidth: 340, margin: "0 auto 32px" }}>
              {[
                { icon: "📋", text: "Контент-стратегия для ваших площадок" },
                { icon: "📅", text: "Контент-план на текущий месяц" },
                { icon: "✍️", text: "Тексты постов под ваш голос бренда" },
                { icon: "🖼",  text: "AI-картинки для каждого поста" },
              ].map((item, i) => (
                <div key={i} style={{ display: "flex", alignItems: "center", gap: 12,
                  padding: "12px 16px", background: "#fff", borderRadius: 10,
                  border: "1px solid #EAE8E2", textAlign: "left" }}>
                  <span style={{ fontSize: 20 }}>{item.icon}</span>
                  <span style={{ fontSize: 14, color: "#333" }}>{item.text}</span>
                  <span style={{ marginLeft: "auto", fontSize: 12, color: "#0F6E56" }}>Генерируется...</span>
                </div>
              ))}
            </div>
            <button onClick={() => router.push("/dashboard")}
              style={{ padding: "14px 40px", background: "#1a1a1a", color: "#fff", border: "none",
                borderRadius: 12, cursor: "pointer", fontSize: 16, fontWeight: 700 }}>
              Перейти в дашборд →
            </button>
          </div>
        )}
      </div>
    </div>
  );
}