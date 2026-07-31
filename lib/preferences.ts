import type { AccentColor, ThemePreference } from "@/lib/types";

export const THEME_PREFERENCES: ThemePreference[] = [
  "light",
  "dark",
  "system"
];

export interface AccentOption {
  id: AccentColor;
  label: string;
  color: string;
  soft: string;
  darkSoft: string;
}

export const ACCENT_OPTIONS: AccentOption[] = [
  {
    id: "blue",
    label: "Синий",
    color: "#2a7de1",
    soft: "#e7f1ff",
    darkSoft: "#17375f"
  },
  {
    id: "green",
    label: "Зелёный",
    color: "#2f9b66",
    soft: "#e5f6ed",
    darkSoft: "#183e2d"
  },
  {
    id: "violet",
    label: "Фиолетовый",
    color: "#7c62df",
    soft: "#f0ecff",
    darkSoft: "#352b63"
  },
  {
    id: "orange",
    label: "Оранжевый",
    color: "#e6802b",
    soft: "#fff0e2",
    darkSoft: "#56341c"
  },
  {
    id: "rose",
    label: "Розовый",
    color: "#d95f85",
    soft: "#fdeaf0",
    darkSoft: "#522839"
  },
  {
    id: "cyan",
    label: "Бирюзовый",
    color: "#188f9e",
    soft: "#e3f6f8",
    darkSoft: "#173e43"
  },
  {
    id: "indigo",
    label: "Индиго",
    color: "#5266d8",
    soft: "#e9edff",
    darkSoft: "#28315e"
  }
];

export const ACCENT_IDS = ACCENT_OPTIONS.map((option) => option.id);

export function isThemePreference(value: unknown): value is ThemePreference {
  return (
    typeof value === "string" &&
    THEME_PREFERENCES.includes(value as ThemePreference)
  );
}

export function isAccentColor(value: unknown): value is AccentColor {
  return (
    typeof value === "string" && ACCENT_IDS.includes(value as AccentColor)
  );
}

export function getAccentOption(accent: AccentColor): AccentOption {
  return (
    ACCENT_OPTIONS.find((option) => option.id === accent) ?? ACCENT_OPTIONS[0]
  );
}
