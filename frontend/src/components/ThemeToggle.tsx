import { useEffect, useState } from "react";
import { IconSun, IconMoon } from "./Icons";

type Theme = "dark" | "light";

function getInitial(): Theme {
  const saved = localStorage.getItem("lifelox-theme");
  if (saved === "light" || saved === "dark") return saved;
  return "dark";
}

export function ThemeToggle() {
  const [theme, setTheme] = useState<Theme>(getInitial);

  useEffect(() => {
    document.documentElement.dataset.theme = theme;
    localStorage.setItem("lifelox-theme", theme);
  }, [theme]);

  return (
    <button
      className="icon-btn theme-toggle"
      onClick={() => setTheme((t) => (t === "dark" ? "light" : "dark"))}
      aria-label={`Switch to ${theme === "dark" ? "light" : "dark"} theme`}
      title={`${theme === "dark" ? "Light" : "Dark"} theme`}
    >
      {theme === "dark" ? <IconSun size={17} /> : <IconMoon size={17} />}
    </button>
  );
}
