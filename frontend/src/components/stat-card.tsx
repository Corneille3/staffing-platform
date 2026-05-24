import { Eyebrow, Mono } from "./ui";

export function StatCard({
  label,
  value,
  tone, // legacy prop, accepted but ignored — the new design uses uniform card styling
}: {
  label: string;
  value: string | number;
  tone?: string;
}) {
  void tone;
  return (
    <article
      style={{
        borderRadius: 18,
        padding: 22,
        background: "var(--card)",
        border: "0.5px solid var(--line)",
      }}
    >
      <Eyebrow>{label}</Eyebrow>
      <Mono style={{ display: "block", marginTop: 10, fontSize: 36, lineHeight: 1, fontWeight: 500, color: "var(--ink)" }}>
        {value}
      </Mono>
    </article>
  );
}
