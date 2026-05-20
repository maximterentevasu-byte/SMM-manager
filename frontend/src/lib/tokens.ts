export const C = {
  dark:       "#0D1B2A",
  graphite:   "#1F2937",
  blue:       "#3478F6",
  skyBlue:    "#EAF4FF",
  teal:       "#00B5A6",
  coral:      "#FF6B5E",
  sand:       "#F2E8D5",
  lightGray:  "#F5F7FA",
  white:      "#FFFFFF",
  border:     "#E5E7EB",
  muted:      "#9CA3AF",
  gray:       "#6B7280",
  tealLight:  "#E0F7F6",
  coralLight: "#FFF0EF",
  telegram:   "#2AABEE",
  vk:         "#4680C2",
  ok:         "#FF8C00",
} as const;

export const FF = {
  h: "'Manrope', -apple-system, BlinkMacSystemFont, sans-serif",
  b: "'Inter', -apple-system, BlinkMacSystemFont, sans-serif",
} as const;

export const R = {
  sm:   8,
  md:   12,
  lg:   16,
  xl:   20,
  full: 9999,
} as const;

export const SH = {
  card:  "0 2px 12px rgba(13,27,42,0.06)",
  hover: "0 4px 20px rgba(13,27,42,0.10)",
  modal: "0 8px 40px rgba(13,27,42,0.12)",
} as const;

export const STATUS: Record<string, { bg: string; color: string }> = {
  planned:          { bg: "#F2E8D5", color: "#92400E" },
  idea_ready:       { bg: "#F2E8D5", color: "#92400E" },
  needs_info:       { bg: "#F2E8D5", color: "#92400E" },
  pending_approval: { bg: "#EAF4FF", color: "#3478F6" },
  content_ready:    { bg: "#E0F7F6", color: "#00B5A6" },
  published:        { bg: "#E0F7F6", color: "#008F84" },
  failed:           { bg: "#FFF0EF", color: "#FF6B5E" },
};

export const PLANS_CFG = [
  { id: "demo",     name: "Демо",   color: C.gray,     bg: C.lightGray },
  { id: "start",    name: "Старт",  color: C.blue,     bg: C.skyBlue   },
  { id: "business", name: "Бизнес", color: C.teal,     bg: C.tealLight },
  { id: "pro",      name: "Про",    color: C.graphite,  bg: C.lightGray },
] as const;
