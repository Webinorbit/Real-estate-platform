"use client";

import { createContext, useCallback, useContext, useEffect, useMemo, useState } from "react";
import { MotionConfig } from "framer-motion";
import { Toaster } from "sonner";

const ThemeContext = createContext({ theme: "light", toggle: () => {} });
export const useTheme = () => useContext(ThemeContext);

const BrandContext = createContext({ name: "", logoUrl: null });
/** The current site's name and logo, for components that render outside a page (e.g. loaders). */
export const useBrand = () => useContext(BrandContext);

export function Providers({ children, brand }) {
  const [theme, setTheme] = useState("light");

  useEffect(() => {
    setTheme(document.documentElement.classList.contains("dark") ? "dark" : "light");
  }, []);

  const toggle = useCallback(() => {
    setTheme((prev) => {
      const next = prev === "dark" ? "light" : "dark";
      document.documentElement.classList.toggle("dark", next === "dark");
      try {
        localStorage.setItem("theme", next);
      } catch {}
      return next;
    });
  }, []);

  const value = useMemo(() => ({ theme, toggle }), [theme, toggle]);

  return (
    <ThemeContext.Provider value={value}>
      <BrandContext.Provider value={brand || { name: "", logoUrl: null }}>
        <MotionConfig reducedMotion="user">{children}</MotionConfig>
      </BrandContext.Provider>
      <Toaster position="top-center" theme={theme} richColors closeButton toastOptions={{ className: "font-sans" }} />
    </ThemeContext.Provider>
  );
}

export const themeInitScript = `(function(){try{var t=localStorage.getItem('theme');if(!t){t=window.matchMedia('(prefers-color-scheme: dark)').matches?'dark':'light'}if(t==='dark')document.documentElement.classList.add('dark')}catch(e){}})();`;
