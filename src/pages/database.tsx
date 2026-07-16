import { useCallback, useEffect, useMemo, useState } from "react";
import {
  Button,
  Card,
  Chip,
  Input,
  Modal,
  ModalBody,
  ModalContent,
  ModalFooter,
  ModalHeader,
  Skeleton,
  Tab,
  Table,
  TableBody,
  TableCell,
  TableColumn,
  TableHeader,
  TableRow,
  Tabs,
  Tooltip,
} from "@heroui/react";
import { Icon } from "@iconify/react";
import { useAuth } from "@/contexts/auth-context-value";
import { toast } from "@services/toast-service";
import {
  DatabaseAdminService,
  daysUntilPurge,
  PURGE_DAYS,
  type DeletedRow,
  type FunderRow,
  type IndustryRow,
  type LookupTable,
  type SoftDeleteTable,
  type StateRow,
} from "@services/database-admin-service";

// ---------------------------------------------------------------------------
// Config: one lookup-table editor, three configurations.
// ---------------------------------------------------------------------------

interface FieldConfig {
  key: string;
  label: string;
  required: boolean;
  placeholder?: string;
}

interface LookupConfig {
  table: LookupTable;
  singular: string;
  fields: FieldConfig[];
}

const LOOKUP_CONFIGS: Record<LookupTable, LookupConfig> = {
  industries: {
    table: "industries",
    singular: "industry",
    fields: [{ key: "name", label: "Name", required: true, placeholder: "e.g. Trucking" }],
  },
  states: {
    table: "states",
    singular: "state",
    fields: [
      { key: "code", label: "Code", required: true, placeholder: "e.g. NY" },
      { key: "name", label: "Name", required: true, placeholder: "e.g. New York" },
    ],
  },
  funders: {
    table: "funders",
    singular: "funder",
    fields: [
      { key: "name", label: "Name", required: true, placeholder: "e.g. Clear View" },
      { key: "code", label: "Code", required: false, placeholder: "e.g. CV" },
      {
        key: "sheet_name",
        label: "Sheet Name",
        required: false,
        placeholder: "Workbook sheet key",
      },
    ],
  },
};

type LookupRow = (IndustryRow | StateRow | FunderRow) & Record<string, unknown>;

const TABLE_LABELS: Record<SoftDeleteTable, string> = {
  industries: "Industry",
  states: "State",
  funders: "Funder",
  merchants: "Merchant",
  deals: "Deal",
};

// ---------------------------------------------------------------------------
// Add / edit modal (fields driven by the lookup config)
// ---------------------------------------------------------------------------

interface EditorState {
  config: LookupConfig;
  row: LookupRow | null; // null = creating
}

function LookupEditorModal({
  editor,
  onClose,
  onSaved,
}: {
  editor: EditorState | null;
  onClose: () => void;
  onSaved: () => void;
}) {
  const [values, setValues] = useState<Record<string, string>>({});
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!editor) return;
    const initial: Record<string, string> = {};
    for (const field of editor.config.fields) {
      initial[field.key] = String(editor.row?.[field.key] ?? "");
    }
    setValues(initial);
  }, [editor]);

  if (!editor) return null;
  const { config, row } = editor;

  const missingRequired = config.fields.some((f) => f.required && !values[f.key]?.trim());

  const save = async () => {
    setSaving(true);
    try {
      const v = (key: string) => values[key]?.trim() ?? "";
      if (config.table === "industries") {
        if (row) await DatabaseAdminService.updateIndustry(row.id as number, v("name"));
        else await DatabaseAdminService.createIndustry(v("name"));
      } else if (config.table === "states") {
        if (row) await DatabaseAdminService.updateState(row.id as number, v("code"), v("name"));
        else await DatabaseAdminService.createState(v("code"), v("name"));
      } else {
        if (row)
          await DatabaseAdminService.updateFunder(
            row.id as number,
            v("name"),
            v("code") || null,
            v("sheet_name") || null
          );
        else
          await DatabaseAdminService.createFunder(
            v("name"),
            v("code") || null,
            v("sheet_name") || null
          );
      }
      toast.success(`${TABLE_LABELS[config.table]} ${row ? "updated" : "created"}`);
      onSaved();
      onClose();
    } catch (err) {
      toast.error(
        `Could not ${row ? "update" : "create"} ${config.singular}`,
        err instanceof Error ? err.message : String(err)
      );
    } finally {
      setSaving(false);
    }
  };

  return (
    <Modal isOpen onClose={onClose} size="md">
      <ModalContent>
        <ModalHeader>{row ? `Edit ${config.singular}` : `Add ${config.singular}`}</ModalHeader>
        <ModalBody>
          {config.fields.map((field) => (
            <Input
              key={field.key}
              label={field.label}
              placeholder={field.placeholder}
              isRequired={field.required}
              value={values[field.key] ?? ""}
              onValueChange={(val) => setValues((prev) => ({ ...prev, [field.key]: val }))}
            />
          ))}
        </ModalBody>
        <ModalFooter>
          <Button variant="light" onPress={onClose}>
            Cancel
          </Button>
          <Button color="primary" isLoading={saving} isDisabled={missingRequired} onPress={save}>
            {row ? "Save" : "Create"}
          </Button>
        </ModalFooter>
      </ModalContent>
    </Modal>
  );
}

// ---------------------------------------------------------------------------
// Delete confirmation modal
// ---------------------------------------------------------------------------

interface DeleteTarget {
  config: LookupConfig;
  row: LookupRow;
}

function DeleteConfirmModal({
  target,
  onClose,
  onDeleted,
}: {
  target: DeleteTarget | null;
  onClose: () => void;
  onDeleted: () => void;
}) {
  const [deleting, setDeleting] = useState(false);
  if (!target) return null;

  const remove = async () => {
    setDeleting(true);
    try {
      await DatabaseAdminService.softDelete(target.config.table, target.row.id as number);
      toast.success(
        `${TABLE_LABELS[target.config.table]} moved to Recently Deleted`,
        `It can be restored for the next ${PURGE_DAYS} days.`
      );
      onDeleted();
      onClose();
    } catch (err) {
      toast.error(
        `Could not delete ${target.config.singular}`,
        err instanceof Error ? err.message : String(err)
      );
    } finally {
      setDeleting(false);
    }
  };

  return (
    <Modal isOpen onClose={onClose} size="md">
      <ModalContent>
        <ModalHeader>Delete {target.config.singular}?</ModalHeader>
        <ModalBody>
          <p>
            <span className="font-semibold">{String(target.row.name ?? target.row.id)}</span> will
            move to Recently Deleted and disappear from the app. You can restore it within{" "}
            {PURGE_DAYS} days; after that it is permanently removed.
          </p>
        </ModalBody>
        <ModalFooter>
          <Button variant="light" onPress={onClose}>
            Cancel
          </Button>
          <Button color="danger" isLoading={deleting} onPress={remove}>
            Delete
          </Button>
        </ModalFooter>
      </ModalContent>
    </Modal>
  );
}

// ---------------------------------------------------------------------------
// Lookup table tab
// ---------------------------------------------------------------------------

function LookupTab({
  config,
  rows,
  loading,
  isAdmin,
  onAdd,
  onEdit,
  onDelete,
}: {
  config: LookupConfig;
  rows: LookupRow[];
  loading: boolean;
  isAdmin: boolean;
  onAdd: () => void;
  onEdit: (row: LookupRow) => void;
  onDelete: (row: LookupRow) => void;
}) {
  const [search, setSearch] = useState("");

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return rows;
    return rows.filter((row) =>
      config.fields.some((f) =>
        String(row[f.key] ?? "")
          .toLowerCase()
          .includes(q)
      )
    );
  }, [rows, search, config]);

  const columns = [
    ...config.fields.map((f) => ({ key: f.key, label: f.label.toUpperCase() })),
    ...(isAdmin ? [{ key: "actions", label: "" }] : []),
  ];

  if (loading) {
    return (
      <Skeleton className="rounded-lg">
        <div className="h-[300px] w-full bg-default-200"></div>
      </Skeleton>
    );
  }

  return (
    <div className="flex flex-col gap-3">
      <div className="flex justify-between items-center gap-3">
        <Input
          size="sm"
          className="max-w-xs"
          placeholder={`Search ${rows.length} ${config.table}…`}
          startContent={<Icon icon="solar:magnifer-linear" width={16} />}
          isClearable
          value={search}
          onValueChange={setSearch}
        />
        {isAdmin && (
          <Button
            size="sm"
            color="primary"
            startContent={<Icon icon="solar:add-circle-linear" width={16} />}
            onPress={onAdd}
          >
            Add {config.singular}
          </Button>
        )}
      </div>

      <Table aria-label={config.table} isStriped>
        <TableHeader columns={columns}>
          {(column) => <TableColumn key={column.key}>{column.label}</TableColumn>}
        </TableHeader>
        <TableBody items={filtered} emptyContent={`No ${config.table} found.`}>
          {(row) => (
            <TableRow key={String(row.id)}>
              {(columnKey) =>
                columnKey === "actions" ? (
                  <TableCell className="w-24">
                    <div className="flex gap-1 justify-end">
                      <Tooltip content="Edit">
                        <Button isIconOnly size="sm" variant="light" onPress={() => onEdit(row)}>
                          <Icon icon="solar:pen-linear" width={16} />
                        </Button>
                      </Tooltip>
                      <Tooltip content="Delete">
                        <Button
                          isIconOnly
                          size="sm"
                          variant="light"
                          color="danger"
                          onPress={() => onDelete(row)}
                        >
                          <Icon icon="solar:trash-bin-trash-linear" width={16} />
                        </Button>
                      </Tooltip>
                    </div>
                  </TableCell>
                ) : (
                  <TableCell>{String(row[String(columnKey)] ?? "—")}</TableCell>
                )
              }
            </TableRow>
          )}
        </TableBody>
      </Table>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Recently Deleted tab
// ---------------------------------------------------------------------------

function RecentlyDeletedTab({
  rows,
  loading,
  isAdmin,
  onRestore,
}: {
  rows: DeletedRow[];
  loading: boolean;
  isAdmin: boolean;
  onRestore: (row: DeletedRow) => void;
}) {
  if (loading) {
    return (
      <Skeleton className="rounded-lg">
        <div className="h-[300px] w-full bg-default-200"></div>
      </Skeleton>
    );
  }

  const lookupTables: SoftDeleteTable[] = ["industries", "states", "funders"];

  return (
    <div className="flex flex-col gap-3">
      <p className="text-small text-default-500">
        Deleted items are kept for {PURGE_DAYS} days, then permanently removed. Items still
        referenced elsewhere (e.g. an industry a merchant uses) are kept until the reference is
        gone.
      </p>
      <Table aria-label="Recently deleted" isStriped>
        <TableHeader>
          <TableColumn>TYPE</TableColumn>
          <TableColumn>ITEM</TableColumn>
          <TableColumn>DELETED</TableColumn>
          <TableColumn>PURGES IN</TableColumn>
          <TableColumn> </TableColumn>
        </TableHeader>
        <TableBody items={rows} emptyContent="Nothing has been deleted recently.">
          {(row) => {
            const days = daysUntilPurge(row.deleted_at);
            const canRestore = isAdmin || !lookupTables.includes(row.table);
            return (
              <TableRow key={`${row.table}-${row.id}`}>
                <TableCell>
                  <Chip size="sm" variant="flat">
                    {TABLE_LABELS[row.table]}
                  </Chip>
                </TableCell>
                <TableCell>
                  <span className="font-medium">{row.label}</span>
                  {row.detail && (
                    <span className="text-default-400 text-small ml-2">{row.detail}</span>
                  )}
                </TableCell>
                <TableCell className="text-small text-default-500">
                  {row.deleted_at ? new Date(row.deleted_at).toLocaleDateString() : "—"}
                </TableCell>
                <TableCell>
                  <Chip size="sm" variant="flat" color={days <= 7 ? "danger" : "default"}>
                    {days} day{days === 1 ? "" : "s"}
                  </Chip>
                </TableCell>
                <TableCell className="w-28">
                  {canRestore && (
                    <Button
                      size="sm"
                      variant="flat"
                      color="primary"
                      startContent={<Icon icon="solar:refresh-linear" width={14} />}
                      onPress={() => onRestore(row)}
                    >
                      Restore
                    </Button>
                  )}
                </TableCell>
              </TableRow>
            );
          }}
        </TableBody>
      </Table>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Page
// ---------------------------------------------------------------------------

function DatabasePage() {
  const { profile } = useAuth();
  const isAdmin = profile?.role === "admin";

  const [industries, setIndustries] = useState<LookupRow[]>([]);
  const [states, setStates] = useState<LookupRow[]>([]);
  const [funders, setFunders] = useState<LookupRow[]>([]);
  const [deleted, setDeleted] = useState<DeletedRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [editor, setEditor] = useState<EditorState | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<DeleteTarget | null>(null);

  const reload = useCallback(async () => {
    setLoading(true);
    try {
      const [ind, st, fu, del] = await Promise.all([
        DatabaseAdminService.listIndustries(),
        DatabaseAdminService.listStates(),
        DatabaseAdminService.listFunders(),
        DatabaseAdminService.listRecentlyDeleted(),
      ]);
      setIndustries(ind as LookupRow[]);
      setStates(st as LookupRow[]);
      setFunders(fu as LookupRow[]);
      setDeleted(del);
    } catch (err) {
      toast.error("Failed to load database", err instanceof Error ? err.message : String(err));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void reload();
  }, [reload]);

  const restore = async (row: DeletedRow) => {
    try {
      await DatabaseAdminService.restore(row.table, row.id);
      toast.success(`${TABLE_LABELS[row.table]} restored`);
      void reload();
    } catch (err) {
      // Most common cause: the name was re-used while this row sat in the bin.
      toast.error(
        `Could not restore ${TABLE_LABELS[row.table].toLowerCase()}`,
        err instanceof Error ? err.message : String(err)
      );
    }
  };

  const tabData: { config: LookupConfig; rows: LookupRow[] }[] = [
    { config: LOOKUP_CONFIGS.industries, rows: industries },
    { config: LOOKUP_CONFIGS.states, rows: states },
    { config: LOOKUP_CONFIGS.funders, rows: funders },
  ];

  return (
    <div className="p-6">
      <div className="flex flex-wrap justify-between items-center mb-6 gap-4">
        <div className="flex flex-col gap-1">
          <h1 className="text-3xl font-bold">Database</h1>
          <p className="text-small text-default-400">
            Manage lookup tables. Deleted items go to Recently Deleted and can be restored for{" "}
            {PURGE_DAYS} days.
          </p>
        </div>
        {!isAdmin && (
          <Chip variant="flat" color="warning" size="sm">
            Read-only — admin role required to edit lookups
          </Chip>
        )}
      </div>

      <Card className="dark:border-default-100 border border-transparent">
        <div className="p-4">
          <Tabs aria-label="Database tables" variant="underlined">
            {tabData.map(({ config, rows }) => (
              <Tab
                key={config.table}
                title={config.table.charAt(0).toUpperCase() + config.table.slice(1)}
              >
                <LookupTab
                  config={config}
                  rows={rows}
                  loading={loading}
                  isAdmin={isAdmin}
                  onAdd={() => setEditor({ config, row: null })}
                  onEdit={(row) => setEditor({ config, row })}
                  onDelete={(row) => setDeleteTarget({ config, row })}
                />
              </Tab>
            ))}
            <Tab
              key="recently-deleted"
              title={
                <div className="flex items-center gap-2">
                  <span>Recently Deleted</span>
                  {deleted.length > 0 && (
                    <Chip size="sm" variant="flat" color="danger">
                      {deleted.length}
                    </Chip>
                  )}
                </div>
              }
            >
              <RecentlyDeletedTab
                rows={deleted}
                loading={loading}
                isAdmin={isAdmin}
                onRestore={restore}
              />
            </Tab>
          </Tabs>
        </div>
      </Card>

      <LookupEditorModal editor={editor} onClose={() => setEditor(null)} onSaved={reload} />
      <DeleteConfirmModal
        target={deleteTarget}
        onClose={() => setDeleteTarget(null)}
        onDeleted={reload}
      />
    </div>
  );
}

export default DatabasePage;
