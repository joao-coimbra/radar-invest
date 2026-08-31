"use client"

import { useActionState } from "react"
import { useFormStatus } from "react-dom"
import { type FormState, loginAction } from "@/app/actions"
import { controlClass, Field, FormError } from "@/components/field"
import { Button } from "@/components/ui/button"

function Submit() {
  const { pending } = useFormStatus()

  return (
    <Button type="submit" disabled={pending} className="h-10 w-full">
      {pending ? "Entrando…" : "Entrar"}
    </Button>
  )
}

export function LoginForm({ eliminado }: { eliminado?: boolean }) {
  const [state, action] = useActionState<FormState, FormData>(loginAction, {})

  return (
    <form action={action} className="grid gap-5">
      {eliminado ? (
        <p
          role="status"
          className="rounded-md border border-border bg-muted px-3 py-2 text-sm text-muted-foreground"
        >
          Sua conta e todos os dados vinculados foram eliminados.
        </p>
      ) : null}

      {state.error ? <FormError>{state.error}</FormError> : null}

      <Field label="E-mail" htmlFor="email">
        <input
          id="email"
          name="email"
          type="email"
          required
          autoComplete="email"
          autoFocus
          className={controlClass}
        />
      </Field>

      <Field label="Senha" htmlFor="password">
        <input
          id="password"
          name="password"
          type="password"
          required
          autoComplete="current-password"
          className={controlClass}
        />
      </Field>

      <Submit />
    </form>
  )
}
