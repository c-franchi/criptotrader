import { botSearch, groupBotNotices } from "@/lib/botNotice";
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
      const { data, error } = await supabase
        .from("notifications")
        .select("*")
        .eq("user_id", user!.id)
        .order("created_at", { ascending: false })
        .limit(100);
      if (error) throw error;
      return data;
    },
  });
  const list = q.data ?? [];
  const groups = groupBotNotices(list);
  const unread = groups.filter((g) => list.some((n) => g.ids.includes(n.id) && !n.read)).length;
  useEffect(() => {
    setSel((s) => new Set([...s].filter((id) => list.some((n) => n.id === id))));
  }, [q.data]); // eslint-disable-line react-hooks/exhaustive-deps
  if (!user) return null;
  const refresh = () => qc.invalidateQueries({ queryKey: ["notifications"] });
  const remove = async (ids: string[]) => {
    if (!ids.length) return;
    await supabase.from("notifications").delete().eq("user_id", user.id).in("id", ids);
    setSel(new Set());
    refresh();
  };
  const markRead = async () => {
    const ids = list.filter((n) => !n.read).map((n) => n.id);
    if (ids.length) {
      await supabase
        .from("notifications")
        .update({ read: true })
        .eq("user_id", user.id)
        .in("id", ids);
      refresh();
    }
  };
  const all = list.length > 0 && sel.size === list.length;
  const toggleGroup = (ids: string[]) =>
    setSel((previous) => {
      const next = new Set(previous);
      const remove = ids.every((id) => next.has(id));
      ids.forEach((id) => (remove ? next.delete(id) : next.add(id)));
      return next;
    });

  return (
    <Popover
      onOpenChange={(o) => {
        if (!o) markRead();
      }}
    >
      <PopoverTrigger asChild>
        <Button
          size="icon"
          variant="ghost"
          aria-label={`Notificações (${unread} novas)`}
          className="relative"
        >
          <Bell className="h-5 w-5" />
          {unread > 0 && (
            <span className="absolute -right-0.5 -top-0.5 min-w-[18px] rounded-full bg-destructive px-1 text-center text-[10px] font-bold leading-[18px] text-destructive-foreground">
              {unread > 99 ? "99+" : unread}
            </span>
          )}
        </Button>
      </PopoverTrigger>
      <PopoverContent align="end" className="w-[min(22rem,calc(100vw-1.5rem))] p-0">
        <div className="flex items-center justify-between gap-2 border-b border-border px-3 py-2">
          <p className="text-sm font-semibold">Notificações</p>
          {list.length > 0 && (
            <label className="flex items-center gap-2 text-xs text-muted-foreground">
              <Checkbox
                checked={all}
                onCheckedChange={() => setSel(all ? new Set() : new Set(list.map((n) => n.id)))}
              />{" "}
              Todas
            </label>
          )}
        </div>
        <div className="max-h-[60vh] overflow-y-auto">
          {list.length === 0 && (
            <p className="p-4 text-center text-sm text-muted-foreground">
              Nenhuma notificação ainda. Quando o preço chegar perto do ponto de um aviso, ela
              aparece aqui.
            </p>
          )}
          {groups.map(({ notice: n, ids }) => (
            <div
              key={n.id}
              className={`flex gap-2 border-b border-border/60 px-3 py-2.5 ${n.read ? "" : "bg-primary/10"}`}
            >
              <Checkbox
                className="mt-0.5"
                checked={ids.every((id) => sel.has(id))}
                onCheckedChange={() => toggleGroup(ids)}
                aria-label="Selecionar"
              />
              <div className="min-w-0 flex-1">
                <p className="text-sm font-medium break-words">
                  {!n.read && <span className="mr-1 text-primary">●</span>}
                  {n.title}
                </p>
                <p className="text-xs text-muted-foreground break-words">{n.body}</p>
                {(n.link === "/grade" || n.link?.startsWith("/grade?")) && (
                  <Link
                    to="/grade"
                    search={botSearch(
                      Object.fromEntries(new URLSearchParams(n.link.split("?")[1] ?? "")),
                    )}
                    className="mt-1 inline-block text-xs text-primary underline"
                  >
                    {n.link === "/grade"
                      ? "Ver robôs · aviso antigo sem identificação"
                      : "Abrir robô e verificar problema"}
                  </Link>
                )}
                {ids.length > 1 && (
                  <p className="mt-1 text-xs text-muted-foreground">
                    {ids.length} avisos semelhantes agrupados
                  </p>
                )}
                <p className="mt-0.5 text-[10px] text-muted-foreground">
                  {new Date(n.created_at).toLocaleString("pt-BR")}
                </p>
              </div>
              <button
                aria-label="Remover"
                className="shrink-0 text-muted-foreground hover:text-destructive"
                onClick={() => remove(ids)}
              >
                <Trash2 className="h-4 w-4" />
              </button>
            </div>
          ))}
        </div>
        <div className="flex items-center justify-between gap-2 px-3 py-2">
          <Link to="/alertas" className="text-xs text-primary underline">
            Meus avisos
          </Link>
          <Button
            size="sm"
            variant="destructive"
            disabled={sel.size === 0}
            onClick={() => remove([...sel])}
          >
            Remover selecionadas ({sel.size})
          </Button>
        </div>
      </PopoverContent>
    </Popover>
  );
}
