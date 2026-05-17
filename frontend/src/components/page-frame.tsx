import { ReactNode } from "react";
import { Eyebrow } from "./ui";

export function PageFrame({
  eyebrow,
  title,
  description,
  children,
}: {
  eyebrow: string;
  title: string;
  description: string;
  children: ReactNode;
}) {
  return (
    <div>
      <header style={{ marginBottom: 28 }}>
        <Eyebrow style={{ marginBottom: 6 }}>{eyebrow}</Eyebrow>
        <h1
          style={{
            margin: 0,
            fontFamily: "var(--serif)",
            fontSize: "clamp(1.9rem, 3.6vw, 2.6rem)",
            lineHeight: 1.05,
            fontWeight: 400,
            color: "var(--ink)",
          }}
        >
          {title}
        </h1>
        <p
          style={{
            margin: "10px 0 0",
            maxWidth: 760,
            fontSize: 14,
            lineHeight: 1.55,
            color: "var(--ink-2)",
          }}
        >
          {description}
        </p>
      </header>
      <section>{children}</section>
    </div>
  );
}
