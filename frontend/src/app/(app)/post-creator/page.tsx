"use client";

import React, { useEffect, useRef, useState } from "react";
import api from "@/lib/api";

type Platform = "vk" | "telegram";
type ConnectedPlatform = { platform: Platform; page_name: string };
type ImageMode = "ai" | "edit" | null;
type ModelKey = "claude" | "gpt" | "gemini";

interface ModelStats { gens: number; publishes: number }
interface CreatorStats {
  claude: ModelStats; gpt: ModelStats; gemini: ModelStats;
  totalGens: number; currentIdx: number;
}

const MODEL_ROTATION: ModelKey[] = ["claude", "gpt", "gemini"];
const MODEL_LABELS: Record<ModelKey, string> = {
  claude: "Claude Sonnet 4.6",
  gpt: "GPT-5.4",
  gemini: "Gemini 3.1 Flash",
};
const MODEL_COLORS: Record<ModelKey, string> = {
  claude: "#D97706",
  gpt: "#059669",
  gemini: "#4680C2",
};
const STATS_KEY = "creator_stats_v1";

function defaultStats(): CreatorStats {
  return {
    claude: { gens: 0, publishes: 0 },
    gpt: { gens: 0, publishes: 0 },
    gemini: { gens: 0, publishes: 0 },
    totalGens: 0,
    currentIdx: 0,
  };
}

function loadStats(): CreatorStats {
  if (typeof window === "undefined") return defaultStats();
  try {
    const raw = localStorage.getItem(STATS_KEY);
    if (raw) return JSON.parse(raw) as CreatorStats;
  } catch {}
  return defaultStats();
}

function saveStats(s: CreatorStats) {
  localStorage.setItem(STATS_KEY, JSON.stringify(s));
}

function calcRanking(s: CreatorStats): ModelKey[] {
  return (["claude", "gpt", "gemini"] as ModelKey[]).slice().sort((a, b) => {
    const diff = s[b].publishes - s[a].publishes;
    return diff !== 0 ? diff : s[b].gens - s[a].gens;
  });
}

function getNextModel(s: CreatorStats): ModelKey {
  if (s.totalGens >= 50) return calcRanking(s)[0];
  return MODEL_ROTATION[s.currentIdx % 3];
}

const MAX_FILES = 10;

const readFileAsBase64 = (file: File): Promise<{ data: string; mime: string }> =>
  new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = (e) => {
      const result = e.target?.result as string;
      const parts = result.split(",");
      const mime = parts[0].replace("data:", "").replace(";base64", "") || "image/jpeg";
      resolve({ data: parts[1] || "", mime });
    };
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });

export default function PostCreatorPage() {
  const [businessId] = useState(() =>
    typeof window !== "undefined" ? localStorage.getItem("businessId") || "" : ""
  );
  const [connectedPlatforms, setConnectedPlatforms] = useState<ConnectedPlatform[]>([]);

  // ── Block 1 ──────────────────────────────────────────────────────────────
  const [idea, setIdea] = useState("");
  const [ideaUrl, setIdeaUrl] = useState("");
  const [ideaFiles, setIdeaFiles] = useState<File[]>([]);
  const [ideaFilePreviews, setIdeaFilePreviews] = useState<string[]>([]);

  // ── Block 2 ──────────────────────────────────────────────────────────────
  const [postText, setPostText] = useState("");

  // ── Block 3 ──────────────────────────────────────────────────────────────
  const [imageMode, setImageMode] = useState<ImageMode>(null);
  const [imagePrompt, setImagePrompt] = useState("");

  // ── Edit mode ────────────────────────────────────────────────────────────
  const [editBaseIdx, setEditBaseIdx] = useState<number>(0);
  const [editBaseUploaded, setEditBaseUploaded] = useState<{ data: string; mime: string } | null>(null);
  const [editBaseUploadedPreview, setEditBaseUploadedPreview] = useState<string>("");
  const [editInstruction, setEditInstruction] = useState<string>("");

  // ── Block 4 ──────────────────────────────────────────────────────────────
  const [imageBase64, setImageBase64] = useState("");

  // ── Platforms / schedule ─────────────────────────────────────────────────
  const [selectedPlatforms, setSelectedPlatforms] = useState<Platform[]>([]);
  const [publishNow, setPublishNow] = useState(true);
  const [publishDate, setPublishDate] = useState("");
  const [publishTime, setPublishTime] = useState("12:00");

  // ── Loading states ────────────────────────────────────────────────────────
  const [loadingText, setLoadingText] = useState(false);
  const [loadingPrompt, setLoadingPrompt] = useState(false);
  const [loadingImage, setLoadingImage] = useState(false);
  const [publishing, setPublishing] = useState(false);
  const [publishMsg, setPublishMsg] = useState("");

  // ── Model rotation stats ──────────────────────────────────────────────────
  const [creatorStats, setCreatorStats] = useState<CreatorStats>(loadStats);
  const [usedModelForText, setUsedModelForText] = useState<ModelKey>("claude");

  const multiFileRef = useRef<HTMLInputElement>(null);
  const ownPhotoRef = useRef<HTMLInputElement>(null);
  const editBaseRef = useRef<HTMLInputElement>(null);

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

  // ── File handlers ─────────────────────────────────────────────────────────

  const onMultiFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files || []).slice(0, MAX_FILES);
    setIdeaFiles(files);
    const previews = files
      .filter(f => f.type.startsWith("image/"))
      .map(f => URL.createObjectURL(f));
    setIdeaFilePreviews(previews);
    e.target.value = "";
  };

  const removeFile = (idx: number) => {
    const newFiles = ideaFiles.filter((_, i) => i !== idx);
    const newPreviews = ideaFilePreviews.filter((_, i) => i !== idx);
    setIdeaFiles(newFiles);
    setIdeaFilePreviews(newPreviews);
  };

  const onOwnPhoto = (e: React.ChangeEvent<HTMLInputElement>) => {
    const f = e.target.files?.[0];
    if (!f) return;
    const reader = new FileReader();
    reader.onload = (ev) => {
      const result = ev.target?.result as string;
      setImageBase64(result.split(",")[1] || "");
      setImageMode(null);
      setImagePrompt("");
    };
    reader.readAsDataURL(f);
    e.target.value = "";
  };

  const onEditBasePhoto = (e: React.ChangeEvent<HTMLInputElement>) => {
    const f = e.target.files?.[0];
    if (!f) return;
    const reader = new FileReader();
    reader.onload = (ev) => {
      const result = ev.target?.result as string;
      const parts = result.split(",");
      const mime = parts[0].replace("data:", "").replace(";base64", "") || "image/jpeg";
      setEditBaseUploaded({ data: parts[1] || "", mime });
      setEditBaseUploadedPreview(result);
      setEditBaseIdx(-1);
    };
    reader.readAsDataURL(f);
    e.target.value = "";
  };

  // ── AI actions ────────────────────────────────────────────────────────────

  const generateText = async () => {
    if (!idea.trim()) return;
    const model = getNextModel(creatorStats);
    setLoadingText(true);
    setPostText("");
    setImagePrompt("");
    setImageBase64("");
    setImageMode(null);
    try {
      const imageData = await Promise.all(
        ideaFiles.filter(f => f.type.startsWith("image/")).map(readFileAsBase64)
      );
      const { data } = await api.post(`/post-creator/${businessId}/generate-text`, {
        idea,
        url: ideaUrl.trim() || undefined,
        images: imageData.length > 0 ? imageData : undefined,
        model,
      });
      setPostText(data.text);
      setUsedModelForText(model);
      const newStats: CreatorStats = {
        ...creatorStats,
        [model]: { ...creatorStats[model], gens: creatorStats[model].gens + 1 },
        totalGens: creatorStats.totalGens + 1,
        currentIdx: creatorStats.totalGens >= 49
          ? creatorStats.currentIdx
          : (creatorStats.currentIdx + 1) % 3,
      };
      setCreatorStats(newStats);
      saveStats(newStats);
    } catch (e: any) {
      const d = e?.response?.data;
      const detail = (typeof d === "string" ? d : d?.detail) || e?.message || "нет ответа от сервера";
      const status = e?.response?.status ? ` [${e.response.status}]` : "";
      setPostText(`Ошибка${status}: ${typeof detail === "string" ? detail : JSON.stringify(detail)}`);
    } finally {
      setLoadingText(false);
    }
  };

  const generateAiPrompt = async () => {
    if (!postText.trim()) return;
    setLoadingPrompt(true);
    setImageBase64("");
    setImageMode("ai");
    setImagePrompt("");
    try {
      const imageData = await Promise.all(
        ideaFiles.filter(f => f.type.startsWith("image/")).map(readFileAsBase64)
      );
      const { data } = await api.post(`/post-creator/${businessId}/generate-prompt`, {
        post_text: postText,
        idea: idea || undefined,
        url: ideaUrl.trim() || undefined,
        images: imageData.length > 0 ? imageData : undefined,
        model: usedModelForText,
      });
      setImagePrompt(data.prompt);
    } catch (e: any) {
      setImagePrompt("Ошибка: " + (e?.response?.data?.detail || "не удалось создать промт"));
    } finally {
      setLoadingPrompt(false);
    }
  };

  const generateImage = async () => {
    const prompt = imagePrompt.trim();
    if (!prompt) return;
    setLoadingImage(true);
    try {
      const { data } = await api.post(`/post-creator/${businessId}/generate-image`, {
        prompt,
        aspect_ratio: "1:1",
      });
      setImageBase64(data.image_base64);
    } catch (e: any) {
      alert("Ошибка генерации: " + (e?.response?.data?.detail || "попробуй изменить промт"));
    } finally {
      setLoadingImage(false);
    }
  };

  const editImage = async () => {
    if (!editInstruction.trim()) return;

    const hasUploadedBase = !!editBaseUploaded;
    const hasAttachedBase = ideaFiles.length > 0 && editBaseIdx >= 0;

    if (!hasUploadedBase && !hasAttachedBase) {
      alert("Выберите основное фото для редактирования (из прикреплённых или загрузите отдельно)");
      return;
    }

    setLoadingImage(true);
    try {
      let baseImage: { data: string; mime: string };
      let refImages: { data: string; mime: string }[] = [];

      if (hasUploadedBase) {
        baseImage = editBaseUploaded!;
        refImages = await Promise.all(ideaFiles.filter(f => f.type.startsWith("image/")).map(readFileAsBase64));
      } else {
        baseImage = await readFileAsBase64(ideaFiles[editBaseIdx]);
        const refFiles = ideaFiles.filter((_, i) => i !== editBaseIdx && ideaFiles[i].type.startsWith("image/"));
        refImages = await Promise.all(refFiles.map(readFileAsBase64));
      }

      const { data } = await api.post(`/post-creator/${businessId}/edit-image`, {
        base_image: baseImage,
        reference_images: refImages.length > 0 ? refImages : undefined,
        instruction_ru: editInstruction,
      });
      setImageBase64(data.image_base64);
      if (data.instruction_en) setImagePrompt(data.instruction_en);
    } catch (e: any) {
      alert("Ошибка редактирования: " + (e?.response?.data?.detail || "попробуй изменить инструкцию"));
    } finally {
      setLoadingImage(false);
    }
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
      const { data } = await api.post(`/post-creator/${businessId}/publish`, {
        post_text: postText,
        image_prompt: imagePrompt || null,
        image_base64: imageBase64 || null,
        platforms: selectedPlatforms,
        scheduled_at,
      });
      const results: { platform: string; status: string; error?: string; warning?: string }[] = data.results || [];
      const ok = results.filter((r) => r.status === "published");
      const fail = results.filter((r) => r.status === "error" || r.status === "no_connection");
      const warns = results.filter((r) => r.warning).map((r) => r.warning as string);
      if (ok.length > 0) {
        const newStats: CreatorStats = {
          ...creatorStats,
          [usedModelForText]: {
            ...creatorStats[usedModelForText],
            publishes: creatorStats[usedModelForText].publishes + 1,
          },
        };
        setCreatorStats(newStats);
        saveStats(newStats);
      }
      if (ok.length > 0 && fail.length === 0 && warns.length === 0) {
        setPublishMsg("✓ Опубликовано в " + ok.map((r) => r.platform).join(", ") + "!");
      } else if (ok.length > 0 && fail.length === 0) {
        setPublishMsg("✓ Опубликовано. ⚠ " + warns.join(" "));
      } else if (ok.length > 0) {
        const failMsg = fail.map((r) => `${r.platform}: ${r.error}`).join("; ");
        setPublishMsg(`✓ ${ok.map((r) => r.platform).join(", ")} — OK. ⚠ Ошибки: ${failMsg}`);
      } else {
        const failMsg = fail.map((r) => `${r.platform}: ${r.error}`).join("; ");
        setPublishMsg("⚠ " + failMsg);
      }
    } catch (e: any) {
      setPublishMsg("⚠ " + (e?.response?.data?.detail || "Ошибка публикации"));
    } finally {
      setPublishing(false);
    }
  };

  const hasText = !!postText.trim();
  const hasPrompt = !!imagePrompt.trim();
  const hasImage = !!imageBase64;
  const showBlock3 = (imageMode === "ai" && (hasPrompt || loadingPrompt)) || imageMode === "edit";

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
          <span style={{ fontSize: 20 }}>⚡</span>
          <h1 style={{ fontSize: 20, fontWeight: 700, color: "#1a1a1a", margin: 0 }}>
            Быстрый пост
          </h1>
        </div>
      </div>


      <div style={{ maxWidth: 780, margin: "0 auto", padding: "2rem" }}>

        {/* ── 1. Идея ── */}
        <div style={card}>
          {sectionTitle(1, "Опишите идею поста", false)}
          <p style={{ color: "#888", fontSize: 13, margin: "0 0 16px", lineHeight: 1.6 }}>
            Расскажите о мероприятии, продукте, акции. Можно добавить ссылку на сайт или пост в соцсети, прикрепить фото.
          </p>

          {/* URL field */}
          <div style={{ marginBottom: 12 }}>
            <label style={{ fontSize: 12, color: "#888", display: "block", marginBottom: 6 }}>
              🔗 Ссылка на сайт или пост (ИИ проанализирует)
            </label>
            <input
              type="url"
              value={ideaUrl}
              onChange={(e) => setIdeaUrl(e.target.value)}
              placeholder="https://example.com/post или https://vk.com/wall..."
              style={{
                width: "100%", padding: "10px 14px",
                border: "1px solid #E0DED8", borderRadius: 10,
                fontSize: 13, background: "#FAFAF8", outline: "none",
                boxSizing: "border-box",
              }}
            />
          </div>

          {textarea(idea, setIdea,
            "Например: открываем новую точку 20 мая, адрес Ленина 15, скидка 20% на всё меню в день открытия, атмосфера уютного кафе...",
            4
          )}

          {/* Multi-file attach */}
          <div style={{ marginTop: 12 }}>
            <button
              onClick={() => multiFileRef.current?.click()}
              style={{ background: "none", border: "1px solid #E0DED8", borderRadius: 8,
                padding: "7px 14px", cursor: "pointer", fontSize: 12, color: "#666",
                display: "inline-flex", alignItems: "center", gap: 6 }}>
              📎 {ideaFiles.length > 0 ? `Прикреплено фото: ${ideaFiles.length}` : "Прикрепить фото (до 10)"}
            </button>
            {ideaFiles.length > 0 && (
              <span style={{ marginLeft: 10, fontSize: 11, color: "#aaa" }}>
                нажмите ещё раз, чтобы заменить
              </span>
            )}
            <input
              ref={multiFileRef}
              type="file"
              accept="image/*"
              multiple
              style={{ display: "none" }}
              onChange={onMultiFileChange}
            />
          </div>

          {/* File previews */}
          {ideaFilePreviews.length > 0 && (
            <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginTop: 10 }}>
              {ideaFilePreviews.map((src, idx) => (
                <div key={idx} style={{ position: "relative" }}>
                  <img src={src} alt={`file-${idx}`}
                    style={{ width: 72, height: 72, objectFit: "cover",
                      borderRadius: 8, border: "1px solid #EAE8E2" }} />
                  <button
                    onClick={() => removeFile(idx)}
                    style={{
                      position: "absolute", top: -6, right: -6,
                      width: 18, height: 18, borderRadius: "50%",
                      background: "#1a1a1a", border: "none", color: "#fff",
                      cursor: "pointer", fontSize: 10, display: "flex",
                      alignItems: "center", justifyContent: "center", padding: 0,
                    }}>✕</button>
                </div>
              ))}
            </div>
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
            </div>

            {/* Image action buttons */}
            {hasText && (
              <div style={{ marginTop: 18, paddingTop: 16, borderTop: "1px solid #F0EEE8" }}>
                <div style={{ fontSize: 12, color: "#888", marginBottom: 10, fontWeight: 600 }}>
                  Изображение к посту:
                </div>
                <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
                  {btn(
                    loadingPrompt && imageMode === "ai" ? "Создаю промт..." : "🖼 Создать промт фото",
                    generateAiPrompt,
                    { disabled: loadingPrompt, loading: loadingPrompt && imageMode === "ai",
                      color: imageMode === "ai" ? "#0F6E56" : "#4680C2" }
                  )}
                  <button
                    onClick={() => {
                      setImageMode("edit");
                      setImagePrompt("");
                      setImageBase64("");
                      setEditBaseIdx(ideaFiles.length > 0 ? 0 : -1);
                      setEditBaseUploaded(null);
                      setEditBaseUploadedPreview("");
                    }}
                    style={{
                      padding: "10px 22px",
                      background: imageMode === "edit" ? "#6B46C1" : "#fff",
                      color: imageMode === "edit" ? "#fff" : "#555",
                      border: `1.5px solid ${imageMode === "edit" ? "#6B46C1" : "#E0DED8"}`,
                      borderRadius: 10, cursor: "pointer", fontSize: 13, fontWeight: 600,
                      display: "inline-flex", alignItems: "center", gap: 6,
                    }}>
                    ✂️ Редактировать фото
                  </button>
                  <button
                    onClick={() => ownPhotoRef.current?.click()}
                    style={{
                      padding: "10px 22px", background: "#fff",
                      color: "#555", border: "1.5px solid #E0DED8",
                      borderRadius: 10, cursor: "pointer", fontSize: 13, fontWeight: 600,
                      display: "inline-flex", alignItems: "center", gap: 6,
                    }}>
                    📁 Загрузить своё фото
                  </button>
                  <input ref={ownPhotoRef} type="file" accept="image/*"
                    style={{ display: "none" }} onChange={onOwnPhoto} />
                </div>
              </div>
            )}
          </div>
        )}

        {/* ── 3. Промт / Редактирование фото ── */}
        {showBlock3 && (
          <div style={card}>
            {imageMode === "ai" && sectionTitle(3, "Промт для изображения", hasPrompt)}
            {imageMode === "edit" && sectionTitle(3, "Редактирование фото", false)}

            {imageMode === "ai" && (
              <>
                <p style={{ color: "#888", fontSize: 13, margin: "0 0 14px" }}>
                  ИИ проанализировал текст поста, идею, ссылку и фото — составил промт на английском.
                  Отредактируйте при необходимости и нажмите «Сгенерировать».
                </p>
                {loadingPrompt && !hasPrompt ? (
                  <div style={{ padding: "20px 0", color: "#888", fontSize: 13 }}>⏳ Анализирую контент...</div>
                ) : (
                  textarea(imagePrompt, setImagePrompt,
                    "Промт для изображения появится здесь...", 4)
                )}
                <div style={{ display: "flex", gap: 10, marginTop: 14, flexWrap: "wrap" }}>
                  {btn(
                    loadingPrompt ? "Создаю промт..." : "🔄 Пересоздать промт",
                    generateAiPrompt,
                    { disabled: loadingPrompt, loading: loadingPrompt, small: true, color: "#555" }
                  )}
                  {hasPrompt && btn(
                    loadingImage ? "Генерирую..." : "🖼 Сгенерировать изображение",
                    generateImage,
                    { disabled: loadingImage, loading: loadingImage, color: "#4680C2" }
                  )}
                </div>
              </>
            )}

            {imageMode === "edit" && (
              <>
                <p style={{ color: "#888", fontSize: 13, margin: "0 0 16px" }}>
                  Выберите основное фото (которое будет редактироваться), остальные прикреплённые — референсы.
                  Gemini 3.1 Flash Image заменит объекты / изменит фото по вашей инструкции.
                </p>

                {/* Выбор основного фото из прикреплённых */}
                {ideaFilePreviews.length > 0 && (
                  <div style={{ marginBottom: 16 }}>
                    <div style={{ fontSize: 12, color: "#666", fontWeight: 600, marginBottom: 8 }}>
                      Основное фото (нажмите, чтобы выбрать):
                    </div>
                    <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                      {ideaFilePreviews.map((src, idx) => (
                        <div
                          key={idx}
                          onClick={() => { setEditBaseIdx(idx); setEditBaseUploaded(null); setEditBaseUploadedPreview(""); }}
                          style={{
                            position: "relative", cursor: "pointer",
                            border: editBaseIdx === idx && !editBaseUploaded ? "3px solid #6B46C1" : "2px solid #E0DED8",
                            borderRadius: 10, overflow: "hidden",
                          }}>
                          <img src={src} alt={`base-${idx}`}
                            style={{ width: 72, height: 72, objectFit: "cover", display: "block" }} />
                          {editBaseIdx === idx && !editBaseUploaded && (
                            <div style={{
                              position: "absolute", bottom: 0, left: 0, right: 0,
                              background: "#6B46C1", color: "#fff",
                              fontSize: 9, fontWeight: 700, textAlign: "center", padding: "2px 0",
                            }}>ОСНОВА</div>
                          )}
                        </div>
                      ))}
                    </div>
                    {editBaseIdx >= 0 && !editBaseUploaded && ideaFilePreviews.length > 1 && (
                      <div style={{ fontSize: 11, color: "#888", marginTop: 6 }}>
                        Остальные {ideaFilePreviews.length - 1} фото → референсы для ИИ
                      </div>
                    )}
                  </div>
                )}

                {/* Загрузка другого основного фото */}
                <div style={{ marginBottom: 16 }}>
                  <button
                    onClick={() => editBaseRef.current?.click()}
                    style={{
                      background: editBaseUploaded ? "#F0EBF8" : "none",
                      border: `1px solid ${editBaseUploaded ? "#6B46C1" : "#E0DED8"}`,
                      borderRadius: 8, padding: "7px 14px", cursor: "pointer",
                      fontSize: 12, color: editBaseUploaded ? "#6B46C1" : "#666",
                      display: "inline-flex", alignItems: "center", gap: 6,
                    }}>
                    {editBaseUploaded ? "✓ Другое основное фото загружено" : "📂 Загрузить другое основное фото"}
                  </button>
                  <input ref={editBaseRef} type="file" accept="image/*"
                    style={{ display: "none" }} onChange={onEditBasePhoto} />
                  {editBaseUploadedPreview && (
                    <img src={editBaseUploadedPreview} alt="edit-base"
                      style={{ display: "block", marginTop: 8, width: 120, height: 120,
                        objectFit: "cover", borderRadius: 10, border: "2px solid #6B46C1" }} />
                  )}
                </div>

                {/* Инструкция */}
                <div style={{ fontSize: 12, color: "#666", fontWeight: 600, marginBottom: 6 }}>
                  Инструкция по редактированию (на русском):
                </div>
                {textarea(editInstruction, setEditInstruction,
                  "Например: замени шоколадки в коробке на товары из референс-фото (чупа-чупс, Hershey's, Mountain Dew). Сохрани кубик, фон и общую композицию. Сделай вид как для рекламной съёмки.", 5)}

                <div style={{ marginTop: 14 }}>
                  {btn(
                    loadingImage ? "Редактирую..." : "✂️ Редактировать",
                    editImage,
                    {
                      disabled: !editInstruction.trim() || loadingImage
                        || (ideaFiles.length === 0 && !editBaseUploaded),
                      loading: loadingImage, color: "#6B46C1",
                    }
                  )}
                </div>
              </>
            )}
          </div>
        )}

        {/* ── 4. Изображение ── */}
        {(hasImage || loadingImage) && (
          <div style={card}>
            {sectionTitle(4, "Изображение", hasImage)}
            {loadingImage && !hasImage && (
              <div style={{ padding: "40px 0", textAlign: "center", color: "#888" }}>
                ⏳ Генерирую изображение...
              </div>
            )}
            {hasImage && (
              <img
                src={`data:image/png;base64,${imageBase64}`}
                alt="generated"
                style={{ width: 280, height: 280, objectFit: "cover",
                  borderRadius: 14, border: "1px solid #EAE8E2", display: "block" }}
              />
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
              {publishing ? "⏳ Публикую..." : "🚀 Отправить на публикацию"}
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
