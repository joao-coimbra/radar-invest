"use client"

import { useActionState } from "react"
import { useFormStatus } from "react-dom"
import { createAssetAction, type FormState } from "@/app/actions"
import { controlClass, Field, FormError, FormOk } from "@/components/field"
import { Button } from "@/components/ui/button"

function Submit() {
  const { pending } = useFormStatus()

  return (
    <Button type="submit" disabled={pending} className="h-10 sm:w-auto">
      {pending ? "Cadastrando…" : "Monitorar ativo"}
    </Button>
  )
}

export function AssetForm({ defaultEmail }: { defaultEmail: string }) {
  const [state, action] = useActionState<FormState, FormData>(
    createAssetAction,
    {}
  )

  return (
    <form
      action={action}
      className="grid gap-5 rounded-lg border border-border bg-card p-5 sm:p-6"
    >
      {state.error ? <FormError>{state.error}</FormError> : null}
      {state.ok ? <FormOk>{state.ok}</FormOk> : null}

      <div className="grid gap-5 sm:grid-cols-2">
        <Field label="Código na B3" htmlFor="ticker" hint="Quatro letras e um ou dois dígitos.">
          <input
            id="ticker"
            name="ticker"
            required
            placeholder="PETR4"
            pattern="[A-Za-z]{4}[0-9]{1,2}"
            className={`${controlClass} font-mono tracking-wide uppercase`}
          />
        </Field>

        <Field label="Tipo" htmlFor="type">
          <select id="type" name="type" className={controlClass} defaultValue="STOCK">
            <option value="STOCK">Ação</option>
            <option value="FII">Fundo imobiliário</option>
            <option value="INDEX">Índice</option>
          </select>
        </Field>

        <Field
          label="Limite de variação"
          htmlFor="alertThresholdPercent"
          hint="Em pontos percentuais, para cima ou para baixo. Ao romper, o ativo entra na fila e gera um alerta."
        >
          <input
            id="alertThresholdPercent"
            name="alertThresholdPercent"
            type="number"
            required
            step="0.1"
            min="0.1"
            max="50"
            defaultValue="3"
            className={`${controlClass} tabular font-mono`}
          />
        </Field>

        <Field
          label="Responsável"
          htmlFor="ownerEmail"
          hint="Aparece mascarado na listagem."
        >
          <input
            id="ownerEmail"
            name="ownerEmail"
            type="email"
            required
            defaultValue={defaultEmail}
            className={controlClass}
          />
        </Field>
      </div>

      <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
        <Submit />
        <p className="text-xs text-muted-foreground">
          O consentimento do responsável é registrado com data e versão do termo.
        </p>
      </div>
    </form>
  )
}
