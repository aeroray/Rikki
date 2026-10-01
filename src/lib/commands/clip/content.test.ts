import { describe, expect, it } from "vitest";
import {
  clipFileName,
  clipFilePaths,
  clipKind,
  clipLineCount,
  clipPreview,
  matchesClipQuery,
} from "$lib/commands/clip/content";
import type { ClipboardEntry } from "$lib/commands/types";

function text(content: string, extra: Partial<ClipboardEntry> = {}): ClipboardEntry {
  return {
    id: "t",
    type: "text",
    content,
    appName: "",
    createdAt: 1,
    pinned: false,
    ...extra,
  };
}

describe("naming a clip's kind", () => {
  it("reads an image and a file list from the entry type", () => {
    expect(clipKind(text("x", { type: "image" }))).toBe("image");
    expect(clipKind(text("C:\\a.png\nC:\\b.png", { type: "files" }))).toBe("files");
  });

  it("recognises a colour, a link, an address and a path", () => {
    expect(clipKind(text("#ff6363"))).toBe("color");
    expect(clipKind(text("rgba(255, 99, 99, 0.5)"))).toBe("color");
    expect(clipKind(text("https://example.com/a?b=1"))).toBe("url");
    expect(clipKind(text("someone@example.com"))).toBe("email");
    expect(clipKind(text("C:\\Users\\me\\notes.txt"))).toBe("path");
    expect(clipKind(text("C:/Users/me/notes.txt"))).toBe("path");
    expect(clipKind(text("\\\\server\\share\\file.txt"))).toBe("path");
    expect(clipKind(text("~/Documents/notes.txt"))).toBe("path");
    expect(clipKind(text("/usr/local/bin"))).toBe("path");
  });

  it("leaves prose, fragments and near-paths as text", () => {
    expect(clipKind(text("just a line"))).toBe("text");
    expect(clipKind(text("/help"))).toBe("text");
    expect(clipKind(text("// a comment"))).toBe("text");
    expect(clipKind(text("and/or"))).toBe("text");
    expect(clipKind(text("C:"))).toBe("text");
    expect(clipKind(text("#hashtag"))).toBe("text");
  });

  it("calls a body with a line break a block, and keeps that out of the short kinds", () => {
    expect(clipKind(text("first\nsecond"))).toBe("multiline");
    // A link copied out of a text file carries the line's newline; the body is
    // still one line, and the link icon is the one that describes it.
    expect(clipKind(text("https://example.com\n"))).toBe("url");
    expect(clipKind(text("  #ff6363  "))).toBe("color");
  });

  it("does not treat a long body as any of the short kinds", () => {
    const long = `https://example.com/${"a".repeat(4000)}`;
    expect(clipKind(text(long))).toBe("text");
    expect(clipKind(text(`#ff6363${"a".repeat(4000)}`))).toBe("text");
    expect(clipKind(text(`${"a".repeat(4000)}\nsecond`))).toBe("multiline");
  });
});

describe("counting the lines of a body", () => {
  it("counts what a row would show", () => {
    expect(clipLineCount("one line")).toBe(1);
    expect(clipLineCount("one\ntwo\nthree")).toBe(3);
    expect(clipLineCount("trailing\n")).toBe(2);
  });

  it("stops counting at the limit instead of walking the whole body", () => {
    expect(clipLineCount("a\n".repeat(500))).toBe(100);
    expect(clipLineCount("a\n".repeat(500), 5)).toBe(6);
  });
});

describe("reading a file list", () => {
  it("splits the stored paths", () => {
    const entry = text("C:\\a\\one.txt\nC:\\a\\two.txt", { type: "files" });
    expect(clipFilePaths(entry)).toEqual(["C:\\a\\one.txt", "C:\\a\\two.txt"]);
    expect(clipFilePaths(text("not files"))).toEqual([]);
  });

  it("names a path by its last segment, on either separator", () => {
    expect(clipFileName("C:\\Users\\me\\notes.txt")).toBe("notes.txt");
    expect(clipFileName("/home/me/notes.txt")).toBe("notes.txt");
    expect(clipFileName("notes.txt")).toBe("notes.txt");
  });
});

describe("matching a row against the search field", () => {
  it("finds a body by its own text", () => {
    expect(matchesClipQuery(text("release notes for 1.2"), "release")).toBe(true);
    expect(matchesClipQuery(text("release notes for 1.2"), "zzz")).toBe(false);
  });

  it("finds an image by what it is, not by its hashed file name", () => {
    const image = text("C:\\clipboard\\images\\8678058480211624207.png", {
      type: "image",
      width: 600,
      height: 400,
      appName: "Explorer",
    });
    expect(matchesClipQuery(image, "image")).toBe(true);
    expect(matchesClipQuery(image, "图片")).toBe(true);
    expect(matchesClipQuery(image, "600x400")).toBe(true);
    expect(matchesClipQuery(image, "8678058480")).toBe(false);
  });

  it("finds a copied file list by what it is", () => {
    const files = text("C:\\Users\\me\\notes.txt", { type: "files" });
    expect(matchesClipQuery(files, "files")).toBe(true);
    expect(matchesClipQuery(files, "文件")).toBe(true);
    expect(matchesClipQuery(files, "notes")).toBe(true);
  });

  it("finds a link by the word for it", () => {
    expect(matchesClipQuery(text("https://example.com"), "链接")).toBe(true);
    expect(matchesClipQuery(text("https://example.com"), "example")).toBe(true);
  });

  it("does not put a keyword on every text row", () => {
    // "text" is not a keyword for the `text` kind: if it were, every row would
    // answer "contains" for almost any query and the ranking would say nothing.
    expect(matchesClipQuery(text("nothing here"), "text")).toBe(false);
    expect(matchesClipQuery(text("nothing here"), "zzz")).toBe(false);
  });
});

describe("the preview a row shows", () => {
  it("collapses a body onto one line and cuts it short", () => {
    expect(clipPreview("one\n  two   three")).toBe("one two three");
    expect(clipPreview("x".repeat(200))).toBe(`${"x".repeat(60)}…`);
    expect(clipPreview("short")).toBe("short");
  });

  it("reads a bounded window, not the whole body", () => {
    // The point of the bound: a body that opens with more than a window of blank
    // space still previews its first real line.
    expect(clipPreview(`${" ".repeat(2000)}deep`)).toBe("deep");
    // The scan for that first character is bounded as well, so a body whose
    // opening is blank past the scan previews as nothing rather than walking
    // megabytes to find the one line that is not blank.
    expect(clipPreview(`${" ".repeat(9000)}far`)).toBe("");
  });

  it("keeps a block's opening rather than the whole of it", () => {
    const preview = clipPreview("const a = 1;\n".repeat(50));
    expect(preview.startsWith("const a = 1; const a = 1;")).toBe(true);
    expect(preview.endsWith("…")).toBe(true);
    expect(preview.length).toBe(61);
  });
});
