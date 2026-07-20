import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { Input, Kbd, Modal, ModalContent, ScrollShadow, Spinner } from "@heroui/react";
import { Icon } from "@iconify/react";
import { useAuth } from "@/contexts/auth-context-value";
import { items, usersItem, settingsItem } from "@features/sidebar/sidebar-items";
import {
  searchPalette,
  EMPTY_RESULTS,
  type PaletteSearchResults,
} from "@services/command-search-service";

interface Props {
  isOpen: boolean;
  onClose: () => void;
}

interface PaletteEntry {
  key: string;
  section: "Pages" | "Merchants" | "Deals";
  label: string;
  sublabel?: string;
  icon: string;
  perform: () => void;
}

const SEARCH_DEBOUNCE_MS = 200;
const MIN_QUERY_LENGTH = 2;
const SECTIONS: PaletteEntry["section"][] = ["Pages", "Merchants", "Deals"];

/**
 * Global Cmd+K palette: jump to any page, or search merchants and deals and
 * land on Deal Lookup pre-filtered to the selection.
 */
export function CommandPalette({ isOpen, onClose }: Props) {
  return (
    <Modal
      isOpen={isOpen}
      onOpenChange={(open) => !open && onClose()}
      placement="top"
      size="xl"
      hideCloseButton
      classNames={{ base: "mt-[10vh]" }}
    >
      <ModalContent>
        {/* The modal unmounts its content when closed, so each open mounts
            fresh query/results/highlight state — no reset effect needed. */}
        <PaletteContent onClose={onClose} />
      </ModalContent>
    </Modal>
  );
}

function PaletteContent({ onClose }: { onClose: () => void }) {
  const navigate = useNavigate();
  const { profile } = useAuth();
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<PaletteSearchResults>(EMPTY_RESULTS);
  const [searching, setSearching] = useState(false);
  const [highlighted, setHighlighted] = useState(0);
  const listRef = useRef<HTMLDivElement>(null);
  /** Guards against out-of-order responses from overlapping searches. */
  const requestIdRef = useRef(0);

  // Debounced merchant/deal search.
  useEffect(() => {
    const trimmed = query.trim();
    if (trimmed.length < MIN_QUERY_LENGTH) {
      setResults(EMPTY_RESULTS);
      setSearching(false);
      return;
    }
    setSearching(true);
    const requestId = ++requestIdRef.current;
    const timer = setTimeout(() => {
      searchPalette(trimmed)
        .then((res) => {
          if (requestIdRef.current !== requestId) return;
          setResults(res);
          setSearching(false);
        })
        .catch(() => {
          if (requestIdRef.current !== requestId) return;
          setResults(EMPTY_RESULTS);
          setSearching(false);
        });
    }, SEARCH_DEBOUNCE_MS);
    return () => clearTimeout(timer);
  }, [query]);

  const goTo = useCallback(
    (path: string, state?: { dealLookupSearch: string }) => {
      onClose();
      navigate(path, state != null ? { state } : undefined);
    },
    [onClose, navigate]
  );

  const entries = useMemo<PaletteEntry[]>(() => {
    const pages = [...items, ...(profile?.role === "admin" ? [usersItem] : []), settingsItem];
    const needle = query.trim().toLowerCase();
    const pageEntries: PaletteEntry[] = pages.flatMap((p) => {
      if (needle && !p.title.toLowerCase().includes(needle)) return [];
      return [
        {
          key: `page-${p.key}`,
          section: "Pages" as const,
          label: p.title,
          icon: p.icon ?? "solar:document-linear",
          perform: () => goTo(`/${p.key}`),
        },
      ];
    });
    const merchantEntries: PaletteEntry[] = results.merchants.map((m) => ({
      key: `merchant-${m.id}`,
      section: "Merchants",
      label: m.name,
      icon: "solar:shop-2-linear",
      perform: () => goTo("/deal-lookup", { dealLookupSearch: m.name }),
    }));
    const dealEntries: PaletteEntry[] = results.deals.flatMap((d) => {
      if (!d.searchValue) return [];
      return [
        {
          key: `deal-${d.id}`,
          section: "Deals" as const,
          label: d.funderAdvanceId ?? d.merchantName ?? "Deal",
          sublabel: d.funderAdvanceId != null ? (d.merchantName ?? undefined) : undefined,
          icon: "solar:document-text-linear",
          perform: () => goTo("/deal-lookup", { dealLookupSearch: d.searchValue }),
        },
      ];
    });
    return [...pageEntries, ...merchantEntries, ...dealEntries];
  }, [query, results, profile?.role, goTo]);

  // Clamp at render time so the highlight stays on a real row as the list
  // grows and shrinks, without a state-adjusting effect.
  const activeIndex = entries.length === 0 ? 0 : Math.min(highlighted, entries.length - 1);

  useEffect(() => {
    listRef.current
      ?.querySelector(`[data-entry-index="${activeIndex}"]`)
      ?.scrollIntoView({ block: "nearest" });
  }, [activeIndex]);

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (entries.length === 0) return;
    if (e.key === "ArrowDown") {
      e.preventDefault();
      setHighlighted((activeIndex + 1) % entries.length);
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setHighlighted((activeIndex - 1 + entries.length) % entries.length);
    } else if (e.key === "Enter") {
      e.preventDefault();
      entries[activeIndex]?.perform();
    }
  };

  const showEmptyHint =
    !searching && entries.length === 0 && query.trim().length >= MIN_QUERY_LENGTH;

  return (
    <div onKeyDown={handleKeyDown}>
      <div className="flex items-center gap-2 px-4 pt-4 pb-2 border-b border-divider">
        <Input
          autoFocus
          aria-label="Search pages, merchants, and deals"
          placeholder="Search pages, merchants, deals…"
          size="lg"
          variant="flat"
          value={query}
          onValueChange={(value) => {
            setQuery(value);
            setHighlighted(0);
          }}
          startContent={
            <Icon icon="solar:magnifer-linear" width={20} className="text-default-400" />
          }
          endContent={searching ? <Spinner size="sm" /> : <Kbd keys={["escape"]} />}
        />
      </div>
      <ScrollShadow ref={listRef} className="max-h-[50vh] p-2">
        {SECTIONS.map((section) => {
          const sectionEntries = entries.filter((e) => e.section === section);
          if (sectionEntries.length === 0) return null;
          return (
            <div key={section} className="mb-1">
              <p className="px-2 py-1 text-tiny font-semibold uppercase text-default-400">
                {section}
              </p>
              {sectionEntries.map((entry) => {
                const index = entries.indexOf(entry);
                return (
                  <button
                    key={entry.key}
                    type="button"
                    data-entry-index={index}
                    className={`w-full flex items-center gap-3 px-3 py-2 rounded-medium text-left ${
                      index === activeIndex ? "bg-default-100" : ""
                    }`}
                    onMouseMove={() => setHighlighted(index)}
                    onClick={entry.perform}
                  >
                    <Icon icon={entry.icon} width={18} className="text-default-500 shrink-0" />
                    <span className="text-small truncate">{entry.label}</span>
                    {entry.sublabel != null && (
                      <span className="text-tiny text-default-400 truncate">{entry.sublabel}</span>
                    )}
                    {index === activeIndex && (
                      <Icon
                        icon="solar:alt-arrow-right-linear"
                        width={14}
                        className="ml-auto text-default-400 shrink-0"
                      />
                    )}
                  </button>
                );
              })}
            </div>
          );
        })}
        {showEmptyHint && (
          <p className="px-3 py-6 text-center text-small text-default-400">
            No matches for “{query.trim()}”
          </p>
        )}
        {entries.length === 0 && !showEmptyHint && (
          <p className="px-3 py-6 text-center text-small text-default-400">
            Type to search merchants and deals
          </p>
        )}
      </ScrollShadow>
      <div className="flex items-center gap-4 px-4 py-2 border-t border-divider text-tiny text-default-400">
        <span className="flex items-center gap-1">
          <Kbd keys={["up", "down"]} /> navigate
        </span>
        <span className="flex items-center gap-1">
          <Kbd keys={["enter"]} /> open
        </span>
      </div>
    </div>
  );
}
