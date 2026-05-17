"use client";

import { useEffect, useState, useRef } from "react";
import { useRouter } from "next/navigation";
import api from "@/lib/api";

type Rubric = {
  name: string; goal: string; format: string; tone: string;
  structure: string[]; frequency: string; type: string; example_topics?: string[];
};

type PlatformStrategy = {
  platform: string; goal: string; tone: string; posts_per_week: number;
  best_posting_times: string[]; content_mix: Record<string, number>;
  content_pillars: string[]; rubrics: Rubric[];
};

type ChatMessage = { role: "user" | "ai"; text: string };

const PLATFORM_LABEL: Record<string, string> = { telegram: "✈ Telegram", vk: "ВК ВКонтакте", ok: "О Одноклассники" };
const MIX_LABELS: Record<string, string> = { sales: "Продажи", educational: "Обучение", entertainment: "Развлечение", ugc_triggers: "UGC" };
const MIX_COLORS: Record<string, string> = { sales: "#0F6E56", educational: "#185FA5", entertainment: "#533AB7", ugc_triggers: "#854F0B" };

export default function StrategyPage() {
  const router = useRouter();
  const [tab, setTab] = useState<"strategy" | "profile">("strategy");
  const [strategy, setStrategy] = useState<PlatformStrategy[] | null>(null);
  const [activePlatform, setActivePlatform] = useState(0);
  const [expandedRubric, setExpandedRubric] = useState<number | null>(null);
  const [loadingStrategy, setLoadingStrategy] = useState(true);
  const [editingPostsPerWeek, setEditingPostsPerWeek] = useState<Record<string, number>>({});
  const [savingPostsPerWeek, setSavingPostsPerWeek] = useState<string | null>(null);

  const [profile, setProfile] = useState<Record<string, any>>({});
  const [loadingProfile, setLoadingProfile] = useState(false);
  const [savingProfile, setSavingProfile] = useState(false);
  const [profileSaved, setProfileSaved] = useState(false);
  const [exportingXls, setExportingXls] = useState(false);

  const [chat, setChat] = useState<ChatMessage[]>([]);
  const [chatInput, setChatInput] = useState("");
  const [chatLoading, setChatLoading] = useState(false);
  const chatEndRef = useRef<HTMLDivElement>(null);

  const [businessId] = useState(() =>
    typeof window !== "undefined" ? localStorage.getItem("businessId") || "" : ""
  );

  useEffect(() => {
    if (!businessId) { router.push("/login"); return; }
    api.get(`/businesses/${businessId}/strategy`)
      .then(({ data }) => {
        setStrategy(data.strategy);
        if (data.strategy) {
          const init: Record<string, number> = {};
          data.strategy.forEach((ps: PlatformStrategy) => { init[ps.platform] = ps.posts_per_week; });
          setEditingPostsPerWeek(init);
        }
      })
      .catch(() => setStrategy(null))
      .finally(() => setLoadingStrategy(false));
  }, [businessId, router]);

  const savePostsPerWeek = async (platform: string) => {
    const val = editingPostsPerWeek[platform];
    if (!val) return;
    setSavingPostsPerWeek(platform);
    try {
      await api.patch(`/businesses/${businessId}/posts-per-week`, { platform, posts_per_week: val });
      setStrategy(prev => prev ? prev.map(ps =>
        ps.platform === platform ? { ...ps, posts_per_week: val } : ps
      ) : prev);
      localStorage.setItem("strategyUpdatedAt", String(Date.now()));
    } catch { alert("Ошибка сохранения"); }
    finally { setSavingPostsPerWeek(null); }
  };

  useEffect(() => {
    if (tab === "profile" && Object.keys(profile).length === 0) {
      setLoadingProfile(true);
      api.get(`/businesses/${businessId}/profile`)
        .then(({ data }) => setProfile(data.profile || {}))
        .catch(() => {})
        .finally(() => setLoadingProfile(false));
    }
  }, [tab, businessId, profile]);

  useEffect(() => {
    chatEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [chat]);

  const sendChat = async () => {
    const msg = chatInput.trim();
    if (!msg || chatLoading) return;
    setChatInput("");
    setChat((prev) => [...prev, { role: "user", text: msg }]);
    setChatLoading(true);
    try {
      const { data } = await api.post(`/businesses/${businessId}/refine-strategy`, { message: msg });
      setStrategy(data.strategy);
      localStorage.setItem("strategyUpdatedAt", String(Date.now()));
      setChat((prev) => [...prev, {
        role: "ai",
        text: "Стратегия обновлена! Перейди в Контент-план и нажми «Обновить план» чтобы сгенерировать новые посты.",
      }]);
    } catch {
      setChat((prev) => [...prev, { role: "ai", text: "Ошибка обновления. Попробуйте ещё раз." }]);
    } finally {
      setChatLoading(false);
    }
  };

  const exportXls = async () => {
    setExportingXls(true);
    try {
      const resp = await api.get(`/onboarding/export-profile/${businessId}`, { responseType: "blob" });
      const url = URL.createObjectURL(new Blob([resp.data]));
      const a = document.createElement("a");
      a.href = url;
      a.download = `profile_${profile.name || "business"}.xlsx`;
      a.click();
      URL.revokeObjectURL(url);
    } catch {
      alert("Ошибка выгрузки");
    } finally {
      setExportingXls(false);
    }
  };

  const saveProfile = async () => {
    setSavingProfile(true);
    try {
      await api.post(`/onboarding/save-profile/${businessId}`, {
        ...profile, products: [], active_promotions: "", brand_voice_examples: [],
        audience_pains: (profile.audience_pains || []).filter(Boolean),
        audience_objections: (profile.audience_objections || []).filter(Boolean),
        competitors: (profile.competitors || []).filter((c: any) => c.name || c.url),
        platforms: profile.platforms || ["telegram"],
        platform_goals: profile.platform_goals || {},
      });
      setProfileSaved(true);
      setTimeout(() => setProfileSaved(false), 3000);
    } catch {
      alert("Ошибка сохранения профиля");
    } finally {
      setSavingProfile(false);
    }
  };

  const inp: React.CSSProperties = {
    width: "100%", padding: "9px 13px", border: "1px solid #E0DED8", borderRadius: 10,
    fontSize: 14, fontFamily: "inherit", outline: "none", boxSizing: "border-box", background: "#fff",
  };
  const lbl: React.CSSProperties = { fontSize: 13, fontWeight: 500, color: "#444", display: "block", marginBottom: 5 };
  const hint: React.CSSProperties = { fontSize: 12, color: "#999", marginTop: 4 };

  return (
    <div style={{ minHeight: "100vh", background: "#F8F7F4", fontFamily: "'Segoe UI', sans-serif" }}>
      {/* Header */}
      <div style={{ background: "#fff", borderBottom: "1px solid #EAE8E2", padding: "0 2rem" }}>
        <div style={{ maxWidth: 900, margin: "0 auto", height: 64, display: "flex", alignItems: "center", gap: 24 }}>
          <h1 style={{ fontSize: 20, fontWeight: 700, color: "#1a1a1a", margin: 0 }}>Стратегия и онбординг</h1>
          <div style={{ display: "flex", gap: 4 }}>
            {(["strategy", "profile"] as const).map((t) => (
              <button key={t} onClick={() => setTab(t)}
                style={{ padding: "7px 18px", borderRadius: 20, border: "1px solid",
                  cursor: "pointer", fontSize: 13, fontWeight: tab === t ? 600 : 400,
                  borderColor: tab === t ? "#1a1a1a" : "#E0DED8",
                  background: tab === t ? "#1a1a1a" : "#fff",
                  color: tab === t ? "#fff" : "#666" }}>
                {t === "strategy" ? "🎯 Стратегия" : "📋 Профиль бизнеса"}
              </button>
            ))}
          </div>
        </div>
      </div>

      <div style={{ maxWidth: 900, margin: "0 auto", padding: "2rem" }}>

        {/* ─── TAB: STRATEGY ─── */}
        {tab === "strategy" && (
          <div style={{ display: "flex", flexDirection: "column", gap: 20 }}>
            {loadingStrategy && (
              <div style={{ textAlign: "center", padding: "3rem", color: "#888" }}>Загружаем стратегию...</div>
            )}

            {!loadingStrategy && !strategy && (
              <div style={{ background: "#fff", border: "1px solid #EAE8E2", borderRadius: 16,
                padding: "3rem", textAlign: "center" }}>
                <div style={{ fontSize: 48, marginBottom: 12 }}>⏳</div>
                <p style={{ color: "#888", margin: 0 }}>Стратегия ещё не сгенерирована.</p>
              </div>
            )}

            {strategy && strategy.length > 0 && (
              <>
                {/* Platform tabs */}
                <div style={{ display: "flex", gap: 8 }}>
                  {strategy.map((ps, i) => (
                    <button key={ps.platform} onClick={() => { setActivePlatform(i); setExpandedRubric(null); }}
                      style={{ padding: "8px 18px", borderRadius: 20, border: "1px solid",
                        cursor: "pointer", fontSize: 13, fontWeight: activePlatform === i ? 600 : 400,
                        borderColor: activePlatform === i ? "#1a1a1a" : "#E0DED8",
                        background: activePlatform === i ? "#1a1a1a" : "#fff",
                        color: activePlatform === i ? "#fff" : "#666" }}>
                      {PLATFORM_LABEL[ps.platform] || ps.platform}
                    </button>
                  ))}
                </div>

                {/* Platform detail */}
                {(() => {
                  const ps = strategy[activePlatform];
                  if (!ps) return null;
                  return (
                    <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
                      {/* Summary row */}
                      <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 12 }}>
                        {[
                          { label: "Цель", value: ps.goal },
                          { label: "Тональность", value: ps.tone },
                        ].map((item) => (
                          <div key={item.label} style={{ background: "#fff", border: "1px solid #EAE8E2",
                            borderRadius: 12, padding: "14px 16px" }}>
                            <div style={{ fontSize: 11, color: "#999", fontWeight: 500, marginBottom: 4 }}>{item.label}</div>
                            <div style={{ fontSize: 13, color: "#1a1a1a", lineHeight: 1.4 }}>{item.value}</div>
                          </div>
                        ))}

                        {/* Постов в неделю — редактируемая карточка */}
                        <div style={{ background: "#fff", border: "1px solid #EAE8E2",
                          borderRadius: 12, padding: "14px 16px" }}>
                          <div style={{ fontSize: 11, color: "#999", fontWeight: 500, marginBottom: 6 }}>
                            Постов в неделю
                          </div>
                          <div style={{ fontSize: 10, color: "#888", marginBottom: 8, lineHeight: 1.4 }}>
                            ИИ рекомендует: <b style={{ color: "#533AB7" }}>{ps.posts_per_week}</b>
                          </div>
                          <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                            <div style={{ display: "flex", alignItems: "center", gap: 4,
                              border: "1px solid #E0DED8", borderRadius: 8, overflow: "hidden" }}>
                              <button
                                onClick={() => setEditingPostsPerWeek(prev => ({
                                  ...prev, [ps.platform]: Math.max(1, (prev[ps.platform] ?? ps.posts_per_week) - 1)
                                }))}
                                style={{ width: 28, height: 28, border: "none", background: "#F1EFE8",
                                  cursor: "pointer", fontSize: 16, color: "#444", display: "flex",
                                  alignItems: "center", justifyContent: "center" }}>−</button>
                              <span style={{ minWidth: 24, textAlign: "center", fontSize: 15,
                                fontWeight: 700, color: "#1a1a1a" }}>
                                {editingPostsPerWeek[ps.platform] ?? ps.posts_per_week}
                              </span>
                              <button
                                onClick={() => setEditingPostsPerWeek(prev => ({
                                  ...prev, [ps.platform]: Math.min(14, (prev[ps.platform] ?? ps.posts_per_week) + 1)
                                }))}
                                style={{ width: 28, height: 28, border: "none", background: "#F1EFE8",
                                  cursor: "pointer", fontSize: 16, color: "#444", display: "flex",
                                  alignItems: "center", justifyContent: "center" }}>+</button>
                            </div>
                            {(editingPostsPerWeek[ps.platform] ?? ps.posts_per_week) !== ps.posts_per_week && (
                              <button
                                onClick={() => savePostsPerWeek(ps.platform)}
                                disabled={savingPostsPerWeek === ps.platform}
                                style={{ padding: "5px 12px", background: "#533AB7", color: "#fff",
                                  border: "none", borderRadius: 7, cursor: "pointer", fontSize: 12,
                                  fontWeight: 600 }}>
                                {savingPostsPerWeek === ps.platform ? "..." : "Сохранить"}
                              </button>
                            )}
                          </div>
                          <div style={{ fontSize: 10, color: "#bbb", marginTop: 6 }}>
                            Контент-план: 5 недель · {(editingPostsPerWeek[ps.platform] ?? ps.posts_per_week) * 5} постов
                          </div>
                        </div>
                      </div>

                      {/* Content mix */}
                      <div style={{ background: "#fff", border: "1px solid #EAE8E2", borderRadius: 12, padding: "16px 20px" }}>
                        <div style={{ fontSize: 12, fontWeight: 600, color: "#888", marginBottom: 12 }}>МИКС КОНТЕНТА</div>
                        <div style={{ display: "flex", gap: 0, borderRadius: 8, overflow: "hidden", height: 12, marginBottom: 12 }}>
                          {Object.entries(ps.content_mix || {}).map(([key, val]) => (
                            <div key={key} style={{ width: `${val}%`, background: MIX_COLORS[key] || "#ccc" }} />
                          ))}
                        </div>
                        <div style={{ display: "flex", gap: 16, flexWrap: "wrap" }}>
                          {Object.entries(ps.content_mix || {}).map(([key, val]) => (
                            <div key={key} style={{ display: "flex", alignItems: "center", gap: 6 }}>
                              <div style={{ width: 10, height: 10, borderRadius: 3, background: MIX_COLORS[key] || "#ccc" }} />
                              <span style={{ fontSize: 12, color: "#555" }}>{MIX_LABELS[key] || key}: <strong>{val}%</strong></span>
                            </div>
                          ))}
                        </div>
                      </div>

                      {/* Content pillars */}
                      {ps.content_pillars?.length > 0 && (
                        <div style={{ background: "#fff", border: "1px solid #EAE8E2", borderRadius: 12, padding: "16px 20px" }}>
                          <div style={{ fontSize: 12, fontWeight: 600, color: "#888", marginBottom: 10 }}>КОНТЕНТНЫЕ СТОЛПЫ</div>
                          <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                            {ps.content_pillars.map((p) => (
                              <span key={p} style={{ padding: "4px 12px", background: "#F1EFE8",
                                borderRadius: 20, fontSize: 13, color: "#555" }}>{p}</span>
                            ))}
                          </div>
                        </div>
                      )}

                      {/* Rubrics */}
                      <div style={{ background: "#fff", border: "1px solid #EAE8E2", borderRadius: 12, overflow: "hidden" }}>
                        <div style={{ padding: "14px 20px", borderBottom: "1px solid #EAE8E2" }}>
                          <div style={{ fontSize: 12, fontWeight: 600, color: "#888" }}>РУБРИКИ ({ps.rubrics?.length || 0})</div>
                        </div>
                        {(ps.rubrics || []).map((r, i) => (
                          <div key={i} style={{ borderBottom: i < ps.rubrics.length - 1 ? "1px solid #F2F0EC" : "none" }}>
                            <div onClick={() => setExpandedRubric(expandedRubric === i ? null : i)}
                              style={{ padding: "14px 20px", display: "flex", alignItems: "center",
                                gap: 12, cursor: "pointer", userSelect: "none" }}>
                              <span style={{ fontSize: 11, fontWeight: 600, padding: "2px 8px",
                                borderRadius: 6, background: "#F1EFE8", color: "#555" }}>{r.type || "?"}</span>
                              <span style={{ fontSize: 14, fontWeight: 500, color: "#1a1a1a", flex: 1 }}>{r.name}</span>
                              <span style={{ fontSize: 12, color: "#999" }}>{r.frequency}</span>
                              <span style={{ fontSize: 12, color: "#bbb" }}>{expandedRubric === i ? "▲" : "▼"}</span>
                            </div>
                            {expandedRubric === i && (
                              <div style={{ padding: "0 20px 16px", display: "flex", flexDirection: "column", gap: 10 }}>
                                <div style={{ fontSize: 13, color: "#555", lineHeight: 1.5 }}><strong>Цель:</strong> {r.goal}</div>
                                <div style={{ fontSize: 13, color: "#555" }}><strong>Формат:</strong> {r.format} · <strong>Тон:</strong> {r.tone}</div>
                                {r.structure?.length > 0 && (
                                  <div style={{ fontSize: 13, color: "#555" }}>
                                    <strong>Структура:</strong> {r.structure.join(" → ")}
                                  </div>
                                )}
                                {r.example_topics?.length > 0 && (
                                  <div>
                                    <div style={{ fontSize: 12, color: "#999", marginBottom: 6 }}>ПРИМЕРЫ ТЕМ</div>
                                    {r.example_topics.map((t) => (
                                      <div key={t} style={{ fontSize: 13, color: "#555", marginBottom: 3 }}>• {t}</div>
                                    ))}
                                  </div>
                                )}
                              </div>
                            )}
                          </div>
                        ))}
                      </div>
                    </div>
                  );
                })()}
              </>
            )}

            {/* Chat */}
            <div style={{ background: "#fff", border: "1px solid #EAE8E2", borderRadius: 16, overflow: "hidden" }}>
              <div style={{ padding: "14px 20px", borderBottom: "1px solid #EAE8E2" }}>
                <div style={{ fontSize: 14, fontWeight: 600, color: "#1a1a1a" }}>🤖 Уточнить стратегию</div>
                <div style={{ fontSize: 12, color: "#999", marginTop: 2 }}>
                  Напиши что хочешь изменить — AI обновит стратегию
                </div>
              </div>

              {chat.length > 0 && (
                <div style={{ maxHeight: 300, overflowY: "auto", padding: "16px 20px",
                  display: "flex", flexDirection: "column", gap: 12 }}>
                  {chat.map((m, i) => (
                    <div key={i} style={{ display: "flex", justifyContent: m.role === "user" ? "flex-end" : "flex-start" }}>
                      <div style={{
                        maxWidth: "75%", padding: "10px 14px", borderRadius: 12,
                        fontSize: 13, lineHeight: 1.5,
                        background: m.role === "user" ? "#1a1a1a" : "#F1EFE8",
                        color: m.role === "user" ? "#fff" : "#333",
                      }}>{m.text}</div>
                    </div>
                  ))}
                  {chatLoading && (
                    <div style={{ display: "flex", justifyContent: "flex-start" }}>
                      <div style={{ padding: "10px 14px", borderRadius: 12, background: "#F1EFE8",
                        fontSize: 13, color: "#888" }}>Обновляю стратегию...</div>
                    </div>
                  )}
                  <div ref={chatEndRef} />
                </div>
              )}

              <div style={{ padding: "16px 20px", display: "flex", gap: 10 }}>
                <input value={chatInput} onChange={(e) => setChatInput(e.target.value)}
                  onKeyDown={(e) => e.key === "Enter" && !e.shiftKey && sendChat()}
                  placeholder="Хочу больше продающих постов / убери развлекательные рубрики / ..."
                  style={{ ...inp, flex: 1 }} />
                <button onClick={sendChat} disabled={chatLoading || !chatInput.trim()}
                  style={{ padding: "9px 20px", background: chatLoading || !chatInput.trim() ? "#ccc" : "#1a1a1a",
                    color: "#fff", border: "none", borderRadius: 10,
                    cursor: chatLoading || !chatInput.trim() ? "not-allowed" : "pointer",
                    fontSize: 13, fontWeight: 600, whiteSpace: "nowrap" }}>
                  Отправить
                </button>
              </div>
            </div>
          </div>
        )}

        {/* ─── TAB: PROFILE ─── */}
        {tab === "profile" && (
          <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
            {loadingProfile ? (
              <div style={{ textAlign: "center", padding: "3rem", color: "#888" }}>Загружаем профиль...</div>
            ) : (
              <>
                <div style={{ background: "#fff", border: "1px solid #EAE8E2", borderRadius: 16, padding: "20px 24px",
                  display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                  <div>
                    <div style={{ fontSize: 15, fontWeight: 600, color: "#1a1a1a" }}>Профиль бизнеса</div>
                    <div style={{ fontSize: 13, color: "#888", marginTop: 2 }}>
                      Измени данные и сохрани — AI будет писать посты точнее
                    </div>
                  </div>
                  <div style={{ display: "flex", gap: 8 }}>
                    <button onClick={exportXls} disabled={exportingXls}
                      style={{ padding: "8px 16px", background: "#E8F5E9", color: "#2E7D32",
                        border: "1px solid #C8E6C9", borderRadius: 10, cursor: "pointer", fontSize: 13, fontWeight: 500 }}>
                      {exportingXls ? "Выгружаю..." : "📥 Выгрузить в Excel"}
                    </button>
                    <button onClick={() => router.push("/onboarding")}
                      style={{ padding: "8px 16px", background: "#F1EFE8", color: "#444",
                        border: "1px solid #E0DED8", borderRadius: 10, cursor: "pointer", fontSize: 13 }}>
                      Пройти онбординг заново
                    </button>
                  </div>
                </div>

                {[
                  { key: "name", label: "Название бизнеса", type: "input", placeholder: "Pick me" },
                  { key: "niche", label: "Ниша", type: "input", placeholder: "Магазин азиатских снеков" },
                  { key: "usp", label: "УТП", type: "textarea", placeholder: "Чем отличаетесь от конкурентов" },
                  { key: "address", label: "Адрес", type: "input", placeholder: "ул. Ленина, 12" },
                  { key: "contact_info", label: "Контакты (телефон, сайт, бот)", type: "input", placeholder: "+7 999 123-45-67, pickme.ru" },
                  { key: "geo", label: "Город / район", type: "input", placeholder: "Москва, Марьино" },
                ].map(({ key, label, type, placeholder }) => (
                  <div key={key} style={{ background: "#fff", border: "1px solid #EAE8E2", borderRadius: 12, padding: "16px 20px" }}>
                    <label style={lbl}>{label}</label>
                    {type === "textarea" ? (
                      <textarea value={profile[key] || ""} onChange={(e) => setProfile({ ...profile, [key]: e.target.value })}
                        placeholder={placeholder}
                        style={{ ...inp, minHeight: 70, resize: "vertical" }} />
                    ) : (
                      <input value={profile[key] || ""} onChange={(e) => setProfile({ ...profile, [key]: e.target.value })}
                        placeholder={placeholder} style={inp} />
                    )}
                  </div>
                ))}


                {profileSaved && (
                  <div style={{ padding: "12px 16px", background: "#E1F5EE", borderRadius: 10,
                    fontSize: 13, color: "#0F6E56", fontWeight: 500 }}>
                    ✓ Профиль сохранён
                  </div>
                )}

                <button onClick={saveProfile} disabled={savingProfile}
                  style={{ padding: "13px", background: savingProfile ? "#888" : "#1a1a1a", color: "#fff",
                    border: "none", borderRadius: 12, cursor: "pointer", fontSize: 15, fontWeight: 600 }}>
                  {savingProfile ? "Сохраняю..." : "Сохранить профиль"}
                </button>
              </>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
