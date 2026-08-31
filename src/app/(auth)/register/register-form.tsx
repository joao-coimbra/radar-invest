"use client"

import { useActionState } from "react"
import { useFormStatus } from "react-dom"
import { type FormState, registerAction } from "@/app/actions"
import { controlClass, Field, FormError } from "@/components/field"
import { Button } from "@/components/ui/button"

function Submit() {
  const { pending } = useFormStatus()

  return (
    <Button type="submit" disabled={pending} className="h-10 w-full">
      {pending ? "Criando conta…" : "Criar conta"}
    </Button>
  )
}

export function RegisterForm() {
  const [state, action] = useActionState<FormState, FormData>(registerAction, {})

  return (
    <form action={action} className="grid gap-5">
      {state.error ? <FormError>{state.error}</FormError> : null}

      <Field label="Nome" htmlFor="name">
        <input
          id="name"
          name="name"
          required
          minLength={2}
          maxLength={120}
          autoComplete="name"
          autoFocus
          className={controlClass}
        />
      </Field>

      <Field label="E-mail" htmlFor="email">
        <input
          id="email"
          name="email"
          type="email"
          required
          maxLength={254}
          autoComplete="email"
          className={controlClass}
        />
      </Field>

      <Field
        label="Senha"
        htmlFor="password"
        hint="Mínimo de 12 caracteres. Guardada como hash scrypt — nem o sistema consegue lê-la de volta."
      >
        <input
          id="password"
          name="password"
          type="password"
          required
          minLength={12}
          maxLength={128}
          autoComplete="new-password"
          className={controlClass}
        />
      </Field>

      <div className="rounded-md border border-border bg-muted/60 p-3.5">
        <label htmlFor="consent" className="flex gap-2.5 text-sm">
          <input
            id="consent"
            name="consent"
            type="checkbox"
            required
            className="mt-0.5 size-4 shrink-0 accent-primary"
          />
          <span className="leading-relaxed">
            Autorizo o tratamento dos meus dados para monitorar minha carteira.
          </span>
        </label>
        <p className="mt-2.5 pl-6.5 text-xs leading-relaxed text-muted-foreground">
          O aceite fica registrado com data e versão do termo. Você pode exportar
          tudo o que guardamos, ou apagar a conta inteira, na página Conta.
        </p>
      </div>

      <Submit />
    </form>
  )
}
