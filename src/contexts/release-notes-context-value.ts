import { createContext, useContext } from "react";

export interface ReleaseNotesContextType {
  currentVersion: string;
  openReleaseNotes: () => void;
}

export const ReleaseNotesContext = createContext<ReleaseNotesContextType | undefined>(undefined);

export const useReleaseNotes = () => {
  const context = useContext(ReleaseNotesContext);
  if (!context) {
    throw new Error("useReleaseNotes must be used within a ReleaseNotesProvider");
  }
  return context;
};
