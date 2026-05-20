"use client";
import React, { useEffect, useState } from "react";
import api from "@/lib/api";

type VKStory = {
  story_id: number;
  group_id: string;
  group_name: string;
  published_at: string;
  expires_at: string | null;
  caption: string;
  views: number;
  replies: number;
  shares: number;
  has_media: boolean;
  media_type: string;
  er_pct: number;
  updated_at: string;
};

const MSK = 3;

function toMsk(iso: string) {
  return new Date(new Date(iso).getTime() + MSK * 3600 * 1000);
}
function fmtDate(iso: string) {
  return toMsk(iso).toLocaleDateString("ru-RU", { day: "2-digit", month: "2-digit", year: "2-digit" });
}
function fmtTime(iso: string) {
  const d = toMsk(iso);
  return `${String(d.getUTCHours()).padStart(2, "0")}:${String(d.getUTCMinutes()).padStart(2, "0")}`;
}
function isoDate(iso: string) { return iso.slice(0, 10); }

export default function VKStoriesTab({ businessId }: { businessId: string }) {
  const [stories, setStories] = useState<VKStory[]>([]);
  const [loading, setLoading] = useState(true);
  const [collecting, setCollecting] = useState(false);
  const [msg, setMsg] = useState("");
  const [selected, setSelected] = useState<VKStory | null>(null);
  const [dateFrom, setDateFrom] = useState("");
  const [dateTo, setDateTo] = useState("");

  useEffect(() => {
    api.get(`/analytics/${businessId}/vk/stories`)
      .then(({ data }) => setStories(data))
      .catch(() => {})
      .finally(() => setLoading(false));
  }, [businessId]);

  const collect = async () => {
    setCollecting(true); setMsg("");
    try {
      await api.post(`/analytics/${businessId}/vk/stories/collect`);
      const { data } = await api.get(`/analytics/${businessId}/vk/stories`);
      setStories(data);
      setMsg("✓ Обновлено");
    } catch (e: any) {
      setMsg("⚠ " + (e?.response?.data?.detail || "Ошибка"));
    } finally { setCollecting(false); }
  };

  const filtered = stories.filter(s => {
    const d = isoDate(s.published_at);
    if (dateFrom && d < dateFrom) return false;
    if (dateTo && d > dateTo) return false;
    return true;
  });

  const cols = [
    { label: "Дата (МСК)",  w: 90,  render: (s: VKStory) => fmtDate(s.published_at) },
    { label: "Время",       w: 60,  render: (s: VKStory) => fmtTime(s.published_at) },
    { label: "ID",          w: 80,  render: (s: VKStory) => String(s.story_id) },
    { label: "Описание",    w: 200, render: (s: VKStory) => s.caption
        ? <span style={{ overflow: "hidden", display: "-webkit-box",
            WebkitLineClamp: 1, WebkitBoxOrient: "vertical" as any }}>{s.caption}</span>
        : <span style={{ color: "#ccc" }}>—</span> },
    { label: "Просмотры",   w: 100, render: (s: VKStory) => s.views.toLocaleString("ru-RU") },
    { label: "Ответы",      w: 75,  render: (s: VKStory) => s.replies.toLocaleString("ru-RU") },
    { label: "Репосты",     w: 80,  render: (s: VKStory) => s.shares.toLocaleString("ru-RU") },
    { label: "ER%",         w: 70,  render: (s: VKStory) => `${s.er_pct.toFixed(2)}%` },
  ];

  const inputStyle: React.CSSProperties = {
    border: "1px solid #E0DED8", borderRadius: 8, padding: "5px 10px",
    fontSize: 13, fontFamily: "inherit", background: "#FAFAF8", outline: "none",
  };

  return (
    <div>
      {/* Disclaimer */}
      <div style={{ background: "#FFFBEB", border: "1px solid #FDE68A", borderRadius: 12,
        padding: "12px 16px", marginBottom: 16, fontSize: 13, color: "#92400E" }}>
        <strong>ВКонтакте не хранит историю Сториз.</strong> В статистику попадут только истории,
        опубликованные после подключения к smmplatform и собранные до истечения 24 часов.
        Данные защищены от обнуления — если VK вернул 0, старые значения сохраняются.
      </div>

      {/* Toolbar */}
      <div style={{ display: "flex", gap: 12, alignItems: "center", marginBottom: 16, flexWrap: "wrap" }}>
        <input type="date" value={dateFrom} onChange={e => setDateFrom(e.target.value)}
          style={inputStyle} title="Дата начала" />
        <span style={{ color: "#aaa", fontSize: 13 }}>—</span>
        <input type="date" value={dateTo} onChange={e => setDateTo(e.target.value)}
          style={inputStyle} title="Дата окончания" />
        {(dateFrom || dateTo) && (
          <button onClick={() => { setDateFrom(""); setDateTo(""); }}
            style={{ background: "none", border: "none", cursor: "pointer",
              fontSize: 12, color: "#aaa", textDecoration: "underline" }}>
            сбросить
          </button>
        )}
        <div style={{ marginLeft: "auto", display: "flex", gap: 8, alignItems: "center" }}>
          {msg && <span style={{ fontSize: 12, color: msg.startsWith("✓") ? "#00B5A6" : "#A32D2D" }}>{msg}</span>}
          <button onClick={collect} disabled={collecting}
            style={{ padding: "7px 16px", background: collecting ? "#888" : "#4680C2",
              color: "#fff", border: "none", borderRadius: 8, fontSize: 13,
              fontWeight: 600, cursor: collecting ? "not-allowed" : "pointer" }}>
            {collecting ? "Обновляю..." : "⟳ Обновить"}
          </button>
        </div>
      </div>

      {/* Table */}
      {loading ? (
        <div style={{ textAlign: "center", padding: "3rem", color: "#888" }}>Загружаем...</div>
      ) : filtered.length === 0 ? (
        <div style={{ textAlign: "center", padding: "3rem", color: "#999",
          background: "#fff", borderRadius: 16, border: "1px solid #EAE8E2" }}>
          {stories.length === 0
            ? "Нажмите «Обновить» для загрузки активных Сториз (истории за последние 24 ч)"
            : "Нет историй за выбранный период"}
        </div>
      ) : (
        <div style={{ background: "#fff", border: "1px solid #EAE8E2", borderRadius: 16, overflow: "auto" }}>
          <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13 }}>
            <thead>
              <tr style={{ background: "#F8F7F4" }}>
                {cols.map(c => (
                  <th key={c.label} style={{ padding: "11px 14px", textAlign: "left",
                    fontWeight: 600, color: "#888", fontSize: 11, letterSpacing: 0.4,
                    borderBottom: "1px solid #EAE8E2", whiteSpace: "nowrap", minWidth: c.w }}>
                    {c.label.toUpperCase()}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {filtered.map((s, i) => (
                <tr key={s.story_id} onClick={() => setSelected(s)}
                  style={{ borderBottom: "1px solid #F2F0EC", cursor: "pointer",
                    background: i === 0 ? "#FFFEF8" : "transparent" }}
                  onMouseEnter={e => (e.currentTarget.style.background = "#F8F7F4")}
                  onMouseLeave={e => (e.currentTarget.style.background = i === 0 ? "#FFFEF8" : "transparent")}>
                  {cols.map(c => (
                    <td key={c.label} style={{ padding: "10px 14px", color: "#444",
                      maxWidth: c.w, overflow: "hidden", whiteSpace: "nowrap" }}>
                      {c.render(s)}
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* StoryDetail modal */}
      {selected && (
        <div style={{ position: "fixed", inset: 0, zIndex: 1000,
          display: "flex", alignItems: "center", justifyContent: "center" }}>
          <div onClick={() => setSelected(null)}
            style={{ position: "absolute", inset: 0, background: "rgba(0,0,0,0.5)" }} />
          <div style={{ position: "relative", width: "min(720px, 95vw)", maxHeight: "90vh",
            background: "#fff", borderRadius: 20, overflow: "hidden",
            boxShadow: "0 24px 80px rgba(0,0,0,0.25)", display: "flex", flexDirection: "column" }}>
            {/* Header */}
            <div style={{ padding: "16px 24px", borderBottom: "1px solid #EAE8E2",
              display: "flex", justifyContent: "space-between", alignItems: "center" }}>
              <div>
                <div style={{ fontSize: 13, fontWeight: 600, color: "#0D1B2A" }}>
                  {selected.group_name}
                </div>
                <div style={{ fontSize: 11, color: "#aaa" }}>
                  {fmtDate(selected.published_at)} {fmtTime(selected.published_at)} МСК · ID {selected.story_id}
                </div>
              </div>
              <button onClick={() => setSelected(null)}
                style={{ background: "none", border: "none", fontSize: 20,
                  cursor: "pointer", color: "#aaa" }}>×</button>
            </div>
            {/* Body */}
            <div style={{ display: "flex", flex: 1, overflow: "hidden" }}>
              {/* Left: placeholder */}
              <div style={{ width: "45%", background: "#F8F7F4", display: "flex",
                flexDirection: "column", alignItems: "center", justifyContent: "center",
                gap: 16, padding: 24, borderRight: "1px solid #EAE8E2" }}>
                <div style={{ fontSize: 40 }}>В</div>
                <div style={{ fontSize: 13, color: "#888", textAlign: "center", lineHeight: 1.5 }}>
                  Предпросмотр историй ВКонтакте недоступен.<br/>
                  Истории исчезают через 24 часа.
                </div>
                {selected.group_id && (
                  <a href={`https://vk.com/stories-${selected.group_id}`}
                    target="_blank" rel="noopener noreferrer"
                    style={{ padding: "9px 20px", background: "#4680C2", color: "#fff",
                      borderRadius: 10, textDecoration: "none", fontSize: 13, fontWeight: 600 }}>
                    ↗ Открыть ВКонтакте
                  </a>
                )}
              </div>
              {/* Right: metrics */}
              <div style={{ width: "55%", padding: 24, overflowY: "auto" }}>
                <div style={{ fontSize: 11, fontWeight: 700, color: "#aaa",
                  letterSpacing: 0.7, marginBottom: 16 }}>МЕТРИКИ ИСТОРИИ</div>
                {[
                  { label: "Просмотры",   val: selected.views.toLocaleString("ru-RU") },
                  { label: "Ответы",      val: selected.replies.toLocaleString("ru-RU") },
                  { label: "Репосты",     val: selected.shares.toLocaleString("ru-RU") },
                  { label: "ER истории",  val: `${selected.er_pct.toFixed(2)}%` },
                ].map(m => (
                  <div key={m.label} style={{ display: "flex", justifyContent: "space-between",
                    padding: "10px 0", borderBottom: "1px solid #F0EEE8" }}>
                    <span style={{ fontSize: 13, color: "#666" }}>{m.label}</span>
                    <span style={{ fontSize: 14, fontWeight: 700, color: "#0D1B2A" }}>{m.val}</span>
                  </div>
                ))}
                {selected.expires_at && (
                  <div style={{ marginTop: 14, fontSize: 12, color: "#aaa" }}>
                    Истекает: {fmtDate(selected.expires_at)} {fmtTime(selected.expires_at)} МСК
                  </div>
                )}
                {selected.caption && (
                  <div style={{ marginTop: 20 }}>
                    <div style={{ fontSize: 11, fontWeight: 700, color: "#aaa",
                      letterSpacing: 0.7, marginBottom: 8 }}>ОПИСАНИЕ</div>
                    <p style={{ fontSize: 13, color: "#444", lineHeight: 1.6, margin: 0 }}>
                      {selected.caption}
                    </p>
                  </div>
                )}
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
