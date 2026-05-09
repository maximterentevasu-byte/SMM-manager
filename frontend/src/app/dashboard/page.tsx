"use client";

import { useEffect, useState, useCallback } from "react";
import { useRouter } from "next/navigation";
import api from "@/lib/api";

const STATUS_CONFIG: Record<string, { label: string; color: string; bg: string }> = {
  content_ready: { label: "Готов",       color: "#0F6E56", bg: "#E1F5EE" },
  published:     { label: "Опубликован", color: "#185FA5", bg: "#E6F1FB" },
  planned:       { label: "Идея",        color: "#5F5E5A", bg: "#F1EFE8" },
  idea_ready:    { label: "Идея готова", color: "#854F0B", bg: "#FAEEDA" },
  failed:        { label: "Ошибка",      color: "#A32D2D", bg: "#FCEBEB" },
};

const PLATFORM_ICON: Record<string, string> = {
  telegram: "✈",
  vk: "ВК",
  ok: "ОК",
};

type Slot = {
  id: string;
  platform: string;
  scheduled_at: string;
  rubric_name: string;
  idea: { idea: string; hook: string; visual_concept: string } | null;
  post_text: string | null;
  image_url: string | null;
  image_prompt: string | null;
  status: string;
};

export default function DashboardPage() {
  const router = useRouter();
  const [slots, setSlots] = useState<Slot[]>([]);
  const [loading, setLoading] = useState(true);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editText, setEditText] = useState("");
  const [saving, setSaving] = useState(false);
  const [generatingImg, setGeneratingImg] = useState<string | null>(null);
  const [filter, setFilter] = useState<string>("all");
  const [platformFilter, setPlatformFilter] = useState<string>("all");
  const [businessId] = useState(() =>
    typeof window !== "undefined" ? localStorage.getItem("businessId") || "" : ""
  );

  const load = useCallback(async () => {
    try {
      const now = new Date();
      const { data } = await api.get(`/content/${businessId}/plan`, {
        params: { year: now.getFullYear(), month: now.getMonth() + 1 },
      });
      setSlots(data);
    } catch {
      router.push("/login");
    } finally {
      setLoading(false);
    }
  }, [businessId, router]);

  useEffect(() => { load(); }, [load]);

  const startEdit = (slot: Slot) => {
    setEditingId(slot.id);
    setEditText(slot.post_text || "");
  };

  const saveEdit = async (id: string) => {
    setSaving(true);
    try {
      await api.patch(`/content/slot/${id}`, { post_text: editText });
      setSlots((prev) => prev.map((s) => s.id === id ? { ...s, post_text: editText } : s));
      setEditingId(null);
    } catch {
      alert("Ошибка сохранения");
    } finally {
      setSaving(false);
    }
  };

  const generateImage = async (slot: Slot) => {
    setGeneratingImg(slot.id);
    try {
      const { data } = await api.post(`/content/slot/${slot.id}/generate-image`);
      setSlots((prev) => prev.map((s) => s.id === slot.id ? { ...s, image_url: data.image_url } : s));
    } catch {
      alert("Ошибка генерации картинки");
    } finally {
      setGeneratingImg(null);
    }
  };

  const publishNow = async (slot: Slot) => {
    try {
      await api.post(`/content/slot/${slot.id}/publish`);
      setSlots((prev) => prev.map((s) => s.id === slot.id ? { ...s, status: "published" } : s));
      alert("Пост отправлен в канал!");
    } catch {
      alert("Ошибка публикации");
    }
  };

  const filtered = slots.filter((s) => {
    const statusOk = filter === "all" || s.status === filter;
    const platformOk = platformFilter === "all" || s.platform === platformFilter;
    return statusOk && platformOk && s.post_text;
  });

  const stats = {
    total: slots.filter((s) => s.post_text).length,
    ready: slots.filter((s) => s.status === "content_ready").length,
    published: slots.filter((s) => s.status === "published").length,
  };

  if (loading) return (
    <div style={{ display: "flex", alignItems: "center", justifyContent: "center",
      height: "100vh", fontFamily: "sans-serif", color: "#888" }}>
      Загружаем контент-план...
    </div>
  );

  return (
    <div style={{ minHeight: "100vh", background: "#F8F7F4", fontFamily: "'Segoe UI', sans-serif" }}>
      <div style={{ background: "#fff", borderBottom: "1px solid #E8E6E0", padding: "0 2rem" }}>
        <div style={{ maxWidth: 1100, margin: "0 auto", display: "flex", alignItems: "center",
          justifyContent: "space-between", height: 64 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
            <span style={{ fontSize: 22, fontWeight: 700, color: "#1a1a1a", letterSpacing: -0.5 }}>
              🍕 SMM Platform
            </span>
            <span style={{ fontSize: 13, color: "#888", background: "#F1EFE8",
              padding: "2px 10px", borderRadius: 20 }}>Май 2026</span>
          </div>
          <div style={{ display: "flex", gap: 24, fontSize: 13, color: "#666" }}>
            <span>Готово: <strong style={{ color: "#0F6E56" }}>{stats.ready}</strong></span>
            <span>Опубликовано: <strong style={{ color: "#185FA5" }}>{stats.published}</strong></span>
            <span>Всего: <strong>{stats.total}</strong></span>
          </div>
        </div>
      </div>

      <div style={{ maxWidth: 1100, margin: "0 auto", padding: "2rem" }}>
        <div style={{ display: "flex", gap: 8, marginBottom: 24, flexWrap: "wrap" }}>
          {["all", "content_ready", "published", "idea_ready", "failed"].map((s) => (
            <button key={s} onClick={() => setFilter(s)}
              style={{ padding: "6px 14px", borderRadius: 20, border: "1px solid",
                cursor: "pointer", fontSize: 13, fontWeight: 500,
                borderColor: filter === s ? "#1a1a1a" : "#E0DED8",
                background: filter === s ? "#1a1a1a" : "#fff",
                color: filter === s ? "#fff" : "#555" }}>
              {s === "all" ? "Все" : STATUS_CONFIG[s]?.label}
            </button>
          ))}
          <div style={{ width: 1, background: "#E0DED8", margin: "0 4px" }} />
          {["all", "telegram", "vk"].map((p) => (
            <button key={p} onClick={() => setPlatformFilter(p)}
              style={{ padding: "6px 14px", borderRadius: 20, border: "1px solid",
                cursor: "pointer", fontSize: 13, fontWeight: 500,
                borderColor: platformFilter === p ? "#533AB7" : "#E0DED8",
                background: platformFilter === p ? "#EEEDFE" : "#fff",
                color: platformFilter === p ? "#533AB7" : "#555" }}>
              {p === "all" ? "Все площадки" : p === "telegram" ? "✈ Telegram" : "ВК VK"}
            </button>
          ))}
        </div>

        <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
          {filtered.map((slot) => {
            const st = STATUS_CONFIG[slot.status] || STATUS_CONFIG.planned;
            const date = new Date(slot.scheduled_at);
            const isEditing = editingId === slot.id;

            return (
              <div key={slot.id} style={{ background: "#fff", borderRadius: 16,
                border: "1px solid #EAE8E2", overflow: "hidden" }}>
                <div style={{ padding: "14px 20px", display: "flex", alignItems: "center",
                  gap: 12, borderBottom: "1px solid #F2F0EC" }}>
                  <span style={{ fontSize: 11, fontWeight: 700, letterSpacing: 0.5,
                    color: "#888", background: "#F1EFE8", padding: "3px 8px", borderRadius: 6 }}>
                    {PLATFORM_ICON[slot.platform] || slot.platform.toUpperCase()}
                  </span>
                  <span style={{ fontSize: 13, color: "#555", fontWeight: 500 }}>{slot.rubric_name}</span>
                  <div style={{ flex: 1 }} />
                  <span style={{ fontSize: 12, color: "#999" }}>
                    {date.getDate()} {["янв","фев","мар","апр","май","июн","июл","авг","сен","окт","ноя","дек"][date.getMonth()]} · {String(date.getHours()).padStart(2,"0")}:{String(date.getMinutes()).padStart(2,"0")}
                  </span>
                  <span style={{ fontSize: 12, fontWeight: 600, padding: "3px 10px",
                    borderRadius: 20, color: st.color, background: st.bg }}>
                    {st.label}
                  </span>
                </div>

                <div style={{ display: "flex" }}>
                  <div style={{ flex: 1, padding: "16px 20px" }}>
                    {isEditing ? (
                      <div>
                        <textarea value={editText} onChange={(e) => setEditText(e.target.value)}
                          style={{ width: "100%", minHeight: 200, padding: 12, fontSize: 14,
                            lineHeight: 1.6, border: "1.5px solid #533AB7", borderRadius: 10,
                            resize: "vertical", fontFamily: "inherit", outline: "none",
                            boxSizing: "border-box" }} />
                        <div style={{ display: "flex", gap: 8, marginTop: 10 }}>
                          <button onClick={() => saveEdit(slot.id)} disabled={saving}
                            style={{ padding: "8px 18px", background: "#1a1a1a", color: "#fff",
                              border: "none", borderRadius: 8, cursor: "pointer",
                              fontSize: 13, fontWeight: 600 }}>
                            {saving ? "Сохраняю..." : "Сохранить"}
                          </button>
                          <button onClick={() => setEditingId(null)}
                            style={{ padding: "8px 18px", background: "#F1EFE8", color: "#555",
                              border: "none", borderRadius: 8, cursor: "pointer", fontSize: 13 }}>
                            Отмена
                          </button>
                        </div>
                      </div>
                    ) : (
                      <div>
                        <p style={{ fontSize: 14, lineHeight: 1.7, color: "#2a2a2a",
                          margin: 0, whiteSpace: "pre-wrap" }}>
                          {slot.post_text}
                        </p>
                        <div style={{ display: "flex", gap: 8, marginTop: 14, flexWrap: "wrap" }}>
                          <button onClick={() => startEdit(slot)}
                            style={{ padding: "7px 14px", background: "#F1EFE8", color: "#444",
                              border: "1px solid #E0DED8", borderRadius: 8, cursor: "pointer",
                              fontSize: 12, fontWeight: 500 }}>
                            ✏️ Редактировать
                          </button>
                          {slot.status === "content_ready" && (
                            <button onClick={() => publishNow(slot)}
                              style={{ padding: "7px 14px", background: "#0F6E56", color: "#fff",
                                border: "none", borderRadius: 8, cursor: "pointer",
                                fontSize: 12, fontWeight: 600 }}>
                              ✈ Опубликовать
                            </button>
                          )}
                        </div>
                      </div>
                    )}
                  </div>

                  <div style={{ width: 200, borderLeft: "1px solid #F2F0EC", padding: 16,
                    display: "flex", flexDirection: "column", gap: 10, alignItems: "center",
                    justifyContent: "center", background: "#FAFAF8" }}>
                    {slot.image_url ? (
                      <img src={slot.image_url} alt="post"
                        style={{ width: "100%", borderRadius: 10, objectFit: "cover" }} />
                    ) : (
                      <div style={{ width: "100%", aspectRatio: "1", background: "#F1EFE8",
                        borderRadius: 10, display: "flex", flexDirection: "column",
                        alignItems: "center", justifyContent: "center", gap: 8 }}>
                        <span style={{ fontSize: 28 }}>🖼</span>
                        <span style={{ fontSize: 11, color: "#999", textAlign: "center",
                          lineHeight: 1.4 }}>Картинка не сгенерирована</span>
                      </div>
                    )}
                    {!slot.image_url && (
                      <button onClick={() => generateImage(slot)} disabled={generatingImg === slot.id}
                        style={{ width: "100%", padding: "8px", background: "#533AB7", color: "#fff",
                          border: "none", borderRadius: 8, cursor: "pointer",
                          fontSize: 12, fontWeight: 600 }}>
                        {generatingImg === slot.id ? "Генерирую..." : "✨ Создать"}
                      </button>
                    )}
                  </div>
                </div>
              </div>
            );
          })}

          {filtered.length === 0 && (
            <div style={{ textAlign: "center", padding: "4rem 0", color: "#999" }}>
              <div style={{ fontSize: 48 }}>📭</div>
              <p style={{ marginTop: 12 }}>Нет постов с таким фильтром</p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}