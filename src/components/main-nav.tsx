"use client"

import Link from "next/link"
import { usePathname } from "next/navigation"
import { cn } from "@/lib/utils"

const LINKS = [
  { href: "/dashboard", label: "Painel" },
  { href: "/assets", label: "Ativos" },
  { href: "/alerts", label: "Alertas" },
  { href: "/account", label: "Conta" },
] as const

export function MainNav() {
  const pathname = usePathname()

  return (
    <nav aria-label="Seções" className="flex items-center gap-0.5">
      {LINKS.map((link) => {
        const active = pathname === link.href

        return (
          <Link
            key={link.href}
            href={link.href}
            aria-current={active ? "page" : undefined}
            className={cn(
              "relative rounded-md px-3 py-2 text-sm transition-colors",
              "focus-visible:ring-[3px] focus-visible:ring-ring/30 focus-visible:outline-none",
              active
                ? "font-medium text-foreground"
                : "text-muted-foreground hover:text-foreground"
            )}
          >
            {link.label}
            {/* Sublinhado em vez de pílula: a barra é fina e uma pílula
                colorida disputaria atenção com o sinal dos ativos. */}
            {active ? (
              <span
                aria-hidden
                className="absolute inset-x-3 -bottom-px h-px bg-foreground"
              />
            ) : null}
          </Link>
        )
      })}
    </nav>
  )
}
