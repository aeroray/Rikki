import QRCode from "qrcode";

const OPTIONS = {
  margin: 2,
  color: { dark: "#000000", light: "#ffffff" },
  errorCorrectionLevel: "H" as const,
};

export async function generateQrSvg(text: string): Promise<string> {
  return QRCode.toString(text, {
    ...OPTIONS,
    type: "svg",
    width: 200,
  });
}

export async function generateQrPngBytes(text: string): Promise<Uint8Array> {
  const dataUrl = await QRCode.toDataURL(text, {
    ...OPTIONS,
    width: 400,
  });
  const res = await fetch(dataUrl);
  const buffer = await res.arrayBuffer();
  return new Uint8Array(buffer);
}

export function payloadKind(data: string): "url" | "json" | "text" {
  const text = data.trim();
  if (/^https?:\/\//i.test(text)) return "url";
  if ((text.startsWith("{") && text.endsWith("}")) || (text.startsWith("[") && text.endsWith("]"))) {
    try {
      JSON.parse(text);
      return "json";
    } catch {
      return "text";
    }
  }
  return "text";
}
