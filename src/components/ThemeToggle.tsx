import { useEffect, useState } from "react";
import { Moon, Sun } from "lucide-react";
import { Button } from "./ui/button";
import { applyTheme, THEME_KEY, type AppTheme } from "@/lib/theme";
export function ThemeToggle() {
  const [theme, setTheme] = useState<AppTheme>("dark");
  useEffect(() => {
    let next: AppTheme = document.documentElement.dataset["theme"] === "light" ? "light" : "dark";
    try {
      next = localStorage.getItem(THEME_KEY) === "light" ? "light" : "dark";
    } catch {
      /* Keep the active theme. */
    }
    applyTheme(next);
    setTheme(next);
    const sync = (event: StorageEvent) => {
      if (event.key !== THEME_KEY && event.key !== null) return;
      const value = event.newValue === "light" ? "light" : "dark";
      applyTheme(value);
      setTheme(value);
    };
    window.addEventListener("storage", sync);
    return () => window.removeEventListener("storage", sync);
  }, []);
  const label = theme === "dark" ? "Ativar tema claro" : "Ativar tema escuro";
  return (
    <Button
      variant="ghost"
      size="icon"
      className="h-11 w-11 shrink-0"
      aria-label={label}
      title={label}
      onClick={() => {
        const next = theme === "dark" ? "light" : "dark";
        applyTheme(next);
        setTheme(next);
        try {
          localStorage.setItem(THEME_KEY, next);
        } catch {
          /* In-memory selection still works. */
        }
      }}
    >
      {theme === "dark" ? <Sun className="h-5 w-5" /> : <Moon className="h-5 w-5" />}
    </Button>
  );
}
