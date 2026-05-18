"use client";

import React, { useEffect, useState, useCallback } from "react";
import api from "@/lib/api";

type TGPost = {
  post_id: number;
  channel_name: string;
  published_at: string;
  text: string;
  views: number;
  reactions: number;
  comments: number;
  reposts: number;
  has_media: boolean;
  media_type: string;
  er_pct: number;
  virality_pct: number;
  has_question: boolean;
  subscribers: number;
  updated_at: string;
};

type Period = "week" | "month" | "3months" | "year" | "all";

const PERIODS: { key: Period; label: string; days: number }[] = [
  { key: "week",    label: "Неделя",   days: 7 },
  { key: "month",   label: "Месяц",    days: 30 },
  { key: "3months", label: "3 месяца", days: 90 },
  { key: "year",    label: "Год",      days: 365 },
  { key: "all",     label: "Всё время", days: 0 },
];

const MEDIA_ICON: Record<string, string> = {
  photo: "🖼",
  video: "🎬",
  voice: "🎙",
  document: "📎",
  none: "",
};

// UTC → Yekaterinburg (UTC+5)
function toEKB(iso: string): Date {
  const d = new Date(iso);
  return new Date(d.getTime() + 5 * 60 * 60 * 1000);
}
function fmtDate(iso: string) {
  const d = toEKB(iso);
  return `${d.getUTCDate().toString().padStart(2,"0")}.${(d.getUTCMonth()+1).toString().padStart(2,"0")}.${d.getUTCFullYear()}`;
}
function fmtTime(iso: string) {
  const d = toEKB(iso);
  return `${d.getUTCHours().toString().padStart(2,"0")}:${d.getUTCMinutes().toString().padStart(2,"0")}`;
}

function truncate(s: string, n = 60) {
  return s.length > n ? s.slice(0, n) + "…" : s;
}

function fmt(n: number, dec = 0) {
  return n == null ? "—" : Number(n).toLocaleString("ru-RU", { maximumFractionDigits: dec });
}

export default function PostsTab({ businessId }: { businessId: string }) {
  const [posts, setPosts] = useState<TGPost[]>([]);
  const [loading, setLoading] = useState(true);
  const [collecting, setCollecting] = useState(false);
  const [collectMsg, setCollectMsg] = useState("");
  const [period, setPeriod] = useState<Period>("all");
  const [selected, setSelected] = useState<TGPost | null>(null);
  const [sortCol, setSortCol] = useState<keyof TGPost>("published_at");
  const [sortDir, setSortDir] = useState<"asc" | "desc">("desc");

  const load = useCallback(async () => {
    try {
      const { data } = await api.get(`/analytics/${businessId}/tg/posts`);
      setPosts(data);
    } catch {
      // empty
    } finally {
      setLoading(false);
    }
  }, [businessId]);

  useEffect(() => { load(); }, [load]);

  const collect = async (deeper = false) => {
    setCollecting(true);
    setCollectMsg("");
    try {
      const { data } = await api.post(
        `/analytics/${businessId}/tg/posts/collect?deeper=${deeper}`
      );
      setCollectMsg(`✓ Собрано ${data.collected} постов`);
      await load();
    } catch (e: any) {
      setCollectMsg("⚠ " + (e?.response?.data?.detail || "Ошибка сбора"));
    } finally {
      setCollecting(false);
    }
  };

  // Period filter
  const now = Date.now();
  const filtered = posts.filter(p => {
    if (period === "all") return true;
    const days = PERIODS.find(x => x.key === period)!.days;
    return new Date(p.published_at).getTime() > now - days * 86400_000;
  });

  // Sort
  const sorted = [...filtered].sort((a, b) => {
    let av = a[sortCol] as any;
    let bv = b[sortCol] as any;
    if (typeof av === "string") av = av.toLowerCase();
    if (typeof bv === "string") bv = bv.toLowerCase();
    if (av < bv) return sortDir === "asc" ? -1 : 1;
    if (av > bv) return sortDir === "asc" ? 1 : -1;
    return 0;
  });

  const toggleSort = (col: keyof TGPost) => {
    if (sortCol === col) setSortDir(d => d === "asc" ? "desc" : "asc");
    else { setSortCol(col); setSortDir("desc"); }
  };

  const SortIcon = ({ col }: { col: keyof TGPost }) => {
    if (sortCol !== col) return <span style={{ color: "#ddd", fontSize: 9, marginLeft: 3 }}>↕</span>;
    return <span style={{ fontSize: 9, marginLeft: 3 }}>{sortDir === "asc" ? "↑" : "↓"}</span>;
  };

  const thStyle: React.CSSProperties = {
    padding: "10px 12px", textAlign: "left", fontWeight: 600,
    color: "#6B7280", fontSize: 11, letterSpacing: 0.4,
    borderBottom: "1px solid #F3F4F6", whiteSpace: "nowrap",
    cursor: "pointer", userSelect: "none", background: "#F9FAFB",
  };
  const tdStyle: React.CSSProperties = {
    padding: "9px 12px", fontSize: 13, color: "#374151",
    borderBottom: "1px solid #F9FAFB", whiteSpace: "nowrap",
  };

  if (loading) {
    return (
      <div style={{ textAlign: "center", padding: "3rem", color: "#888" }}>
        Загружаем посты...
      </div>
    );
  }

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
      {/* Controls */}
      <div style={{ display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap" }}>
        {/* Period selector */}
        <div style={{ display: "flex", gap: 3, background: "#F0EEE8", padding: 4, borderRadius: 10 }}>
          {PERIODS.map(p => (
            <button key={p.key} onClick={() => setPeriod(p.key)}
              style={{
                padding: "6px 14px", borderRadius: 8, border: "none", cursor: "pointer",
                fontSize: 12, fontWeight: period === p.key ? 600 : 400,
                background: period === p.key ? "#fff" : "transparent",
                color: period === p.key ? "#0D1B2A" : "#999",
                boxShadow: period === p.key ? "0 1px 4px rgba(0,0,0,0.08)" : "none",
              }}>
              {p.label}
            </button>
          ))}
        </div>

        <div style={{ flex: 1 }} />

        <span style={{ fontSize: 12, color: "#9CA3AF" }}>
          {sorted.length} постов из {posts.length} сохранённых
        </span>

        <button onClick={() => collect(false)} disabled={collecting}
          style={{ padding: "7px 16px", background: collecting ? "#ccc" : "#3478F6",
            color: "#fff", border: "none", borderRadius: 9, fontSize: 13,
            fontWeight: 600, cursor: collecting ? "not-allowed" : "pointer" }}>
          {collecting ? "Собираю..." : "⟳ Обновить"}
        </button>

        {posts.length > 0 && (
          <button onClick={() => collect(true)} disabled={collecting}
            style={{ padding: "7px 16px", background: "transparent",
              color: "#6B7280", border: "1px solid #E5E7EB", borderRadius: 9,
              fontSize: 13, cursor: collecting ? "not-allowed" : "pointer" }}>
            Загрузить старые
          </button>
        )}
      </div>

      {collectMsg && (
        <div style={{ padding: "10px 14px", borderRadius: 10, fontSize: 13,
          background: collectMsg.startsWith("✓") ? "#ECFDF5" : "#FEF2F2",
          color: collectMsg.startsWith("✓") ? "#059669" : "#DC2626" }}>
          {collectMsg}
        </div>
      )}

      {/* Empty state */}
      {posts.length === 0 && !collecting && (
        <div style={{ background: "#fff", border: "1px solid #E5E7EB", borderRadius: 16,
          padding: "48px 32px", textAlign: "center" }}>
          <div style={{ fontSize: 36, marginBottom: 12 }}>📊</div>
          <p style={{ fontSize: 15, fontWeight: 600, color: "#0D1B2A", margin: "0 0 8px" }}>
            Нет данных по постам
          </p>
          <p style={{ color: "#6B7280", fontSize: 14, margin: "0 0 20px" }}>
            Нажмите «Обновить» чтобы собрать посты из Telegram-канала
          </p>
          <button onClick={() => collect(false)} disabled={collecting}
            style={{ padding: "10px 24px", background: "#3478F6", color: "#fff",
              border: "none", borderRadius: 10, fontSize: 14, fontWeight: 600, cursor: "pointer" }}>
            Собрать посты
          </button>
        </div>
      )}

      {/* Table + side panel layout */}
      {sorted.length > 0 && (
        <div style={{ display: "flex", gap: 16, alignItems: "flex-start" }}>
          {/* Table */}
          <div style={{ flex: 1, minWidth: 0, background: "#fff",
            border: "1px solid #E5E7EB", borderRadius: 16, overflow: "auto" }}>
            <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13 }}>
              <thead>
                <tr>
                  {[
                    { col: "published_at" as keyof TGPost, label: "Дата (ЕКБ)", minWidth: 110 },
                    { col: "published_at" as keyof TGPost, label: "Время (ЕКБ)", noSort: true, minWidth: 90 },
                    { col: "post_id" as keyof TGPost, label: "ID", minWidth: 72 },
                    { col: "text" as keyof TGPost, label: "Текст поста", minWidth: 220 },
                    { col: "views" as keyof TGPost, label: "Просмотры", minWidth: 110 },
                    { col: "reactions" as keyof TGPost, label: "Реакции", minWidth: 100 },
                    { col: "comments" as keyof TGPost, label: "Комментарии", minWidth: 120 },
                    { col: "reposts" as keyof TGPost, label: "Репосты", minWidth: 100 },
                    { col: "er_pct" as keyof TGPost, label: "ER %", minWidth: 80 },
                    { col: "virality_pct" as keyof TGPost, label: "Вирал %", minWidth: 90 },
                    { col: "has_question" as keyof TGPost, label: "Вопрос", minWidth: 85 },
                  ].map(({ col, label, noSort, minWidth }) => (
                    <th key={label} style={{ ...thStyle, minWidth }}
                      onClick={() => !noSort && toggleSort(col)}>
                      {label}{!noSort && <SortIcon col={col} />}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {sorted.map(p => {
                  const isActive = selected?.post_id === p.post_id;
                  return (
                    <tr key={p.post_id}
                      onClick={() => setSelected(isActive ? null : p)}
                      style={{
                        background: isActive ? "#EEF4FF" : "transparent",
                        cursor: "pointer",
                        transition: "background 0.1s",
                      }}
                      onMouseEnter={e => {
                        if (!isActive) (e.currentTarget as HTMLElement).style.background = "#F9FAFB";
                      }}
                      onMouseLeave={e => {
                        if (!isActive) (e.currentTarget as HTMLElement).style.background = "transparent";
                      }}>
                      <td style={tdStyle}>{fmtDate(p.published_at)}</td>
                      <td style={tdStyle}>{fmtTime(p.published_at)}</td>
                      <td style={{ ...tdStyle, color: "#9CA3AF", fontFamily: "monospace" }}>{p.post_id}</td>
                      <td style={{ ...tdStyle, maxWidth: 240 }}>
                        <div style={{ display: "flex", alignItems: "center", gap: 5 }}>
                          {p.has_media && (
                            <span style={{ fontSize: 14, flexShrink: 0 }}>{MEDIA_ICON[p.media_type] || "📎"}</span>
                          )}
                          <span style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap",
                            color: p.text ? "#374151" : "#9CA3AF", fontStyle: p.text ? "normal" : "italic" }}>
                            {p.text ? truncate(p.text, 55) : "[без текста]"}
                          </span>
                        </div>
                      </td>
                      <td style={{ ...tdStyle, fontWeight: 600 }}>{fmt(p.views)}</td>
                      <td style={tdStyle}>{fmt(p.reactions)}</td>
                      <td style={tdStyle}>{fmt(p.comments)}</td>
                      <td style={tdStyle}>{fmt(p.reposts)}</td>
                      <td style={{ ...tdStyle, color: p.er_pct > 5 ? "#059669" : p.er_pct > 2 ? "#D97706" : "#374151" }}>
                        {fmt(p.er_pct, 2)}%
                      </td>
                      <td style={tdStyle}>{fmt(p.virality_pct, 2)}%</td>
                      <td style={{ ...tdStyle, color: p.has_question ? "#3478F6" : "#9CA3AF" }}>
                        {p.has_question ? "да" : "нет"}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>

          {/* Side panel */}
          {selected && (
            <PostDetail post={selected} onClose={() => setSelected(null)} />
          )}
        </div>
      )}
    </div>
  );
}

function PostDetail({ post, onClose }: { post: TGPost; onClose: () => void }) {
  // Only public channels with valid @username (letters/digits/underscore, no spaces) support embeds
  const isValidUsername = (s: string) => /^[a-zA-Z0-9_]{3,}$/.test(s);
  const embedUrl = isValidUsername(post.channel_name)
    ? `https://t.me/${post.channel_name}/${post.post_id}?embed=1&mode=tme`
    : null;

  return (
    <div style={{
      width: 480, flexShrink: 0, background: "#fff", border: "1px solid #E5E7EB",
      borderRadius: 16, overflow: "hidden", position: "sticky", top: 20,
      maxHeight: "calc(100vh - 120px)", display: "flex", flexDirection: "column",
    }}>
      {/* Header */}
      <div style={{ padding: "14px 16px", borderBottom: "1px solid #F3F4F6",
        display: "flex", alignItems: "center", justifyContent: "space-between" }}>
        <div>
          <div style={{ fontSize: 13, fontWeight: 600, color: "#0D1B2A" }}>
            Пост #{post.post_id}
          </div>
          <div style={{ fontSize: 11, color: "#9CA3AF", marginTop: 1 }}>
            {fmtDate(post.published_at)} · {fmtTime(post.published_at)} ЕКБ
          </div>
        </div>
        <button onClick={onClose}
          style={{ background: "#F3F4F6", border: "none", borderRadius: 8,
            width: 28, height: 28, cursor: "pointer", fontSize: 14, color: "#6B7280",
            display: "flex", alignItems: "center", justifyContent: "center" }}>
          ✕
        </button>
      </div>

      <div style={{ overflowY: "auto", flex: 1 }}>
        {/* Media area: embed OR media placeholder — never post text here */}
        {embedUrl ? (
          <div style={{ borderBottom: "1px solid #F3F4F6" }}>
            <iframe
              src={embedUrl}
              style={{ width: "100%", border: "none", minHeight: 200 }}
              sandbox="allow-scripts allow-same-origin allow-popups"
              onLoad={(e) => {
                const iframe = e.currentTarget;
                try {
                  iframe.style.height =
                    (iframe.contentWindow?.document.body.scrollHeight || 200) + "px";
                } catch {}
              }}
            />
          </div>
        ) : post.has_media ? (
          <div style={{ padding: "16px", borderBottom: "1px solid #F3F4F6" }}>
            <div style={{ background: "#F9FAFB", borderRadius: 12, padding: "24px 16px",
              display: "flex", flexDirection: "column", alignItems: "center", gap: 8,
              color: "#6B7280" }}>
              <span style={{ fontSize: 36 }}>{MEDIA_ICON[post.media_type] || "📎"}</span>
              <span style={{ fontSize: 13, textTransform: "capitalize" }}>{post.media_type}</span>
              <span style={{ fontSize: 11, color: "#9CA3AF" }}>Медиа доступно только в Telegram</span>
            </div>
          </div>
        ) : null}


        {/* Metrics */}
        <div style={{ padding: "14px 16px" }}>
          <div style={{ fontSize: 11, fontWeight: 700, color: "#9CA3AF",
            letterSpacing: 0.6, marginBottom: 12 }}>ПОКАЗАТЕЛИ</div>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8 }}>
            {[
              { emoji: "👁", label: "Просмотры", value: post.views.toLocaleString("ru-RU") },
              { emoji: "❤️", label: "Реакции", value: String(post.reactions) },
              { emoji: "💬", label: "Комментарии", value: String(post.comments) },
              { emoji: "🔁", label: "Репосты", value: String(post.reposts) },
            ].map(m => (
              <div key={m.label} style={{ background: "#F9FAFB", borderRadius: 10,
                padding: "10px 12px" }}>
                <div style={{ fontSize: 16, marginBottom: 2 }}>{m.emoji}</div>
                <div style={{ fontSize: 18, fontWeight: 700, color: "#0D1B2A" }}>{m.value}</div>
                <div style={{ fontSize: 11, color: "#9CA3AF", marginTop: 1 }}>{m.label}</div>
              </div>
            ))}
          </div>

          <div style={{ marginTop: 8, background: post.er_pct > 5 ? "#ECFDF5" : "#F9FAFB",
            borderRadius: 10, padding: "10px 16px", display: "flex", alignItems: "center",
            justifyContent: "space-between" }}>
            <div style={{ fontSize: 12, color: "#6B7280" }}>ER поста</div>
            <div style={{ fontSize: 18, fontWeight: 700,
              color: post.er_pct > 5 ? "#059669" : post.er_pct > 2 ? "#D97706" : "#0D1B2A" }}>
              {post.er_pct.toFixed(2)}%
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
