"use client"

import { useActionState } from "react"
import { useFormStatus } from "react-dom"
import { createAssetAction, type FormState } from "@/app/actions"
import { controlClass, Field, FormError, FormOk } from "@/components/field"
import { Button } from "@/components/ui/button"

function Submit() {
  const { pending } = useFormStatus()

  return (
    <Button type="submit" disabled={pending} className="h-10 px-5">
      {pending ? "Cadastrando…" : "Monitorar ativo"}
    </Button>
  )
}

/**
 * Cadastro de ativo.
 *
 * Duas seções, porque os campos respondem a perguntas diferentes: *que ativo é
 * este* e *quando ele merece minha atenção*. Quatro campos soltos numa grade
 * 2×2 fazem o assessor ler os quatro para achar o que quer mudar.
 */
export function AssetForm({ defaultEmail }: { defaultEmail: string }) {
  const [state, action] = useActionState<FormState, FormData>(
    createAssetAction,
    {}
  )

  return (
    <form action={action} className="rounded-lg border border-border bg-card">
      {state.error || state.ok ? (
        <div className="border-b border-border p-5 sm:px-6">
          {state.error ? <FormError>{state.error}</FormError> : null}
          {state.ok ? <FormOk>{state.ok}</FormOk> : null}
        </div>
      ) : null}

      <div className="grid gap-x-6 gap-y-6 p-5 sm:grid-cols-2 sm:p-6">
        <fieldset className="contents">
          <legend className="sr-only">Identificação do ativo</legend>

          {/* `items-start` no par: sem isso, o campo sem dica é esticado pela
              altura do vizinho e o controle desce. */}
          <div className="grid items-start gap-4 sm:col-span-2 sm:grid-cols-[minmax(0,11rem)_minmax(0,26rem)]">
            <Field
              label="Código na B3"
              htmlFor="ticker"
              hint="Quatro letras e um ou dois dígitos."
            >
              <input
                id="ticker"
                name="ticker"
                required
                placeholder="PETR4"
                pattern="[A-Za-z]{4}[0-9]{1,2}"
                autoComplete="off"
                spellCheck={false}
                className={`${controlClass} font-mono tracking-[0.08em] uppercase`}
              />
            </Field>

            <Field
              label="Tipo"
              htmlFor="type"
              hint="Define como o ativo é agrupado nos relatórios."
            >
              <select
                id="type"
                name="type"
                defaultValue="STOCK"
                className={controlClass}
              >
                <option value="STOCK">Ação</option>
                <option value="FII">Fundo imobiliário</option>
                <option value="INDEX">Índice</option>
              </select>
            </Field>
          </div>
        </fieldset>

        <div
          aria-hidden
          className="hidden h-px bg-border sm:col-span-2 sm:block"
        />

        <fieldset className="contents">
          <legend className="sr-only">Regra de monitoramento</legend>

          <div className="grid items-start gap-4 sm:col-span-2 sm:grid-cols-[minmax(0,11rem)_minmax(0,26rem)]">
            <Field
              label="Limite de variação"
              htmlFor="alertThresholdPercent"
              hint="Em pontos percentuais, para cima ou para baixo."
            >
              <div className="relative">
                <input
                  id="alertThresholdPercent"
                  name="alertThresholdPercent"
                  type="number"
                  required
                  step="0.1"
                  min="0.1"
                  max="50"
                  defaultValue="3"
                  className={`${controlClass} tabular pr-8 font-mono`}
                />
                <span
                  aria-hidden
                  className="pointer-events-none absolute inset-y-0 right-3 flex items-center font-mono text-sm text-muted-foreground"
                >
                  %
                </span>
              </div>
            </Field>

            <Field
              label="Responsável"
              htmlFor="ownerEmail"
              hint="Aparece mascarado na listagem, por minimização."
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
        </fieldset>
      </div>

      <div className="flex flex-wrap items-center justify-between gap-x-6 gap-y-3 border-t border-border bg-muted/40 px-5 py-4 sm:px-6">
        <p className="max-w-md text-xs leading-relaxed text-muted-foreground">
          Ao cadastrar, o consentimento do responsável é registrado com data e
          versão do termo, conforme o Art. 8º da LGPD.
        </p>
        <Submit />
      </div>
    </form>
  )
}
