export function AppBrand({ surface, className = "brand" }) {
  return (
    <div className={className}>
      KEYFORTA <span>/ {surface}</span>
    </div>
  );
}