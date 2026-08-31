import { cn } from "@/lib/utils"

/**
 * Campo de formulário: rótulo, controle e dica.
 *
 * O rótulo é sempre visível. Placeholder como rótulo desaparece assim que a
 * pessoa começa a digitar, e aí ela não tem mais como conferir o que está
 * preenchendo — o problema aparece justamente na revisão, quando importa.
 */
export function Field({
  label,
  hint,
  htmlFor,
  children,
  className,
}: {
  label: string
  hint?: string
  htmlFor: string
  children: React.ReactNode
  className?: string
}) {
  return (
    <div className={cn("grid gap-1.5", className)}>
      <label
        htmlFor={htmlFor}
        className="text-[0.8125rem] font-medium text-foreground"
      >
        {label}
      </label>
      {children}
      {hint ? (
        <p className="text-xs leading-relaxed text-muted-foreground">{hint}</p>
      ) : null}
    </div>
  )
}

export const controlClass = cn(
  "h-10 w-full rounded-md border border-input bg-card px-3 text-sm",
  "text-foreground placeholder:text-muted-foreground/70",
  "outline-none transition focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring/25",
  "disabled:cursor-not-allowed disabled:opacity-60"
)

/** Aviso de erro do formulário. Diz o que houve, não pede desculpas. */
export function FormError({ children }: { children: React.ReactNode }) {
  return (
    <p
      role="alert"
      className="rounded-md border border-destructive/30 bg-destructive/8 px-3 py-2 text-sm text-destructive"
    >
      {children}
    </p>
  )
}

export function FormOk({ children }: { children: React.ReactNode }) {
  return (
    <p
      role="status"
      className="rounded-md border border-signal-up/30 bg-signal-up/8 px-3 py-2 text-sm text-signal-up"
    >
      {children}
    </p>
  )
}
