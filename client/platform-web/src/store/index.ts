import { create } from "zustand";
import { persist } from "zustand/middleware";

type Theme = "dark" | "light";

interface AppState {
  theme: Theme;
  setTheme: (theme: Theme) => void;
  toggleTheme: () => void;
  selectedContactId: string | null;
  setSelectedContactId: (id: string | null) => void;
}

export const useAppStore = create<AppState>()(
  persist(
    (set) => ({
      theme: "light",
      setTheme: (theme) => {
        document.documentElement.classList.remove("light", "dark");
        document.documentElement.classList.add(theme);
        set({ theme });
      },
      toggleTheme: () => set((state) => {
        const next = state.theme === "dark" ? "light" : "dark";
        document.documentElement.classList.remove("light", "dark");
        document.documentElement.classList.add(next);
        return { theme: next };
      }),
      selectedContactId: null,
      setSelectedContactId: (id) => set({ selectedContactId: id }),
    }),
    {
      name: "cep-store",
      partialize: (state) => ({ theme: state.theme }), // Only persist theme
    }
  )
);
