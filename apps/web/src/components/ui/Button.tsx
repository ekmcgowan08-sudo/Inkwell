import { forwardRef, type ButtonHTMLAttributes } from "react";

type Variant = "primary" | "secondary" | "ghost" | "danger";

interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: Variant;
  size?: "md" | "sm";
}

export const Button = forwardRef<HTMLButtonElement, ButtonProps>(function Button(
  { variant = "primary", size = "md", className = "", ...props },
  ref,
) {
  const classes = ["iw-btn", `iw-btn-${variant}`, size === "sm" ? "iw-btn-sm" : "", className].filter(Boolean).join(" ");
  return <button ref={ref} className={classes} {...props} />;
});

export function IconButton({
  label,
  children,
  className = "",
  ...props
}: ButtonHTMLAttributes<HTMLButtonElement> & { label: string; children: React.ReactNode }) {
  return (
    <button aria-label={label} title={label} className={`iw-icon-btn ${className}`} {...props}>
      {children}
    </button>
  );
}
