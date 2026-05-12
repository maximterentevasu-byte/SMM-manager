"use client";

import React, { useEffect, useState } from "react";
import api from "@/lib/api";

type TGWeek = {
  week_start: string; week_end: string; channel_name: string;
  subscribers: number; posts_count: number;
  total_views: number; avg_views: number; median_views: number;
  avg_reactions: number; avg_comments: number; avg_reposts: number;
  er_views_pct: number; er_activity_pct: number;
  virality_pct: number; quality_index: number;
  best_day: string; best_hour: string;
  collected_at: string;
};

type VKWeek = {
  week_start: string; week_end: string; group_name: string;
  members: number; posts_count: number;
  total_views: number; avg_views: number; median_views: number;
  avg_likes: number; avg_comments: number; avg_reposts: number;
  er_subscribers_pct: number; er_views_pct: number;
  virality_pct: number; engagement_index: number;
  net_growth: number | null; best_day: string; best_hour: string;
  collected_at: string;
};

type TGCredsStatus = {
  configured: boolean;
  has_connection: boolean;
  channel_name?: string;
};

const fmt = (n: number | undefined | null, decimals = 0) =>
  n == null ? "—" : Number(n).toLocaleString("ru-RU", { maximumFractionDigits: decimals });

const delta = (curr: number, prev: number) => {
  if (!prev) return null;
  return ((curr - prev) / prev) * 100;
};

export default function AnalyticsPage() {
  const [tab, setTab] = useState<"tg" | "vk">("tg");
  const [tgData, setTgData] = useState<TGWeek[]>([]);
  const [vkData, setVkData] = useState<VKWeek[]>([]);
  const [loadingTg, setLoadingTg] = useState(true);
  const [loadingVk, setLoadingVk] = useState(true);
  const [collecting, setCollecting] = useState(false);
  const [collectMsg, setCollectMsg] = useState("");
  const [showSetup, setShowSetup] = useState(false);

  const [tgCredsStatus, setTgCredsStatus] = useState<TGCredsStatus | null>(null);
  const [tgCreds, setTgCreds] = useState({ api_id: "", api_hash: "", session: "" });
  const [savingCreds, setSavingCreds] = useState(false);
  const [credsMsg, setCredsMsg] = useState("");

  const [businessId] = useState(() =>
    typeof window !== "undefined" ? localStorage.getItem("businessId") || "" : ""
  );

  useEffect(() => {
    if (!businessId) return;
    api.get(`/analytics/${businessId}/tg`)
      .then(({ data }) => setTgData(data))
      .catch(() => {})
      .finally(() => setLoadingTg(false));
    api.get(`/analytics/${businessId}/vk`)
      .then(({ data }) => setVkData(data))
      .catch(() => {})
      .finally(() => setLoadingVk(false));
    api.get(`/analytics/${businessId}/tg-credentials`)
      .then(({ data }) => setTgCredsStatus(data))
      .catch(() => setTgCredsStatus({ configured: false, has_connection: false }));
  }, [businessId]);

  const collect = async () => {
    setCollecting(true);
    setCollectMsg("");
    try {
      await api.post(`/analytics/${businessId}/collect`);
      setCollectMsg("Сбор запущен. Данные появятся через 1–5 минут — обнови страницу.");
    } catch {
      setCollectMsg("Ошибка запуска сбора");
    } finally {
      setCollecting(false);
    }
  };

  const saveTgCreds = async () => {
    setSavingCreds(true);
    setCredsMsg("");
    try {
      await api.post(`/analytics/${businessId}/tg-credentials`, {
        api_id: parseInt(tgCreds.api_id),
        api_hash: tgCreds.api_hash,
        session: tgCreds.session,
      });
      setTgCredsStatus((prev) => prev ? { ...prev, configured: true } : null);
      setCredsMsg("✓ Реквизиты сохранены. Теперь нажмите «Собрать сейчас».");
    } catch (e: any) {
      setCredsMsg(e?.response?.data?.detail || "Ошибка сохранения");
    } finally {
      setSavingCreds(false);
    }
  };

  const exportExcel = (platform: "tg" | "vk") => {
    window.open(
      `${process.env.NEXT_PUBLIC_API_URL || ""}/api/analytics/${businessId}/${platform}/export`,
      "_blank"
    );
  };

  const lastUpdated = (data: (TGWeek | VKWeek)[]) =>
    data.length > 0 ? new Date(data[0].collected_at).toLocaleDateString("ru-RU") : null;

  const tgLast = tgData[0];
  const vkLast = vkData[0];
  const tgPrev = tgData[1];
  const vkPrev = vkData[1];

  const card = (label: string, value: string, suffix = "", trend?: number | null) => (
    <div style={{ background: "#fff", border: "1px solid #EAE8E2", borderRadius: 14,
      padding: "16px 20px", flex: 1, minWidth: 0 }}>
      <div style={{ fontSize: 11, color: "#999", fontWeight: 600, letterSpacing: 0.5, marginBottom: 8 }}>
        {label.toUpperCase()}
      </div>
      <div style={{ fontSize: 22, fontWeight: 700, color: "#1a1a1a" }}>
        {value}<span style={{ fontSize: 14, fontWeight: 400, color: "#888", marginLeft: 3 }}>{suffix}</span>
      </div>
      {trend != null && (
        <div style={{ fontSize: 12, marginTop: 6,
          color: trend > 0 ? "#0F6E56" : trend < 0 ? "#A32D2D" : "#888" }}>
          {trend > 0 ? "▲" : trend < 0 ? "▼" : "•"} {Math.abs(trend).toFixed(1)}% к прошлой неделе
        </div>
      )}
    </div>
  );

  const tg_cols = [
    { key: "week_start", label: "Неделя", render: (r: TGWeek) => `${r.week_start} — ${r.week_end}`, w: 200 },
    { key: "subscribers", label: "Подписчики", render: (r: TGWeek) => fmt(r.subscribers), w: 110 },
    { key: "posts_count", label: "Постов", render: (r: TGWeek) => String(r.posts_count), w: 70 },
    { key: "avg_views", label: "Ср. охват", render: (r: TGWeek) => fmt(r.avg_views, 0), w: 100 },
    { key: "er_views_pct", label: "ER просм.", render: (r: TGWeek) => fmt(r.er_views_pct, 2) + "%", w: 90 },
    { key: "er_activity_pct", label: "ER актив.", render: (r: TGWeek) => fmt(r.er_activity_pct, 2) + "%", w: 90 },
    { key: "virality_pct", label: "Вирусность", render: (r: TGWeek) => fmt(r.virality_pct, 3) + "%", w: 100 },
    { key: "avg_reactions", label: "Ср. реакции", render: (r: TGWeek) => fmt(r.avg_reactions, 1), w: 100 },
    { key: "quality_index", label: "Индекс", render: (r: TGWeek) => fmt(r.quality_index, 2), w: 80 },
    { key: "best_day", label: "Лучший день", render: (r: TGWeek) => `${r.best_day} ${r.best_hour}`, w: 110 },
  ];

  const vk_cols = [
    { key: "week_start", label: "Неделя", render: (r: VKWeek) => `${r.week_start} — ${r.week_end}`, w: 200 },
    { key: "members", label: "Участников", render: (r: VKWeek) => fmt(r.members), w: 110 },
    { key: "posts_count", label: "Постов", render: (r: VKWeek) => String(r.posts_count), w: 70 },
    { key: "avg_views", label: "Ср. охват", render: (r: VKWeek) => fmt(r.avg_views, 0), w: 100 },
    { key: "er_subscribers_pct", label: "ER подп.", render: (r: VKWeek) => fmt(r.er_subscribers_pct, 2) + "%", w: 90 },
    { key: "er_views_pct", label: "ER просм.", render: (r: VKWeek) => fmt(r.er_views_pct, 2) + "%", w: 90 },
    { key: "virality_pct", label: "Вирусность", render: (r: VKWeek) => fmt(r.virality_pct, 3) + "%", w: 100 },
    { key: "engagement_index", label: "Индекс", render: (r: VKWeek) => fmt(r.engagement_index, 2), w: 80 },
    { key: "net_growth", label: "Прирост", render: (r: VKWeek) => r.net_growth != null ? (r.net_growth >= 0 ? "+" : "") + r.net_growth : "н/д", w: 80 },
    { key: "best_day", label: "Лучший день", render: (r: VKWeek) => `${r.best_day} ${r.best_hour}`, w: 110 },
  ];

  return (
    <div style={{ minHeight: "100vh", background: "#F8F7F4", fontFamily: "'Segoe UI', sans-serif" }}>
      {/* Header */}
      <div style={{ background: "#fff", borderBottom: "1px solid #EAE8E2", padding: "0 2rem" }}>
        <div style={{ maxWidth: 1100, margin: "0 auto", height: 64,
          display: "flex", alignItems: "center", justifyContent: "space-between" }}>
          <div style={{ display: "flex", alignItems: "center", gap: 16 }}>
            <h1 style={{ fontSize: 20, fontWeight: 700, color: "#1a1a1a", margin: 0 }}>Аналитика</h1>
            <div style={{ display: "flex", gap: 4 }}>
              {(["tg", "vk"] as const).map((t) => (
                <button key={t} onClick={() => setTab(t)}
                  style={{ padding: "6px 18px", borderRadius: 20, border: "1px solid",
                    cursor: "pointer", fontSize: 13, fontWeight: tab === t ? 600 : 400,
                    borderColor: tab === t ? "#1a1a1a" : "#E0DED8",
                    background: tab === t ? "#1a1a1a" : "#fff",
                    color: tab === t ? "#fff" : "#666" }}>
                  {t === "tg" ? "✈ Telegram" : "В ВКонтакте"}
                </button>
              ))}
            </div>
          </div>
          <div style={{ display: "flex", gap: 10, alignItems: "center" }}>
            {(tab === "tg" ? lastUpdated(tgData) : lastUpdated(vkData)) && (
              <span style={{ fontSize: 12, color: "#aaa" }}>
                Обновлено: {tab === "tg" ? lastUpdated(tgData) : lastUpdated(vkData)}
              </span>
            )}
            <button onClick={collect} disabled={collecting}
              style={{ padding: "8px 16px", background: collecting ? "#888" : "#1a1a1a",
                color: "#fff", border: "none", borderRadius: 10,
                cursor: collecting ? "not-allowed" : "pointer", fontSize: 13, fontWeight: 600 }}>
              {collecting ? "Запускаю..." : "⟳ Собрать сейчас"}
            </button>
            <button onClick={() => exportExcel(tab)}
              style={{ padding: "8px 16px", background: "#0F6E56", color: "#fff",
                border: "none", borderRadius: 10, cursor: "pointer", fontSize: 13, fontWeight: 600 }}>
              ⬇ Excel
            </button>
          </div>
        </div>
      </div>

      <div style={{ maxWidth: 1100, margin: "0 auto", padding: "2rem" }}>
        {collectMsg && (
          <div style={{ marginBottom: 16, padding: "12px 16px", background: "#E1F5EE",
            borderRadius: 10, fontSize: 13, color: "#0F6E56" }}>
            {collectMsg}
          </div>
        )}

        {/* Кнопка-тоггл инструкции */}
        <div style={{ marginBottom: 24 }}>
          <button
            onClick={() => setShowSetup((v) => !v)}
            style={{ display: "flex", alignItems: "center", gap: 8,
              background: "#fff", border: "1px solid #EAE8E2", borderRadius: 12,
              padding: "10px 18px", cursor: "pointer", fontSize: 14,
              color: "#444", fontWeight: 500, width: "100%", textAlign: "left" }}>
            <span style={{ fontSize: 16 }}>⚙</span>
            <span>Как запустить автосбор (Celery)</span>
            <span style={{ marginLeft: "auto", fontSize: 12, color: "#aaa" }}>
              {showSetup ? "▲ Скрыть" : "▼ Показать"}
            </span>
          </button>
          {showSetup && <CelerySetupGuide />}
        </div>

        {/* ── TELEGRAM ── */}
        {tab === "tg" && (
          <>
            {loadingTg ? (
              <div style={{ textAlign: "center", padding: "3rem", color: "#888" }}>Загружаем...</div>
            ) : tgData.length > 0 ? (
              <>
                {tgLast && (
                  <div style={{ display: "flex", gap: 12, marginBottom: 24, flexWrap: "wrap" }}>
                    {card("Подписчики", fmt(tgLast.subscribers))}
                    {card("Ср. охват", fmt(tgLast.avg_views), "просм.",
                      tgPrev ? delta(tgLast.avg_views, tgPrev.avg_views) : null)}
                    {card("ER по просмотрам", fmt(tgLast.er_views_pct, 2), "%",
                      tgPrev ? delta(tgLast.er_views_pct, tgPrev.er_views_pct) : null)}
                    {card("Индекс качества", fmt(tgLast.quality_index, 2), "",
                      tgPrev ? delta(tgLast.quality_index, tgPrev.quality_index) : null)}
                  </div>
                )}
                <WeeklyTable rows={tgData} cols={tg_cols} emptyText="Нет данных по Telegram" />
              </>
            ) : tgCredsStatus?.configured ? (
              <ReadyState text="Реквизиты Telegram сохранены. Нажмите «Собрать сейчас» — данные появятся через 1–5 минут." />
            ) : tgCredsStatus?.has_connection ? (
              <TGCredsForm
                creds={tgCreds}
                onChange={setTgCreds}
                onSave={saveTgCreds}
                saving={savingCreds}
                msg={credsMsg}
              />
            ) : (
              <NoConnectionState platform="Telegram" />
            )}
          </>
        )}

        {/* ── VK ── */}
        {tab === "vk" && (
          <>
            {loadingVk ? (
              <div style={{ textAlign: "center", padding: "3rem", color: "#888" }}>Загружаем...</div>
            ) : vkData.length > 0 ? (
              <>
                {vkLast && (
                  <div style={{ display: "flex", gap: 12, marginBottom: 24, flexWrap: "wrap" }}>
                    {card("Участников", fmt(vkLast.members))}
                    {card("Ср. охват", fmt(vkLast.avg_views), "просм.",
                      vkPrev ? delta(vkLast.avg_views, vkPrev.avg_views) : null)}
                    {card("ER подписчики", fmt(vkLast.er_subscribers_pct, 2), "%",
                      vkPrev ? delta(vkLast.er_subscribers_pct, vkPrev.er_subscribers_pct) : null)}
                    {card("Индекс вовлечённости", fmt(vkLast.engagement_index, 2), "",
                      vkPrev ? delta(vkLast.engagement_index, vkPrev.engagement_index) : null)}
                  </div>
                )}
                <WeeklyTable rows={vkData} cols={vk_cols} emptyText="Нет данных по ВКонтакте" />
              </>
            ) : (
              <VKEmptyState />
            )}
          </>
        )}
      </div>
    </div>
  );
}

// ─── вспомогательные компоненты ────────────────────────────────────────────

function WeeklyTable({ rows, cols, emptyText }: { rows: any[]; cols: any[]; emptyText: string }) {
  if (!rows.length) {
    return (
      <div style={{ textAlign: "center", padding: "3rem", color: "#999",
        background: "#fff", borderRadius: 16, border: "1px solid #EAE8E2" }}>
        {emptyText}
      </div>
    );
  }
  return (
    <div style={{ background: "#fff", border: "1px solid #EAE8E2", borderRadius: 16, overflow: "auto" }}>
      <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13 }}>
        <thead>
          <tr style={{ background: "#F8F7F4" }}>
            {cols.map((c) => (
              <th key={c.key} style={{ padding: "11px 14px", textAlign: "left",
                fontWeight: 600, color: "#888", fontSize: 11, letterSpacing: 0.4,
                borderBottom: "1px solid #EAE8E2", whiteSpace: "nowrap", minWidth: c.w }}>
                {c.label.toUpperCase()}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((row, i) => (
            <tr key={i} style={{ borderBottom: "1px solid #F2F0EC",
              background: i === 0 ? "#FFFEF8" : "transparent" }}>
              {cols.map((c) => (
                <td key={c.key} style={{ padding: "11px 14px", color: i === 0 ? "#1a1a1a" : "#444",
                  fontWeight: i === 0 ? 500 : 400, whiteSpace: "nowrap" }}>
                  {c.render(row)}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function ReadyState({ text }: { text: string }) {
  return (
    <div style={{ background: "#fff", border: "1px solid #EAE8E2", borderRadius: 16,
      padding: "40px 32px", textAlign: "center" }}>
      <div style={{ fontSize: 32, marginBottom: 12 }}>✓</div>
      <p style={{ color: "#444", fontSize: 15, margin: 0 }}>{text}</p>
    </div>
  );
}

function NoConnectionState({ platform }: { platform: string }) {
  return (
    <div style={{ background: "#fff", border: "1px solid #EAE8E2", borderRadius: 16,
      padding: "40px 32px", textAlign: "center" }}>
      <div style={{ fontSize: 32, marginBottom: 12 }}>🔗</div>
      <h3 style={{ fontSize: 17, fontWeight: 700, color: "#1a1a1a", margin: "0 0 8px" }}>
        {platform} не подключён
      </h3>
      <p style={{ color: "#888", fontSize: 14, margin: 0 }}>
        Сначала подключи {platform} в разделе{" "}
        <a href="/platforms" style={{ color: "#1a1a1a", fontWeight: 600 }}>Подключение платформ</a>.
      </p>
    </div>
  );
}

// ─── TG Credentials Form ────────────────────────────────────────────────────

type TGCredsFormProps = {
  creds: { api_id: string; api_hash: string; session: string };
  onChange: (v: { api_id: string; api_hash: string; session: string }) => void;
  onSave: () => void;
  saving: boolean;
  msg: string;
};

function TGCredsForm({ creds, onChange, onSave, saving, msg }: TGCredsFormProps) {
  const [showScript, setShowScript] = useState(false);
  const canSave = creds.api_id && creds.api_hash && creds.session;

  const inp = (placeholder: string, key: "api_id" | "api_hash" | "session", type = "text") => (
    <input
      type={type}
      placeholder={placeholder}
      value={creds[key]}
      onChange={(e) => onChange({ ...creds, [key]: e.target.value })}
      style={{ width: "100%", padding: "10px 14px", border: "1px solid #E0DED8",
        borderRadius: 10, fontSize: 13, fontFamily: "inherit",
        background: "#FAFAF8", outline: "none", boxSizing: "border-box" }}
    />
  );

  return (
    <div style={{ background: "#fff", border: "1px solid #EAE8E2", borderRadius: 16, padding: "32px" }}>
      <div style={{ fontSize: 28, marginBottom: 10 }}>✈</div>
      <h3 style={{ fontSize: 18, fontWeight: 700, color: "#1a1a1a", margin: "0 0 6px" }}>
        Подключи аналитику Telegram
      </h3>
      <p style={{ color: "#888", fontSize: 14, margin: "0 0 24px", lineHeight: 1.6 }}>
        Для сбора статистики канала нужны MTProto-реквизиты вашего аккаунта Telegram.
        Это отдельно от бот-токена — данные вводятся один раз.
      </p>

      {/* Step 1 */}
      <div style={{ marginBottom: 20 }}>
        <div style={{ fontWeight: 600, fontSize: 14, color: "#1a1a1a", marginBottom: 10 }}>
          Шаг 1. Получи API ID и API Hash
        </div>
        <ol style={{ margin: "0 0 0 18px", padding: 0, color: "#555", fontSize: 13, lineHeight: 2 }}>
          <li>Зайди на <strong>my.telegram.org</strong> и войди в аккаунт Telegram</li>
          <li>Выбери <strong>API development tools</strong></li>
          <li>Создай приложение (название и платформа — произвольные)</li>
          <li>Скопируй <code style={{ background: "#EAE8E2", padding: "1px 6px", borderRadius: 4 }}>App api_id</code> и <code style={{ background: "#EAE8E2", padding: "1px 6px", borderRadius: 4 }}>App api_hash</code></li>
        </ol>
        <div style={{ display: "flex", gap: 12, marginTop: 12 }}>
          <div style={{ flex: 1 }}>{inp("API ID (число)", "api_id")}</div>
          <div style={{ flex: 2 }}>{inp("API Hash (строка из 32 символов)", "api_hash")}</div>
        </div>
      </div>

      {/* Step 2 */}
      <div style={{ marginBottom: 20 }}>
        <div style={{ fontWeight: 600, fontSize: 14, color: "#1a1a1a", marginBottom: 10 }}>
          Шаг 2. Сгенерируй строку сессии (один раз)
        </div>
        <p style={{ margin: "0 0 10px", color: "#555", fontSize: 13, lineHeight: 1.6 }}>
          Строка сессии позволяет серверу читать статистику канала от имени твоего аккаунта.
          Запусти этот скрипт на любом компьютере с Python 3:
        </p>
        <button
          onClick={() => setShowScript((v) => !v)}
          style={{ background: "none", border: "1px solid #E0DED8", borderRadius: 8,
            padding: "6px 14px", cursor: "pointer", fontSize: 12, color: "#666", marginBottom: 8 }}>
          {showScript ? "▲ Скрыть скрипт" : "▼ Показать скрипт генерации"}
        </button>
        {showScript && (
          <pre style={{ background: "#1a1a1a", color: "#4ade80", padding: "14px 16px",
            borderRadius: 10, fontFamily: "monospace", fontSize: 12,
            margin: "0 0 10px", overflowX: "auto", whiteSpace: "pre-wrap" }}>
{`pip install telethon

python -c "
from telethon.sync import TelegramClient
from telethon.sessions import StringSession
api_id = int(input('Введи api_id: '))
api_hash = input('Введи api_hash: ')
with TelegramClient(StringSession(), api_id, api_hash) as c:
    print('\\nТвоя строка сессии:')
    print(c.session.save())
"`}
          </pre>
        )}
        <p style={{ margin: "0 0 10px", color: "#888", fontSize: 12 }}>
          Скрипт попросит ввести телефон и код из Telegram — это безопасно, данные не покидают твой компьютер.
          Скопируй длинную строку, которую напечатает скрипт.
        </p>
        <textarea
          placeholder="Вставь строку сессии сюда (начинается с 1Bv...)"
          value={creds.session}
          onChange={(e) => onChange({ ...creds, session: e.target.value })}
          rows={3}
          style={{ width: "100%", padding: "10px 14px", border: "1px solid #E0DED8",
            borderRadius: 10, fontSize: 12, fontFamily: "monospace",
            background: "#FAFAF8", resize: "vertical", boxSizing: "border-box" }}
        />
      </div>

      {/* Save */}
      <button
        onClick={onSave}
        disabled={saving || !canSave}
        style={{ padding: "11px 28px", background: canSave ? "#1a1a1a" : "#ccc",
          color: "#fff", border: "none", borderRadius: 10, fontSize: 14, fontWeight: 600,
          cursor: canSave ? "pointer" : "not-allowed" }}>
        {saving ? "Сохраняю..." : "Сохранить реквизиты"}
      </button>

      {msg && (
        <div style={{ marginTop: 12, fontSize: 13,
          color: msg.startsWith("✓") ? "#0F6E56" : "#A32D2D" }}>
          {msg}
        </div>
      )}
    </div>
  );
}

// ─── VK Empty State ─────────────────────────────────────────────────────────

function VKEmptyState() {
  return (
    <div style={{ background: "#fff", border: "1px solid #EAE8E2", borderRadius: 16,
      padding: "40px 32px" }}>
      <div style={{ fontSize: 28, marginBottom: 10 }}>В</div>
      <h3 style={{ fontSize: 18, fontWeight: 700, color: "#1a1a1a", margin: "0 0 8px" }}>
        Данных по ВКонтакте ещё нет
      </h3>
      <p style={{ color: "#555", fontSize: 14, margin: "0 0 16px", lineHeight: 1.6 }}>
        Убедись что сообщество подключено в разделе{" "}
        <a href="/platforms" style={{ color: "#1a1a1a", fontWeight: 600 }}>Подключение платформ</a>,
        затем нажми <strong>«⟳ Собрать сейчас»</strong> вверху страницы.
      </p>
      <div style={{ background: "#FFF8E6", border: "1px solid #F5E6A0", borderRadius: 10,
        padding: "12px 16px", fontSize: 13, color: "#7A5C00" }}>
        Для получения данных об охватах и приросте подписчиков убедись, что при создании токена
        выбрано разрешение <strong>«Статистика сообщества»</strong>.
      </div>
    </div>
  );
}

// ─── Celery Setup Guide ──────────────────────────────────────────────────────

function CelerySetupGuide() {
  const pre = (text: string, color = "#4ade80") => (
    <pre style={{ background: "#1a1a1a", color, padding: "12px 16px",
      borderRadius: 10, fontFamily: "monospace", fontSize: 12,
      margin: "8px 0", overflowX: "auto", whiteSpace: "pre-wrap" }}>
      {text}
    </pre>
  );
  const pill = (t: string) => (
    <code style={{ background: "#EAE8E2", padding: "2px 7px", borderRadius: 5, fontSize: 12 }}>{t}</code>
  );

  return (
    <div style={{ border: "1px solid #EAE8E2", borderTop: "none", borderRadius: "0 0 12px 12px",
      background: "#fff", padding: "20px 24px", fontSize: 13, color: "#444", lineHeight: 1.8 }}>
      <p style={{ margin: "0 0 12px", color: "#888" }}>
        Кнопка «Собрать сейчас» работает без Celery. Celery нужен только для
        <strong> еженедельного автосбора</strong> (каждый понедельник в 06:00 МСК).
      </p>
      <div style={{ fontWeight: 600, color: "#1a1a1a", marginBottom: 4 }}>Запуск вручную</div>
      {pre(`# Воркер\ncelery -A app.workers.celery_app worker -l info -Q default,generation,posting\n\n# Beat-планировщик (в отдельном терминале)\ncelery -A app.workers.celery_app beat -l info`)}
      <div style={{ fontWeight: 600, color: "#1a1a1a", marginBottom: 4, marginTop: 16 }}>Docker Compose</div>
      {pre(`celery_worker:\n  build: ./backend\n  command: celery -A app.workers.celery_app worker -l info\n  depends_on: [redis, db]\n  env_file: .env\n\ncelery_beat:\n  build: ./backend\n  command: celery -A app.workers.celery_app beat -l info\n  depends_on: [redis]\n  env_file: .env`, "#93c5fd")}
      <div style={{ background: "#FFF8E6", border: "1px solid #F5E6A0", borderRadius: 8,
        padding: "10px 14px", marginTop: 12, fontSize: 12, color: "#7A5C00" }}>
        ⚠ Нужен Redis. Укажи {pill("REDIS_URL")} в .env (по умолчанию {pill("redis://localhost:6379/0")}).
      </div>
    </div>
  );
}
