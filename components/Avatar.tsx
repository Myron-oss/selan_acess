"use client";

import { useState } from "react";

interface AvatarProps {
  name: string;
  tgId: number;
  url?: string | null;
  size?: "sm" | "md" | "lg" | "xl";
  className?: string;
}

const AVATAR_COLORS = [
  "#5b7cfa",
  "#16a085",
  "#8e6bd8",
  "#e67e22",
  "#d85f80",
  "#268ca3",
  "#5572a4",
  "#b36b3d"
];

const SIZE_CLASSES = {
  sm: "h-8 w-8 text-[11px]",
  md: "h-10 w-10 text-xs",
  lg: "h-14 w-14 text-base",
  xl: "h-20 w-20 text-xl"
};

export function getInitials(name: string): string {
  return (
    name
      .trim()
      .split(/\s+/)
      .slice(0, 2)
      .map((part) => part[0]?.toUpperCase() ?? "")
      .join("") || "?"
  );
}

function getAvatarColor(tgId: number): string {
  const normalized = Math.abs(Math.trunc(tgId));
  return AVATAR_COLORS[normalized % AVATAR_COLORS.length];
}

export default function Avatar({
  name,
  tgId,
  url,
  size = "md",
  className = ""
}: AvatarProps) {
  const [imageFailed, setImageFailed] = useState(false);

  return (
    <span
      className={`relative inline-flex shrink-0 items-center justify-center overflow-hidden rounded-full font-semibold text-white shadow-sm ring-2 ring-white/80 dark:ring-slate-800 ${SIZE_CLASSES[size]} ${className}`}
      style={{ backgroundColor: getAvatarColor(tgId) }}
      aria-label={`Аватар: ${name}`}
    >
      {url && !imageFailed ? (
        // URL хранится только после серверной проверки пути публичного bucket.
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={url}
          alt=""
          className="h-full w-full object-cover"
          onError={() => setImageFailed(true)}
        />
      ) : (
        getInitials(name)
      )}
    </span>
  );
}
