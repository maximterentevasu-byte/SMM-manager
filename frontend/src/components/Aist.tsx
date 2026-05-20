"use client";

interface AistProps {
  size?: number;
  message?: string;
  submessage?: string;
}

export function Aist({ size = 80, message = "Здесь пока пусто", submessage }: AistProps) {
  return (
    <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 16, padding: "40px 20px", textAlign: "center" }}>
      <svg width={size} height={size} viewBox="0 0 80 80" fill="none" xmlns="http://www.w3.org/2000/svg">
        {/* Body */}
        <ellipse cx="40" cy="48" rx="18" ry="22" fill="#EAF4FF" stroke="#3478F6" strokeWidth="1.5"/>
        {/* Head */}
        <ellipse cx="40" cy="22" rx="10" ry="10" fill="#EAF4FF" stroke="#3478F6" strokeWidth="1.5"/>
        {/* Beak */}
        <path d="M50 22 L58 19 L55 23 Z" fill="#FF6B5E"/>
        {/* Eye */}
        <circle cx="43" cy="20" r="1.8" fill="#0D1B2A"/>
        <circle cx="43.7" cy="19.3" r="0.6" fill="#fff"/>
        {/* Wing left */}
        <path d="M22 50 Q14 44 18 36 Q24 42 26 50Z" fill="#3478F6" opacity="0.25" stroke="#3478F6" strokeWidth="1" strokeLinejoin="round"/>
        {/* Wing right */}
        <path d="M58 50 Q66 44 62 36 Q56 42 54 50Z" fill="#3478F6" opacity="0.25" stroke="#3478F6" strokeWidth="1" strokeLinejoin="round"/>
        {/* Legs */}
        <line x1="35" y1="69" x2="32" y2="78" stroke="#FF6B5E" strokeWidth="2" strokeLinecap="round"/>
        <line x1="45" y1="69" x2="48" y2="78" stroke="#FF6B5E" strokeWidth="2" strokeLinecap="round"/>
        {/* Feet */}
        <path d="M28 78 L32 78 L30 75" stroke="#FF6B5E" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
        <path d="M44 78 L48 78 L50 75" stroke="#FF6B5E" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
        {/* AI stars */}
        <circle cx="16" cy="24" r="2" fill="#00B5A6" opacity="0.7"/>
        <circle cx="64" cy="30" r="1.5" fill="#00B5A6" opacity="0.5"/>
        <circle cx="20" cy="38" r="1" fill="#3478F6" opacity="0.5"/>
      </svg>
      <div>
        <div style={{ fontSize: 15, fontWeight: 600, color: "#0D1B2A", marginBottom: 4, fontFamily: "'Manrope', sans-serif" }}>
          {message}
        </div>
        {submessage && (
          <div style={{ fontSize: 13, color: "#9CA3AF", lineHeight: 1.5 }}>
            {submessage}
          </div>
        )}
      </div>
    </div>
  );
}
