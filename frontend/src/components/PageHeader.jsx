export default function PageHeader({ eyebrow, title, children }) {
  return (
    <div className="flex flex-wrap items-end justify-between gap-4 mb-8 animate-rise">
      <div>
        {eyebrow && <div className="label mb-2">{eyebrow}</div>}
        <h1 className="font-display text-3xl sm:text-4xl font-extrabold tracking-tight text-white">{title}</h1>
      </div>
      <div className="flex flex-wrap gap-2">{children}</div>
    </div>
  );
}
