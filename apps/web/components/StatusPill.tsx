export function StatusPill({ label, tone }: { label: string; tone: "good" | "bad" | "warn" }) {
  return <span className={`status ${tone}`}>{label}</span>;
}
