import { SVGProps } from "react";

/**
 * Three claw marks fanning outward from a shared base — outer claws coral (deny),
 * centre emerald (allow). All strokes converge at the bottom like extended claws.
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
      {/* Left claw — fans upper-left */}
      <path
        d="M 24 44 C 20 32 10 18 6 5"
        stroke="#FF5C6C"
        strokeWidth="5"
        strokeLinecap="round"
        strokeOpacity="0.9"
      />
      {/* Centre claw — goes straight up */}
      <path
        d="M 24 44 C 24 30 23 17 24 5"
        stroke="#3DDC97"
        strokeWidth="5"
        strokeLinecap="round"
        strokeOpacity="0.85"
      />
      {/* Right claw — fans upper-right */}
      <path
        d="M 24 44 C 28 32 38 18 42 5"
        stroke="#FF5C6C"
        strokeWidth="5"
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
  md: "h-8 w-8",
  lg: "h-14 w-14",
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
      <div className={`flex flex-col items-center gap-2 ${className}`}>
        <ClawMark className={markSize[size === "lg" ? "lg" : "md"]} />
        <div className="text-center">
          <p className={`font-display font-bold text-mist-100 tracking-tight leading-none ${wordSize[size]}`}>
            LeashClaw
          </p>
          <p className={`font-mono text-mist-700 mt-1 tracking-widest uppercase ${subSize[size]}`}>
            agent governance console
          </p>
        </div>
      </div>
    );
  }

  // horizontal — mark beside wordmark
  return (
    <div className={`flex items-center gap-3 ${className}`}>
      <ClawMark className={markSize[size]} />
      <div>
        <p className={`font-display font-bold text-mist-100 tracking-tight leading-none ${wordSize[size]}`}>
          LeashClaw
        </p>
        <p className={`font-mono text-mist-700 tracking-widest uppercase ${subSize[size]}`}>
          governance console
        </p>
      </div>
    </div>
  );
}
