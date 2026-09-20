import { useId, type InputHTMLAttributes, type ReactNode, type SelectHTMLAttributes, type TextareaHTMLAttributes } from "react";

interface FieldWrapperProps {
  label: string;
  hint?: string;
  error?: string;
  children: (id: string, describedBy: string | undefined) => ReactNode;
}

function FieldWrapper({ label, hint, error, children }: FieldWrapperProps) {
  const id = useId();
  const hintId = hint ? `${id}-hint` : undefined;
  const errorId = error ? `${id}-error` : undefined;
  const describedBy = [hintId, errorId].filter(Boolean).join(" ") || undefined;
  return (
    <div className="iw-field">
      <label className="iw-field-label" htmlFor={id}>
        {label}
      </label>
      {children(id, describedBy)}
      {hint && (
        <span className="iw-help-text" id={hintId}>
          {hint}
        </span>
      )}
      {error && (
        <span className="iw-field-error" id={errorId} role="alert">
          {error}
        </span>
      )}
    </div>
  );
}

export function TextField({
  label,
  hint,
  error,
  ...props
}: { label: string; hint?: string; error?: string } & InputHTMLAttributes<HTMLInputElement>) {
  return (
    <FieldWrapper label={label} hint={hint} error={error}>
      {(id, describedBy) => <input id={id} className="iw-input" aria-describedby={describedBy} aria-invalid={!!error} {...props} />}
    </FieldWrapper>
  );
}

export function TextAreaField({
  label,
  hint,
  error,
  ...props
}: { label: string; hint?: string; error?: string } & TextareaHTMLAttributes<HTMLTextAreaElement>) {
  return (
    <FieldWrapper label={label} hint={hint} error={error}>
      {(id, describedBy) => <textarea id={id} className="iw-textarea" aria-describedby={describedBy} aria-invalid={!!error} {...props} />}
    </FieldWrapper>
  );
}

export function SelectField({
  label,
  hint,
  error,
  children,
  ...props
}: { label: string; hint?: string; error?: string; children: ReactNode } & SelectHTMLAttributes<HTMLSelectElement>) {
  return (
    <FieldWrapper label={label} hint={hint} error={error}>
      {(id, describedBy) => (
        <select id={id} className="iw-select" aria-describedby={describedBy} {...props}>
          {children}
        </select>
      )}
    </FieldWrapper>
  );
}
