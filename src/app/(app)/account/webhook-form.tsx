"use client"

import { useActionState } from "react"
import { useFormStatus } from "react-dom"
import { type FormState, saveWebhookAction } from "@/app/actions"
import { controlClass, Field, FormError, FormOk } from "@/components/field"
import { Button } from "@/components/ui/button"

function Submit() {
  const { pending } = useFormStatus()

  return (
    <Button type="submit" variant="outline" disabled={pending} className="h-10">
      {pending ? "Salvando…" : "Salvar canal"}
    </Button>
  )
}

export function WebhookForm({ current }: { current: string | null }) {
  const [state, action] = useActionState<FormState, FormData>(
    saveWebhookAction,
    {}
  )

  return (
    <form action={action} className="grid gap-4">
      {state.error ? <FormError>{state.error}</FormError> : null}
      {state.ok ? <FormOk>{state.ok}</FormOk> : null}

      <Field
        label="URL do webhook"
        htmlFor="alertsWebhookUrl"
        hint="Aceita webhook do Discord ou do Slack sem adaptação. Deixe em branco para não receber notificações."
      >
        <input
          id="alertsWebhookUrl"
          name="alertsWebhookUrl"
          type="url"
          inputMode="url"
          defaultValue={current ?? ""}
          placeholder="https://discord.com/api/webhooks/…"
          className={`${controlClass} font-mono text-xs`}
        />
      </Field>

      <div>
        <Submit />
      </div>
    </form>
  )
}
