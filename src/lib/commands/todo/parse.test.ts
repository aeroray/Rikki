import { describe, expect, it } from "vitest";

import { filterTagOf, parseTodoInput } from "$lib/commands/todo/parse";

describe("parseTodoInput", () => {
  it("reads plain text as a todo with no label", () => {
    expect(parseTodoInput("买牛奶")).toEqual({ kind: "create", text: "买牛奶", tag: "" });
    expect(parseTodoInput("  buy milk  ")).toEqual({
      kind: "create",
      text: "buy milk",
      tag: "",
    });
  });

  it("takes a trailing #label as the label", () => {
    expect(parseTodoInput("买牛奶 #购物")).toEqual({
      kind: "create",
      text: "买牛奶",
      tag: "购物",
    });
    expect(parseTodoInput("fix the parser #rikki")).toEqual({
      kind: "create",
      text: "fix the parser",
      tag: "rikki",
    });
  });

  it("reads a line that is only a label as a filter", () => {
    expect(parseTodoInput("#购物")).toEqual({ kind: "filter", tag: "购物" });
    expect(parseTodoInput("   #购物   ")).toEqual({ kind: "filter", tag: "购物" });
  });

  /// The rule is "ends the line, starts at a word boundary", and these are the
  /// strings that rule exists to leave alone.
  it("leaves a # that is not a trailing label as text", () => {
    expect(parseTodoInput("议题#3")).toEqual({ kind: "create", text: "议题#3", tag: "" });
    expect(parseTodoInput("#1 修 bug")).toEqual({
      kind: "create",
      text: "#1 修 bug",
      tag: "",
    });
    expect(parseTodoInput("买牛奶 #购物 谢谢")).toEqual({
      kind: "create",
      text: "买牛奶 #购物 谢谢",
      tag: "",
    });
  });

  it("is empty for whitespace", () => {
    expect(parseTodoInput("")).toEqual({ kind: "empty" });
    expect(parseTodoInput("   ")).toEqual({ kind: "empty" });
  });
});

describe("filterTagOf", () => {
  it("narrows only for a line that is purely a label", () => {
    expect(filterTagOf("#购物")).toBe("购物");
    expect(filterTagOf("")).toBe("");
    // Being typed as a new item, with or without a label of its own.
    expect(filterTagOf("买牛奶")).toBe("");
    expect(filterTagOf("买牛奶 #购物")).toBe("");
  });
});
