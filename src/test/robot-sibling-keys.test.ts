import { readFileSync } from "node:fs";
import ts from "typescript";
import { describe, expect, it } from "vitest";

// React matches keyed siblings by identity on every polling update. Reusing a key
// for different components can leave orphan DOM nodes even when JSX lists each once.
describe.each(["grade", "estrategia"])("%s component identities", (route) => {
  it("does not reuse an explicit key among JSX siblings", () => {
    const source = ts.createSourceFile(
      `${route}.tsx`,
      readFileSync(`src/routes/${route}.tsx`, "utf8"),
      ts.ScriptTarget.Latest,
      true,
      ts.ScriptKind.TSX,
    );
    const collisions: string[] = [];
    function visit(node: ts.Node) {
      if (ts.isJsxElement(node) || ts.isJsxFragment(node)) {
        const seen = new Set<string>();
        for (const child of node.children) {
          const element = ts.isJsxElement(child)
            ? child.openingElement
            : ts.isJsxSelfClosingElement(child)
              ? child
              : null;
          const key = element?.attributes.properties
            .find(
              (p): p is ts.JsxAttribute => ts.isJsxAttribute(p) && p.name.getText(source) === "key",
            )
            ?.initializer?.getText(source);
          if (!key) continue;
          if (seen.has(key)) collisions.push(`${element?.tagName.getText(source)}: ${key}`);
          seen.add(key);
        }
      }
      ts.forEachChild(node, visit);
    }
    visit(source);
    expect(collisions).toEqual([]);
  });
});
