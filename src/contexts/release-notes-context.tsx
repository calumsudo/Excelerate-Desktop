import React, { createContext, useContext, useEffect, useState, useCallback, useMemo } from "react";
import { getVersion } from "@tauri-apps/api/app";
import { getChangelogEntries, type ChangelogEntry } from "@utils/changelog";
import { ReleaseNotesModal } from "@components/release-notes/release-notes-modal";

const SEEN_VERSION_KEY = "excelerate:releaseNotesSeenVersion";

interface ReleaseNotesContextType {
  currentVersion: string;
  openReleaseNotes: () => void;
}

const ReleaseNotesContext = createContext<ReleaseNotesContextType | undefined>(undefined);

export const useReleaseNotes = () => {
  const context = useContext(ReleaseNotesContext);
  if (!context) {
    throw new Error("useReleaseNotes must be used within a ReleaseNotesProvider");
  }
  return context;
};

interface ReleaseNotesProviderProps {
  children: React.ReactNode;
}

export const ReleaseNotesProvider: React.FC<ReleaseNotesProviderProps> = ({ children }) => {
  const [currentVersion, setCurrentVersion] = useState("");
  const [isOpen, setIsOpen] = useState(false);
  const [entries, setEntries] = useState<ChangelogEntry[]>([]);

  useEffect(() => {
    let cancelled = false;

    getVersion()
      .then((version) => {
        if (cancelled) return;
        setCurrentVersion(version);

        const seenVersion = localStorage.getItem(SEEN_VERSION_KEY);

        // First launch ever: nothing to announce, just record the baseline.
        if (seenVersion === null) {
          localStorage.setItem(SEEN_VERSION_KEY, version);
          return;
        }

        if (seenVersion === version) return;

        const allEntries = getChangelogEntries();
        const seenIndex = allEntries.findIndex((e) => e.version === seenVersion);
        const unseen = seenIndex === -1 ? allEntries.slice(0, 1) : allEntries.slice(0, seenIndex);

        if (unseen.length > 0) {
          setEntries(unseen);
          setIsOpen(true);
        }
      })
      .catch(() => {
        // Not running inside Tauri (e.g. plain browser dev server) — skip.
      });

    return () => {
      cancelled = true;
    };
  }, []);

  const closeModal = () => {
    setIsOpen(false);
    if (currentVersion) localStorage.setItem(SEEN_VERSION_KEY, currentVersion);
  };

  const openReleaseNotes = useCallback(() => {
    setEntries(getChangelogEntries());
    setIsOpen(true);
  }, []);

  const value = useMemo(
    () => ({ currentVersion, openReleaseNotes }),
    [currentVersion, openReleaseNotes]
  );

  return (
    <ReleaseNotesContext.Provider value={value}>
      {children}
      <ReleaseNotesModal isOpen={isOpen} onClose={closeModal} entries={entries} />
    </ReleaseNotesContext.Provider>
  );
};
