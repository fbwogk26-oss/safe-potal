import { createContext, useContext, useState, ReactNode } from "react";
import { HQ_DEPARTMENTS, HQ_NAMES, DEFAULT_HQ } from "@/lib/headquarters";

interface HeadquartersContextType {
  headquarters: string;
  setHeadquarters: (hq: string) => void;
  departments: string[];
  hqNames: string[];
}

const STORAGE_KEY = "selected_hq";

const HeadquartersContext = createContext<HeadquartersContextType>({
  headquarters: DEFAULT_HQ,
  setHeadquarters: () => {},
  departments: HQ_DEPARTMENTS[DEFAULT_HQ],
  hqNames: HQ_NAMES,
});

export function HeadquartersProvider({ children }: { children: ReactNode }) {
  const [headquarters, setHq] = useState<string>(() => {
    try {
      const stored = localStorage.getItem(STORAGE_KEY);
      return stored && HQ_DEPARTMENTS[stored] ? stored : DEFAULT_HQ;
    } catch {
      return DEFAULT_HQ;
    }
  });

  const setHeadquarters = (hq: string) => {
    if (HQ_DEPARTMENTS[hq]) {
      try { localStorage.setItem(STORAGE_KEY, hq); } catch {}
      setHq(hq);
    }
  };

  const departments = HQ_DEPARTMENTS[headquarters] ?? HQ_DEPARTMENTS[DEFAULT_HQ];

  return (
    <HeadquartersContext.Provider value={{ headquarters, setHeadquarters, departments, hqNames: HQ_NAMES }}>
      {children}
    </HeadquartersContext.Provider>
  );
}

export function useHeadquarters() {
  return useContext(HeadquartersContext);
}
