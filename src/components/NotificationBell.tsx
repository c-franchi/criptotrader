import { useEffect, useState } from "react";
import { Link } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Bell, Trash2 } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { Button } from "@/components/ui/button";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Checkbox } from "@/components/ui/checkbox";

export function NotificationBell() {
  const { user } = useAuth();
  const qc = useQueryClient();
  const [sel, setSel] = useState<Set<string>>(new Set());
  const q = useQuery({
    queryKey: ["notifications", user?.id],
    enabled: !!user,
    refetchInterval: 30_000,
    queryFn: async () => {
      const { data, error } = await supabase.from("notifications").select("*").order("created_at", { ascending: false }).limit(100);
      if (error) throw error;
      return data;
    },
  });
  const list = q.data ?? [];
  const unread = list.filter((n) => !n.read).length;
  useEffect(() => { setSel((s) => new Set([...s].filter((id) => list.some((n) => n.id === id)))); }, [q.data]); // eslint-disable-line react-hooks/exhaustive-deps
  if (!user) return null;
  const refresh = () => qc.invalidateQueries({ queryKey: ["notifications"] });
  const remove = async (ids: string[]) => { if (!ids.length) return; await supabase.from("notifications").delete().in("id", ids); setSel(new Set()); refresh(); };
  const markRead = async () => { const ids = list.filter((n) => !n.read).map((n) => n.id); if (ids.length) { await supabase.from("notifications").update({ read: true }).in("id", ids); refresh(); } };
  const all = list.length > 0 && sel.size === list.length;
  const toggle = (id: string) => setSel((s) => { const n = new Set(s); n.has(id) ? n.delete(id) : n.add(id); return n; });

  return (
    <Popover onOpenChange={(o) => { if (!o) markRead(); }}>
      <PopoverTrigger asChild>
        <Button size="icon" variant="ghost" aria-label={`Notificações (${unread} novas)`} className="relative">
          <Bell className="h-5 w-5" />
          {unread > 0 && <span className="absolute -right-0.5 -top-0.5 min-w-[18px] rounded-full bg-destructive px-1 text-center text-[10px] font-bold leading-[18px] text-destructive-foreground">{unread > 99 ? "99+" : unread}</span>}
        </Button>
      </PopoverTrigger>
      <PopoverContent align="end" className="w-[min(22rem,calc(100vw-1.5rem))] p-0">
        <div className="flex items-center justify-between gap-2 border-b border-border px-3 py-2">
          <p className="text-sm font-semibold">Notificações</p>
          {list.length > 0 && (
            <label className="flex items-center gap-2 text-xs text-muted-foreground">
              <Checkbox checked={all} onCheckedChange={() => setSel(all ? new Set() : new Set(list.map((n) => n.id)))} /> Todas
            </label>
          )}
        </div>
        <div className="max-h-[60vh] overflow-y-auto">
          {list.length === 0 && <p className="p-4 text-center text-sm text-muted-foreground">Nenhuma notificação ainda. Quando o preço chegar perto do ponto de um aviso, ela aparece aqui.</p>}
          {list.map((n) => (
            <div key={n.id} className={`flex gap-2 border-b border-border/60 px-3 py-2.5 ${n.read ? "" : "bg-primary/10"}`}>
              <Checkbox className="mt-0.5" checked={sel.has(n.id)} onCheckedChange={() => toggle(n.id)} aria-label="Selecionar" />
              <div className="min-w-0 flex-1">
                <p className="text-sm font-medium break-words">{!n.read && <span className="mr-1 text-primary">●</span>}{n.title}</p>
                <p className="text-xs text-muted-foreground break-words">{n.body}</p>
                <p className="mt-0.5 text-[10px] text-muted-foreground">{new Date(n.created_at).toLocaleString("pt-BR")}</p>
              </div>
              <button aria-label="Remover" className="shrink-0 text-muted-foreground hover:text-destructive" onClick={() => remove([n.id])}><Trash2 className="h-4 w-4" /></button>
            </div>
          ))}
        </div>
        <div className="flex items-center justify-between gap-2 px-3 py-2">
          <Link to="/alertas" className="text-xs text-primary underline">Meus avisos</Link>
          <Button size="sm" variant="destructive" disabled={sel.size === 0} onClick={() => remove([...sel])}>Remover selecionadas ({sel.size})</Button>
        </div>
      </PopoverContent>
    </Popover>
  );
}
