"use client";

import React, { useCallback, useEffect, useRef, useState } from "react";
import api from "@/lib/api";

type Platform = "vk" | "telegram";
type ConnectedPlatform = { platform: Platform; page_name: string };
type ModelKey = "claude" | "gpt";

const MODEL_LABELS: Record<ModelKey, string> = {
  claude: "Claude Sonnet 4.6",
  gpt: "GPT-5.4",
};
const MODEL_COLORS: Record<ModelKey, string> = {
  claude: "#D97706",
  gpt: "#059669",
};

const MAX_TEXT_ATTEMPTS = 3;
const MAX_IMAGE_ATTEMPTS = 3;
const MAX_EDITS = 3;
const MAX_FILES = 10;
const DRAFT_KEY_PREFIX = "qp_draft_v1_";

interface Draft {
  idea: string;
  ideaUrl: string;
  postText: string;
  textHistory: string[];
  currentTextIdx: number;
  textGenCount: number;
  imagePrompt: string;
  imageBase64: string;
  imageGenCount: number;
  editCount: number;
  selectedPlatforms: Platform[];
  publishNow: boolean;
  publishDate: string;
  publishTime: string;
  usedModel: ModelKey;
}

function loadDraft(businessId: string): Draft | null {
  if (typeof window === "undefined" || !businessId) return null;
  try {
    const raw = localStorage.getItem(DRAFT_KEY_PREFIX + businessId);
    if (raw) return JSON.parse(raw) as Draft;
  } catch {}
  return null;
}

function saveDraft(businessId: string, draft: Draft) {
  if (!businessId) return;
  localStorage.setItem(DRAFT_KEY_PREFIX + businessId, JSON.stringify(draft));
}

function clearDraft(businessId: string) {
  if (!businessId) return;
  localStorage.removeItem(DRAFT_KEY_PREFIX + businessId);
}

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

// ── Styles ─────────────────────────────────────────────────────────────────────

const card: React.CSSProperties = {
  background: "#fff",
  border: "1px solid #EAE8E2",
  borderRadius: 18,
  padding: "28px 32px",
  marginBottom: 16,
};

function SectionTitle({ n, label, done }: { n: number; label: string; done: boolean }) {
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 18 }}>
      <div style={{
        width: 28, height: 28, borderRadius: "50%", display: "flex",
        alignItems: "center", justifyContent: "center", flexShrink: 0,
        fontSize: 13, fontWeight: 700,
        background: done ? "#0F6E56" : "#1a1a1a", color: "#fff",
      }}>
        {done ? "✓" : n}
      </div>
      <div style={{ fontSize: 16, fontWeight: 700, color: "#1a1a1a" }}>{label}</div>
    </div>
  );
}

function Btn({
  label, onClick, disabled, loading, color, small,
}: {
  label: string; onClick: () => void; disabled?: boolean;
  loading?: boolean; color?: string; small?: boolean;
}) {
  return (
    <button
      onClick={onClick}
      disabled={disabled || loading}
      style={{
        padding: small ? "7px 16px" : "10px 22px",
        background: (disabled || loading) ? "#E0DED8" : (color || "#1a1a1a"),
        color: (disabled || loading) ? "#aaa" : "#fff",
        border: "none", borderRadius: 10,
        cursor: (disabled || loading) ? "not-allowed" : "pointer",
        fontSize: small ? 12 : 13, fontWeight: 600,
        display: "inline-flex", alignItems: "center", gap: 6,
        opacity: loading ? 0.7 : 1, transition: "opacity 0.15s",
      }}
    >
      {loading ? "⏳ " : ""}{label}
    </button>
  );
}

function Textarea({
  value, onChange, placeholder, rows = 5,
}: { value: string; onChange: (v: string) => void; placeholder: string; rows?: number }) {
  return (
    <textarea
      value={value}
      onChange={(e) => onChange(e.target.value)}
      placeholder={placeholder}
      rows={rows}
      style={{
        width: "100%", padding: "12px 16px",
        border: "1px solid #E0DED8", borderRadius: 12,
        fontSize: 13, fontFamily: "inherit", lineHeight: 1.7,
        background: "#FAFAF8", resize: "vertical", boxSizing: "border-box", outline: "none",
      }}
    />
  );
}

function AttemptBadge({ current, max, label }: { current: number; max: number; label: string }) {
  const left = max - current;
  const color = left === 0 ? "#DC2626" : left === 1 ? "#D97706" : "#0F6E56";
  return (
    <span style={{
      fontSize: 11, color, background: color + "15",
      border: `1px solid ${color}30`,
      borderRadius: 12, padding: "2px 9px", fontWeight: 600,
    }}>
      {label}: {current}/{max}
    </span>
  );
}

const PLATFORM_META: Record<Platform, { label: string; color: string; icon: string }> = {
  vk:       { label: "ВКонтакте", color: "#4680C2", icon: "В" },
  telegram: { label: "Telegram",  color: "#229ED9", icon: "✈" },
};

// ── Main component ─────────────────────────────────────────────────────────────

export default function PostCreatorPage() {
  const [businessId] = useState(() =>
    typeof window !== "undefined" ? localStorage.getItem("businessId") || "" : ""
  );
  const [connectedPlatforms, setConnectedPlatforms] = useState<ConnectedPlatform[]>([]);
  const [draftSaved, setDraftSaved] = useState(false);

  // ── Block 1 ───────────────────────────────────────────────────────────────
  const [idea, setIdea] = useState("");
  const [ideaUrl, setIdeaUrl] = useState("");
  const [ideaFiles, setIdeaFiles] = useState<File[]>([]);
  const [ideaFilePreviews, setIdeaFilePreviews] = useState<string[]>([]);

  // ── Block 2: Text + history ───────────────────────────────────────────────
  const [textHistory, setTextHistory] = useState<string[]>([]);
  const [currentTextIdx, setCurrentTextIdx] = useState(-1);
  const [textGenCount, setTextGenCount] = useState(0);
  const [postText, setPostText] = useState("");
  const [usedModel, setUsedModel] = useState<ModelKey>("claude");

  // ── Block 3: Prompt (user-written) ────────────────────────────────────────
  const [showPromptBlock, setShowPromptBlock] = useState(false);
  const [imagePrompt, setImagePrompt] = useState("");

  // ── Block 4: Image + inline edit ─────────────────────────────────────────
  const [imageBase64, setImageBase64] = useState("");
  const [imageGenCount, setImageGenCount] = useState(0);
  const [inlineEditInstruction, setInlineEditInstruction] = useState("");
  const [editCount, setEditCount] = useState(0);
  const [showInlineEdit, setShowInlineEdit] = useState(false);

  // ── Platforms / schedule ──────────────────────────────────────────────────
  const [selectedPlatforms, setSelectedPlatforms] = useState<Platform[]>([]);
  const [publishNow, setPublishNow] = useState(true);
  const [publishDate, setPublishDate] = useState("");
  const [publishTime, setPublishTime] = useState("12:00");

  // ── Loading states ────────────────────────────────────────────────────────
  const [loadingText, setLoadingText] = useState(false);
  const [loadingImage, setLoadingImage] = useState(false);
  const [publishing, setPublishing] = useState(false);
  const [publishMsg, setPublishMsg] = useState("");

  const multiFileRef = useRef<HTMLInputElement>(null);
  const ownPhotoRef = useRef<HTMLInputElement>(null);

  // ── Draft persistence ─────────────────────────────────────────────────────

  const buildDraft = useCallback((): Draft => ({
    idea, ideaUrl, postText, textHistory, currentTextIdx, textGenCount,
    imagePrompt, imageBase64, imageGenCount, editCount,
    selectedPlatforms, publishNow, publishDate, publishTime, usedModel,
  }), [idea, ideaUrl, postText, textHistory, currentTextIdx, textGenCount,
       imagePrompt, imageBase64, imageGenCount, editCount,
       selectedPlatforms, publishNow, publishDate, publishTime, usedModel]);

  // Save draft on any relevant state change
  useEffect(() => {
    if (!businessId) return;
    const draft = buildDraft();
    const hasContent = idea || postText || imageBase64 || imagePrompt;
    if (!hasContent) return;
    saveDraft(businessId, draft);
    setDraftSaved(true);
    const t = setTimeout(() => setDraftSaved(false), 2000);
    return () => clearTimeout(t);
  }, [idea, ideaUrl, postText, textHistory, currentTextIdx, imagePrompt,
      imageBase64, selectedPlatforms, publishNow, publishDate, publishTime]);

  // Load draft + platforms on mount
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

    const draft = loadDraft(businessId);
    if (draft) {
      setIdea(draft.idea || "");
      setIdeaUrl(draft.ideaUrl || "");
      setPostText(draft.postText || "");
      setTextHistory(draft.textHistory || []);
      setCurrentTextIdx(draft.currentTextIdx ?? -1);
      setTextGenCount(draft.textGenCount || 0);
      setImagePrompt(draft.imagePrompt || "");
      setImageBase64(draft.imageBase64 || "");
      setImageGenCount(draft.imageGenCount || 0);
      setEditCount(draft.editCount || 0);
      setSelectedPlatforms(draft.selectedPlatforms || []);
      setPublishNow(draft.publishNow ?? true);
      if (draft.publishDate) setPublishDate(draft.publishDate);
      setPublishTime(draft.publishTime || "12:00");
      setUsedModel(draft.usedModel || "claude");
      if (draft.imagePrompt) setShowPromptBlock(true);
    }
  }, [businessId]);

  // ── File handlers ─────────────────────────────────────────────────────────

  const onMultiFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files || []).slice(0, MAX_FILES);
    setIdeaFiles(files);
    const previews = files.filter(f => f.type.startsWith("image/")).map(f => URL.createObjectURL(f));
    setIdeaFilePreviews(previews);
    e.target.value = "";
  };

  const removeFile = (idx: number) => {
    setIdeaFiles(ideaFiles.filter((_, i) => i !== idx));
    setIdeaFilePreviews(ideaFilePreviews.filter((_, i) => i !== idx));
  };

  const onOwnPhoto = (e: React.ChangeEvent<HTMLInputElement>) => {
    const f = e.target.files?.[0];
    if (!f) return;
    const reader = new FileReader();
    reader.onload = (ev) => {
      const result = ev.target?.result as string;
      setImageBase64(result.split(",")[1] || "");
    };
    reader.readAsDataURL(f);
    e.target.value = "";
  };

  // ── AI actions ─────────────────────────────────────────────────────────────

  const generateText = async () => {
    if (!idea.trim() || textGenCount >= MAX_TEXT_ATTEMPTS) return;
    setLoadingText(true);
    try {
      const imageData = await Promise.all(
        ideaFiles.filter(f => f.type.startsWith("image/")).map(readFileAsBase64)
      );
      const { data } = await api.post(`/post-creator/${businessId}/generate-text`, {
        idea,
        url: ideaUrl.trim() || undefined,
        images: imageData.length > 0 ? imageData : undefined,
      });
      const newText: string = data.text;
      const newModel: ModelKey = data.model_used === "gpt" ? "gpt" : "claude";
      const newHistory = [...textHistory, newText];
      const newIdx = newHistory.length - 1;
      const newCount = textGenCount + 1;
      setTextHistory(newHistory);
      setCurrentTextIdx(newIdx);
      setPostText(newText);
      setTextGenCount(newCount);
      setUsedModel(newModel);
    } catch (e: any) {
      const d = e?.response?.data;
      const detail = (typeof d === "string" ? d : d?.detail) || e?.message || "нет ответа";
      const status = e?.response?.status ? ` [${e.response.status}]` : "";
      const errText = `Ошибка${status}: ${typeof detail === "string" ? detail : JSON.stringify(detail)}`;
      const newHistory = [...textHistory, errText];
      setTextHistory(newHistory);
      setCurrentTextIdx(newHistory.length - 1);
      setPostText(errText);
      setTextGenCount(textGenCount + 1);
    } finally {
      setLoadingText(false);
    }
  };

  const navigateText = (dir: -1 | 1) => {
    const newIdx = currentTextIdx + dir;
    if (newIdx < 0 || newIdx >= textHistory.length) return;
    setCurrentTextIdx(newIdx);
    setPostText(textHistory[newIdx]);
  };

  const generateImage = async () => {
    const prompt = imagePrompt.trim();
    if (!prompt || imageGenCount >= MAX_IMAGE_ATTEMPTS) return;
    setLoadingImage(true);
    try {
      const { data } = await api.post(`/post-creator/${businessId}/generate-image`, {
        prompt,
        aspect_ratio: "1:1",
      });
      setImageBase64(data.image_base64);
      setImageGenCount(imageGenCount + 1);
      setShowInlineEdit(false);
      setInlineEditInstruction("");
    } catch (e: any) {
      alert("Ошибка генерации: " + (e?.response?.data?.detail || "попробуй изменить промт"));
    } finally {
      setLoadingImage(false);
    }
  };

  const editImageInline = async () => {
    if (!inlineEditInstruction.trim() || !imageBase64 || editCount >= MAX_EDITS) return;
    setLoadingImage(true);
    try {
      const { data } = await api.post(`/post-creator/${businessId}/edit-image`, {
        base_image: { data: imageBase64, mime: "image/png" },
        instruction_ru: inlineEditInstruction,
      });
      setImageBase64(data.image_base64);
      setEditCount(editCount + 1);
      setInlineEditInstruction("");
      setShowInlineEdit(false);
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

  const resetForm = () => {
    setIdea(""); setIdeaUrl(""); setIdeaFiles([]); setIdeaFilePreviews([]);
    setPostText(""); setTextHistory([]); setCurrentTextIdx(-1); setTextGenCount(0);
    setImagePrompt(""); setShowPromptBlock(false);
    setImageBase64(""); setImageGenCount(0); setEditCount(0); setShowInlineEdit(false);
    setInlineEditInstruction("");
    setSelectedPlatforms([]); setPublishNow(true); setPublishMsg("");
  };

  const deletePost = () => {
    clearDraft(businessId);
    resetForm();
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
      if (ok.length > 0 && fail.length === 0 && warns.length === 0) {
        setPublishMsg("✓ Опубликовано в " + ok.map((r) => r.platform).join(", ") + "!");
        clearDraft(businessId);
        resetForm();
      } else if (ok.length > 0 && fail.length === 0) {
        setPublishMsg("✓ Опубликовано. ⚠ " + warns.join(" "));
        clearDraft(businessId);
      } else if (ok.length > 0) {
        setPublishMsg(`✓ ${ok.map((r) => r.platform).join(", ")} — OK. ⚠ ${fail.map((r) => `${r.platform}: ${r.error}`).join("; ")}`);
      } else {
        setPublishMsg("⚠ " + fail.map((r) => `${r.platform}: ${r.error}`).join("; "));
      }
    } catch (e: any) {
      setPublishMsg("⚠ " + (e?.response?.data?.detail || "Ошибка публикации"));
    } finally {
      setPublishing(false);
    }
  };

  const hasText = !!postText.trim();
  const hasImage = !!imageBase64;

  // ── Render ─────────────────────────────────────────────────────────────────

  return (
    <div style={{ minHeight: "100vh", background: "#F8F7F4", fontFamily: "'Segoe UI', sans-serif" }}>
      {/* Header */}
      <div style={{ background: "#fff", borderBottom: "1px solid #EAE8E2", padding: "0 2rem" }}>
        <div style={{ maxWidth: 780, margin: "0 auto", height: 64,
          display: "flex", alignItems: "center", justifyContent: "space-between" }}>
          <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
            <span style={{ fontSize: 20 }}>⚡</span>
            <h1 style={{ fontSize: 20, fontWeight: 700, color: "#1a1a1a", margin: 0 }}>
              Быстрый пост
            </h1>
            {draftSaved && (
              <span style={{ fontSize: 11, color: "#0F6E56", background: "#E1F5EE",
                borderRadius: 8, padding: "2px 8px", fontWeight: 600 }}>
                Черновик сохранён
              </span>
            )}
          </div>
          {(hasText || idea) && (
            <button
              onClick={deletePost}
              style={{ padding: "7px 16px", background: "none", border: "1.5px solid #DC2626",
                borderRadius: 10, color: "#DC2626", cursor: "pointer",
                fontSize: 13, fontWeight: 600 }}>
              Удалить пост
            </button>
          )}
        </div>
      </div>

      <div style={{ maxWidth: 780, margin: "0 auto", padding: "2rem" }}>

        {/* ── 1. Идея ── */}
        <div style={card}>
          <SectionTitle n={1} label="Опишите идею поста" done={false} />
          <p style={{ color: "#888", fontSize: 13, margin: "0 0 16px", lineHeight: 1.6 }}>
            Расскажите о мероприятии, продукте, акции. Можно добавить ссылку или прикрепить фото.
          </p>

          <div style={{ marginBottom: 12 }}>
            <label style={{ fontSize: 12, color: "#888", display: "block", marginBottom: 6 }}>
              🔗 Ссылка на сайт или пост (ИИ проанализирует)
            </label>
            <input
              type="url"
              value={ideaUrl}
              onChange={(e) => setIdeaUrl(e.target.value)}
              placeholder="https://example.com/post или https://vk.com/wall..."
              style={{ width: "100%", padding: "10px 14px",
                border: "1px solid #E0DED8", borderRadius: 10,
                fontSize: 13, background: "#FAFAF8", outline: "none", boxSizing: "border-box" }}
            />
          </div>

          <Textarea value={idea} onChange={setIdea}
            placeholder="Например: открываем новую точку 20 мая, адрес Ленина 15, скидка 20%..." rows={4} />

          <div style={{ marginTop: 12 }}>
            <button
              onClick={() => multiFileRef.current?.click()}
              style={{ background: "none", border: "1px solid #E0DED8", borderRadius: 8,
                padding: "7px 14px", cursor: "pointer", fontSize: 12, color: "#666",
                display: "inline-flex", alignItems: "center", gap: 6 }}>
              📎 {ideaFiles.length > 0 ? `Прикреплено фото: ${ideaFiles.length}` : "Прикрепить фото (до 10)"}
            </button>
            <input ref={multiFileRef} type="file" accept="image/*" multiple
              style={{ display: "none" }} onChange={onMultiFileChange} />
          </div>

          {ideaFilePreviews.length > 0 && (
            <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginTop: 10 }}>
              {ideaFilePreviews.map((src, idx) => (
                <div key={idx} style={{ position: "relative" }}>
                  <img src={src} alt={`file-${idx}`}
                    style={{ width: 72, height: 72, objectFit: "cover",
                      borderRadius: 8, border: "1px solid #EAE8E2" }} />
                  <button onClick={() => removeFile(idx)}
                    style={{ position: "absolute", top: -6, right: -6,
                      width: 18, height: 18, borderRadius: "50%",
                      background: "#1a1a1a", border: "none", color: "#fff",
                      cursor: "pointer", fontSize: 10, display: "flex",
                      alignItems: "center", justifyContent: "center", padding: 0 }}>✕</button>
                </div>
              ))}
            </div>
          )}

          <div style={{ marginTop: 20, display: "flex", alignItems: "center", gap: 12, flexWrap: "wrap" }}>
            <Btn
              label={loadingText ? "Генерирую текст..." : "✨ Сгенерировать текст"}
              onClick={generateText}
              disabled={!idea.trim() || loadingText || textGenCount >= MAX_TEXT_ATTEMPTS}
              loading={loadingText}
            />
            {textGenCount > 0 && (
              <AttemptBadge current={textGenCount} max={MAX_TEXT_ATTEMPTS} label="Попыток" />
            )}
          </div>
          {textGenCount >= MAX_TEXT_ATTEMPTS && (
            <div style={{ marginTop: 8, fontSize: 12, color: "#DC2626" }}>
              Достигнут лимит попыток генерации текста ({MAX_TEXT_ATTEMPTS}).
            </div>
          )}
        </div>

        {/* ── 2. Текст поста ── */}
        {(hasText || loadingText) && (
          <div style={card}>
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 18 }}>
              <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
                <div style={{ width: 28, height: 28, borderRadius: "50%", display: "flex",
                  alignItems: "center", justifyContent: "center", flexShrink: 0,
                  fontSize: 13, fontWeight: 700,
                  background: hasText ? "#0F6E56" : "#1a1a1a", color: "#fff" }}>
                  {hasText ? "✓" : 2}
                </div>
                <div style={{ fontSize: 16, fontWeight: 700, color: "#1a1a1a" }}>Текст поста</div>
              </div>
              {hasText && (
                <span style={{ fontSize: 11, color: MODEL_COLORS[usedModel],
                  background: MODEL_COLORS[usedModel] + "15",
                  border: `1px solid ${MODEL_COLORS[usedModel]}30`,
                  borderRadius: 12, padding: "2px 9px", fontWeight: 600 }}>
                  {MODEL_LABELS[usedModel]}
                </span>
              )}
            </div>

            <p style={{ color: "#888", fontSize: 13, margin: "0 0 14px" }}>
              Отредактируйте текст по необходимости.
            </p>

            <Textarea value={postText} onChange={(v) => {
              setPostText(v);
              // update current history slot on manual edit
              if (currentTextIdx >= 0) {
                const updated = [...textHistory];
                updated[currentTextIdx] = v;
                setTextHistory(updated);
              }
            }} placeholder="Здесь появится сгенерированный текст..." rows={14} />

            {/* History navigation */}
            {textHistory.length > 1 && (
              <div style={{ display: "flex", alignItems: "center", gap: 12, marginTop: 12 }}>
                <button onClick={() => navigateText(-1)} disabled={currentTextIdx <= 0}
                  style={{ padding: "5px 12px", border: "1px solid #E0DED8", borderRadius: 8,
                    background: "#fff", cursor: currentTextIdx <= 0 ? "not-allowed" : "pointer",
                    fontSize: 13, color: currentTextIdx <= 0 ? "#ccc" : "#555" }}>
                  ← Пред.
                </button>
                <span style={{ fontSize: 12, color: "#888" }}>
                  Вариант {currentTextIdx + 1} из {textHistory.length}
                </span>
                <button onClick={() => navigateText(1)} disabled={currentTextIdx >= textHistory.length - 1}
                  style={{ padding: "5px 12px", border: "1px solid #E0DED8", borderRadius: 8,
                    background: "#fff",
                    cursor: currentTextIdx >= textHistory.length - 1 ? "not-allowed" : "pointer",
                    fontSize: 13, color: currentTextIdx >= textHistory.length - 1 ? "#ccc" : "#555" }}>
                  След. →
                </button>
              </div>
            )}

            {/* Image action buttons */}
            {hasText && (
              <div style={{ marginTop: 18, paddingTop: 16, borderTop: "1px solid #F0EEE8" }}>
                <div style={{ fontSize: 12, color: "#888", marginBottom: 10, fontWeight: 600 }}>
                  Изображение к посту:
                </div>
                <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
                  <button
                    onClick={() => {
                      setShowPromptBlock(true);
                      if (!imagePrompt) setImagePrompt("");
                    }}
                    style={{ padding: "10px 22px",
                      background: showPromptBlock ? "#0F6E56" : "#4680C2",
                      color: "#fff", border: "none", borderRadius: 10,
                      cursor: "pointer", fontSize: 13, fontWeight: 600,
                      display: "inline-flex", alignItems: "center", gap: 6 }}>
                    🖼 Создать промт фото
                  </button>
                  <button
                    onClick={() => ownPhotoRef.current?.click()}
                    style={{ padding: "10px 22px", background: "#fff",
                      color: "#555", border: "1.5px solid #E0DED8",
                      borderRadius: 10, cursor: "pointer", fontSize: 13, fontWeight: 600,
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

        {/* ── 3. Промт для фото (пустое поле, пользователь пишет сам) ── */}
        {showPromptBlock && (
          <div style={card}>
            <SectionTitle n={3} label="Промт для изображения" done={!!imagePrompt.trim()} />
            <p style={{ color: "#888", fontSize: 13, margin: "0 0 14px" }}>
              Напишите промт на английском — опишите что должно быть на изображении.
            </p>
            <Textarea value={imagePrompt} onChange={setImagePrompt}
              placeholder="A professional product photo of a coffee cup on a wooden table, warm lighting, bokeh background, photorealistic..."
              rows={4} />
            <div style={{ display: "flex", alignItems: "center", gap: 12, marginTop: 14, flexWrap: "wrap" }}>
              {imagePrompt.trim() && (
                <Btn
                  label={loadingImage ? "Генерирую..." : "🖼 Сгенерировать изображение"}
                  onClick={generateImage}
                  disabled={loadingImage || imageGenCount >= MAX_IMAGE_ATTEMPTS}
                  loading={loadingImage}
                  color="#4680C2"
                />
              )}
              {imageGenCount > 0 && (
                <AttemptBadge current={imageGenCount} max={MAX_IMAGE_ATTEMPTS} label="Генераций" />
              )}
            </div>
            {imageGenCount >= MAX_IMAGE_ATTEMPTS && (
              <div style={{ marginTop: 8, fontSize: 12, color: "#DC2626" }}>
                Достигнут лимит генераций изображения ({MAX_IMAGE_ATTEMPTS}).
              </div>
            )}
          </div>
        )}

        {/* ── 4. Изображение + инлайн редактирование ── */}
        {(hasImage || loadingImage) && (
          <div style={card}>
            <SectionTitle n={4} label="Изображение" done={hasImage} />
            {loadingImage && !hasImage && (
              <div style={{ padding: "40px 0", textAlign: "center", color: "#888" }}>
                ⏳ Генерирую изображение...
              </div>
            )}
            {hasImage && (
              <>
                <img
                  src={`data:image/png;base64,${imageBase64}`}
                  alt="generated"
                  style={{ width: 280, height: 280, objectFit: "cover",
                    borderRadius: 14, border: "1px solid #EAE8E2", display: "block" }}
                />

                {/* Inline edit section */}
                <div style={{ marginTop: 20, paddingTop: 16, borderTop: "1px solid #F0EEE8" }}>
                  <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 10 }}>
                    <div style={{ fontSize: 14, fontWeight: 700, color: "#1a1a1a" }}>
                      Редактировать изображение
                    </div>
                    <AttemptBadge current={editCount} max={MAX_EDITS} label="Правок" />
                  </div>

                  {!showInlineEdit && editCount < MAX_EDITS && (
                    <button
                      onClick={() => setShowInlineEdit(true)}
                      style={{ padding: "8px 18px", background: "none",
                        border: "1.5px solid #6B46C1", borderRadius: 10,
                        color: "#6B46C1", cursor: "pointer", fontSize: 13, fontWeight: 600 }}>
                      ✏️ Внести правки
                    </button>
                  )}

                  {showInlineEdit && (
                    <>
                      <Textarea
                        value={inlineEditInstruction}
                        onChange={setInlineEditInstruction}
                        placeholder="Например: измени фон на белый, добавь логотип в правый нижний угол..."
                        rows={3}
                      />
                      <div style={{ display: "flex", gap: 10, marginTop: 10 }}>
                        <Btn
                          label={loadingImage ? "Редактирую..." : "Обновить"}
                          onClick={editImageInline}
                          disabled={!inlineEditInstruction.trim() || loadingImage || editCount >= MAX_EDITS}
                          loading={loadingImage}
                          color="#6B46C1"
                          small
                        />
                        <button
                          onClick={() => { setShowInlineEdit(false); setInlineEditInstruction(""); }}
                          style={{ padding: "7px 14px", background: "none",
                            border: "1px solid #E0DED8", borderRadius: 8,
                            cursor: "pointer", fontSize: 12, color: "#666" }}>
                          Отмена
                        </button>
                      </div>
                    </>
                  )}

                  {editCount >= MAX_EDITS && (
                    <div style={{ fontSize: 12, color: "#DC2626", marginTop: 6 }}>
                      Достигнут лимит правок ({MAX_EDITS}).
                    </div>
                  )}
                </div>
              </>
            )}
          </div>
        )}

        {/* ── 5. Платформы ── */}
        {hasText && (
          <div style={card}>
            <SectionTitle n={5} label="Куда публиковать" done={selectedPlatforms.length > 0} />
            <p style={{ color: "#888", fontSize: 13, margin: "0 0 16px" }}>
              Выберите одну или несколько подключённых платформ.
            </p>
            <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
              {connectedPlatforms.length === 0 && (
                <div style={{ fontSize: 13, color: "#aaa" }}>
                  Нет подключённых платформ.{" "}
                  <a href="/platforms" style={{ color: "#1a1a1a", fontWeight: 600 }}>Подключить →</a>
                </div>
              )}
              {connectedPlatforms.map(({ platform, page_name }) => {
                const meta = PLATFORM_META[platform];
                const active = selectedPlatforms.includes(platform);
                return (
                  <button key={platform} onClick={() => togglePlatform(platform)}
                    style={{ padding: "10px 20px", borderRadius: 12, border: "2px solid",
                      borderColor: active ? meta.color : "#E0DED8",
                      background: active ? meta.color + "18" : "#fff",
                      cursor: "pointer", display: "flex", alignItems: "center", gap: 8,
                      transition: "all 0.15s" }}>
                    <span style={{ fontSize: 15, fontWeight: 700, color: meta.color }}>{meta.icon}</span>
                    <div style={{ textAlign: "left" }}>
                      <div style={{ fontSize: 13, fontWeight: 600, color: active ? meta.color : "#1a1a1a" }}>
                        {meta.label}
                      </div>
                      <div style={{ fontSize: 11, color: "#aaa" }}>{page_name}</div>
                    </div>
                    {active && <span style={{ marginLeft: 4, fontSize: 13, color: meta.color }}>✓</span>}
                  </button>
                );
              })}
            </div>
          </div>
        )}

        {/* ── 6. Расписание ── */}
        {hasText && selectedPlatforms.length > 0 && (
          <div style={card}>
            <SectionTitle n={6} label="Время публикации" done={false} />
            <div style={{ display: "flex", gap: 10, marginBottom: 16, flexWrap: "wrap" }}>
              <button onClick={() => setPublishNow(true)}
                style={{ padding: "9px 20px", borderRadius: 10, border: "2px solid",
                  borderColor: publishNow ? "#1a1a1a" : "#E0DED8",
                  background: publishNow ? "#1a1a1a" : "#fff",
                  color: publishNow ? "#fff" : "#666",
                  cursor: "pointer", fontSize: 13, fontWeight: 600 }}>
                ⚡ Опубликовать сейчас
              </button>
              <button onClick={() => setPublishNow(false)}
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
                  <label style={{ fontSize: 12, color: "#888", display: "block", marginBottom: 4 }}>Дата</label>
                  <input type="date" value={publishDate} onChange={(e) => setPublishDate(e.target.value)}
                    style={{ padding: "9px 14px", border: "1px solid #E0DED8",
                      borderRadius: 10, fontSize: 13, background: "#FAFAF8", outline: "none" }} />
                </div>
                <div>
                  <label style={{ fontSize: 12, color: "#888", display: "block", marginBottom: 4 }}>Время</label>
                  <input type="time" value={publishTime} onChange={(e) => setPublishTime(e.target.value)}
                    style={{ padding: "9px 14px", border: "1px solid #E0DED8",
                      borderRadius: 10, fontSize: 13, background: "#FAFAF8", outline: "none" }} />
                </div>
              </div>
            )}
          </div>
        )}

        {/* ── Финальные кнопки ── */}
        {hasText && selectedPlatforms.length > 0 && (
          <div style={{ marginTop: 8 }}>
            <button
              onClick={publish}
              disabled={publishing}
              style={{ width: "100%", padding: "16px", borderRadius: 14, border: "none",
                background: publishing ? "#888" : "#1a1a1a",
                color: "#fff", fontSize: 16, fontWeight: 700,
                cursor: publishing ? "not-allowed" : "pointer",
                display: "flex", alignItems: "center", justifyContent: "center", gap: 10,
                letterSpacing: 0.3 }}>
              {publishing ? "⏳ Публикую..." : "🚀 Отправить на публикацию"}
            </button>

            {publishMsg && (
              <div style={{ marginTop: 14, padding: "14px 20px", borderRadius: 12,
                background: publishMsg.startsWith("✓") ? "#E1F5EE" : "#FFF3CD",
                color: publishMsg.startsWith("✓") ? "#0F6E56" : "#856404",
                fontSize: 14, fontWeight: 600, textAlign: "center" }}>
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

        {/* Кнопка удаления внизу страницы (всегда видна если есть контент) */}
        {(hasText || idea.trim()) && (
          <div style={{ marginTop: 24, textAlign: "center" }}>
            <button
              onClick={deletePost}
              style={{ padding: "10px 28px", background: "none",
                border: "1.5px solid #DC2626", borderRadius: 10,
                color: "#DC2626", cursor: "pointer", fontSize: 13, fontWeight: 600 }}>
              🗑 Удалить пост
            </button>
          </div>
        )}

      </div>
    </div>
  );
}
