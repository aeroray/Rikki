import { nearestColorName } from "./names";

export type Rgba = {
  r: number;
  g: number;
  b: number;
  a: number;
};

export type ParsedColor = {
  rgba: Rgba;
  hex: string;
  rgb: string;
  hsl: string;
  rgbaCss: string;
  hsla: string;
  nameEn: string;
  nameZh: string;
};

const HEX = /^#([\da-f]{3}|[\da-f]{4}|[\da-f]{6}|[\da-f]{8})$/i;
const RGB_WRAP = /^rgba?\((.+)\)$/i;
const HSL_WRAP = /^hsla?\((.+)\)$/i;

export function isColorValue(text: string): boolean {
  return parseColor(text) !== null;
}

export function parseColor(input: string): ParsedColor | null {
  const text = input.trim();
  if (!text) return null;
  const rgba = parseHex(text) ?? parseRgb(text) ?? parseHsl(text);
  if (!rgba) return null;
  return formatColor(rgba);
}

export function colorQuery(searchText: string, commandRest: string, commandId: string | null): string {
  if (commandId === "color") return commandRest.trim();
  return searchText.trim();
}

export function formatColor(rgba: Rgba): ParsedColor {
  const { r, g, b, a } = clampRgba(rgba);
  const { h, s, l } = rgbToHsl(r, g, b);
  const name = nearestColorName(r, g, b);
  return {
    rgba: { r, g, b, a },
    hex: toHex(r, g, b, a),
    rgb: `rgb(${r}, ${g}, ${b})`,
    hsl: `hsl(${h}, ${s}%, ${l}%)`,
    rgbaCss: `rgba(${r}, ${g}, ${b}, ${formatAlpha(a)})`,
    hsla: `hsla(${h}, ${s}%, ${l}%, ${formatAlpha(a)})`,
    nameEn: name.en,
    nameZh: name.zh,
  };
}

function parseHex(text: string): Rgba | null {
  const match = HEX.exec(text);
  if (!match) return null;
  let hex = match[1] ?? "";
  if (hex.length === 3 || hex.length === 4) {
    hex = [...hex].map((ch) => ch + ch).join("");
  }
  const r = Number.parseInt(hex.slice(0, 2), 16);
  const g = Number.parseInt(hex.slice(2, 4), 16);
  const b = Number.parseInt(hex.slice(4, 6), 16);
  const a = hex.length === 8 ? Number.parseInt(hex.slice(6, 8), 16) / 255 : 1;
  return { r, g, b, a };
}

function parseRgb(text: string): Rgba | null {
  const match = RGB_WRAP.exec(text);
  if (!match) return null;
  const parts = splitCssColorArgs(match[1] ?? "");
  if (parts.length < 3 || parts.length > 4) return null;
  const r = parseChannel(parts[0] ?? "", 255);
  const g = parseChannel(parts[1] ?? "", 255);
  const b = parseChannel(parts[2] ?? "", 255);
  if (r === null || g === null || b === null) return null;
  const a = parts[3] === undefined ? 1 : parseAlpha(parts[3]);
  if (a === null) return null;
  return { r, g, b, a };
}

function parseHsl(text: string): Rgba | null {
  const match = HSL_WRAP.exec(text);
  if (!match) return null;
  const parts = splitCssColorArgs(match[1] ?? "");
  if (parts.length < 3 || parts.length > 4) return null;
  const h = parseHue(parts[0] ?? "");
  const s = parsePercent(parts[1] ?? "");
  const l = parsePercent(parts[2] ?? "");
  if (h === null || s === null || l === null) return null;
  const a = parts[3] === undefined ? 1 : parseAlpha(parts[3]);
  if (a === null) return null;
  const { r, g, b } = hslToRgb(h, s, l);
  return { r, g, b, a };
}

function splitCssColorArgs(inner: string): string[] {
  const trimmed = inner.trim();
  if (!trimmed) return [];
  const [channels, slashAlpha] = trimmed.split("/").map((part) => part.trim());
  const parts = (channels ?? "").split(/[\s,]+/).filter(Boolean);
  if (slashAlpha) parts.push(slashAlpha);
  return parts;
}

function parseChannel(raw: string, max: number): number | null {
  const trimmed = raw.trim();
  if (trimmed.endsWith("%")) {
    const value = Number.parseFloat(trimmed.slice(0, -1));
    if (!Number.isFinite(value)) return null;
    return clamp(Math.round((value / 100) * max), 0, max);
  }
  const value = Number.parseFloat(trimmed);
  if (!Number.isFinite(value)) return null;
  return clamp(Math.round(value), 0, max);
}

function parsePercent(raw: string): number | null {
  const trimmed = raw.trim().endsWith("%") ? raw.trim().slice(0, -1) : raw.trim();
  const value = Number.parseFloat(trimmed);
  if (!Number.isFinite(value)) return null;
  return clamp(value, 0, 100);
}

function parseHue(raw: string): number | null {
  const trimmed = raw.trim().replace(/deg$/i, "");
  const value = Number.parseFloat(trimmed);
  if (!Number.isFinite(value)) return null;
  return value;
}

function parseAlpha(raw: string): number | null {
  const trimmed = raw.trim();
  if (trimmed.endsWith("%")) {
    const value = Number.parseFloat(trimmed.slice(0, -1));
    if (!Number.isFinite(value)) return null;
    return clamp(value / 100, 0, 1);
  }
  const value = Number.parseFloat(trimmed);
  if (!Number.isFinite(value)) return null;
  return clamp(value, 0, 1);
}

function clampRgba({ r, g, b, a }: Rgba): Rgba {
  return {
    r: clamp(Math.round(r), 0, 255),
    g: clamp(Math.round(g), 0, 255),
    b: clamp(Math.round(b), 0, 255),
    a: clamp(a, 0, 1),
  };
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

function toHex(r: number, g: number, b: number, a: number): string {
  const rgb = `${hexByte(r)}${hexByte(g)}${hexByte(b)}`;
  if (a >= 1 - 0.5 / 255) return `#${rgb}`;
  return `#${rgb}${hexByte(Math.round(a * 255))}`;
}

function hexByte(value: number): string {
  return value.toString(16).padStart(2, "0").toUpperCase();
}

function formatAlpha(a: number): string {
  const rounded = Math.round(a * 1000) / 1000;
  if (Number.isInteger(rounded)) return String(rounded);
  return String(rounded);
}

function rgbToHsl(r: number, g: number, b: number): { h: number; s: number; l: number } {
  const rr = r / 255;
  const gg = g / 255;
  const bb = b / 255;
  const max = Math.max(rr, gg, bb);
  const min = Math.min(rr, gg, bb);
  const l = (max + min) / 2;
  if (max === min) return { h: 0, s: 0, l: Math.round(l * 100) };
  const d = max - min;
  const s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
  let h = 0;
  if (max === rr) h = (gg - bb) / d + (gg < bb ? 6 : 0);
  else if (max === gg) h = (bb - rr) / d + 2;
  else h = (rr - gg) / d + 4;
  return {
    h: Math.round(h * 60),
    s: Math.round(s * 100),
    l: Math.round(l * 100),
  };
}

function hslToRgb(h: number, s: number, l: number): { r: number; g: number; b: number } {
  const hh = ((h % 360) + 360) % 360;
  const ss = clamp(s, 0, 100) / 100;
  const ll = clamp(l, 0, 100) / 100;
  if (ss === 0) {
    const v = Math.round(ll * 255);
    return { r: v, g: v, b: v };
  }
  const q = ll < 0.5 ? ll * (1 + ss) : ll + ss - ll * ss;
  const p = 2 * ll - q;
  const hk = hh / 360;
  return {
    r: Math.round(hueToRgb(p, q, hk + 1 / 3) * 255),
    g: Math.round(hueToRgb(p, q, hk) * 255),
    b: Math.round(hueToRgb(p, q, hk - 1 / 3) * 255),
  };
}

function hueToRgb(p: number, q: number, t: number): number {
  let tt = t;
  if (tt < 0) tt += 1;
  if (tt > 1) tt -= 1;
  if (tt < 1 / 6) return p + (q - p) * 6 * tt;
  if (tt < 1 / 2) return q;
  if (tt < 2 / 3) return p + (q - p) * (2 / 3 - tt) * 6;
  return p;
}
