import type { ButtonHTMLAttributes, ReactNode } from 'react';

type Variant = 'primary' | 'secondary' | 'ghost' | 'danger';

const VARIANTS: Record<Variant, string> = {
  primary: 'bg-moss text-on-accent hover:bg-moss-dark active:bg-moss-dark shadow-sm',
  secondary: 'bg-card text-ink border border-line hover:bg-paper-deep',
  ghost: 'text-moss hover:bg-moss-soft',
  danger: 'bg-card text-rust border border-rust/40 hover:bg-rust-soft',
};

export function Button({
  variant = 'primary',
  size = 'md',
  className = '',
  children,
  ...props
}: ButtonHTMLAttributes<HTMLButtonElement> & { variant?: Variant; size?: 'md' | 'lg' | 'sm' }) {
  const sizes = {
    sm: 'min-h-10 px-3 text-[0.95rem]',
    md: 'min-h-12 px-5 text-base',
    lg: 'min-h-14 px-6 text-lg',
  };
  return (
    <button
      type="button"
      className={`inline-flex items-center justify-center gap-2 rounded-2xl font-semibold transition-colors disabled:opacity-50 ${sizes[size]} ${VARIANTS[variant]} ${className}`}
      {...props}
    >
      {children}
    </button>
  );
}

export function Card({
  children,
  className = '',
  as: As = 'section',
  ...rest
}: {
  children: ReactNode;
  className?: string;
  as?: 'section' | 'div' | 'aside' | 'article';
  'aria-labelledby'?: string;
  'aria-label'?: string;
  'data-testid'?: string;
}) {
  return (
    <As
      className={`rounded-[var(--radius-card)] border border-line bg-card p-5 shadow-[0_1px_0_rgba(0,0,0,0.03)] ${className}`}
      {...rest}
    >
      {children}
    </As>
  );
}

export function SectionTitle({
  id,
  children,
  eyebrow,
}: {
  id?: string;
  children: ReactNode;
  eyebrow?: string;
}) {
  return (
    <div className="mb-3">
      {eyebrow && (
        <p className="text-xs font-bold uppercase tracking-[0.12em] text-ink-muted">{eyebrow}</p>
      )}
      <h2 id={id} className="text-lg font-bold text-ink">
        {children}
      </h2>
    </div>
  );
}

export function Notice({
  tone = 'info',
  children,
  role,
}: {
  tone?: 'info' | 'warn' | 'error';
  children: ReactNode;
  role?: 'status' | 'alert';
}) {
  const tones = {
    info: 'bg-paper-deep text-ink-soft border-line',
    warn: 'bg-amber-soft text-amber border-amber/30',
    error: 'bg-rust-soft text-rust border-rust/30',
  };
  return (
    <div role={role} className={`rounded-2xl border px-4 py-3 text-[0.95rem] ${tones[tone]}`}>
      {children}
    </div>
  );
}

export function Chip({
  selected,
  disabled,
  children,
  onClick,
  note,
}: {
  selected?: boolean;
  disabled?: boolean;
  children: ReactNode;
  onClick?: () => void;
  note?: string;
}) {
  return (
    <button
      type="button"
      aria-pressed={selected}
      disabled={disabled}
      onClick={onClick}
      className={`inline-flex min-h-11 items-center gap-1.5 rounded-full border px-4 text-[0.95rem] font-semibold transition-colors ${
        selected
          ? 'border-moss bg-moss text-on-accent'
          : 'border-line bg-card text-ink hover:bg-paper-deep'
      } disabled:border-dashed disabled:bg-transparent disabled:text-ink-muted disabled:opacity-100`}
    >
      {children}
      {note && <span className="text-xs font-medium">· {note}</span>}
    </button>
  );
}

export function ExternalLink({
  href,
  children,
  className = '',
}: {
  href: string;
  children: ReactNode;
  className?: string;
}) {
  return (
    <a
      href={href}
      target="_blank"
      rel="noopener noreferrer"
      className={`font-semibold text-moss underline decoration-moss/30 underline-offset-4 hover:decoration-moss ${className}`}
    >
      {children}
      <span className="sr-only"> (opens in a new tab)</span>
    </a>
  );
}
