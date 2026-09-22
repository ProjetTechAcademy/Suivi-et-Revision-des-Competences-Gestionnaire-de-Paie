"use client";

import { useEffect, useState } from "react";

export function ThemeToggle() {
  const [dark, setDark] = useState(false);
  useEffect(() => {
    const saved = localStorage.getItem("paia-theme");
    const initial = saved === "dark" || (!saved && matchMedia("(prefers-color-scheme: dark)").matches);
    setDark(initial);
    document.documentElement.dataset.theme = initial ? "dark" : "light";
  }, []);
  const toggle = () => {
    const next = !dark;
    setDark(next);
    document.documentElement.dataset.theme = next ? "dark" : "light";
    localStorage.setItem("paia-theme", next ? "dark" : "light");
  };
  return <button className="iconButton" onClick={toggle} aria-label={dark ? "Activer le mode clair" : "Activer le mode sombre"}>{dark ? "☀" : "☾"}</button>;
}
