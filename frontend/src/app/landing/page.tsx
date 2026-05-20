"use client";
import { useState, useEffect } from "react";
import api from "@/lib/api";

// ── Design tokens (brandbook v1.0) ────────────────────────────────────────────
const C = {
  blue:       "#3478F6",
  dark:       "#0D1B2A",
  darker:     "#060D14",
  graphite:   "#1F2937",
  skyBlue:    "#EAF4FF",
  teal:       "#00B5A6",
  tealLight:  "#E0F7F6",
  coral:      "#FF6B5E",
  coralLight: "#FFF0EF",
  sand:       "#F2E8D5",
  lightGray:  "#F5F7FA",
  border:     "#E5E7EB",
  white:      "#FFFFFF",
  gray:       "#6B7280",
  muted:      "#9CA3AF",
} as const;

const ff = {
  h: "'Manrope', sans-serif",
  b: "'Inter', sans-serif",
};

// ── Lead form ─────────────────────────────────────────────────────────────────
interface FD { name: string; email: string; phone: string; }
interface FE { name?: string; email?: string; phone?: string; }

function validate(d: FD): FE {
  const e: FE = {};
  if (!d.name.trim() || d.name.trim().length < 2) e.name = "Введите имя";
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(d.email.trim())) e.email = "Некорректный email";
  if (d.phone.replace(/\D/g, "").length < 7) e.phone = "Введите телефон";
  return e;
}

function LeadForm({ id, dark }: { id: string; dark?: boolean }) {
  const [form, setForm] = useState<FD>({ name: "", email: "", phone: "" });
  const [err, setErr] = useState<FE>({});
  const [loading, setLoading] = useState(false);
  const [done, setDone] = useState(false);
  const [srvErr, setSrvErr] = useState("");

  const set = (k: keyof FD) => (e: React.ChangeEvent<HTMLInputElement>) =>
    setForm(p => ({ ...p, [k]: e.target.value }));

  const submit = async () => {
    const errs = validate(form);
    setErr(errs);
    if (Object.keys(errs).length) return;
    setLoading(true);
    setSrvErr("");
    try {
      await api.post("/leads", form);
      setDone(true);
    } catch {
      setSrvErr("Не удалось отправить заявку. Попробуйте позже.");
    } finally {
      setLoading(false);
    }
  };

  if (done) return (
    <div style={{ textAlign: "center", padding: "24px 0" }}>
      <div style={{
        width: 56, height: 56, borderRadius: "50%", background: C.tealLight,
        display: "flex", alignItems: "center", justifyContent: "center",
        margin: "0 auto 16px",
      }}>
        <svg width="26" height="26" fill="none" stroke={C.teal} strokeWidth="2.5" viewBox="0 0 24 24">
          <polyline points="20 6 9 17 4 12" />
        </svg>
      </div>
      <p style={{ fontFamily: ff.h, fontSize: 18, fontWeight: 700, color: dark ? C.white : C.dark, margin: "0 0 8px" }}>
        Заявка принята!
      </p>
      <p style={{ color: dark ? C.muted : C.gray, fontSize: 14, lineHeight: 1.6, margin: 0, fontFamily: ff.b }}>
        Мы напишем вам в ближайшие часы и поможем с первыми настройками.
      </p>
    </div>
  );

  const inp = (field: keyof FD, placeholder: string, type = "text") => (
    <div>
      <input
        type={type}
        placeholder={placeholder}
        value={form[field]}
        onChange={set(field)}
        onKeyDown={e => e.key === "Enter" && submit()}
        style={{
          width: "100%", padding: "13px 14px", fontSize: 15,
          border: `1.5px solid ${err[field] ? C.coral : C.border}`,
          borderRadius: 10, outline: "none",
          fontFamily: ff.b, background: C.white, color: C.graphite,
          boxSizing: "border-box", transition: "border-color 0.15s",
        }}
      />
      {err[field] && (
        <p style={{ color: C.coral, fontSize: 12, margin: "4px 0 0", fontFamily: ff.b }}>{err[field]}</p>
      )}
    </div>
  );

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
      {inp("name", "Ваше имя")}
      {inp("email", "Email", "email")}
      {inp("phone", "Телефон", "tel")}
      {srvErr && (
        <div style={{
          padding: "10px 14px", background: "#FFF0EF", borderRadius: 8,
          fontSize: 13, color: "#FF6B5E", border: "1px solid #FFBDB9",
        }}>{srvErr}</div>
      )}
      <button
        onClick={submit}
        disabled={loading}
        style={{
          padding: "14px 24px", background: loading ? C.muted : C.blue,
          color: C.white, border: "none", borderRadius: 10,
          fontSize: 16, fontWeight: 700, cursor: loading ? "not-allowed" : "pointer",
          fontFamily: ff.h, transition: "background 0.15s", marginTop: 4,
        }}
      >
        {loading ? "Отправляем..." : "Попробовать 3 дня бесплатно →"}
      </button>
      <p style={{ fontSize: 12, color: C.muted, margin: 0, textAlign: "center", fontFamily: ff.b }}>
        Без карты · Без обязательств · Отмена в любой момент
      </p>
    </div>
  );
}

// ── Check icon ────────────────────────────────────────────────────────────────
function Check({ color }: { color: string }) {
  return (
    <svg width="11" height="11" fill="none" stroke={color} strokeWidth="2.5" viewBox="0 0 24 24">
      <polyline points="20 6 9 17 4 12" />
    </svg>
  );
}

// ── Main ──────────────────────────────────────────────────────────────────────
export default function LandingPage() {
  const [openFaq, setOpenFaq] = useState<number | null>(null);
  const [mob, setMob] = useState(false);

  useEffect(() => {
    const check = () => setMob(window.innerWidth < 768);
    check();
    window.addEventListener("resize", check);
    return () => window.removeEventListener("resize", check);
  }, []);

  const wrap: React.CSSProperties = {
    maxWidth: 1080, margin: "0 auto", padding: mob ? "0 20px" : "0 40px",
  };
  const sec = (bg: string, py = mob ? 56 : 80): React.CSSProperties => ({
    background: bg, padding: `${py}px 0`,
  });
  const h2: React.CSSProperties = {
    fontFamily: ff.h, fontSize: mob ? 28 : 38, fontWeight: 800,
    color: C.dark, margin: "0 0 12px", letterSpacing: -0.5, lineHeight: 1.15,
  };
  const lead: React.CSSProperties = {
    fontFamily: ff.b, fontSize: mob ? 15 : 17, color: C.gray,
    margin: "0 0 48px", lineHeight: 1.65,
  };
  const card: React.CSSProperties = {
    background: C.white, borderRadius: 18, padding: "28px 24px",
    border: `1px solid ${C.border}`,
    boxShadow: "0 2px 16px rgba(13,27,42,0.05)",
  };

  const faqs = [
    {
      q: "Мне нужно уметь что-то делать или разбираться в SMM?",
      a: "Нет. Вы просто заполняете анкету о своём бизнесе — платформа сама составляет стратегию, пишет тексты и делает картинки. Никаких специальных знаний не нужно.",
    },
    {
      q: "Посты будут звучать как живой человек, а не как робот?",
      a: "Да. При настройке вы выбираете тон общения — серьёзный, дружелюбный, экспертный. Платформа пишет в вашем стиле и учитывает специфику вашей аудитории.",
    },
    {
      q: "Что если мне не понравится?",
      a: "Первые 3 дня — полностью бесплатно, без привязки карты. Попробуйте, посмотрите результат. Если не понравится — просто не продолжайте. Никакого удержания.",
    },
    {
      q: "Сколько постов в месяц выходит?",
      a: "Зависит от тарифа: на Старте — 12 постов, на Бизнесе — 30, на Про — без ограничений. На бесплатном демо — 10 постов за 3 дня.",
    },
    {
      q: "Платформа публикует сама или мне нужно нажимать кнопку?",
      a: "Полностью автоматически. Платформа публикует посты по расписанию сама. Вы можете просматривать план заранее и вносить правки, но это не обязательно.",
    },
  ];

  const plans = [
    {
      name: "Демо",
      price: "Бесплатно",
      period: "3 дня",
      badge: "Без карты",
      badgeBg: C.lightGray,
      badgeColor: C.gray,
      accentBorder: C.border,
      accent: C.graphite,
      popular: false,
      features: ["10 постов", "1 площадка", "AI-стратегия", "AI-тексты постов", "Автопостинг"],
      cta: "Начать бесплатно",
    },
    {
      name: "Старт",
      price: "2 990 ₽",
      period: "месяц",
      badge: null,
      accentBorder: `${C.blue}50`,
      accent: C.blue,
      popular: false,
      features: ["12 постов в месяц", "1 площадка", "AI-стратегия и план", "AI-тексты + картинки", "Автопостинг", "Базовая аналитика"],
      cta: "Выбрать Старт",
    },
    {
      name: "Бизнес",
      price: "5 990 ₽",
      period: "месяц",
      badge: "Популярный",
      badgeBg: C.teal,
      badgeColor: C.white,
      accentBorder: `${C.teal}60`,
      accent: C.teal,
      popular: true,
      features: ["30 постов в месяц", "3 площадки", "AI-стратегия и план", "AI-тексты + картинки", "Автопостинг", "Полная аналитика", "Приоритетная поддержка"],
      cta: "Выбрать Бизнес",
    },
  ];

  const testimonials = [
    {
      name: "Анна К.",
      role: "Владелица кофейни, Москва",
      text: "Раньше соцсети висели мёртвым грузом. Теперь платформа ведёт их сама — я только иногда захожу посмотреть. Несколько клиентов пришли именно из Telegram.",
    },
    {
      name: "Дмитрий П.",
      role: "Интернет-магазин одежды",
      text: "Сэкономил деньги на SMM-специалисте и нервы на согласовании контента. Платформа делает посты в нашем стиле — уже не могу отличить от ручного.",
    },
    {
      name: "Наталья В.",
      role: "Студия ногтевого сервиса",
      text: "Не разбираюсь ни в каком SMM, но теперь у меня нормальные соцсети. Клиенты пишут: «видели вас ВКонтакте». Это работает.",
    },
  ];

  return (
    <div style={{ fontFamily: ff.b, color: C.graphite, overflowX: "hidden" }}>

      {/* ── Nav ─────────────────────────────────────────────────────────── */}
      <nav style={{
        position: "sticky", top: 0, zIndex: 100,
        background: "rgba(255,255,255,0.95)", backdropFilter: "blur(12px)",
        borderBottom: `1px solid ${C.border}`,
        padding: mob ? "0 20px" : "0 40px", height: 60,
        display: "flex", alignItems: "center", justifyContent: "space-between",
      }}>
        <div style={{ fontFamily: ff.h, fontSize: 22, fontWeight: 800, color: C.dark, letterSpacing: -0.5 }}>
          smm<span style={{ color: C.blue }}>platform</span>
        </div>
        <div style={{ display: "flex", gap: 12, alignItems: "center" }}>
          {!mob && (
            <a href="/login" style={{ fontSize: 14, color: C.gray, textDecoration: "none", fontWeight: 500 }}>
              Войти
            </a>
          )}
          <a href="#hero-form" style={{
            padding: mob ? "8px 14px" : "9px 20px",
            background: C.blue, color: C.white,
            borderRadius: 8, fontSize: mob ? 13 : 14, fontWeight: 600,
            textDecoration: "none", fontFamily: ff.h,
          }}>
            {mob ? "Попробовать" : "Попробовать бесплатно"}
          </a>
        </div>
      </nav>

      {/* ── Hero ────────────────────────────────────────────────────────── */}
      <section style={{
        background: C.dark, padding: mob ? "60px 20px 72px" : "88px 40px 104px",
        position: "relative", overflow: "hidden",
      }}>
        {/* Декоративные круги */}
        <div style={{
          position: "absolute", right: mob ? -100 : 80, top: -80, width: 380, height: 380,
          borderRadius: "50%", background: C.blue, opacity: 0.07, pointerEvents: "none",
        }} />
        <div style={{
          position: "absolute", right: mob ? -40 : 160, top: 60, width: 200, height: 200,
          borderRadius: "50%", background: C.teal, opacity: 0.1, pointerEvents: "none",
        }} />
        <div style={{
          position: "absolute", left: -60, bottom: -60, width: 250, height: 250,
          borderRadius: "50%", background: C.coral, opacity: 0.05, pointerEvents: "none",
        }} />

        <div style={{
          maxWidth: 1080, margin: "0 auto",
          display: "flex",
          flexDirection: mob ? "column" : "row",
          gap: mob ? 44 : 64,
          alignItems: mob ? "stretch" : "center",
        }}>
          {/* Левая часть */}
          <div style={{ flex: 1 }}>
            <div style={{
              display: "inline-flex", alignItems: "center", gap: 8,
              background: "rgba(52,120,246,0.15)", borderRadius: 20,
              padding: "6px 14px", marginBottom: 24,
            }}>
              <span style={{ width: 7, height: 7, borderRadius: "50%", background: C.blue, display: "inline-block" }} />
              <span style={{ color: C.blue, fontSize: 13, fontWeight: 600, fontFamily: ff.h }}>
                AI-платформа · Системный SMM
              </span>
            </div>

            <h1 style={{
              fontFamily: ff.h, fontSize: mob ? 38 : 56,
              fontWeight: 800, color: C.white, margin: "0 0 20px",
              lineHeight: 1.08, letterSpacing: -1.5,
            }}>
              Соцсети,<br />которые ведут<br />
              <span style={{ color: C.blue }}>себя сами</span>
            </h1>

            <p style={{
              color: "#94A3B8", fontSize: mob ? 16 : 19, lineHeight: 1.65,
              margin: "0 0 36px", fontFamily: ff.b, maxWidth: 500,
            }}>
              Вы рассказываете о бизнесе — платформа пишет посты, делает картинки и публикует по расписанию. Без времени, навыков и дорогого специалиста.
            </p>

            <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
              {[
                "Не нужно разбираться в SMM",
                "В 10× дешевле SMM-специалиста",
                "ВКонтакте, Telegram и Одноклассники",
              ].map(t => (
                <div key={t} style={{ display: "flex", alignItems: "center", gap: 12 }}>
                  <div style={{
                    width: 22, height: 22, borderRadius: "50%",
                    background: C.teal, display: "flex",
                    alignItems: "center", justifyContent: "center", flexShrink: 0,
                  }}>
                    <Check color="#fff" />
                  </div>
                  <span style={{ color: "#CBD5E1", fontSize: 15, fontFamily: ff.b }}>{t}</span>
                </div>
              ))}
            </div>
          </div>

          {/* Правая часть: форма */}
          <div id="hero-form" style={{
            width: mob ? "100%" : 380, flexShrink: 0,
            background: C.white, borderRadius: 20,
            padding: "28px 28px 24px",
            boxShadow: "0 32px 80px rgba(0,0,0,0.35)",
          }}>
            <p style={{ fontFamily: ff.h, fontSize: 18, fontWeight: 700, color: C.dark, margin: "0 0 4px" }}>
              Оставьте заявку
            </p>
            <p style={{ color: C.gray, fontSize: 13, margin: "0 0 20px", fontFamily: ff.b }}>
              Настроим платформу под ваш бизнес
            </p>
            <LeadForm id="hero" />
          </div>
        </div>
      </section>

      {/* ── Stats strip ─────────────────────────────────────────────────── */}
      <section style={{ background: C.white, padding: mob ? "32px 20px" : "44px 40px", borderBottom: `1px solid ${C.border}` }}>
        <div style={{
          ...wrap,
          display: "flex",
          flexDirection: mob ? "column" : "row",
          gap: mob ? 28 : 0,
          justifyContent: "space-around", alignItems: "center",
          textAlign: "center",
        }}>
          {[
            { val: "200+",      label: "бизнесов уже работают на платформе" },
            { val: "15 000+",   label: "постов опубликовано автоматически" },
            { val: "от 2 990 ₽", label: "в месяц — дешевле любого специалиста" },
          ].map(({ val, label }) => (
            <div key={val}>
              <div style={{ fontFamily: ff.h, fontSize: mob ? 34 : 44, fontWeight: 800, color: C.blue, lineHeight: 1 }}>
                {val}
              </div>
              <div style={{ color: C.gray, fontSize: 14, marginTop: 8, fontFamily: ff.b }}>{label}</div>
            </div>
          ))}
        </div>
      </section>

      {/* ── Pains ───────────────────────────────────────────────────────── */}
      <section style={sec(C.skyBlue)}>
        <div style={wrap}>
          <div style={{ textAlign: mob ? "left" : "center", marginBottom: 48 }}>
            <h2 style={h2}>Узнаёте себя?</h2>
            <p style={{ ...lead, margin: 0 }}>Большинство предпринимателей сталкиваются с одним и тем же</p>
          </div>
          <div style={{
            display: "grid",
            gridTemplateColumns: mob ? "1fr" : "repeat(3, 1fr)",
            gap: 20,
          }}>
            {[
              {
                icon: "⏱",
                title: "Нет времени",
                desc: "Соцсети требуют несколько часов каждую неделю: придумать, написать, оформить, опубликовать. Вы занимаетесь бизнесом, а не контентом.",
                bg: C.coralLight,
              },
              {
                icon: "🤷",
                title: "Не умею делать контент",
                desc: "Непонятно что писать, как оформить, когда публиковать. SMM — это целая профессия, которую нужно годами осваивать.",
                bg: "#FFF7ED",
              },
              {
                icon: "💸",
                title: "Дорого нанимать",
                desc: "Хороший SMM-специалист стоит 30–80 тыс./мес. Для малого бизнеса это неподъёмно, особенно без гарантий результата.",
                bg: "#F0FFF4",
              },
            ].map(({ icon, title, desc, bg }) => (
              <div key={title} style={card}>
                <div style={{
                  width: 52, height: 52, borderRadius: 14,
                  background: bg, display: "flex",
                  alignItems: "center", justifyContent: "center",
                  fontSize: 26, marginBottom: 18,
                }}>{icon}</div>
                <h3 style={{ fontFamily: ff.h, fontSize: 18, fontWeight: 700, color: C.dark, margin: "0 0 10px" }}>
                  {title}
                </h3>
                <p style={{ color: C.gray, fontSize: 14, lineHeight: 1.65, margin: 0 }}>{desc}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ── How it works ────────────────────────────────────────────────── */}
      <section style={sec(C.white)}>
        <div style={wrap}>
          <div style={{ textAlign: mob ? "left" : "center", marginBottom: 48 }}>
            <h2 style={h2}>Как это работает</h2>
            <p style={{ ...lead, margin: 0 }}>Три шага — и соцсети работают сами</p>
          </div>
          <div style={{
            display: "grid",
            gridTemplateColumns: mob ? "1fr" : "repeat(3, 1fr)",
            gap: mob ? 36 : 48,
          }}>
            {[
              {
                num: "1",
                title: "Расскажите о бизнесе",
                desc: "Заполните анкету за 10 минут: чем занимаетесь, кто клиенты, какой тон общения вам близок.",
              },
              {
                num: "2",
                title: "Платформа всё настраивает",
                desc: "AI составляет SMM-стратегию, контент-план и создаёт первые посты с картинками — в вашем стиле.",
              },
              {
                num: "3",
                title: "Соцсети работают сами",
                desc: "Платформа публикует по расписанию, анализирует реакцию аудитории и улучшает следующие посты.",
              },
            ].map(({ num, title, desc }) => (
              <div key={num}>
                <div style={{
                  fontFamily: ff.h, fontSize: 96, fontWeight: 800,
                  color: C.tealLight, lineHeight: 0.9, marginBottom: 4,
                  userSelect: "none",
                }}>{num}</div>
                <h3 style={{ fontFamily: ff.h, fontSize: 20, fontWeight: 700, color: C.dark, margin: "16px 0 10px" }}>
                  {title}
                </h3>
                <p style={{ color: C.gray, fontSize: 15, lineHeight: 1.65, margin: 0 }}>{desc}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ── Benefits ────────────────────────────────────────────────────── */}
      <section style={sec(C.sand)}>
        <div style={wrap}>
          <div style={{ textAlign: mob ? "left" : "center", marginBottom: 48 }}>
            <h2 style={h2}>Что вы получаете</h2>
            <p style={{ ...lead, margin: 0 }}>Конкретные результаты, а не обещания</p>
          </div>
          <div style={{
            display: "grid",
            gridTemplateColumns: mob ? "1fr 1fr" : "repeat(4, 1fr)",
            gap: 16,
          }}>
            {[
              { icon: "⏱", val: "20+ часов",    label: "в месяц экономии на ведении соцсетей" },
              { icon: "💰", val: "В 10×",         label: "дешевле, чем нанимать SMM-специалиста" },
              { icon: "🧠", val: "Без навыков",   label: "AI знает SMM — вам не нужно разбираться" },
              { icon: "📱", val: "3 платформы",   label: "ВКонтакте, Telegram и Одноклассники" },
            ].map(({ icon, val, label }) => (
              <div key={val} style={{
                ...card, textAlign: "center",
                boxShadow: "0 2px 12px rgba(13,27,42,0.04)",
              }}>
                <div style={{ fontSize: mob ? 30 : 36, marginBottom: 12 }}>{icon}</div>
                <div style={{
                  fontFamily: ff.h, fontSize: mob ? 17 : 22, fontWeight: 800,
                  color: C.teal, marginBottom: 8,
                }}>{val}</div>
                <div style={{ color: C.gray, fontSize: mob ? 12 : 13, lineHeight: 1.5 }}>{label}</div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ── Testimonials ────────────────────────────────────────────────── */}
      <section style={sec(C.white)}>
        <div style={wrap}>
          <div style={{ textAlign: mob ? "left" : "center", marginBottom: 48 }}>
            <h2 style={h2}>Говорят предприниматели</h2>
            <p style={{ ...lead, margin: 0 }}>Реальные истории малого бизнеса</p>
          </div>
          <div style={{
            display: "grid",
            gridTemplateColumns: mob ? "1fr" : "repeat(3, 1fr)",
            gap: 20,
          }}>
            {testimonials.map(({ name, role, text }) => (
              <div key={name} style={{
                background: C.lightGray, borderRadius: 18, padding: "24px",
                border: `1px solid ${C.border}`,
              }}>
                <div style={{ color: "#FBBF24", fontSize: 18, letterSpacing: 2, marginBottom: 16 }}>
                  ★★★★★
                </div>
                <p style={{
                  color: C.graphite, fontSize: 15, lineHeight: 1.65,
                  margin: "0 0 20px", fontStyle: "italic",
                }}>
                  «{text}»
                </p>
                <div>
                  <div style={{ fontFamily: ff.h, fontWeight: 700, color: C.dark, fontSize: 15 }}>{name}</div>
                  <div style={{ color: C.muted, fontSize: 13, marginTop: 2 }}>{role}</div>
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ── Pricing ─────────────────────────────────────────────────────── */}
      <section style={sec(C.lightGray)}>
        <div style={wrap}>
          <div style={{ textAlign: mob ? "left" : "center", marginBottom: 48 }}>
            <h2 style={h2}>Простые цены</h2>
            <p style={{ ...lead, margin: 0 }}>
              Среднестатистический SMM-специалист стоит 30–80 тыс./мес.{mob ? " " : <br />}
              Тариф Бизнес в 10 раз дешевле — и работает 24/7.
            </p>
          </div>
          <div style={{
            display: "grid",
            gridTemplateColumns: mob ? "1fr" : "repeat(3, 1fr)",
            gap: 20, alignItems: "start",
          }}>
            {plans.map(plan => (
              <div key={plan.name} style={{
                background: C.white, borderRadius: 20, padding: "28px 24px",
                border: `2px solid ${plan.accentBorder}`,
                boxShadow: plan.popular
                  ? "0 12px 40px rgba(0,181,166,0.18)"
                  : "0 2px 12px rgba(13,27,42,0.04)",
                position: "relative",
              }}>
                {plan.badge && (
                  <div style={{
                    position: "absolute", top: -14, left: "50%", transform: "translateX(-50%)",
                    background: plan.badgeBg, color: plan.badgeColor,
                    padding: "4px 16px", borderRadius: 20, fontSize: 12, fontWeight: 700,
                    fontFamily: ff.h, whiteSpace: "nowrap",
                  }}>{plan.badge}</div>
                )}
                <div style={{ marginBottom: 20 }}>
                  <div style={{ fontFamily: ff.h, fontSize: 15, fontWeight: 700, color: C.gray, marginBottom: 10 }}>
                    {plan.name}
                  </div>
                  <div style={{ display: "flex", alignItems: "baseline", gap: 6 }}>
                    <span style={{ fontFamily: ff.h, fontSize: 32, fontWeight: 800, color: C.dark }}>
                      {plan.price}
                    </span>
                    <span style={{ color: C.muted, fontSize: 14 }}>/ {plan.period}</span>
                  </div>
                </div>
                <div style={{ marginBottom: 24 }}>
                  {plan.features.map(f => (
                    <div key={f} style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 10 }}>
                      <div style={{
                        width: 18, height: 18, borderRadius: "50%",
                        background: `${plan.accent}20`,
                        display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0,
                      }}>
                        <Check color={plan.accent} />
                      </div>
                      <span style={{ fontSize: 14, color: C.graphite }}>{f}</span>
                    </div>
                  ))}
                </div>
                <a href="/register" style={{
                  display: "block", textAlign: "center", padding: "13px",
                  background: plan.accent, color: C.white, borderRadius: 10,
                  fontSize: 14, fontWeight: 700, textDecoration: "none",
                  fontFamily: ff.h,
                }}>{plan.cta}</a>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ── FAQ ─────────────────────────────────────────────────────────── */}
      <section style={sec(C.white)}>
        <div style={{ maxWidth: 720, margin: "0 auto", padding: mob ? "0 20px" : "0 40px" }}>
          <div style={{ textAlign: mob ? "left" : "center", marginBottom: 48 }}>
            <h2 style={h2}>Часто спрашивают</h2>
            <p style={{ ...lead, margin: 0 }}>Отвечаем на главные вопросы предпринимателей</p>
          </div>
          <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
            {faqs.map((faq, i) => (
              <div key={i} style={{
                border: `1px solid ${C.border}`, borderRadius: 12, overflow: "hidden",
              }}>
                <button
                  onClick={() => setOpenFaq(openFaq === i ? null : i)}
                  style={{
                    width: "100%", padding: "18px 20px",
                    background: openFaq === i ? C.lightGray : C.white,
                    border: "none", cursor: "pointer",
                    display: "flex", justifyContent: "space-between", alignItems: "center", gap: 12,
                    textAlign: "left",
                  }}
                >
                  <span style={{
                    fontFamily: ff.h, fontSize: mob ? 15 : 16,
                    fontWeight: 600, color: C.dark,
                  }}>{faq.q}</span>
                  <span style={{
                    color: C.blue, fontSize: 22, flexShrink: 0, fontWeight: 300,
                    transform: openFaq === i ? "rotate(45deg)" : "none",
                    transition: "transform 0.2s", display: "block",
                  }}>+</span>
                </button>
                {openFaq === i && (
                  <div style={{
                    padding: "4px 20px 20px", color: C.gray,
                    fontSize: 15, lineHeight: 1.7, background: C.lightGray,
                    fontFamily: ff.b,
                  }}>{faq.a}</div>
                )}
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ── Final CTA ───────────────────────────────────────────────────── */}
      <section id="cta-form" style={{
        background: C.dark, padding: mob ? "64px 20px" : "88px 40px",
        position: "relative", overflow: "hidden",
      }}>
        <div style={{
          position: "absolute", left: "50%", top: -80, transform: "translateX(-50%)",
          width: 600, height: 300, borderRadius: "50%",
          background: C.blue, opacity: 0.06, pointerEvents: "none",
        }} />
        <div style={{ maxWidth: 500, margin: "0 auto", textAlign: "center" }}>
          <h2 style={{
            fontFamily: ff.h, fontSize: mob ? 30 : 40,
            fontWeight: 800, color: C.white, margin: "0 0 14px",
            letterSpacing: -0.8, lineHeight: 1.15,
          }}>
            Готовы сэкономить<br />время и деньги?
          </h2>
          <p style={{
            color: "#94A3B8", fontSize: mob ? 15 : 17, lineHeight: 1.65,
            margin: "0 0 36px", fontFamily: ff.b,
          }}>
            Первые 3 дня — бесплатно.<br />Без карты. Без сложных настроек.
          </p>
          <div style={{
            background: "rgba(255,255,255,0.06)", borderRadius: 20,
            padding: "28px 24px",
            border: "1px solid rgba(255,255,255,0.1)",
          }}>
            <LeadForm id="cta" dark />
          </div>
        </div>
      </section>

      {/* ── Footer ──────────────────────────────────────────────────────── */}
      <footer style={{
        background: C.darker, padding: mob ? "32px 20px" : "40px 40px",
        borderTop: "1px solid rgba(255,255,255,0.06)",
      }}>
        <div style={{
          maxWidth: 1080, margin: "0 auto",
          display: "flex",
          flexDirection: mob ? "column" : "row",
          gap: mob ? 20 : 0,
          justifyContent: "space-between", alignItems: mob ? "flex-start" : "center",
        }}>
          <div>
            <div style={{ fontFamily: ff.h, fontSize: 20, fontWeight: 800, color: C.white, letterSpacing: -0.5, marginBottom: 4 }}>
              smm<span style={{ color: C.blue }}>platform</span>
            </div>
            <div style={{ color: "#374151", fontSize: 13 }}>
              © 2026 smmplatform.pro · AI-платформа для системного SMM
            </div>
          </div>
          <div style={{ display: "flex", gap: 24, flexWrap: "wrap" }}>
            {[
              { label: "Войти", href: "/login" },
              { label: "Регистрация", href: "/register" },
              { label: "Тарифы", href: "/plans" },
            ].map(({ label, href }) => (
              <a key={href} href={href} style={{ color: "#4B5563", fontSize: 14, textDecoration: "none" }}>
                {label}
              </a>
            ))}
          </div>
        </div>
      </footer>

    </div>
  );
}
