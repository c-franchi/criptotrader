import { Settings } from "lucide-react";
import { Button } from "./ui/button";
import {
  Dialog,
  DialogTrigger,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "./ui/dialog";
import { useCurrency } from "@/hooks/currencyContext";
import { fiatCurrency } from "@/lib/fiat";
export function PreferencesDialog() {
  const { currency, setCurrency } = useCurrency();
  return (
    <Dialog>
      <DialogTrigger asChild>
        <Button size="icon" variant="ghost" aria-label="Preferências" title="Preferências">
          <Settings className="h-5 w-5" />
        </Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Preferências</DialogTitle>
          <DialogDescription>
            Personalize a exibição dos valores neste dispositivo.
          </DialogDescription>
        </DialogHeader>
        <label className="space-y-2 text-sm">
          Moeda de exibição
          <select
            aria-label="Moeda de exibição"
            className="block w-full rounded-lg border border-border bg-background p-3"
            value={currency}
            onChange={(e) => setCurrency(fiatCurrency(e.target.value))}
          >
            <option value="BRL">Real brasileiro (R$)</option>
            <option value="USD">Dólar americano (US$)</option>
            <option value="EUR">Euro (€)</option>
          </select>
        </label>
        <p className="text-sm text-muted-foreground">
          Os equivalentes são estimativas de câmbio, exibidas junto aos valores em BNB ou USD. As
          operações continuam usando BNB e o token selecionado.
        </p>
      </DialogContent>
    </Dialog>
  );
}
