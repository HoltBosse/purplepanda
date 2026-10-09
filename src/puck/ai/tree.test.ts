import type { Data } from "@puckeditor/core";
import { describe, expect, it } from "vitest";
import { deepMerge, findNode, insertNodes, moveNode, outline, readableProps, removeNodes, type Shapes, updateProps } from "./tree.js";

const shapes: Shapes = {
  Section: { slots: ["content"], defaultProps: { scheme: "default", paddingY: 12, content: [] } },
  Rich: { slots: [], defaultProps: { content: "" } },
  Button: { slots: [], defaultProps: { children: "Button", href: "", image: { file: null, position: "start", gap: 2 } } },
};

function doc(): Data {
  return {
    root: { props: { title: "Home" } },
    content: [
      {
        type: "Section",
        props: {
          id: "Section-1",
          scheme: "default",
          paddingY: 12,
          content: [{ type: "Rich", props: { id: "Rich-1", content: "<h2>Hello <em>world</em></h2>" } }],
        },
      },
      { type: "Button", props: { id: "Button-1", children: "Go", href: "/go", image: { file: null, position: "start", gap: 2 } } },
    ],
  } as Data;
}

describe("insertNodes", () => {
  it("builds nested components over their defaults with fresh ids", () => {
    const data = doc();
    const ids = insertNodes(data, shapes, "root", undefined, 0, [
      { type: "Section", props: { scheme: "dark" }, slots: { content: [{ type: "Button", props: { children: "Buy" } }] } },
    ]);
    expect(ids).toHaveLength(2);
    const section = data.content[0] as { type: string; props: Record<string, any> };
    expect(section.type).toBe("Section");
    expect(section.props).toMatchObject({ id: ids[0], scheme: "dark", paddingY: 12 });
    expect(section.props.content[0].props).toMatchObject({ id: ids[1], children: "Buy", href: "", image: { position: "start" } });
  });

  it("targets a parent's first slot by default and clamps the index", () => {
    const data = doc();
    insertNodes(data, shapes, "Section-1", undefined, 99, [{ type: "Rich" }]);
    expect(findNode(data, shapes, "Section-1")?.node.props.content).toHaveLength(2);
  });

  it("leaves the document untouched when a spec is invalid", () => {
    const data = doc();
    expect(() => insertNodes(data, shapes, "root", undefined, 0, [{ type: "Rich" }, { type: "Nope" }])).toThrow(/Unknown component/);
    expect(data.content).toHaveLength(2);
    expect(() => insertNodes(data, shapes, "Button-1", undefined, 0, [{ type: "Rich" }])).toThrow(/no slots/);
  });

  it("doesn't let a spec choose its own id", () => {
    const data = doc();
    const [id] = insertNodes(data, shapes, "root", undefined, 0, [{ type: "Rich", props: { id: "Button-1" } }]);
    expect(id).not.toBe("Button-1");
  });
});

describe("updateProps", () => {
  it("deep-merges objects, replaces scalars and keeps the id", () => {
    const data = doc();
    updateProps(data, shapes, "Button-1", { children: "Start", image: { position: "end" }, id: "hijack" });
    const props = findNode(data, shapes, "Button-1")?.node.props;
    expect(props).toMatchObject({ id: "Button-1", children: "Start", image: { file: null, position: "end", gap: 2 } });
  });

  it("refuses to overwrite slots", () => {
    const data = doc();
    const ignored = updateProps(data, shapes, "Section-1", { content: [], scheme: "dark" });
    expect(ignored).toEqual(["content"]);
    expect(findNode(data, shapes, "Section-1")?.node.props.content).toHaveLength(1);
  });

  it("updates root props", () => {
    const data = doc();
    updateProps(data, shapes, "root", { title: "About" });
    expect(data.root.props).toEqual({ title: "About" });
  });
});

describe("moveNode / removeNodes", () => {
  it("moves a component into a slot", () => {
    const data = doc();
    moveNode(data, shapes, "Button-1", "Section-1", "content", 0);
    expect(data.content).toHaveLength(1);
    const children = findNode(data, shapes, "Section-1")?.node.props.content as { props: { id: string } }[] | undefined;
    expect(children?.[0]?.props.id).toBe("Button-1");
  });

  it("won't move a component into itself", () => {
    const data = doc();
    expect(() => moveNode(data, shapes, "Section-1", "Section-1", undefined, 0)).toThrow(/itself/);
  });

  it("removes nested components and reports missing ids", () => {
    const data = doc();
    expect(removeNodes(data, shapes, ["Rich-1", "ghost"])).toEqual(["ghost"]);
    expect(findNode(data, shapes, "Rich-1")).toBeNull();
  });
});

describe("outline / readableProps", () => {
  it("summarizes the tree one line per component", () => {
    expect(outline(doc(), shapes)).toBe(
      ['root title="Home"', "  - Section id=Section-1 scheme=\"default\"", "    [content]", '      - Rich id=Rich-1 content="Hello world"', '  - Button id=Button-1 children="Go" href="/go"'].join(
        "\n",
      ),
    );
  });

  it("lists slot children by id", () => {
    const node = findNode(doc(), shapes, "Section-1")?.node;
    expect(node && readableProps(node, shapes).content).toEqual(["Rich-1"]);
  });
});

describe("deepMerge", () => {
  it("replaces arrays rather than merging them", () => {
    expect(deepMerge({ a: [1, 2], b: { c: 1 } }, { a: [3], b: { d: 2 } })).toEqual({ a: [3], b: { c: 1, d: 2 } });
  });
});
