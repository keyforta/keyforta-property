export function MetricCard({ label, value, note, className = "metric-card" }) {
  return (
    <article className={className}>
      <span>{label}</span>
      <strong>{value}</strong>
      <small>{note}</small>
    </article>
  );
}