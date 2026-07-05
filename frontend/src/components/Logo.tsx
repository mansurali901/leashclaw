import { useId } from "react";
import { SVGProps } from "react";

export function ShieldMark({ className, ...props }: SVGProps<SVGSVGElement>) {
  const uid = useId().replace(/:/g, "");
  const gShield = `lcg-s-${uid}`;
  const gHighlight = `lcg-h-${uid}`;

  return (
    <svg
      viewBox="0 0 48 48"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      aria-hidden="true"
      className={className}
      {...props}
    >
      <defs>
        <linearGradient id={gShield} x1="24" y1="2" x2="24" y2="46" gradientUnits="userSpaceOnUse">
          <stop offset="0%" stopColor="#2563EB" />
          <stop offset="55%" stopColor="#1E40AF" />
          <stop offset="100%" stopColor="#1E3A8A" />
        </linearGradient>
        <radialGradient id={gHighlight} cx="35%" cy="25%" r="60%" gradientUnits="objectBoundingBox">
          <stop offset="0%" stopColor="#60A5FA" stopOpacity="0.25" />
          <stop offset="100%" stopColor="#60A5FA" stopOpacity="0" />
        </radialGradient>
      </defs>

      {/* Shield body */}
      <path
        d="M24 2 L6 8 L4.5 28.5 Q4.5 40.5 24 46.5 Q43.5 40.5 43.5 28.5 L42 8 Z"
        fill={`url(#${gShield})`}
      />
      {/* Highlight sheen */}
      <path
        d="M24 2 L6 8 L4.5 28.5 Q4.5 40.5 24 46.5 Q43.5 40.5 43.5 28.5 L42 8 Z"
        fill={`url(#${gHighlight})`}
      />
      {/* Shield border */}
      <path
        d="M24 2 L6 8 L4.5 28.5 Q4.5 40.5 24 46.5 Q43.5 40.5 43.5 28.5 L42 8 Z"
        fill="none"
        stroke="#60A5FA"
        strokeWidth="0.9"
        strokeOpacity="0.6"
      />

      {/* ── Network lines: Y-shape from AI node down to the two person nodes ── */}
      <line x1="24" y1="20.5" x2="24" y2="26.5" stroke="white" strokeWidth="1.3" strokeOpacity="0.5" />
      <line x1="24" y1="26.5" x2="13.5" y2="33.5" stroke="white" strokeWidth="1.3" strokeOpacity="0.5" />
      <line x1="24" y1="26.5" x2="34.5" y2="33.5" stroke="white" strokeWidth="1.3" strokeOpacity="0.5" />

      {/* ── AI / Robot node — top center ── */}
      <circle cx="24" cy="13.5" r="5.8" fill="#1E3A8A" stroke="#60A5FA" strokeWidth="1.4" />
      {/* Visor / sensor bar */}
      <rect x="20.5" y="11.8" width="7" height="3.2" rx="1.6" fill="#60A5FA" />
      {/* Sensor dots */}
      <circle cx="22.3" cy="13.4" r="0.9" fill="#DBEAFE" />
      <circle cx="25.7" cy="13.4" r="0.9" fill="#DBEAFE" />
      {/* Chin / lower face indicator */}
      <path d="M21.5 16.2 Q24 17.5 26.5 16.2" fill="none" stroke="#60A5FA" strokeWidth="0.8" strokeLinecap="round" strokeOpacity="0.7" />

      {/* ── Left person node ── */}
      <circle cx="13.5" cy="34" r="3.8" fill="#1E3A8A" stroke="#93C5FD" strokeWidth="1.2" />
      {/* Person head */}
      <circle cx="13.5" cy="32.1" r="1.7" fill="#93C5FD" />
      {/* Person shoulders arc */}
      <path d="M10.5 35.5 Q13.5 38.2 16.5 35.5" fill="none" stroke="#93C5FD" strokeWidth="1.1" strokeLinecap="round" />

      {/* ── Right person node ── */}
      <circle cx="34.5" cy="34" r="3.8" fill="#1E3A8A" stroke="#93C5FD" strokeWidth="1.2" />
      {/* Person head */}
      <circle cx="34.5" cy="32.1" r="1.7" fill="#93C5FD" />
      {/* Person shoulders arc */}
      <path d="M31.5 35.5 Q34.5 38.2 37.5 35.5" fill="none" stroke="#93C5FD" strokeWidth="1.1" strokeLinecap="round" />
    </svg>
  );
}

// Alias kept for any remaining imports
export const ClawMark = ShieldMark;

interface LogoProps {
  variant?: "mark" | "horizontal" | "stacked";
  size?: "xs" | "sm" | "md" | "nav" | "lg";
  className?: string;
}

const markSize = {
  xs:  "h-4 w-4",
  sm:  "h-6 w-6",
  nav: "h-8 w-8",
  md:  "h-9 w-9",
  lg:  "h-16 w-16",
};

const wordSize = {
  xs:  "text-sm",
  sm:  "text-base",
  nav: "text-base",
  md:  "text-xl",
  lg:  "text-3xl",
};

const subSize = {
  xs:  "text-[9px]",
  sm:  "text-[10px]",
  nav: "text-[10px]",
  md:  "text-[11px]",
  lg:  "text-sm",
};

export default function Logo({ variant = "horizontal", size = "md", className = "" }: LogoProps) {
  if (variant === "mark") {
    return <ShieldMark className={`${markSize[size]} ${className}`} />;
  }

  if (variant === "stacked") {
    const stackMarkSize = size === "lg" ? "lg" : size === "nav" ? "nav" : "md";
    return (
      <div className={`flex flex-col items-center gap-3 ${className}`}>
        <ShieldMark className={markSize[stackMarkSize]} />
        <div className="text-center">
          <p className={`font-display font-bold text-mist-100 tracking-tight leading-none ${wordSize[size]}`}>
            LeashClaw
          </p>
          <p className={`font-mono text-mist-600 mt-1.5 tracking-widest uppercase ${subSize[size]}`}>
            Governance Console
          </p>
        </div>
      </div>
    );
  }

  // horizontal — shield beside wordmark
  return (
    <div className={`flex items-center gap-2.5 ${className}`}>
      <ShieldMark className={markSize[size]} />
      <div>
        <p className={`font-display font-bold text-mist-100 tracking-tight leading-none ${wordSize[size]}`}>
          LeashClaw
        </p>
        <p className={`font-mono text-mist-600 tracking-widest uppercase ${subSize[size]}`}>
          Governance Console
        </p>
      </div>
    </div>
  );
}
