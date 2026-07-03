import { SVGProps } from "react";

/**
 * Guardrail pulse mark — 6 decision-pulse bars mirroring the dashboard's
 * DecisionPulse component. Allow bars (emerald, shorter) alternate with
 * deny bars (coral, taller), reading as a security fence / guardrail at
 * a distance and as the live enforcement pulse up close.
 */
export function PulseMark({ className, ...props }: SVGProps<SVGSVGElement>) {
  return (
    <svg
      viewBox="0 0 48 48"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      aria-hidden="true"
      className={className}
      {...props}
    >
      {/* Bar 1 · allow · h=14 */}
      <rect x="1.5"  y="32" width="5" height="14" rx="2" fill="#3DDC97" fillOpacity="0.85" />
      {/* Bar 2 · deny  · h=36 */}
      <rect x="9.5"  y="10" width="5" height="36" rx="2" fill="#FF5C6C" fillOpacity="0.9"  />
      {/* Bar 3 · allow · h=18 */}
      <rect x="17.5" y="28" width="5" height="18" rx="2" fill="#3DDC97" fillOpacity="0.85" />
      {/* Bar 4 · deny  · h=42 */}
      <rect x="25.5" y="4"  width="5" height="42" rx="2" fill="#FF5C6C" fillOpacity="0.9"  />
      {/* Bar 5 · allow · h=10 */}
      <rect x="33.5" y="36" width="5" height="10" rx="2" fill="#3DDC97" fillOpacity="0.85" />
      {/* Bar 6 · deny  · h=28 */}
      <rect x="41.5" y="18" width="5" height="28" rx="2" fill="#FF5C6C" fillOpacity="0.9"  />
    </svg>
  );
}

interface LogoProps {
  /**
   * "mark"       — icon only, no wordmark (use for favicons, tight spaces)
   * "horizontal" — icon left, wordmark right (default, sidebar / nav)
   * "stacked"    — icon centered above wordmark (login / marketing)
   */
  variant?: "mark" | "horizontal" | "stacked";
  size?: "xs" | "sm" | "md" | "lg";
  className?: string;
}

const markSize = {
  xs: "h-4 w-4",
  sm: "h-5 w-5",
  md: "h-7 w-7",
  lg: "h-12 w-12",
};

const wordSize = {
  xs: "text-sm",
  sm: "text-base",
  md: "text-xl",
  lg: "text-3xl",
};

const subSize = {
  xs: "text-[9px]",
  sm: "text-[10px]",
  md: "text-xs",
  lg: "text-sm",
};

export default function Logo({ variant = "horizontal", size = "md", className = "" }: LogoProps) {
  if (variant === "mark") {
    return <PulseMark className={`${markSize[size]} ${className}`} />;
  }

  if (variant === "stacked") {
    return (
      <div className={`flex flex-col items-center gap-3 ${className}`}>
        <PulseMark className={markSize[lg_or_md(size)]} />
        <div className="text-center">
          <p className={`font-display font-medium text-mist-100 tracking-tight leading-none ${wordSize[size]}`}>
            Guardrail
          </p>
          <p className={`font-mono text-mist-700 mt-1 tracking-widest uppercase ${subSize[size]}`}>
            agent governance console
          </p>
        </div>
      </div>
    );
  }

  // horizontal (default)
  return (
    <div className={`flex items-center gap-2.5 ${className}`}>
      <PulseMark className={markSize[size]} />
      <span className={`font-display font-medium text-mist-100 tracking-tight leading-none ${wordSize[size]}`}>
        Guardrail
      </span>
    </div>
  );
}

function lg_or_md(size: LogoProps["size"]) {
  return size === "lg" ? "lg" : "md";
}
