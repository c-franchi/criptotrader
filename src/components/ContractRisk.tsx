import { useEffect, useState } from "react";
import { checkContractRisk } from "@/lib/security.functions";
import type { ContractRisk as Risk } from "@/lib/safety";

type R = { ok: boolean; risks: Risk[]; owner: string | null; renounced: boolean | null };

/** Shows owner powers found in the token contract. Indicative only — not a guarantee. */
export function ContractRisk({ address }: { address: string }) {
  const [r, setR] = useState<R | null | "erro">(null);
  useEffect(() => {
    let live = true;
    setR(null);
    checkContractRisk({ data: { address } }).then((x) => live && setR(x.ok ? x : "erro")).catch(() => live && setR("erro"));
    return () => { live = false; };
  }, [address]);
  if (r === null) return <p className="text-xs text-muted-foreground">Verificando o contrato do token…</p>;
  if (r === "erro") return <p className="text-xs text-muted-foreground">Verificação do contrato indisponível agora.</p>;
  const high = r.risks.some((x) => x.severity === "alto") && r.renounced !== true;
  return (
    <div className={`rounded-md border p-3 text-xs ${high ? "border-destructive/50 bg-destructive/10" : r.risks.length ? "border-warning/50 bg-warning/10" : "border-success/40 bg-success/10"}`}>
      <p className="font-semibold">
        {r.risks.length === 0 ? "Contrato sem funções perigosas conhecidas" : high ? "Atenção: o dono do token tem poderes de risco" : "Contrato com funções de controle"}
      </p>
      {r.risks.length > 0 && <ul className="mt-1 list-disc pl-4">{r.risks.map((x) => <li key={x.label} className={x.severity === "alto" ? "text-destructive" : ""}>{x.label}</li>)}</ul>}
      <p className="mt-1 text-muted-foreground">
        {r.renounced === true ? "O dono renunciou ao controle — essas funções não podem mais ser usadas." : r.renounced === false ? "O contrato ainda tem um dono ativo." : "Não foi possível identificar o dono."}{" "}
        Verificação indicativa; não garante que o token é seguro.
      </p>
    </div>
  );
}
