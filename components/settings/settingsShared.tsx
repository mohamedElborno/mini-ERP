"use client";

// ─── Section Card ───────────────────────────────────────────────────────────

export function SectionCard({
  title,
  children,
}: {
  title: string;
  children: React.ReactNode;
}) {
  return (
    <div className="border-border bg-card rounded-xl border shadow-sm">
      <div className="border-border border-b px-5 py-4">
        <h2 className="text-base font-semibold">{title}</h2>
      </div>
      <div className="p-5">{children}</div>
    </div>
  );
}

// ─── Field Row ───────────────────────────────────────────────────────────────

export function FieldRow({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}) {
  return (
    <div className="flex flex-col gap-1 sm:flex-row sm:items-center sm:gap-4">
      <span className="text-muted-foreground w-44 shrink-0 text-sm">
        {label}
      </span>
      <div className="flex-1">{children}</div>
    </div>
  );
}

// ─── Input / Select / Btn ───────────────────────────────────────────────────

export function Input(props: React.InputHTMLAttributes<HTMLInputElement>) {
  return (
    <input
      {...props}
      className="border-input bg-background text-foreground placeholder:text-muted-foreground focus-visible:ring-ring w-full rounded-lg border px-3 py-2 text-sm outline-none focus-visible:ring-2 disabled:opacity-50"
    />
  );
}

export function Select(
  props: React.SelectHTMLAttributes<HTMLSelectElement>,
) {
  return (
    <select
      {...props}
      className="border-input bg-background text-foreground focus-visible:ring-ring w-full rounded-lg border px-3 py-2 text-sm outline-none focus-visible:ring-2 disabled:opacity-50"
    />
  );
}

export function Btn({
  children,
  variant = "primary",
  disabled,
  onClick,
  type = "button",
}: {
  children: React.ReactNode;
  variant?: "primary" | "ghost" | "danger";
  disabled?: boolean;
  onClick?: () => void;
  type?: "button" | "submit";
}) {
  const cls =
    variant === "primary"
      ? "bg-primary text-primary-foreground hover:bg-primary/90"
      : variant === "danger"
        ? "bg-destructive/10 text-destructive hover:bg-destructive/20"
        : "border-border bg-background hover:bg-muted border text-sm";

  return (
    <button
      type={type}
      disabled={disabled}
      onClick={onClick}
      className={`rounded-lg px-4 py-2 text-sm font-medium transition-colors disabled:opacity-50 ${cls}`}
    >
      {children}
    </button>
  );
}
