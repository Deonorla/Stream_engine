import { createContext, useContext, useState } from 'react';

type AppMode = 'owner' | 'agent';
const AppModeContext = createContext<{ mode: AppMode; setMode: (m: AppMode) => void }>({
  mode: 'owner',
  setMode: () => {},
});

export function AppModeProvider({ children }: { children: React.ReactNode }) {
  const [mode, setMode] = useState<AppMode>('owner');
  return <AppModeContext.Provider value={{ mode, setMode }}>{children}</AppModeContext.Provider>;
}

export function useAppMode() {
  return useContext(AppModeContext);
}
