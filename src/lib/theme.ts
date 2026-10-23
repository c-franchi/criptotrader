export type AppTheme = "light" | "dark";
export const THEME_KEY = "cryptobot:theme";
export function applyTheme(theme: AppTheme) {
  document.documentElement.dataset["theme"] = theme;
  document.documentElement.classList.toggle("dark", theme === "dark");
  document.documentElement.style.colorScheme = theme;
  document
    .querySelector('meta[name="theme-color"]')
    ?.setAttribute("content", theme === "light" ? "#fafafa" : "#030816");
}
// Runs before paint, keeping the server-rendered theme and the saved preference consistent.
export const THEME_INIT = `(function(){var t='dark';try{if(localStorage.getItem('${THEME_KEY}')==='light')t='light'}catch(e){}var d=document.documentElement;d.dataset["theme"]=t;d.classList.toggle('dark',t==='dark');d.style.colorScheme=t;var m=document.querySelector('meta[name="theme-color"]');if(m)m.content=t==='light'?'#fafafa':'#030816'})()`;
