export function StatCard({
  label,
  value,
  tone,
}: {
  label: string;
  value: string | number;
  tone: string;
}) {
  return (
    <article
      style={{
        borderRadius: 24,
        padding: 24,
        background: tone,
        color: "#f9f5ea",
        boxShadow: "0 18px 36px rgba(24, 50, 41, 0.12)",
      }}
    >
      <p style={{ margin: 0, fontSize: 13, letterSpacing: "0.14em", textTransform: "uppercase" }}>
        {label}
      </p>
      <p style={{ margin: "12px 0 0", fontSize: 44, lineHeight: 1, fontWeight: 700 }}>{value}</p>
    </article>
  );
}
