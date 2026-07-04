import { SVGProps } from "react";

/**
 * LeashClaw mark — 3 diagonal claw-scratch strokes in signal colours.
 * Left + right in coral (deny), centre in emerald (allow).
 * Slight inward curve on each stroke so they read as claw marks at any size.
 */
export function ClawMark({ className, ...props }: SVGProps<SVGSVGElement>) {
  return (
    <svg
      viewBox="0 0 48 48"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      aria-hidden="true"
      className={className}
      {...props}
    >
      {/* Left claw — coral */}
      <path
        d="M 7 4 C 9 16 11 30 13 44"
        stroke="#FF5C6C"
        strokeWidth="5.5"
        strokeLinecap="round"
        strokeOpacity="0.9"
      />
      {/* Centre claw — emerald */}
      <path
        d="M 20 4 C 22 16 24 30 26 44"
        stroke="#3DDC97"
        strokeWidth="5.5"
        strokeLinecap="round"
        strokeOpacity="0.85"
      />
      {/* Right claw — coral */}
      <path
        d="M 33 4 C 35 16 37 30 39 44"
        stroke="#FF5C6C"
        strokeWidth="5.5"
        strokeLinecap="round"
        strokeOpacity="0.9"
      />
    </svg>
  );
}

interface LogoProps {
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
    return <ClawMark className={`${markSize[size]} ${className}`} />;
  }

  if (variant === "stacked") {
    return (
      <div className={`flex flex-col items-center gap-3 ${className}`}>
        <ClawMark className={markSize[size === "lg" ? "lg" : "md"]} />
        <div className="text-center">
          <p className={`font-display font-medium text-mist-100 tracking-tight leading-none ${wordSize[size]}`}>
            LeashClaw
          </p>
          <p className={`font-mono text-mist-700 mt-1 tracking-widest uppercase ${subSize[size]}`}>
            agent governance console
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className={`flex items-center gap-2.5 ${className}`}>
      <ClawMark className={markSize[size]} />
      <span className={`font-display font-medium text-mist-100 tracking-tight leading-none ${wordSize[size]}`}>
        LeashClaw
      </span>
    </div>
  );
}
