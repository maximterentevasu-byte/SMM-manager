"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import api from "@/lib/api";
import { useMobile } from "@/hooks/useMobile";
import { Aist } from "@/components/Aist";
import { SkeletonCard, SkeletonKpi } from "@/components/Skeleton";

// ─── Types ───────────────────────────────────────────────────────────────────

type KpiItem = {
  name: string; label: string; icon: string; fmt: string;
  value: number | null; delta_pct: number | null;
};
type ChangeItem = {
  metric: string; platform: string; value: number; prev: number; change_pct: number;
};
type Slot5d = {
  id: string; platform: string; scheduled_at: string; status: string;
  status_label: string; rubric_name: string; post_text: string; needs_info_for: string[];
};
type Slot7d = {
  id: string; platform: string; scheduled_at: string; status: string;
  rubric_name: string; post_text: string; has_image: boolean; image_url: string | null;
};
type TopPost = {
  platform: string; date: string; views: number; likes: number;
  comments: number; reposts: number; text: string; channel_name: string;
};
type DashData = {
  business_name: string;
  smm_metrics: string[];
  kpi: Record<string, KpiItem[]>;
  analytics: { growing: ChangeItem[]; falling: ChangeItem[]; ai_summary: string | null; has_data: boolean };
  scheduled_5d: Slot5d[];
  upcoming_7d: Slot7d[];
  top_content: { "1m": TopPost[]; "3m": TopPost[]; all: TopPost[] };
};

// ─── Helpers ──────────────────────────────────────────────────────────────────

const PLATFORM_COLOR: Record<string, string> = { vk: "#4680C2", tg: "#2AABEE", ok: "#FF8C00" };
const PLATFORM_LABEL: Record<string, string> = { vk: "ВК", tg: "TG", ok: "ОК" };

const STATUS_COLOR: Record<string, { bg: string; color: string }> = {
  planned:          { bg: "#F2E8D5", color: "#92400E" },
  idea_ready:       { bg: "#F2E8D5", color: "#92400E" },
  needs_info:       { bg: "#F2E8D5", color: "#92400E" },
  pending_approval: { bg: "#EAF4FF", color: "#3478F6" },
  content_ready:    { bg: "#E0F7F6", color: "#00B5A6" },
  published:        { bg: "#E0F7F6", color: "#008F84" },
  failed:           { bg: "#FFF0EF", color: "#FF6B5E" },
};

function fmtNum(v: number | null, fmt: string): string {
  if (v === null || v === undefined) return "—";
  if (fmt === "pct") return `${v.toFixed(1)}%`;
  if (fmt === "float") return v.toFixed(1);
  if (v >= 1_000_000) return `${(v / 1_000_000).toFixed(1)}M`;
  if (v >= 1_000) return `${(v / 1_000).toFixed(1)}K`;
  return String(Math.round(v));
}

function fmtDate(iso: string): string {
  const d = new Date(iso);
  const days = ["Вс", "Пн", "Вт", "Ср", "Чт", "Пт", "Сб"];
  const months = ["янв", "фев", "мар", "апр", "май", "июн", "июл", "авг", "сен", "окт", "ноя", "дек"];
  return `${days[d.getDay()]}, ${d.getDate()} ${months[d.getMonth()]}`;
}

function fmtTime(iso: string): string {
  const d = new Date(iso);
  return `${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`;
}

function groupBy5d(slots: Slot5d[]): Map<string, Slot5d[]> {
  const map = new Map<string, Slot5d[]>();
  for (const s of slots) {
    const key = fmtDate(s.scheduled_at);
    if (!map.has(key)) map.set(key, []);
    map.get(key)!.push(s);
  }
  return map;
}

// ─── Sub-components ───────────────────────────────────────────────────────────

function PlatformBadge({ platform }: { platform: string }) {
  return (
    <span style={{
      display: "inline-flex", alignItems: "center", justifyContent: "center",
      width: 28, height: 28, borderRadius: 8, flexShrink: 0,
      background: PLATFORM_COLOR[platform] || "#888", color: "#fff",
      fontSize: 10, fontWeight: 700,
    }}>
      {PLATFORM_LABEL[platform] || platform.toUpperCase()}
    </span>
  );
}

function Delta({ pct }: { pct: number | null }) {
  if (pct === null) return null;
  const up = pct > 0;
  return (
    <span style={{
      fontSize: 11, fontWeight: 600,
      color: up ? "#00B5A6" : "#FF6B5E",
      display: "inline-flex", alignItems: "center", gap: 2,
    }}>
      {up ? "▲" : "▼"} {Math.abs(pct).toFixed(1)}%
    </span>
  );
}

function SectionCard({ title, children, action }: {
  title: React.ReactNode; children: React.ReactNode; action?: React.ReactNode;
}) {
  return (
    <div style={{
      background: "#fff", borderRadius: 16, padding: "20px 22px",
      boxShadow: "0 1px 4px rgba(13,27,42,0.06)", border: "1px solid #E5E7EB",
    }}>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 16 }}>
        <div style={{ fontFamily: "'Manrope', sans-serif", fontWeight: 700, fontSize: 14, color: "#0D1B2A" }}>
          {title}
        </div>
        {action}
      </div>
      {children}
    </div>
  );
}

function EmptyState({ text, sub }: { text: string; sub?: string }) {
  return <Aist size={60} message={text} submessage={sub} />;
}

// ─── Main page ────────────────────────────────────────────────────────────────

export default function HomePage() {
  const router = useRouter();
  const isMobile = useMobile();
  const [data, setData] = useState<DashData | null>(null);
  const [loading, setLoading] = useState(true);
  const [kpiPeriod, setKpiPeriod] = useState<"1m" | "3m" | "6m" | "all">("1m");
  const [topPeriod, setTopPeriod] = useState<"1m" | "3m" | "all">("1m");

  useEffect(() => {
    const biz = localStorage.getItem("businessId");
    if (!biz) { setLoading(false); return; }
    api.get(`/home/${biz}`)
      .then(({ data: d }) => setData(d))
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  const hour = new Date().getHours();
  const greeting = hour < 12 ? "Доброе утро" : hour < 18 ? "Добрый день" : "Добрый вечер";

  const periods: { key: "1m" | "3m" | "6m" | "all"; label: string }[] = [
    { key: "1m", label: "1 мес" },
    { key: "3m", label: "3 мес" },
    { key: "6m", label: "6 мес" },
    { key: "all", label: "Всё время" },
  ];

  return (
    <div style={{ minHeight: "100vh", background: "#F5F7FA", fontFamily: "'Inter', sans-serif" }}>
      {/* Header — hidden on mobile (top bar in layout handles it) */}
      {!isMobile && (
        <div style={{ background: "#fff", borderBottom: "1px solid #E5E7EB", padding: "0 2rem" }}>
          <div style={{ maxWidth: 1200, margin: "0 auto", height: 64, display: "flex", alignItems: "center", justifyContent: "space-between" }}>
            <div>
              <h1 style={{ fontFamily: "'Manrope', sans-serif", fontSize: 20, fontWeight: 700, color: "#0D1B2A", margin: 0 }}>
                {greeting}{data?.business_name ? `, ${data.business_name}` : ""}
              </h1>
              <div style={{ fontSize: 12, color: "#9CA3AF", marginTop: 2 }}>
                {new Date().toLocaleDateString("ru-RU", { weekday: "long", day: "numeric", month: "long" })}
              </div>
            </div>
            <button onClick={() => router.push("/content")} style={{
              background: "#3478F6", color: "#fff", border: "none", borderRadius: 10,
              padding: "8px 16px", fontSize: 13, fontWeight: 600, cursor: "pointer",
            }}>
              Контент-план →
            </button>
          </div>
        </div>
      )}

      {/* Mobile greeting */}
      {isMobile && (
        <div style={{ padding: "14px 16px 4px", background: "#fff", borderBottom: "1px solid #F3F4F6" }}>
          <div style={{ fontFamily: "'Manrope', sans-serif", fontSize: 16, fontWeight: 700, color: "#0D1B2A" }}>
            {greeting}{data?.business_name ? `, ${data.business_name}` : ""}
          </div>
          <div style={{ fontSize: 11, color: "#9CA3AF", marginTop: 2 }}>
            {new Date().toLocaleDateString("ru-RU", { weekday: "long", day: "numeric", month: "long" })}
          </div>
        </div>
      )}

      <div style={{ maxWidth: 1200, margin: "0 auto", padding: isMobile ? "12px 12px" : "24px 2rem" }}>
        {loading ? (
          <div style={{ display: "grid", gridTemplateColumns: isMobile ? "1fr" : "repeat(auto-fill, minmax(200px, 1fr))", gap: 12, marginBottom: 20 }}>
            {Array.from({ length: isMobile ? 4 : 6 }).map((_, i) => <SkeletonKpi key={i} />)}
          </div>
        ) : !data ? (
          <Aist size={90} message="Не удалось загрузить данные" submessage="Обновите страницу или проверьте подключение" />
        ) : (
          <>
            {/* ── KPI Block ─────────────────────────────────────────────────── */}
            <div id="tour-kpi-block" style={{ marginBottom: 20 }}>
              <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 14, flexWrap: "wrap", gap: 8 }}>
                <div style={{ fontFamily: "'Manrope', sans-serif", fontWeight: 700, fontSize: isMobile ? 14 : 15, color: "#0D1B2A" }}>
                  Ключевые показатели
                </div>
                <div style={{ display: "flex", gap: 4 }}>
                  {periods.map(p => (
                    <button key={p.key} onClick={() => setKpiPeriod(p.key)} style={{
                      padding: isMobile ? "4px 8px" : "5px 12px", borderRadius: 8, border: "none", cursor: "pointer",
                      background: kpiPeriod === p.key ? "#3478F6" : "#F3F4F6",
                      color: kpiPeriod === p.key ? "#fff" : "#6B7280",
                      fontSize: isMobile ? 11 : 12, fontWeight: kpiPeriod === p.key ? 700 : 400,
                    }}>
                      {p.label}
                    </button>
                  ))}
                </div>
              </div>

              {(data.kpi[kpiPeriod] || []).length === 0 ? (
                <div style={{ background: "#fff", borderRadius: 16, border: "1px solid #E5E7EB" }}>
                  <Aist size={70} message="Нет данных за этот период" submessage="Настройте метрики в онбординге и подключите площадки" />
                </div>
              ) : (
                <div style={{ display: "grid", gridTemplateColumns: isMobile ? "repeat(2, 1fr)" : "repeat(auto-fill, minmax(200px, 1fr))", gap: isMobile ? 8 : 12 }}>
                  {(data.kpi[kpiPeriod] || []).map((kpi, i) => (
                    <div key={i} style={{
                      background: "#fff", borderRadius: 14, padding: "18px 20px",
                      border: "1px solid #E5E7EB", boxShadow: "0 1px 3px rgba(13,27,42,0.05)",
                    }}>
                      <div style={{ fontSize: 20, marginBottom: 8 }}>{kpi.icon}</div>
                      <div style={{ fontSize: 11, color: "#9CA3AF", marginBottom: 4, fontWeight: 500 }}>
                        {kpi.label}
                      </div>
                      <div style={{ fontSize: 26, fontWeight: 700, color: "#0D1B2A", lineHeight: 1, marginBottom: 6 }}>
                        {fmtNum(kpi.value, kpi.fmt)}
                      </div>
                      <Delta pct={kpi.delta_pct} />
                    </div>
                  ))}
                </div>
              )}
            </div>

            {/* ── Main 2-column grid ────────────────────────────────────────── */}
            <div style={{ display: "grid", gridTemplateColumns: isMobile ? "1fr" : "1fr 1fr", gap: isMobile ? 12 : 16, marginBottom: isMobile ? 12 : 16 }}>
              {/* Analytics block */}
              <SectionCard title="📈 Аналитика за неделю">
                {!data.analytics.has_data ? (
                  <EmptyState text="Аналитика появится после первого сбора данных" sub="Подключите VK или Telegram в разделе Платформы" />
                ) : (
                  <div>
                    {/* Growing */}
                    {data.analytics.growing.length > 0 && (
                      <div style={{ marginBottom: 16 }}>
                        <div style={{ fontSize: 11, fontWeight: 600, color: "#00B5A6", marginBottom: 8, display: "flex", alignItems: "center", gap: 4 }}>
                          <span>▲</span> Топ 5 растущих
                        </div>
                        {data.analytics.growing.map((c, i) => (
                          <div key={i} style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "5px 0", borderBottom: "1px solid #F3F4F6" }}>
                            <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                              <span style={{ fontSize: 10, color: "#9CA3AF", width: 14 }}>{i + 1}</span>
                              <PlatformBadge platform={c.platform} />
                              <span style={{ fontSize: 12, color: "#374151" }}>{c.metric}</span>
                            </div>
                            <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                              <span style={{ fontSize: 12, color: "#6B7280" }}>{fmtNum(c.value, "float")}</span>
                              <span style={{ fontSize: 11, fontWeight: 700, color: "#00B5A6" }}>+{c.change_pct}%</span>
                            </div>
                          </div>
                        ))}
                      </div>
                    )}

                    {/* Falling */}
                    {data.analytics.falling.length > 0 && (
                      <div style={{ marginBottom: 16 }}>
                        <div style={{ fontSize: 11, fontWeight: 600, color: "#FF6B5E", marginBottom: 8, display: "flex", alignItems: "center", gap: 4 }}>
                          <span>▼</span> Топ 5 падающих
                        </div>
                        {data.analytics.falling.map((c, i) => (
                          <div key={i} style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "5px 0", borderBottom: "1px solid #F3F4F6" }}>
                            <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                              <span style={{ fontSize: 10, color: "#9CA3AF", width: 14 }}>{i + 1}</span>
                              <PlatformBadge platform={c.platform} />
                              <span style={{ fontSize: 12, color: "#374151" }}>{c.metric}</span>
                            </div>
                            <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                              <span style={{ fontSize: 12, color: "#6B7280" }}>{fmtNum(c.value, "float")}</span>
                              <span style={{ fontSize: 11, fontWeight: 700, color: "#FF6B5E" }}>{c.change_pct}%</span>
                            </div>
                          </div>
                        ))}
                      </div>
                    )}

                    {/* AI summary */}
                    {data.analytics.ai_summary && (
                      <div style={{
                        background: "linear-gradient(135deg, #EFF6FF 0%, #F5F3FF 100%)",
                        borderRadius: 12, padding: "12px 14px",
                        border: "1px solid #DBEAFE",
                      }}>
                        <div style={{ fontSize: 11, fontWeight: 600, color: "#3478F6", marginBottom: 4 }}>
                          🤖 АИСТ — сводка за неделю
                        </div>
                        <div style={{ fontSize: 12, color: "#374151", lineHeight: 1.6 }}>
                          {data.analytics.ai_summary}
                        </div>
                      </div>
                    )}

                    {data.analytics.growing.length === 0 && data.analytics.falling.length === 0 && (
                      <EmptyState text="Нужно минимум 2 недели аналитики для сравнения" />
                    )}
                  </div>
                )}
              </SectionCard>

              {/* Scheduled 5 days */}
              <SectionCard
                title="📅 Требуют внимания (5 дней)"
                action={
                  <button onClick={() => router.push("/content")} style={{
                    background: "none", border: "none", color: "#3478F6",
                    fontSize: 12, cursor: "pointer", fontWeight: 500,
                  }}>
                    Открыть план →
                  </button>
                }
              >
                {data.scheduled_5d.length === 0 ? (
                  <EmptyState text="Всё готово" sub="Ничего не требует внимания" />
                ) : (
                  <div>
                    {Array.from(groupBy5d(data.scheduled_5d).entries()).map(([dateLabel, slots]) => (
                      <div key={dateLabel} style={{ marginBottom: 12 }}>
                        <div style={{ fontSize: 11, fontWeight: 600, color: "#9CA3AF", marginBottom: 6 }}>
                          {dateLabel}
                        </div>
                        {slots.map(s => {
                          const sc = STATUS_COLOR[s.status] || { bg: "#F3F4F6", color: "#6B7280" };
                          return (
                            <div key={s.id} onClick={() => router.push("/content")} style={{
                              display: "flex", alignItems: "center", gap: 10,
                              padding: "8px 10px", borderRadius: 10, marginBottom: 4,
                              background: "#FAFAFA", border: "1px solid #F3F4F6",
                              cursor: "pointer",
                            }}>
                              <PlatformBadge platform={s.platform} />
                              <div style={{ flex: 1, minWidth: 0 }}>
                                <div style={{ fontSize: 12, fontWeight: 500, color: "#374151", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
                                  {s.rubric_name || (s.post_text ? s.post_text.slice(0, 50) : "Без контента")}
                                </div>
                                <div style={{ fontSize: 11, color: "#9CA3AF", marginTop: 1 }}>
                                  {fmtTime(s.scheduled_at)}
                                </div>
                              </div>
                              <span style={{
                                fontSize: 10, fontWeight: 600, padding: "3px 8px", borderRadius: 12,
                                background: sc.bg, color: sc.color, whiteSpace: "nowrap", flexShrink: 0,
                              }}>
                                {s.status_label}
                              </span>
                            </div>
                          );
                        })}
                      </div>
                    ))}
                  </div>
                )}
              </SectionCard>
            </div>

            {/* ── Bottom 2-column grid ──────────────────────────────────────── */}
            <div style={{ display: "grid", gridTemplateColumns: isMobile ? "1fr" : "1fr 1fr", gap: isMobile ? 12 : 16 }}>
              {/* Top content */}
              <SectionCard
                title="🏆 Топ контент"
                action={
                  <div style={{ display: "flex", gap: 4 }}>
                    {(["1m", "3m", "all"] as const).map(p => (
                      <button key={p} onClick={() => setTopPeriod(p)} style={{
                        padding: "3px 9px", borderRadius: 6, border: "none", cursor: "pointer",
                        background: topPeriod === p ? "#0D1B2A" : "#F3F4F6",
                        color: topPeriod === p ? "#fff" : "#6B7280",
                        fontSize: 11, fontWeight: topPeriod === p ? 700 : 400,
                      }}>
                        {p === "1m" ? "1 мес" : p === "3m" ? "3 мес" : "Всё"}
                      </button>
                    ))}
                  </div>
                }
              >
                {(data.top_content[topPeriod] || []).length === 0 ? (
                  <EmptyState text="Лучшие посты появятся здесь" sub="Подключите площадки и соберите аналитику" />
                ) : (
                  <div>
                    {data.top_content[topPeriod].map((post, i) => (
                      <div key={i} style={{
                        display: "flex", gap: 10, padding: "10px 0",
                        borderBottom: i < data.top_content[topPeriod].length - 1 ? "1px solid #F3F4F6" : "none",
                      }}>
                        <div style={{ fontSize: 13, fontWeight: 700, color: "#D1D5DB", width: 20, flexShrink: 0, paddingTop: 2 }}>
                          {i + 1}
                        </div>
                        <PlatformBadge platform={post.platform} />
                        <div style={{ flex: 1, minWidth: 0 }}>
                          <div style={{ fontSize: 12, color: "#374151", lineHeight: 1.5, marginBottom: 6, overflow: "hidden", display: "-webkit-box", WebkitLineClamp: 2, WebkitBoxOrient: "vertical" as any }}>
                            {post.text || <span style={{ color: "#9CA3AF" }}>Без текста</span>}
                          </div>
                          <div style={{ display: "flex", gap: 10, fontSize: 11, color: "#9CA3AF" }}>
                            <span>👁 {fmtNum(post.views, "int")}</span>
                            <span>❤️ {fmtNum(post.likes, "int")}</span>
                            <span>💬 {fmtNum(post.comments, "int")}</span>
                            {post.reposts > 0 && <span>🔄 {fmtNum(post.reposts, "int")}</span>}
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </SectionCard>

              {/* Upcoming 7 days */}
              <SectionCard
                title="📆 Ближайшие посты (7 дней)"
                action={
                  <button onClick={() => router.push("/content")} style={{
                    background: "none", border: "none", color: "#3478F6",
                    fontSize: 12, cursor: "pointer", fontWeight: 500,
                  }}>
                    Открыть план →
                  </button>
                }
              >
                {data.upcoming_7d.length === 0 ? (
                  <EmptyState text="Нет запланированных постов" sub="На ближайшие 7 дней расписание пусто" />
                ) : (
                  <div>
                    {data.upcoming_7d.map((s, i) => {
                      const sc = STATUS_COLOR[s.status] || { bg: "#F3F4F6", color: "#6B7280" };
                      return (
                        <div key={s.id} style={{
                          display: "flex", gap: 10, padding: "9px 0",
                          borderBottom: i < data.upcoming_7d.length - 1 ? "1px solid #F3F4F6" : "none",
                          alignItems: "flex-start",
                        }}>
                          {/* Image placeholder or icon */}
                          <div style={{
                            width: 44, height: 44, borderRadius: 10, flexShrink: 0,
                            background: s.has_image ? "#E0F2FE" : "#F3F4F6",
                            display: "flex", alignItems: "center", justifyContent: "center",
                            fontSize: s.has_image ? 20 : 16,
                            overflow: "hidden",
                          }}>
                            {s.image_url ? (
                              <img src={s.image_url} alt="" style={{ width: "100%", height: "100%", objectFit: "cover" }} />
                            ) : s.has_image ? "🖼" : (
                              <span style={{ color: PLATFORM_COLOR[s.platform], fontSize: 13, fontWeight: 700 }}>
                                {PLATFORM_LABEL[s.platform]}
                              </span>
                            )}
                          </div>
                          <div style={{ flex: 1, minWidth: 0 }}>
                            <div style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 3 }}>
                              <span style={{ fontSize: 11, fontWeight: 600, color: PLATFORM_COLOR[s.platform] }}>
                                {PLATFORM_LABEL[s.platform]}
                              </span>
                              <span style={{ fontSize: 11, color: "#9CA3AF" }}>{fmtDate(s.scheduled_at)} · {fmtTime(s.scheduled_at)}</span>
                            </div>
                            <div style={{ fontSize: 12, color: "#374151", lineHeight: 1.5, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
                              {s.rubric_name || (s.post_text ? s.post_text.slice(0, 60) : <span style={{ color: "#9CA3AF" }}>Нет текста</span>)}
                            </div>
                          </div>
                          <span style={{
                            fontSize: 10, fontWeight: 600, padding: "3px 8px", borderRadius: 12,
                            background: sc.bg, color: sc.color, whiteSpace: "nowrap", flexShrink: 0,
                          }}>
                            {s.status === "published" ? "✓" : s.status === "content_ready" ? "✓" : "•"}
                          </span>
                        </div>
                      );
                    })}
                  </div>
                )}
              </SectionCard>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
