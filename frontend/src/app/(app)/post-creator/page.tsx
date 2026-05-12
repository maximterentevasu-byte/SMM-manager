"use client";

import React, { useEffect, useRef, useState } from "react";
import api from "@/lib/api";

type Platform = "vk" | "telegram";
type ConnectedPlatform = { platform: Platform; page_name: string };

const MAX_IMAGE_RETRIES = 2;

export default function PostCreatorPage() {
  const [businessId] = useState(() =>
    typeof window !== "undefined" ? localStorage.getItem("businessId") || "" : ""
  );
  const [connectedPlatforms, setConnectedPlatforms] = useState<ConnectedPlatform[]>([]);

  // ── Step states ──────────────────────────────────────────────────────────
  const [idea, setIdea] = useState("");
  const [ideaFile, setIdeaFile] = useState<File | null>(null);
  const [ideaFilePreview, setIdeaFilePreview] = useState("");

  const [postText, setPostText] = useState("");
  const [imagePrompt, setImagePrompt] = useState("");
  const [imageBase64, setImageBase64] = useState("");
  const [imageRetries, setImageRetries] = useState(0);

  const [selectedPlatforms, setSelectedPlatforms] = useState<Platform[]>([]);
  const [publishNow, setPublishNow] = useState(true);
  const [publishDate, setPublishDate] = useState("");
  const [publishTime, setPublishTime] = useState("12:00");

  // ── Loading / message states ──────────────────────────────────────────────
  const [loadingText, setLoadingText] = useState(false);
  const [loadingPrompt, setLoadingPrompt] = useState(false);
  const [loadingImage, setLoadingImage] = useState(false);
  const [publishing, setPublishing] = useState(false);
  const [publishMsg, setPublishMsg] = useState("");

  const fileInputRef = useRef<HTMLInputElement>(null);
  const ownPhotoRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (!businessId) return;
    api.get(`/platforms/list/${businessId}`).then(({ data }) => {
      setConnectedPlatforms(
        (data || []).filter((p: any) => p.is_active).map((p: any) => ({
          platform: p.platform as Platform,
          page_name: p.page_name,
        }))
      );
    }).catch(() => {});

    const today = new Date();
    const yyyy = today.getFullYear();
    const mm = String(today.getMonth() + 1).padStart(2, "0");
    const dd = String(today.getDate()).padStart(2, "0");
    setPublishDate(`${yyyy}-${mm}-${dd}`);
  }, [businessId]);

  // ── Handlers ──────────────────────────────────────────────────────────────

  const onFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const f = e.target.files?.[0];
    if (!f) return;
    setIdeaFile(f);
    if (f.type.startsWith("image/")) {
      const url = URL.createObjectURL(f);
      setIdeaFilePreview(url);
    } else {
      setIdeaFilePreview("");
    }
  };

  const generateText = async () => {
    if (!idea.trim()) return;
    setLoadingText(true);
    setPostText("");
    setImagePrompt("");
    setImageBase64("");
    setImageRetries(0);
    try {
      const fd = new FormData();
      fd.append("idea", idea);
      if (ideaFile) fd.append("file", ideaFile);
      const { data } = await api.post(`/post-creator/${businessId}/generate-text`, fd);
      setPostText(data.text);
    } catch (e: any) {
      setPostText("Ошибка: " + (e?.response?.data?.detail || "не удалось сгенерировать"));
    } finally {
      setLoadingText(false);
    }
  };

  const generatePrompt = async () => {
    if (!postText.trim()) return;
    setLoadingPrompt(true);
    setImageBase64("");
    setImageRetries(0);
    try {
      const { data } = await api.post(`/post-creator/${businessId}/generate-prompt`, {
        post_text: postText,
      });
      setImagePrompt(data.prompt);
    } catch (e: any) {
      setImagePrompt("Ошибка: " + (e?.response?.data?.detail || "не удалось создать промт"));
    } finally {
      setLoadingPrompt(false);
    }
  };

  const generateImage = async () => {
    if (!imagePrompt.trim()) return;
    setLoadingImage(true);
    try {
      const { data } = await api.post(`/post-creator/${businessId}/generate-image`, {
        prompt: imagePrompt,
        aspect_ratio: "1:1",
      });
      setImageBase64(data.image_base64);
      setImageRetries((r) => r + 1);
    } catch (e: any) {
      alert("Ошибка генерации: " + (e?.response?.data?.detail || "попробуй изменить промт"));
    } finally {
      setLoadingImage(false);
    }
  };

  const onOwnPhoto = (e: React.ChangeEvent<HTMLInputElement>) => {
    const f = e.target.files?.[0];
    if (!f) return;
    const reader = new FileReader();
    reader.onload = (ev) => {
      const result = ev.target?.result as string;
      // strip data URL prefix — keep only base64 part
      setImageBase64(result.split(",")[1] || "");
    };
    reader.readAsDataURL(f);
  };

  const togglePlatform = (p: Platform) => {
    setSelectedPlatforms((prev) =>
      prev.includes(p) ? prev.filter((x) => x !== p) : [...prev, p]
    );
  };

  const publish = async () => {
    if (!postText.trim()) { alert("Сначала создай текст поста"); return; }
    if (!selectedPlatforms.length) { alert("Выбери хотя бы одну платформу"); return; }

    let scheduled_at: string | null = null;
    if (!publishNow) {
      if (!publishDate) { alert("Укажи дату публикации"); return; }
      scheduled_at = new Date(`${publishDate}T${publishTime}:00`).toISOString();
    }

    setPublishing(true);
    setPublishMsg("");
    try {
      await api.post(`/post-creator/${businessId}/publish`, {
        post_text: postText,
        image_prompt: imagePrompt || null,
        image_base64: imageBase64 || null,
        platforms: selectedPlatforms,
        scheduled_at,
      });
      setPublishMsg("✓ Пост добавлен в контент-план!");
    } catch (e: any) {
      setPublishMsg("⚠ " + (e?.response?.data?.detail || "Ошибка публикации"));
    } finally {
      setPublishing(false);
    }
  };

  const hasText = !!postText.trim();
  const hasPrompt = !!imagePrompt.trim();
  const hasImage = !!imageBase64;
  const canRetry = imageRetries < MAX_IMAGE_RETRIES + 1;
  const retriesLeft = MAX_IMAGE_RETRIES + 1 - imageRetries;

  // ── Styles ────────────────────────────────────────────────────────────────

  const card: React.CSSProperties = {
    background: "#fff",
    border: "1px solid #EAE8E2",
    borderRadius: 18,
    padding: "28px 32px",
    marginBottom: 16,
  };

  const sectionTitle = (n: number, label: string, done: boolean) => (
    <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 18 }}>
      <div style={{
        width: 28, height: 28, borderRadius: "50%", display: "flex",
        alignItems: "center", justifyContent: "center", flexShrink: 0,
        fontSize: 13, fontWeight: 700,
        background: done ? "#0F6E56" : "#1a1a1a",
        color: "#fff",
      }}>
        {done ? "✓" : n}
      </div>
      <div style={{ fontSize: 16, fontWeight: 700, color: "#1a1a1a" }}>{label}</div>
    </div>
  );

  const btn = (
    label: string,
    onClick: () => void,
    opts: { disabled?: boolean; loading?: boolean; color?: string; small?: boolean } = {}
  ) => (
    <button
      onClick={onClick}
      disabled={opts.disabled || opts.loading}
      style={{
        padding: opts.small ? "7px 16px" : "10px 22px",
        background: opts.disabled ? "#E0DED8" : (opts.color || "#1a1a1a"),
        color: opts.disabled ? "#aaa" : "#fff",
        border: "none", borderRadius: 10,
        cursor: opts.disabled ? "not-allowed" : "pointer",
        fontSize: opts.small ? 12 : 13, fontWeight: 600,
        display: "inline-flex", alignItems: "center", gap: 6,
        transition: "opacity 0.15s",
        opacity: opts.loading ? 0.7 : 1,
      }}
    >
      {opts.loading ? "⏳ " : ""}{label}
    </button>
  );

  const textarea = (
    value: string,
    onChange: (v: string) => void,
    placeholder: string,
    rows = 5
  ) => (
    <textarea
      value={value}
      onChange={(e) => onChange(e.target.value)}
      placeholder={placeholder}
      rows={rows}
      style={{
        width: "100%", padding: "12px 16px",
        border: "1px solid #E0DED8", borderRadius: 12,
        fontSize: 13, fontFamily: "inherit", lineHeight: 1.7,
        background: "#FAFAF8", resize: "vertical", boxSizing: "border-box",
        outline: "none",
      }}
    />
  );

  const PLATFORM_META: Record<Platform, { label: string; color: string; icon: string }> = {
    vk:       { label: "ВКонтакте", color: "#4680C2", icon: "В" },
    telegram: { label: "Telegram",  color: "#229ED9", icon: "✈" },
  };

  return (
    <div style={{ minHeight: "100vh", background: "#F8F7F4", fontFamily: "'Segoe UI', sans-serif" }}>
      {/* Header */}
      <div style={{ background: "#fff", borderBottom: "1px solid #EAE8E2", padding: "0 2rem" }}>
        <div style={{ maxWidth: 780, margin: "0 auto", height: 64,
          display: "flex", alignItems: "center", gap: 12 }}>
          <span style={{ fontSize: 20 }}>✏️</span>
          <h1 style={{ fontSize: 20, fontWeight: 700, color: "#1a1a1a", margin: 0 }}>
            Создание поста
          </h1>
        </div>
      </div>

      <div style={{ maxWidth: 780, margin: "0 auto", padding: "2rem" }}>

        {/* ── 1. Идея ── */}
        <div style={card}>
          {sectionTitle(1, "Опишите идею поста", false)}
          <p style={{ color: "#888", fontSize: 13, margin: "0 0 16px", lineHeight: 1.6 }}>
            Расскажите о мероприятии, продукте, акции — любых деталях: даты, адрес, стилистика.
            При необходимости прикрепите фото или документ.
          </p>
          {textarea(idea, setIdea,
            "Например: открываем новую точку 20 мая, адрес Ленина 15, скидка 20% на всё меню в день открытия, атмосфера уютного кафе...",
            5
          )}

          {/* File attach */}
          <div style={{ display: "flex", alignItems: "center", gap: 12, marginTop: 12 }}>
            <button
              onClick={() => fileInputRef.current?.click()}
              style={{ background: "none", border: "1px solid #E0DED8", borderRadius: 8,
                padding: "7px 14px", cursor: "pointer", fontSize: 12, color: "#666",
                display: "flex", alignItems: "center", gap: 6 }}>
              📎 {ideaFile ? ideaFile.name : "Прикрепить файл или фото"}
            </button>
            {ideaFile && (
              <button onClick={() => { setIdeaFile(null); setIdeaFilePreview(""); }}
                style={{ background: "none", border: "none", cursor: "pointer",
                  fontSize: 12, color: "#aaa" }}>✕ убрать</button>
            )}
            <input ref={fileInputRef} type="file" accept="image/*,.pdf,.doc,.docx,.txt"
              style={{ display: "none" }} onChange={onFileChange} />
          </div>

          {ideaFilePreview && (
            <img src={ideaFilePreview} alt="preview"
              style={{ marginTop: 12, maxHeight: 160, borderRadius: 10,
                objectFit: "cover", border: "1px solid #EAE8E2" }} />
          )}

          <div style={{ marginTop: 20 }}>
            {btn(
              loadingText ? "Генерирую текст..." : "✨ Сгенерировать текст",
              generateText,
              { disabled: !idea.trim() || loadingText, loading: loadingText, color: "#1a1a1a" }
            )}
          </div>
        </div>

        {/* ── 2. Текст поста ── */}
        {(hasText || loadingText) && (
          <div style={card}>
            {sectionTitle(2, "Текст поста", hasText)}
            <p style={{ color: "#888", fontSize: 13, margin: "0 0 14px" }}>
              Отредактируйте текст по необходимости или обновите.
            </p>
            {textarea(postText, setPostText,
              "Здесь появится сгенерированный текст...", 8)}
            <div style={{ display: "flex", gap: 10, marginTop: 14, flexWrap: "wrap" }}>
              {btn("⟳ Обновить", generateText,
                { disabled: !idea.trim() || loadingText, loading: loadingText, small: true, color: "#555" }
              )}
              {hasText && btn(
                loadingPrompt ? "Создаю промт..." : "→ Создать промт для картинки",
                generatePrompt,
                { disabled: loadingPrompt, loading: loadingPrompt, color: "#0F6E56" }
              )}
            </div>
          </div>
        )}

        {/* ── 3. Промт для картинки ── */}
        {(hasPrompt || loadingPrompt) && (
          <div style={card}>
            {sectionTitle(3, "Промт для генерации изображения", hasPrompt)}
            <p style={{ color: "#888", fontSize: 13, margin: "0 0 14px" }}>
              Claude составил промт на английском для Imagen 3. Можете скорректировать.
            </p>
            {textarea(imagePrompt, setImagePrompt,
              "Здесь появится промт для изображения...", 4)}
            <div style={{ display: "flex", gap: 10, marginTop: 14, flexWrap: "wrap" }}>
              {btn("⟳ Обновить промт", generatePrompt,
                { disabled: !postText.trim() || loadingPrompt, loading: loadingPrompt, small: true, color: "#555" }
              )}
              {hasPrompt && btn(
                loadingImage ? "Генерирую..." : "🖼 Сгенерировать изображение",
                generateImage,
                { disabled: loadingImage, loading: loadingImage, color: "#4680C2" }
              )}
            </div>
          </div>
        )}

        {/* ── 4. Изображение ── */}
        {(hasImage || loadingImage) && (
          <div style={card}>
            {sectionTitle(4, "Изображение", hasImage)}
            {loadingImage && !hasImage && (
              <div style={{ padding: "40px 0", textAlign: "center", color: "#888" }}>
                ⏳ Gemini Imagen 3 рисует...
              </div>
            )}
            {hasImage && (
              <div style={{ display: "flex", gap: 24, flexWrap: "wrap", alignItems: "flex-start" }}>
                <img
                  src={`data:image/png;base64,${imageBase64}`}
                  alt="generated"
                  style={{ width: 280, height: 280, objectFit: "cover",
                    borderRadius: 14, border: "1px solid #EAE8E2", flexShrink: 0 }}
                />
                <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
                  <div style={{ fontSize: 13, color: "#888", marginBottom: 4 }}>
                    Использовано попыток: {imageRetries} / {MAX_IMAGE_RETRIES + 1}
                  </div>
                  {btn(
                    canRetry && retriesLeft > 0
                      ? `⟳ Обновить (осталось ${retriesLeft})`
                      : "Лимит попыток исчерпан",
                    generateImage,
                    { disabled: !canRetry || retriesLeft === 0 || loadingImage,
                      loading: loadingImage, small: true, color: "#555" }
                  )}
                  <button
                    onClick={() => ownPhotoRef.current?.click()}
                    style={{ padding: "7px 16px", background: "none",
                      border: "1px solid #E0DED8", borderRadius: 8,
                      cursor: "pointer", fontSize: 12, color: "#444",
                      display: "inline-flex", alignItems: "center", gap: 6 }}>
                    📁 Загрузить своё фото
                  </button>
                  <input ref={ownPhotoRef} type="file" accept="image/*"
                    style={{ display: "none" }} onChange={onOwnPhoto} />
                </div>
              </div>
            )}
          </div>
        )}

        {/* ── 5. Платформы ── */}
        {hasText && (
          <div style={card}>
            {sectionTitle(5, "Куда публиковать", selectedPlatforms.length > 0)}
            <p style={{ color: "#888", fontSize: 13, margin: "0 0 16px" }}>
              Выберите одну или несколько подключённых платформ.
            </p>
            <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
              {connectedPlatforms.length === 0 && (
                <div style={{ fontSize: 13, color: "#aaa" }}>
                  Нет подключённых платформ.{" "}
                  <a href="/platforms" style={{ color: "#1a1a1a", fontWeight: 600 }}>
                    Подключить →
                  </a>
                </div>
              )}
              {connectedPlatforms.map(({ platform, page_name }) => {
                const meta = PLATFORM_META[platform];
                const active = selectedPlatforms.includes(platform);
                return (
                  <button
                    key={platform}
                    onClick={() => togglePlatform(platform)}
                    style={{
                      padding: "10px 20px", borderRadius: 12, border: "2px solid",
                      borderColor: active ? meta.color : "#E0DED8",
                      background: active ? meta.color + "18" : "#fff",
                      cursor: "pointer", display: "flex", alignItems: "center", gap: 8,
                      transition: "all 0.15s",
                    }}>
                    <span style={{ fontSize: 15, fontWeight: 700, color: meta.color }}>
                      {meta.icon}
                    </span>
                    <div style={{ textAlign: "left" }}>
                      <div style={{ fontSize: 13, fontWeight: 600,
                        color: active ? meta.color : "#1a1a1a" }}>
                        {meta.label}
                      </div>
                      <div style={{ fontSize: 11, color: "#aaa" }}>{page_name}</div>
                    </div>
                    {active && (
                      <span style={{ marginLeft: 4, fontSize: 13, color: meta.color }}>✓</span>
                    )}
                  </button>
                );
              })}
            </div>
          </div>
        )}

        {/* ── 6. Расписание ── */}
        {hasText && selectedPlatforms.length > 0 && (
          <div style={card}>
            {sectionTitle(6, "Время публикации", false)}

            <div style={{ display: "flex", gap: 10, marginBottom: 16, flexWrap: "wrap" }}>
              <button
                onClick={() => setPublishNow(true)}
                style={{ padding: "9px 20px", borderRadius: 10, border: "2px solid",
                  borderColor: publishNow ? "#1a1a1a" : "#E0DED8",
                  background: publishNow ? "#1a1a1a" : "#fff",
                  color: publishNow ? "#fff" : "#666",
                  cursor: "pointer", fontSize: 13, fontWeight: 600 }}>
                ⚡ Опубликовать сейчас
              </button>
              <button
                onClick={() => setPublishNow(false)}
                style={{ padding: "9px 20px", borderRadius: 10, border: "2px solid",
                  borderColor: !publishNow ? "#1a1a1a" : "#E0DED8",
                  background: !publishNow ? "#1a1a1a" : "#fff",
                  color: !publishNow ? "#fff" : "#666",
                  cursor: "pointer", fontSize: 13, fontWeight: 600 }}>
                📅 Запланировать
              </button>
            </div>

            {!publishNow && (
              <div style={{ display: "flex", gap: 12, alignItems: "center", flexWrap: "wrap" }}>
                <div>
                  <label style={{ fontSize: 12, color: "#888", display: "block", marginBottom: 4 }}>
                    Дата
                  </label>
                  <input
                    type="date"
                    value={publishDate}
                    onChange={(e) => setPublishDate(e.target.value)}
                    style={{ padding: "9px 14px", border: "1px solid #E0DED8",
                      borderRadius: 10, fontSize: 13, background: "#FAFAF8",
                      outline: "none" }}
                  />
                </div>
                <div>
                  <label style={{ fontSize: 12, color: "#888", display: "block", marginBottom: 4 }}>
                    Время
                  </label>
                  <input
                    type="time"
                    value={publishTime}
                    onChange={(e) => setPublishTime(e.target.value)}
                    style={{ padding: "9px 14px", border: "1px solid #E0DED8",
                      borderRadius: 10, fontSize: 13, background: "#FAFAF8",
                      outline: "none" }}
                  />
                </div>
              </div>
            )}
          </div>
        )}

        {/* ── Финальная кнопка ── */}
        {hasText && selectedPlatforms.length > 0 && (
          <div style={{ marginTop: 8 }}>
            <button
              onClick={publish}
              disabled={publishing}
              style={{
                width: "100%", padding: "16px", borderRadius: 14, border: "none",
                background: publishing ? "#888" : "#1a1a1a",
                color: "#fff", fontSize: 16, fontWeight: 700,
                cursor: publishing ? "not-allowed" : "pointer",
                display: "flex", alignItems: "center", justifyContent: "center", gap: 10,
                letterSpacing: 0.3,
              }}>
              {publishing ? "⏳ Добавляю в план..." : "🚀 Отправить на публикацию"}
            </button>

            {publishMsg && (
              <div style={{
                marginTop: 14, padding: "14px 20px", borderRadius: 12,
                background: publishMsg.startsWith("✓") ? "#E1F5EE" : "#FFF3CD",
                color: publishMsg.startsWith("✓") ? "#0F6E56" : "#856404",
                fontSize: 14, fontWeight: 600, textAlign: "center",
              }}>
                {publishMsg}
                {publishMsg.startsWith("✓") && (
                  <a href="/content" style={{ marginLeft: 12, color: "#0F6E56",
                    textDecoration: "underline", fontWeight: 700 }}>
                    Открыть контент-план →
                  </a>
                )}
              </div>
            )}
          </div>
        )}

      </div>
    </div>
  );
}
