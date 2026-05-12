import { useState, useCallback } from "react";
import { Link } from "wouter";
import { ArrowRight } from "lucide-react";

const CARD_W = 158;
const CARD_H = 84;
const GAP = 12;
const FAN_OFFSET = CARD_W + GAP;

const TRANSITION: React.CSSProperties = {
  transitionProperty: "transform, opacity, box-shadow",
  transitionDuration: "420ms",
  transitionTimingFunction: "cubic-bezier(0.34, 1.56, 0.64, 1)",
};

function StethIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" className="w-6 h-6 shrink-0" aria-hidden="true">
      <path d="M4.5 6.5a2 2 0 1 1 4 0v5a5.5 5.5 0 0 0 11 0v-1" stroke="#14b8a6" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round"/>
      <path d="M4.5 6.5V5a.5.5 0 0 1 .5-.5h3a.5.5 0 0 1 .5.5v1.5" stroke="#14b8a6" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round"/>
      <circle cx="19.5" cy="9.5" r="2.5" stroke="#14b8a6" strokeWidth="1.75"/>
      <circle cx="19.5" cy="9.5" r="1" fill="#14b8a6"/>
    </svg>
  );
}

function FlaskIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" className="w-6 h-6 shrink-0" aria-hidden="true">
      <path d="M9 3h6M10 3v7.5L6.5 17A3 3 0 0 0 9.24 21h5.52A3 3 0 0 0 17.5 17L14 10.5V3" stroke="#14b8a6" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round"/>
      <path d="M6.5 17h11" stroke="#14b8a6" strokeWidth="1.75" strokeLinecap="round"/>
      <circle cx="10.5" cy="18.5" r="1" fill="#14b8a6"/>
      <circle cx="13.5" cy="19.5" r="0.75" fill="#14b8a6" opacity="0.7"/>
    </svg>
  );
}

export function HeroCardFan({ className = "" }: { className?: string }) {
  const [fanned, setFanned] = useState(false);
  const expand = useCallback(() => setFanned(true), []);
  const collapse = useCallback(() => setFanned(false), []);

  const c1Transform = "translateX(0px) translateY(0px) scale(1)";

  const c2Transform = fanned
    ? `translateX(${FAN_OFFSET}px) translateY(0px) scale(1)`
    : "translateX(0px) translateY(10px) scale(0.965)";

  const c3Transform = fanned
    ? `translateX(${FAN_OFFSET * 2}px) translateY(0px) scale(1)`
    : "translateX(0px) translateY(20px) scale(0.93)";

  const cardBase = "absolute top-0 rounded-2xl select-none flex items-center gap-3 px-4";

  return (
    <div className={`mt-6 ${className}`}>
      <div
        className="relative cursor-pointer"
        style={{ height: CARD_H + 24, width: CARD_W }}
        onMouseEnter={expand}
        onMouseLeave={collapse}
        onFocus={expand}
        onBlur={(e) => {
          // Only collapse if focus leaves the whole group entirely
          if (!e.currentTarget.contains(e.relatedTarget as Node | null)) collapse();
        }}
        data-testid="hero-card-fan"
      >
        {/* Card 3 — Lab Tests (bottom of stack, fans right) */}
        <Link
          href="/lab-tests"
          tabIndex={fanned ? 0 : -1}
          onClick={(e) => { if (!fanned) { e.preventDefault(); expand(); } }}
          data-testid="card-hero-lab-tests"
          style={{
            ...TRANSITION,
            width: CARD_W,
            height: CARD_H,
            zIndex: 1,
            transform: c3Transform,
            opacity: fanned ? 1 : 0.78,
            pointerEvents: fanned ? "auto" : "none",
          }}
          className={`${cardBase} bg-white dark:bg-gray-900 border border-gray-200/80 dark:border-white/10 shadow-md hover:shadow-lg`}
        >
          <FlaskIcon />
          <div>
            <p className="font-semibold text-sm text-gray-900 dark:text-white leading-tight">Lab Tests</p>
            <p className="text-[11px] text-gray-400 dark:text-white/40">400+ diagnostics</p>
          </div>
        </Link>

        {/* Card 2 — Consultation (middle of stack, stays center in fan) */}
        <Link
          href="/consultants"
          tabIndex={fanned ? 0 : -1}
          onClick={(e) => { if (!fanned) { e.preventDefault(); expand(); } }}
          data-testid="card-hero-consultation"
          style={{
            ...TRANSITION,
            width: CARD_W,
            height: CARD_H,
            zIndex: 2,
            transform: c2Transform,
            opacity: fanned ? 1 : 0.88,
            pointerEvents: fanned ? "auto" : "none",
          }}
          className={`${cardBase} bg-white dark:bg-gray-900 border border-gray-200/80 dark:border-white/10 shadow-md hover:shadow-lg`}
        >
          <StethIcon />
          <div>
            <p className="font-semibold text-sm text-gray-900 dark:text-white leading-tight">Consultation</p>
            <p className="text-[11px] text-gray-400 dark:text-white/40">Specialist video</p>
          </div>
        </Link>

        {/* Card 1 — Enter Perfusion (top of stack, fans left) */}
        <Link
          href="/home"
          tabIndex={0}
          onClick={(e) => { if (!fanned) { e.preventDefault(); expand(); } }}
          data-testid="button-enter-perfusion"
          style={{
            ...TRANSITION,
            width: CARD_W,
            height: CARD_H,
            zIndex: 3,
            transform: c1Transform,
            opacity: 1,
            pointerEvents: "auto",
          }}
          className={`${cardBase} justify-between px-5 bg-gradient-to-r from-red-700 via-red-600 to-red-700 border border-red-500/40 shadow-lg shadow-red-900/30`}
        >
          <span className="font-semibold text-base text-white tracking-wide">Enter Perfusion</span>
          <ArrowRight className="h-5 w-5 text-white/80 shrink-0 transition-transform duration-300" />
        </Link>

        {/* Invisible overlay — intercepts clicks when stacked to fan instead of navigate */}
        {!fanned && (
          <div
            className="absolute inset-0 z-10"
            onClick={expand}
            aria-hidden="true"
          />
        )}
      </div>

      {/* Subtle hint that fades once expanded */}
      <p
        className={`mt-2 text-xs text-gray-400 dark:text-white/30 transition-opacity duration-300 select-none ${fanned ? "opacity-0 pointer-events-none" : "opacity-100"}`}
        aria-hidden="true"
      >
        tap or hover to explore
      </p>
    </div>
  );
}
