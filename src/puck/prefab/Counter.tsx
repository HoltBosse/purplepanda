import type { ComponentConfig } from "@puckeditor/core";
import { useState } from "react";

export type CounterProps = {
  label: string;
  start: number;
  step: number;
};

// Reference implementation of a whole-component island. `island: true` opts it into front-end
// hydration: on a published page the button below is server-rendered as static HTML and then
// hydrated into a live React root, so `useState` and the click handler work. Everything around it
// on the page stays static.
//
// The only constraint versus a normal component is that every prop must be JSON-serializable
// (primitives, plain objects/arrays) — no `slot` fields or `ReactNode` props — because the props
// travel to the browser inside the island marker. See src/puck/islands.tsx.
const Counter: ComponentConfig<CounterProps> = {
  label: "Counter",
  island: true,
  locations: ["page", "template"],
  fields: {
    label: { type: "text", label: "Label" },
    start: { type: "number", label: "Start value" },
    step: { type: "number", label: "Step" },
  },
  defaultProps: {
    label: "Count",
    start: 0,
    step: 1,
  },
  render: ({ label, start, step }) => {
    const [count, setCount] = useState(start);
    return (
      <button type="button" className="btn" onClick={() => setCount((c) => c + step)}>
        {label}: {count}
      </button>
    );
  },
};

export default Counter;
