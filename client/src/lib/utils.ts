import { clsx, type ClassValue } from "clsx"
import { twMerge } from "tailwind-merge"

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}

/**
 * 개인정보 보호를 위해 이름 마스킹
 * 예: "홍길동" → "홍길*", "홍길" → "홍*", "김" → "김"
 */
export function maskName(name: string | null | undefined): string {
  if (!name) return "";
  const trimmed = name.trim();
  if (trimmed.length <= 1) return trimmed;
  return trimmed.slice(0, trimmed.length - 1) + "*";
}
