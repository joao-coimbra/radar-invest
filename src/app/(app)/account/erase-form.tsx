"use client"

import { useState } from "react"
import { useFormStatus } from "react-dom"
import { eraseAccountAction } from "@/app/actions"
import { controlClass } from "@/components/field"
import { Button } from "@/components/ui/button"

function Submit({ enabled }: { enabled: boolean }) {
  const { pending } = useFormStatus()

  return (
    <Button type="submit" variant="destructive" disabled={!enabled || pending}>
      {pending ? "Eliminando…" : "Eliminar minha conta"}
    </Button>
  )
}

/**
 * Confirmação por digitação.
 *
 * A eliminação é irreversível e apaga ativos, alertas e sessões junto. Um
 * clique único convive mal com isso: digitar a palavra obriga a intenção a
 * atravessar as mãos, não só o cursor.
 */
export function EraseForm() {
  const [typed, setTyped] = useState("")
  const confirmed = typed.trim().toUpperCase() === "ELIMINAR"

  return (
    <form action={eraseAccountAction} className="grid gap-4">
      <div className="grid gap-1.5">
        <label htmlFor="confirm" className="text-[0.8125rem] font-medium">
          Digite <span className="font-mono">ELIMINAR</span> para liberar o botão
        </label>
        <input
          id="confirm"
          value={typed}
          onChange={(event) => setTyped(event.target.value)}
          autoComplete="off"
          className={`${controlClass} max-w-56 font-mono tracking-wide`}
        />
      </div>

      <Submit enabled={confirmed} />
    </form>
  )
}
