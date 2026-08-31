"use client"

import { useActionState } from "react"
import { useFormStatus } from "react-dom"
import { type FormState, runSyncAction } from "@/app/actions"
import { Button } from "@/components/ui/button"

function Submit() {
  const { pending } = useFormStatus()

  return (
    <Button type="submit" variant="outline" size="sm" disabled={pending}>
      {pending ? "Sincronizando…" : "Sincronizar agora"}
    </Button>
  )
}

/** Disparo manual do ciclo, para ADMIN. O agendador faz o mesmo de 15 em 15 min. */
export function SyncButton() {
  const [state, action] = useActionState<FormState, FormData>(runSyncAction, {})

  return (
    <form action={action} className="flex flex-wrap items-center gap-3">
      <Submit />
      {state.ok ? (
        <span role="status" className="text-xs text-muted-foreground">
          {state.ok}
        </span>
      ) : null}
      {state.error ? (
        <span role="alert" className="text-xs text-destructive">
          {state.error}
        </span>
      ) : null}
    </form>
  )
}
