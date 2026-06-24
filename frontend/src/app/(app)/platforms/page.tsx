"use client";

import { useEffect, useState } from "react";
import api from "@/lib/api";
import { useMobile } from "@/hooks/useMobile";

type Connection = {
  platform: string;
  page_name: string;
  external_page_id: string;
  is_active: boolean;
  admin_chat_id: string | null;
};

type PlatformSetup = {
  token: string;
  pageId: string;
};

const code: React.CSSProperties = {
  background: "#F5F7FA", padding: "1px 6px", borderRadius: 4,
  fontFamily: "monospace", fontSize: 12, color: "#333",
};

const PLATFORMS = [
  {
    id: "telegram",
    name: "Telegram",
    icon: "✈",
    color: "#2AABEE",
    bg: "#E8F6FE",
    description: "Канал или группа",
    steps: [
      {
        title: "Добавь нашего бота администратором канала",
        items: [
          <>Открой свой канал → Настройки → Администраторы</>,
          <>Нажми «Добавить администратора» и найди бота:{" "}
            <a href="https://t.me/smmplatformb_bot" target="_blank" rel="noreferrer" style={{ color: "#2AABEE" }}>@smmplatformb_bot</a>
          </>,
          <>Достаточно прав: <strong>Публикация сообщений</strong></>,
        ],
      },
      {
        title: "Введи ID канала",
        items: [
          <><strong>Публичный канал:</strong> просто введи username: <code style={code}>@mychannel</code></>,
          <><strong>Приватный канал:</strong> перешли любое сообщение из канала боту{" "}
            <a href="https://t.me/JsonDumpBot" target="_blank" rel="noreferrer" style={{ color: "#2AABEE" }}>@JsonDumpBot</a>
          </>,
          <>В ответе найди <code style={code}>"chat"</code> → <code style={code}>"id"</code> — отрицательное число вида <code style={code}>-1001234567890</code></>,
          <>⚠️ <strong>Важно:</strong> бот должен быть добавлен (шаг 1) <em>до</em> подключения, иначе проверка не пройдёт</>,
        ],
      },
    ],
    tokenLabel: "",
    tokenPlaceholder: "",
    pageIdLabel: "ID канала / чата",
    pageIdPlaceholder: "-1001234567890 или @username",
    pageIdHint: "Отрицательное число (-1001234567890) или @username публичного канала",
  },
  {
    id: "vk",
    name: "ВКонтакте",
    icon: "В",
    color: "#4680C2",
    bg: "#EBF2FB",
    description: "Сообщество (группа или публичная страница)",
    steps: [
      {
        title: "Получи пользовательский токен VK (нужен для публикации с фото)",
        items: [
          <>Открой ссылку в браузере, где ты залогинен в VK:</>,
          <><a
              href="https://oauth.vk.com/authorize?client_id=2685278&scope=wall,photos,groups,offline&response_type=token&redirect_uri=https://oauth.vk.com/blank.html"
              target="_blank" rel="noreferrer" style={{ color: "#4680C2", wordBreak: "break-all" }}>
              oauth.vk.com/authorize?client_id=2685278&scope=wall,photos,groups,offline&response_type=token&redirect_uri=https://oauth.vk.com/blank.html
            </a></>,
          <>Нажми «Разрешить» — тебя перенаправит на страницу с пустым полем</>,
          <>В адресной строке найди <code style={code}>access_token=</code> — скопируй всё до <code style={code}>&expires_in</code></>,
          <><strong>Это и есть твой токен</strong> — вставь его ниже</>,
        ],
      },
      {
        title: "Найди ID своего сообщества",
        items: [
          <>Открой страницу сообщества в браузере</>,
          <>В адресной строке: <code style={code}>vk.com/club123456</code> — ID это <code style={code}>123456</code></>,
          <>Или: Управление → Настройки — вверху страницы будет «ID сообщества»</>,
          <>Вводи только цифры, <strong>без минуса и без «club»</strong></>,
        ],
      },
    ],
    tokenLabel: "Пользовательский токен VK",
    tokenPlaceholder: "vk1.a.xxxxxxxxxxxxxxxx",
    pageIdLabel: "ID сообщества",
    pageIdPlaceholder: "123456789",
    pageIdHint: "Только цифры, без минуса",
  },
];

export default function PlatformsPage() {
  const isMobile = useMobile();
  const [connections, setConnections] = useState<Connection[]>([]);
  const [loading, setLoading] = useState(true);
  const [expanded, setExpanded] = useState<string | null>(null);
  const [form, setForm] = useState<Record<string, PlatformSetup>>({
    telegram: { token: "", pageId: "" },
    vk: { token: "", pageId: "" },
  });
  const [connecting, setConnecting] = useState<string | null>(null);
  const [disconnecting, setDisconnecting] = useState<string | null>(null);
  const [testing, setTesting] = useState<string | null>(null);
  const [error, setError] = useState<Record<string, string>>({});
  const [success, setSuccess] = useState<Record<string, string>>({});
  const [openStep, setOpenStep] = useState<Record<string, number | null>>({});
  const [adminChatId, setAdminChatId] = useState("");
  const [savingAdminChat, setSavingAdminChat] = useState(false);

  const [businessId, setBusinessId] = useState(() =>
    typeof window !== "undefined" ? localStorage.getItem("businessId") || "" : ""
  );

  useEffect(() => {
    const load = async () => {
      let bId = businessId;
      if (!bId) {
        try {
          const { data: businesses } = await api.get("/businesses/");
          if (businesses.length > 0) {
            bId = businesses[0].id;
            localStorage.setItem("businessId", bId);
            setBusinessId(bId);
          }
        } catch {}
      }
      if (!bId) {
        setLoading(false);
        return;
      }
      api.get(`/platforms/list/${bId}`)
        .then(({ data }) => setConnections(data))
        .catch(() => {})
        .finally(() => setLoading(false));
    };
    load();
  }, []);


  const getConn = (id: string) => connections.find((c) => c.platform === id) || null;

  const setErr = (id: string, msg: string) => setError((p) => ({ ...p, [id]: msg }));
  const setOk = (id: string, msg: string) => {
    setSuccess((p) => ({ ...p, [id]: msg }));
    setTimeout(() => setSuccess((p) => ({ ...p, [id]: "" })), 4000);
  };

  const parseTgError = (detail: unknown, platformId: string): string => {
    if (!detail) return "❌ Ошибка подключения — проверьте токен и ID канала";
    if (typeof detail !== "string") return "❌ Ошибка подключения — проверьте токен и ID канала";
    const d = detail.toLowerCase();

    // Сетевые ошибки (от нашего бэкенда)
    if (d.startsWith("network_error:") || d.startsWith("timeout:"))
      return `⚠️ Сервер не смог подключиться к ${platformId === "telegram" ? "Telegram" : "VK"} API. Попробуйте через минуту или обратитесь в поддержку.`;

    if (platformId === "telegram") {
      if (d.includes("unauthorized"))
        return "❌ Неверный токен бота — проверьте его в @BotFather (команда /mybots)";
      if (d.includes("chat not found") || d.includes("peer_id_invalid"))
        return "❌ Канал не найден — убедитесь что: 1) бот добавлен в канал как администратор, 2) ID канала введён верно";
      if (d.includes("not a member") || d.includes("kicked") || d.includes("forbidden"))
        return "❌ Бот не является участником канала — добавьте бота в канал как администратора (Настройки → Администраторы)";
      if (d.includes("bot was blocked"))
        return "❌ Бот заблокирован — напишите боту в личку /start, затем попробуйте снова";
      if (d.includes("business not found"))
        return "⚠️ Сессия устарела — обновите страницу или войдите заново";
      if (d.includes("bad request"))
        return "❌ Неверный запрос — проверьте формат ID канала (должно быть отрицательное число, например -1001234567890, или @username)";
    }
    if (platformId === "vk") {
      if (d.includes("invalid access_token") || d.includes("access token"))
        return "❌ Неверный токен VK — получите новый по инструкции выше";
      if (d.includes("access denied") || d.includes("not admin"))
        return "❌ Нет прав администратора — токен должен принадлежать администратору сообщества";
      if (d.includes("invalid group id") || d.includes("group_id"))
        return "❌ Неверный ID сообщества — только цифры, без минуса и «club»";
    }
    return detail;
  };

  const connect = async (platformId: string) => {
    const f = form[platformId];
    const needsToken = platformId !== "telegram";
    if ((needsToken && !f.token.trim()) || !f.pageId.trim()) {
      setErr(platformId, needsToken ? "Заполните оба поля" : "Введите ID канала");
      return;
    }
    if (!businessId) {
      setErr(platformId, "⚠️ Бизнес не найден — обновите страницу или войдите заново");
      return;
    }
    setConnecting(platformId);
    setError((p) => ({ ...p, [platformId]: "" }));
    try {
      const { data } = await api.post("/platforms/connect", {
        business_id: businessId,
        platform: platformId,
        token: f.token.trim(),
        page_id: f.pageId.trim(),
      });
      setConnections((prev) => {
        const filtered = prev.filter((c) => c.platform !== platformId);
        return [...filtered, {
          platform: platformId,
          page_name: data.page_name,
          external_page_id: f.pageId.trim(),
          is_active: true,
          admin_chat_id: null,
        }];
      });
      setForm((p) => ({ ...p, [platformId]: { token: "", pageId: "" } }));
      setExpanded(null);
      setOk(platformId, `✅ Подключено: ${data.page_name}`);
    } catch (e: any) {
      setErr(platformId, parseTgError(e.response?.data?.detail, platformId));
    } finally {
      setConnecting(null);
    }
  };

  const disconnect = async (platformId: string) => {
    if (!confirm("Отключить платформу?")) return;
    setDisconnecting(platformId);
    try {
      await api.delete(`/platforms/disconnect/${businessId}/${platformId}`);
      setConnections((prev) => prev.filter((c) => c.platform !== platformId));
      setOk(platformId, "Платформа отключена");
    } catch (e: any) {
      setErr(platformId, e.response?.data?.detail || "Ошибка отключения");
    } finally {
      setDisconnecting(null);
    }
  };

  const testPost = async (platformId: string) => {
    setTesting(platformId);
    setError((p) => ({ ...p, [platformId]: "" }));
    try {
      await api.post(`/platforms/test-post/${businessId}`, {
        platform: platformId,
        text: "✅ Тестовое сообщение от SMM Platform. Автопостинг работает!",
      });
      setOk(platformId, "Тест отправлен! Проверь канал/сообщество.");
    } catch (e: any) {
      setErr(platformId, e.response?.data?.detail || "Ошибка отправки теста");
    } finally {
      setTesting(null);
    }
  };

  const saveAdminChat = async () => {
    if (!adminChatId.trim()) return;
    setSavingAdminChat(true);
    setError((p) => ({ ...p, telegram: "" }));
    try {
      const { data } = await api.patch(`/platforms/admin-chat/${businessId}`, {
        admin_chat_id: adminChatId.trim(),
      });
      setConnections((prev) =>
        prev.map((c) =>
          c.platform === "telegram" ? { ...c, admin_chat_id: adminChatId.trim() } : c
        )
      );
      setAdminChatId("");
      setOk("telegram", `Уведомления настроены → ${data.chat_name}`);
    } catch (e: any) {
      const rawDetail = e.response?.data?.detail;
      const raw = typeof rawDetail === "string" ? rawDetail : "";
      const d = raw.toLowerCase();
      let msg = raw || "Ошибка сохранения";
      if (d.includes("chat not found") || d.includes("peer_id_invalid"))
        msg = "❌ Чат не найден — напишите боту /start в личку, затем вставьте свой числовой ID";
      else if (d.includes("forbidden") || d.includes("blocked"))
        msg = "❌ Бот заблокирован — напишите ему /start в личку и попробуйте снова";
      setErr("telegram", msg);
    } finally {
      setSavingAdminChat(false);
    }
  };

  const inp: React.CSSProperties = {
    width: "100%", padding: "10px 13px", border: "1px solid #E0DED8",
    borderRadius: 10, fontSize: 14, fontFamily: "monospace",
    outline: "none", boxSizing: "border-box", background: "#fff",
  };

  return (
    <div style={{ minHeight: "100vh", background: "#F8F7F4", fontFamily: "'Segoe UI', sans-serif" }}>
      {!isMobile && (
        <div style={{ background: "#fff", borderBottom: "1px solid #EAE8E2", padding: "0 2rem" }}>
          <div style={{ maxWidth: 860, margin: "0 auto", height: 64, display: "flex", alignItems: "center", gap: 16 }}>
            <h1 style={{ fontSize: 20, fontWeight: 700, color: "#0D1B2A", margin: 0 }}>Подключение платформ</h1>
            <span style={{ fontSize: 13, color: "#888" }}>
              Подключи каналы для автоматической публикации постов
            </span>
          </div>
        </div>
      )}
      {isMobile && (
        <div style={{ padding: "14px 16px 10px", background: "#fff", borderBottom: "1px solid #F3F4F6" }}>
          <h1 style={{ fontSize: 17, fontWeight: 700, color: "#0D1B2A", margin: 0 }}>Подключение платформ</h1>
          <div style={{ fontSize: 12, color: "#888", marginTop: 2 }}>Подключи каналы для автопубликации</div>
        </div>
      )}

      <div id="tour-add-platform" style={{ maxWidth: 860, margin: "0 auto", padding: isMobile ? "12px 12px" : "2rem", display: "flex", flexDirection: "column", gap: isMobile ? 12 : 20 }}>
        {loading ? (
          <div style={{ textAlign: "center", padding: "3rem", color: "#888" }}>Загружаем...</div>
        ) : (
          <div style={{ display: "flex", flexDirection: "column", gap: isMobile ? 12 : 20 }}>
          {PLATFORMS.map((pl) => {
            const conn = getConn(pl.id);
            const isExpanded = expanded === pl.id;
            const f = form[pl.id];
            const err = error[pl.id] || "";
            const ok = success[pl.id] || "";

            return (
              <div key={pl.id} style={{ background: "#fff", border: "1px solid #EAE8E2",
                borderRadius: 18, overflow: "hidden" }}>

                {/* Header */}
                <div style={{ padding: "20px 24px", display: "flex", alignItems: "center", gap: 16 }}>
                  <div style={{ width: 44, height: 44, borderRadius: 12, background: pl.bg,
                    display: "flex", alignItems: "center", justifyContent: "center",
                    fontSize: 20, fontWeight: 700, color: pl.color, flexShrink: 0 }}>
                    {pl.icon}
                  </div>
                  <div style={{ flex: 1 }}>
                    <div style={{ fontSize: 16, fontWeight: 600, color: "#0D1B2A" }}>{pl.name}</div>
                    <div style={{ fontSize: 13, color: "#999", marginTop: 2 }}>
                      {conn ? conn.page_name : pl.description}
                    </div>
                  </div>

                  <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                    {conn ? (
                      <>
                        <span style={{ fontSize: 12, fontWeight: 600, padding: "4px 12px",
                          borderRadius: 20, background: "#E1F5EE", color: "#0F6E56" }}>
                          ✓ Подключён
                        </span>
                        <button onClick={() => testPost(pl.id)} disabled={testing === pl.id}
                          style={{ padding: "8px 16px", background: "#F5F7FA", color: "#444",
                            border: "1px solid #E0DED8", borderRadius: 10, cursor: "pointer",
                            fontSize: 13, fontWeight: 500 }}>
                          {testing === pl.id ? "Отправка..." : "Тест"}
                        </button>
                        <button onClick={() => disconnect(pl.id)} disabled={disconnecting === pl.id}
                          style={{ padding: "8px 16px", background: "#FCEBEB", color: "#A32D2D",
                            border: "1px solid #F5C6C6", borderRadius: 10, cursor: "pointer",
                            fontSize: 13, fontWeight: 500 }}>
                          {disconnecting === pl.id ? "..." : "Отключить"}
                        </button>
                      </>
                    ) : (
                      <>
                        <span style={{ fontSize: 12, padding: "4px 12px", borderRadius: 20,
                          background: "#F5F7FA", color: "#888" }}>
                          Не подключён
                        </span>
                        <button
                          onClick={() => setExpanded(isExpanded ? null : pl.id)}
                          style={{ padding: "8px 20px", background: "#0D1B2A", color: "#fff",
                            border: "none", borderRadius: 10, cursor: "pointer",
                            fontSize: 13, fontWeight: 600 }}>
                          {isExpanded ? "Свернуть" : "Подключить"}
                        </button>
                      </>
                    )}
                  </div>
                </div>

                {/* Feedback */}
                {(err || ok) && (
                  <div style={{ margin: "0 24px 12px", padding: "10px 14px", borderRadius: 10, fontSize: 13,
                    background: err ? "#FCEBEB" : "#E1F5EE",
                    color: err ? "#A32D2D" : "#0F6E56" }}>
                    {err || ok}
                  </div>
                )}

                {/* Setup panel */}
                {!conn && isExpanded && (
                  <div style={{ borderTop: "1px solid #F2F0EC", padding: "24px" }}>

                    {/* Instructions */}
                    <div style={{ marginBottom: 24 }}>
                      <div style={{ fontSize: 13, fontWeight: 600, color: "#888",
                        marginBottom: 12, letterSpacing: 0.5 }}>ИНСТРУКЦИЯ ПО ПОДКЛЮЧЕНИЮ</div>

                      <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                        {pl.steps.map((step, si) => {
                          const isOpen = openStep[pl.id] === si;
                          return (
                            <div key={si} style={{ border: "1px solid #EAE8E2", borderRadius: 12, overflow: "hidden" }}>
                              <div onClick={() => setOpenStep((p) => ({ ...p, [pl.id]: isOpen ? null : si }))}
                                style={{ padding: "12px 16px", display: "flex", alignItems: "center",
                                  gap: 12, cursor: "pointer", userSelect: "none",
                                  background: isOpen ? "#F8F7F4" : "#fff" }}>
                                <span style={{ width: 24, height: 24, borderRadius: "50%",
                                  background: isOpen ? "#0D1B2A" : "#F5F7FA",
                                  color: isOpen ? "#fff" : "#888",
                                  display: "flex", alignItems: "center", justifyContent: "center",
                                  fontSize: 12, fontWeight: 700, flexShrink: 0 }}>
                                  {si + 1}
                                </span>
                                <span style={{ fontSize: 14, fontWeight: 500, color: "#0D1B2A", flex: 1 }}>
                                  {step.title}
                                </span>
                                <span style={{ fontSize: 12, color: "#bbb" }}>{isOpen ? "▲" : "▼"}</span>
                              </div>
                              {isOpen && (
                                <div style={{ padding: "4px 16px 14px 52px", display: "flex", flexDirection: "column", gap: 8 }}>
                                  {step.items.map((item, ii) => (
                                    <div key={ii} style={{ display: "flex", gap: 8, alignItems: "flex-start" }}>
                                      <span style={{ color: "#bbb", fontSize: 12, marginTop: 2, flexShrink: 0 }}>{ii + 1}.</span>
                                      <span style={{ fontSize: 13, color: "#444", lineHeight: 1.6 }}>{item}</span>
                                    </div>
                                  ))}
                                </div>
                              )}
                            </div>
                          );
                        })}
                      </div>
                    </div>

                    {/* Form */}
                    <div style={{ background: "#F8F7F4", borderRadius: 14, padding: "20px" }}>
                      <div style={{ fontSize: 13, fontWeight: 600, color: "#888",
                        marginBottom: 16, letterSpacing: 0.5 }}>ДАННЫЕ ДЛЯ ПОДКЛЮЧЕНИЯ</div>

                      <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
                        {pl.tokenLabel && (
                          <div>
                            <label style={{ fontSize: 13, fontWeight: 500, color: "#444",
                              display: "block", marginBottom: 6 }}>
                              {pl.tokenLabel}
                            </label>
                            <input
                              type="password"
                              value={f.token}
                              onChange={(e) => setForm((p) => ({ ...p, [pl.id]: { ...f, token: e.target.value } }))}
                              placeholder={pl.tokenPlaceholder}
                              style={{ ...inp, fontFamily: "monospace" }}
                            />
                            <p style={{ fontSize: 12, color: "#999", marginTop: 4 }}>
                              Хранится в зашифрованном виде
                            </p>
                          </div>
                        )}

                        <div>
                          <label style={{ fontSize: 13, fontWeight: 500, color: "#444",
                            display: "block", marginBottom: 6 }}>
                            {pl.pageIdLabel}
                          </label>
                          <input
                            value={f.pageId}
                            onChange={(e) => setForm((p) => ({ ...p, [pl.id]: { ...f, pageId: e.target.value } }))}
                            placeholder={pl.pageIdPlaceholder}
                            style={{ ...inp, fontFamily: "monospace" }}
                          />
                          <p style={{ fontSize: 12, color: "#999", marginTop: 4 }}>{pl.pageIdHint}</p>
                        </div>

                        <button
                          onClick={() => connect(pl.id)}
                          disabled={connecting === pl.id || (pl.id !== "telegram" && !f.token.trim()) || !f.pageId.trim()}
                          style={{
                            padding: "12px", fontSize: 14, fontWeight: 600, color: "#fff",
                            background: connecting === pl.id || (pl.id !== "telegram" && !f.token.trim()) || !f.pageId.trim()
                              ? "#bbb" : pl.color,
                            border: "none", borderRadius: 12, cursor: "pointer",
                          }}>
                          {connecting === pl.id ? "Проверяю подключение..." : "Проверить и подключить"}
                        </button>

                        <p style={{ fontSize: 12, color: "#aaa", margin: 0, textAlign: "center" }}>
                          Мы проверим токен перед сохранением — неверные данные не сохраним
                        </p>
                      </div>
                    </div>
                  </div>
                )}

                {/* Already connected — small info bar */}
                {conn && (
                  <div style={{ borderTop: "1px solid #F2F0EC", background: "#FAFAF8" }}>
                    <div style={{ padding: "12px 24px", display: "flex", alignItems: "center", gap: 16, fontSize: 13, color: "#888" }}>
                      <span>@username: <code style={{ ...code, fontSize: 11 }}>{conn.external_page_id}</code></span>
                      <span style={{ color: "#ddd" }}>|</span>
                      <span>Автопостинг активен</span>
                      <button onClick={() => setExpanded(isExpanded ? null : pl.id)}
                        style={{ marginLeft: "auto", background: "none", border: "none",
                          cursor: "pointer", color: "#aaa", fontSize: 12 }}>
                        Обновить данные
                      </button>
                    </div>

                    {/* Telegram-only: admin notification chat */}
                    {pl.id === "telegram" && (
                      <div style={{ borderTop: "1px solid #F2F0EC", padding: "16px 24px" }}>
                        <div style={{ fontSize: 13, fontWeight: 600, color: "#555", marginBottom: 10 }}>
                          🔔 Уведомления администратора
                        </div>
                        {conn.admin_chat_id ? (
                          <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                            <span style={{ fontSize: 12, padding: "4px 12px", borderRadius: 20,
                              background: "#E1F5EE", color: "#0F6E56", fontWeight: 600 }}>
                              ✓ Настроено
                            </span>
                            <span style={{ fontSize: 13, color: "#888" }}>
                              Chat ID: <code style={{ ...code, fontSize: 11 }}>{conn.admin_chat_id}</code>
                            </span>
                            <button onClick={() => setAdminChatId(conn.admin_chat_id!)}
                              style={{ marginLeft: "auto", background: "none", border: "none",
                                cursor: "pointer", color: "#aaa", fontSize: 12 }}>
                              Изменить
                            </button>
                          </div>
                        ) : (
                          <div style={{ fontSize: 13, color: "#e07800", background: "#FFF8ED",
                            border: "1px solid #FFD699", borderRadius: 10, padding: "10px 14px", marginBottom: 12 }}>
                            ⚠️ Не настроено — бот не сможет присылать вам уведомления о постах
                          </div>
                        )}

                        {(!conn.admin_chat_id || adminChatId) && (
                          <div style={{ marginTop: 12, display: "flex", flexDirection: "column", gap: 10 }}>
                            <div style={{ fontSize: 12, color: "#888", lineHeight: 1.6 }}>
                              Чтобы бот присылал вам уведомления о постах, ожидающих согласования:<br />
                              1. Напишите{" "}
                              <a href="https://t.me/smmplatformb_bot" target="_blank" rel="noreferrer" style={{ color: "#2AABEE" }}>@smmplatformb_bot</a>{" "}
                              в личку — отправьте любое сообщение<br />
                              2. Узнайте свой ID: напишите <code style={code}>/start</code> боту{" "}
                              <a href="https://t.me/userinfobot" target="_blank" rel="noreferrer" style={{ color: "#2AABEE" }}>@userinfobot</a>{" "}
                              — он вернёт ваш ID (положительное число)<br />
                              3. Вставьте ID ниже
                            </div>
                            <div style={{ display: "flex", gap: 10 }}>
                              <input
                                value={adminChatId}
                                onChange={(e) => setAdminChatId(e.target.value)}
                                placeholder="123456789"
                                style={{ ...inp, fontFamily: "monospace", maxWidth: 220 }}
                              />
                              <button
                                onClick={saveAdminChat}
                                disabled={savingAdminChat || !adminChatId.trim()}
                                style={{ padding: "10px 20px", fontSize: 13, fontWeight: 600,
                                  color: "#fff", background: savingAdminChat || !adminChatId.trim() ? "#bbb" : "#2AABEE",
                                  border: "none", borderRadius: 10, cursor: "pointer", whiteSpace: "nowrap" }}>
                                {savingAdminChat ? "Проверяю..." : "Сохранить"}
                              </button>
                            </div>
                          </div>
                        )}
                      </div>
                    )}
                  </div>
                )}

                {/* Re-connect form (when connected but wants to update) */}
                {conn && isExpanded && (
                  <div style={{ borderTop: "1px solid #F2F0EC", padding: "20px 24px",
                    background: "#F8F7F4" }}>
                    <div style={{ fontSize: 13, fontWeight: 600, color: "#888",
                      marginBottom: 14, letterSpacing: 0.5 }}>ОБНОВИТЬ ДАННЫЕ ПОДКЛЮЧЕНИЯ</div>
                    <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
                      <input type="password" value={f.token}
                        onChange={(e) => setForm((p) => ({ ...p, [pl.id]: { ...f, token: e.target.value } }))}
                        placeholder={pl.tokenPlaceholder}
                        style={{ ...inp, fontFamily: "monospace" }} />
                      <input value={f.pageId}
                        onChange={(e) => setForm((p) => ({ ...p, [pl.id]: { ...f, pageId: e.target.value } }))}
                        placeholder={pl.pageIdPlaceholder}
                        style={{ ...inp, fontFamily: "monospace" }} />
                      <button onClick={() => connect(pl.id)} disabled={connecting === pl.id}
                        style={{ padding: "11px", fontSize: 14, fontWeight: 600, color: "#fff",
                          background: connecting === pl.id ? "#bbb" : pl.color,
                          border: "none", borderRadius: 12, cursor: "pointer" }}>
                        {connecting === pl.id ? "Проверяю..." : "Обновить подключение"}
                      </button>
                    </div>
                  </div>
                )}
              </div>
            );
          })}
          </div>
        )}

        {/* Info block */}
        <div style={{ background: "#fff", border: "1px solid #EAE8E2", borderRadius: 16,
          padding: "20px 24px", display: "flex", gap: 16 }}>
          <span style={{ fontSize: 24, flexShrink: 0 }}>🔒</span>
          <div>
            <div style={{ fontSize: 14, fontWeight: 600, color: "#0D1B2A", marginBottom: 4 }}>
              Безопасность токенов
            </div>
            <div style={{ fontSize: 13, color: "#888", lineHeight: 1.6 }}>
              Все токены хранятся в зашифрованном виде (Fernet AES-128). Мы никогда не передаём их третьим лицам.
              Для Telegram используется общий бот платформы — отозвать его доступ можно удалив бота из администраторов канала.
              Токен ВКонтакте — в настройках сообщества → Работа с API.
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
