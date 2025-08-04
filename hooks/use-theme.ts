"use client"

import { useEffect, useState } from "react"

type Theme = "light" | "dark" | "system"

export function useTheme() {
  const [theme, setTheme] = useState<Theme>(() => {
    if (typeof window !== "undefined") {
      const storedTheme = localStorage.getItem("theme") as Theme
      return storedTheme || "system"
    }
    return "system"
  })

  const [systemTheme, setSystemTheme] = useState<"light" | "dark">(() => {
    if (typeof window !== "undefined") {
      return window.matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light"
    }
    return "light"
  })

  useEffect(() => {
    const mediaQuery = window.matchMedia("(prefers-color-scheme: dark)")
    
    const handleChange = (e: MediaQueryListEvent) => {
      setSystemTheme(e.matches ? "dark" : "light")
    }

    mediaQuery.addEventListener("change", handleChange)
    return () => mediaQuery.removeEventListener("change", handleChange)
  }, [])

  useEffect(() => {
    const root = window.document.documentElement
    const activeTheme = theme === "system" ? systemTheme : theme
    const currentTheme = root.classList.contains("dark") ? "dark" : 
                       root.classList.contains("light") ? "light" : null

    // Only update if the theme actually changes
    if (currentTheme !== activeTheme) {
      root.classList.remove("light", "dark")
      root.classList.add(activeTheme)
    }
    
    localStorage.setItem("theme", theme)
  }, [theme, systemTheme])

  return {
    theme,
    setTheme,
    systemTheme,
    activeTheme: theme === "system" ? systemTheme : theme,
  }
}