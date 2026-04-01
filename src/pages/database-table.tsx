import { useParams, useNavigate } from "react-router-dom";
import { useEffect, useState, useCallback } from "react";
import {
  Table,
  TableHeader,
  TableColumn,
  TableBody,
  TableRow,
  TableCell,
  Button,
  Spinner,
  Modal,
  ModalContent,
  ModalHeader,
  ModalBody,
  ModalFooter,
  Input,
  Select,
  SelectItem,
  Autocomplete,
  AutocompleteItem,
  Switch,
  Textarea,
  useDisclosure,
} from "@heroui/react";
import { Icon } from "@iconify/react";
import { supabase } from "@services/supabase";
import { toast } from "@services/toast-service";
import type { Database } from "@services/supabase.types";

type PublicTableName = keyof Database["public"]["Tables"];
type TableRow_t = Record<string, unknown>;

// Tables that support add/edit via the modal
const editableTables: Record<string, string> = {
  industries: "Industry",
  portfolios: "Portfolio",
  funders: "Funder",
  merchants: "Merchant",
  portfolio_funders: "Portfolio Funder",
  deals: "Deal",
};

type LookupData = {
  industries: { id: number; name: string }[];
  states: { id: number; code: string; name: string }[];
  funders: { id: number; name: string }[];
  portfolios: { id: number; name: string }[];
  merchants: { id: string; name: string }[];
};

export default function DatabaseTablePage() {
  const { tableName } = useParams<{ tableName: string }>();
  const navigate = useNavigate();
  const { isOpen, onOpen, onClose } = useDisclosure();

  const [rows, setRows] = useState<TableRow_t[]>([]);
  const [columns, setColumns] = useState<string[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [editingRow, setEditingRow] = useState<TableRow_t | null>(null);

  // Form fields for simple tables
  const [newName, setNewName] = useState("");
  const [newCode, setNewCode] = useState("");

  // Form fields for merchants
  const [merchantName, setMerchantName] = useState("");
  const [merchantWebsite, setMerchantWebsite] = useState("");
  const [merchantIndustryId, setMerchantIndustryId] = useState("");
  const [merchantStateId, setMerchantStateId] = useState("");
  const [merchantFunderId, setMerchantFunderId] = useState("");
  const [merchantPortfolioId, setMerchantPortfolioId] = useState("");

  // Form fields for portfolio_funders
  const [pfPortfolioId, setPfPortfolioId] = useState("");
  const [pfFunderId, setPfFunderId] = useState("");

  // Form fields for deals
  const [dealMerchantId, setDealMerchantId] = useState("");
  const [dealPortfolioId, setDealPortfolioId] = useState("");
  const [dealFunderId, setDealFunderId] = useState("");
  const [dealAdvanceId, setDealAdvanceId] = useState("");
  const [dealFunderAdvanceId, setDealFunderAdvanceId] = useState("");
  const [dealFico, setDealFico] = useState("");
  const [dealBuyRate, setDealBuyRate] = useState("");
  const [dealCommission, setDealCommission] = useState("");
  const [dealTotalAmountFunded, setDealTotalAmountFunded] = useState("");
  const [dealNumDailyPayments, setDealNumDailyPayments] = useState("");
  const [dealNumWeeklyPayments, setDealNumWeeklyPayments] = useState("");
  const [dealLengthMonths, setDealLengthMonths] = useState("");
  const [dealParticipationOnAmount, setDealParticipationOnAmount] = useState("");
  const [dealNewDollars, setDealNewDollars] = useState(false);
  const [dealRtr, setDealRtr] = useState(false);
  const [dealIsDefault, setDealIsDefault] = useState(false);
  const [dealDateFunded, setDealDateFunded] = useState("");
  const [dealDefaultDate, setDealDefaultDate] = useState("");
  const [dealDefaultNotes, setDealDefaultNotes] = useState("");

  // Lookup data for dropdowns
  const [lookups, setLookups] = useState<LookupData>({
    industries: [],
    states: [],
    funders: [],
    portfolios: [],
    merchants: [],
  });

  const editLabel = tableName ? editableTables[tableName] : undefined;

  const fetchData = useCallback(async () => {
    if (!tableName) return;
    setLoading(true);
    const { data, error } = await supabase.from(tableName as PublicTableName).select("*");
    if (error) {
      toast.error("Error loading data", error.message);
      setLoading(false);
      return;
    }
    if (data && data.length > 0) {
      setColumns(Object.keys(data[0]));
    } else {
      if (tableName === "industries" || tableName === "portfolios") {
        setColumns(["id", "name"]);
      } else if (tableName === "funders") {
        setColumns(["id", "name", "code"]);
      } else if (tableName === "states") {
        setColumns(["id", "code", "name"]);
      } else if (tableName === "merchants") {
        setColumns(["id", "name", "industry_id", "state_id", "website", "funder_id", "portfolio_id", "created_at", "updated_at"]);
      } else if (tableName === "portfolio_funders") {
        setColumns(["portfolio_id", "funder_id"]);
      } else if (tableName === "deals") {
        setColumns(["id", "merchant_id", "portfolio_id", "funder_id", "advance_id", "funder_advance_id", "fico", "buy_rate", "commission", "total_amount_funded", "num_daily_payments", "num_weekly_payments", "deal_length_months", "participation_on_amount", "new_dollars", "rtr", "is_default", "date_funded", "default_date", "default_notes", "created_at", "updated_at"]);
      } else if (tableName === "user_profiles") {
        setColumns(["id", "email", "full_name", "role", "created_at", "updated_at"]);
      }
    }
    setRows(data ?? []);
    setLoading(false);
  }, [tableName]);

  const fetchLookups = useCallback(async () => {
    if (tableName !== "merchants" && tableName !== "portfolio_funders" && tableName !== "deals") return;
    const [industries, states, funders, portfolios, merchants] = await Promise.all([
      supabase.from("industries").select("id, name").order("name"),
      supabase.from("states").select("id, code, name").order("name"),
      supabase.from("funders").select("id, name").order("name"),
      supabase.from("portfolios").select("id, name").order("name"),
      supabase.from("merchants").select("id, name").order("name"),
    ]);
    setLookups({
      industries: (industries.data as LookupData["industries"]) ?? [],
      states: (states.data as LookupData["states"]) ?? [],
      funders: (funders.data as LookupData["funders"]) ?? [],
      portfolios: (portfolios.data as LookupData["portfolios"]) ?? [],
      merchants: (merchants.data as LookupData["merchants"]) ?? [],
    });
  }, [tableName]);

  useEffect(() => {
    fetchData();
    fetchLookups();
  }, [fetchData, fetchLookups]);

  const resetForm = () => {
    setNewName("");
    setNewCode("");
    setMerchantName("");
    setMerchantWebsite("");
    setMerchantIndustryId("");
    setMerchantStateId("");
    setMerchantFunderId("");
    setMerchantPortfolioId("");
    setPfPortfolioId("");
    setPfFunderId("");
    setDealMerchantId("");
    setDealPortfolioId("");
    setDealFunderId("");
    setDealAdvanceId("");
    setDealFunderAdvanceId("");
    setDealFico("");
    setDealBuyRate("");
    setDealCommission("");
    setDealTotalAmountFunded("");
    setDealNumDailyPayments("");
    setDealNumWeeklyPayments("");
    setDealLengthMonths("");
    setDealParticipationOnAmount("");
    setDealNewDollars(false);
    setDealRtr(false);
    setDealIsDefault(false);
    setDealDateFunded("");
    setDealDefaultDate("");
    setDealDefaultNotes("");
  };

  const openAdd = () => {
    setEditingRow(null);
    resetForm();
    onOpen();
  };

  const openEdit = (row: TableRow_t) => {
    setEditingRow(row);
    if (tableName === "merchants") {
      setMerchantName(String(row.name ?? ""));
      setMerchantWebsite(String(row.website ?? ""));
      setMerchantIndustryId(row.industry_id != null ? String(row.industry_id) : "");
      setMerchantStateId(row.state_id != null ? String(row.state_id) : "");
      setMerchantFunderId(row.funder_id != null ? String(row.funder_id) : "");
      setMerchantPortfolioId(row.portfolio_id != null ? String(row.portfolio_id) : "");
    } else if (tableName === "portfolio_funders") {
      setPfPortfolioId(row.portfolio_id != null ? String(row.portfolio_id) : "");
      setPfFunderId(row.funder_id != null ? String(row.funder_id) : "");
    } else if (tableName === "deals") {
      setDealMerchantId(row.merchant_id != null ? String(row.merchant_id) : "");
      setDealPortfolioId(row.portfolio_id != null ? String(row.portfolio_id) : "");
      setDealFunderId(row.funder_id != null ? String(row.funder_id) : "");
      setDealAdvanceId(String(row.advance_id ?? ""));
      setDealFunderAdvanceId(String(row.funder_advance_id ?? ""));
      setDealFico(row.fico != null ? String(row.fico) : "");
      setDealBuyRate(row.buy_rate != null ? String(row.buy_rate) : "");
      setDealCommission(row.commission != null ? String(row.commission) : "");
      setDealTotalAmountFunded(row.total_amount_funded != null ? String(row.total_amount_funded) : "");
      setDealNumDailyPayments(row.num_daily_payments != null ? String(row.num_daily_payments) : "");
      setDealNumWeeklyPayments(row.num_weekly_payments != null ? String(row.num_weekly_payments) : "");
      setDealLengthMonths(row.deal_length_months != null ? String(row.deal_length_months) : "");
      setDealParticipationOnAmount(row.participation_on_amount != null ? String(row.participation_on_amount) : "");
      setDealNewDollars(Boolean(row.new_dollars));
      setDealRtr(Boolean(row.rtr));
      setDealIsDefault(Boolean(row.is_default));
      setDealDateFunded(row.date_funded ? (row.date_funded as string).slice(0, 16) : "");
      setDealDefaultDate(row.default_date ? (row.default_date as string).slice(0, 16) : "");
      setDealDefaultNotes(row.default_notes ? JSON.stringify(row.default_notes, null, 2) : "");
    } else {
      setNewName(String(row.name ?? ""));
      setNewCode(String(row.code ?? ""));
    }
    onOpen();
  };

  const handleClose = () => {
    setEditingRow(null);
    resetForm();
    onClose();
  };

  const handleSave = async () => {
    if (!tableName || !editLabel) return;
    setSaving(true);

    if (tableName === "merchants") {
      if (!merchantName.trim()) { setSaving(false); return; }

      const merchantData = {
        name: merchantName.trim(),
        website: merchantWebsite.trim() || null,
        industry_id: merchantIndustryId ? Number(merchantIndustryId) : null,
        state_id: merchantStateId ? Number(merchantStateId) : null,
        funder_id: merchantFunderId ? Number(merchantFunderId) : null,
        portfolio_id: merchantPortfolioId ? Number(merchantPortfolioId) : null,
      };

      if (editingRow) {
        const { error } = await supabase
          .from("merchants" as PublicTableName)
          .update(merchantData)
          .eq("id", editingRow.id as string);

        if (error) {
          toast.error("Error updating merchant", error.message);
        } else {
          toast.success("Merchant updated");
          handleClose();
          fetchData();
        }
      } else {
        const { error } = await supabase
          .from("merchants" as PublicTableName)
          .insert(merchantData);

        if (error) {
          toast.error("Error adding merchant", error.message);
        } else {
          toast.success("Merchant added");
          handleClose();
          fetchData();
        }
      }
    } else if (tableName === "deals") {
      let parsedNotes = null;
      if (dealDefaultNotes.trim()) {
        try {
          parsedNotes = JSON.parse(dealDefaultNotes);
        } catch {
          toast.error("Invalid JSON", "Default notes must be valid JSON");
          setSaving(false);
          return;
        }
      }

      const dealData = {
        merchant_id: dealMerchantId || null,
        portfolio_id: dealPortfolioId ? Number(dealPortfolioId) : null,
        funder_id: dealFunderId ? Number(dealFunderId) : null,
        advance_id: dealAdvanceId.trim() || null,
        funder_advance_id: dealFunderAdvanceId.trim() || null,
        fico: dealFico ? Number(dealFico) : null,
        buy_rate: dealBuyRate ? Number(dealBuyRate) : null,
        commission: dealCommission ? Number(dealCommission) : null,
        total_amount_funded: dealTotalAmountFunded ? Number(dealTotalAmountFunded) : null,
        num_daily_payments: dealNumDailyPayments ? Number(dealNumDailyPayments) : null,
        num_weekly_payments: dealNumWeeklyPayments ? Number(dealNumWeeklyPayments) : null,
        deal_length_months: dealLengthMonths ? Number(dealLengthMonths) : null,
        participation_on_amount: dealParticipationOnAmount ? Number(dealParticipationOnAmount) : null,
        new_dollars: dealNewDollars,
        rtr: dealRtr,
        is_default: dealIsDefault,
        date_funded: dealDateFunded || null,
        default_date: dealDefaultDate || null,
        default_notes: parsedNotes,
      };

      if (editingRow) {
        const { error } = await supabase
          .from("deals" as PublicTableName)
          .update(dealData)
          .eq("id", editingRow.id as string);

        if (error) {
          toast.error("Error updating deal", error.message);
        } else {
          toast.success("Deal updated");
          handleClose();
          fetchData();
        }
      } else {
        const { error } = await supabase
          .from("deals" as PublicTableName)
          .insert(dealData);

        if (error) {
          toast.error("Error adding deal", error.message);
        } else {
          toast.success("Deal added");
          handleClose();
          fetchData();
        }
      }
    } else if (tableName === "portfolio_funders") {
      if (!pfPortfolioId || !pfFunderId) { setSaving(false); return; }

      const pfData = {
        portfolio_id: Number(pfPortfolioId),
        funder_id: Number(pfFunderId),
      };

      // portfolio_funders has a composite PK, so no edit — just insert
      const { error } = await supabase
        .from("portfolio_funders" as PublicTableName)
        .insert(pfData);

      if (error) {
        toast.error("Error adding portfolio funder", error.message);
      } else {
        toast.success("Portfolio funder added");
        handleClose();
        fetchData();
      }
    } else {
      if (!newName.trim()) { setSaving(false); return; }

      if (editingRow) {
        const updateData: Record<string, unknown> = { name: newName.trim() };
        if (tableName === "funders") {
          updateData.code = newCode.trim() || null;
        }

        const { error } = await supabase
          .from(tableName as PublicTableName)
          .update(updateData)
          .eq("id", editingRow.id as number);

        if (error) {
          toast.error(`Error updating ${editLabel.toLowerCase()}`, error.message);
        } else {
          toast.success(`${editLabel} updated`);
          handleClose();
          fetchData();
        }
      } else {
        const insertData = tableName === "funders"
          ? { name: newName.trim(), code: newCode.trim() || null }
          : { name: newName.trim() };

        const { error } = await supabase
          .from(tableName as PublicTableName)
          .insert(insertData);

        if (error) {
          toast.error(`Error adding ${editLabel.toLowerCase()}`, error.message);
        } else {
          toast.success(`${editLabel} added`);
          handleClose();
          fetchData();
        }
      }
    }

    setSaving(false);
  };

  if (!tableName) return null;

  const showActions = !!editLabel;
  const allColumns = showActions ? [...columns, "__actions"] : columns;

  const renderCell = (row: TableRow_t, col: string) => {
    if (col === "__actions") {
      // portfolio_funders has composite PK, no edit support
      if (tableName === "portfolio_funders") return null;
      return (
        <Button
          isIconOnly
          size="sm"
          variant="light"
          onPress={() => openEdit(row)}
          aria-label="Edit row"
        >
          <Icon icon="solar:pen-outline" width={16} />
        </Button>
      );
    }
    if (row[col] === null) {
      return <span className="text-default-300 italic">null</span>;
    }
    if (typeof row[col] === "boolean") {
      return row[col] ? "Yes" : "No";
    }
    if (typeof row[col] === "object") {
      return JSON.stringify(row[col]);
    }
    return String(row[col]);
  };

  const isSaveDisabled = tableName === "merchants"
    ? !merchantName.trim()
    : tableName === "deals"
      ? false
      : tableName === "portfolio_funders"
        ? !pfPortfolioId || !pfFunderId
        : !newName.trim();

  const renderModalBody = () => {
    if (tableName === "merchants") {
      return (
        <>
          <Input
            label="Merchant Name"
            placeholder="e.g. ABC Corp"
            value={merchantName}
            onValueChange={setMerchantName}
            isRequired
            autoFocus
          />
          <Autocomplete
            label="Industry"
            placeholder="Type to search industries..."
            selectedKey={merchantIndustryId || null}
            onSelectionChange={(key) => setMerchantIndustryId(key ? String(key) : "")}
          >
            {lookups.industries.map((ind) => (
              <AutocompleteItem key={String(ind.id)}>{ind.name}</AutocompleteItem>
            ))}
          </Autocomplete>
          <Autocomplete
            label="State"
            placeholder="Type to search states..."
            selectedKey={merchantStateId || null}
            onSelectionChange={(key) => setMerchantStateId(key ? String(key) : "")}
          >
            {lookups.states.map((s) => (
              <AutocompleteItem key={String(s.id)}>{s.code} - {s.name}</AutocompleteItem>
            ))}
          </Autocomplete>
          <Input
            label="Website"
            placeholder="e.g. https://example.com"
            value={merchantWebsite}
            onValueChange={setMerchantWebsite}
          />
          <Select
            label="Funder"
            placeholder="Select a funder"
            selectedKeys={merchantFunderId ? [merchantFunderId] : []}
            onSelectionChange={(keys) => setMerchantFunderId(Array.from(keys)[0] as string ?? "")}
          >
            {lookups.funders.map((f) => (
              <SelectItem key={String(f.id)}>{f.name}</SelectItem>
            ))}
          </Select>
          <Select
            label="Portfolio"
            placeholder="Select a portfolio"
            selectedKeys={merchantPortfolioId ? [merchantPortfolioId] : []}
            onSelectionChange={(keys) => setMerchantPortfolioId(Array.from(keys)[0] as string ?? "")}
          >
            {lookups.portfolios.map((p) => (
              <SelectItem key={String(p.id)}>{p.name}</SelectItem>
            ))}
          </Select>
        </>
      );
    }

    if (tableName === "deals") {
      return (
        <>
          <Autocomplete
            label="Merchant"
            placeholder="Type to search merchants..."
            selectedKey={dealMerchantId || null}
            onSelectionChange={(key) => setDealMerchantId(key ? String(key) : "")}
          >
            {lookups.merchants.map((m) => (
              <AutocompleteItem key={String(m.id)}>{m.name}</AutocompleteItem>
            ))}
          </Autocomplete>
          <Select
            label="Portfolio"
            placeholder="Select a portfolio"
            selectedKeys={dealPortfolioId ? [dealPortfolioId] : []}
            onSelectionChange={(keys) => setDealPortfolioId(Array.from(keys)[0] as string ?? "")}
          >
            {lookups.portfolios.map((p) => (
              <SelectItem key={String(p.id)}>{p.name}</SelectItem>
            ))}
          </Select>
          <Select
            label="Funder"
            placeholder="Select a funder"
            selectedKeys={dealFunderId ? [dealFunderId] : []}
            onSelectionChange={(keys) => setDealFunderId(Array.from(keys)[0] as string ?? "")}
          >
            {lookups.funders.map((f) => (
              <SelectItem key={String(f.id)}>{f.name}</SelectItem>
            ))}
          </Select>
          <div className="grid grid-cols-2 gap-4">
            <Input
              label="Advance ID"
              placeholder="e.g. ADV-001"
              value={dealAdvanceId}
              onValueChange={setDealAdvanceId}
            />
            <Input
              label="Funder Advance ID"
              placeholder="e.g. FADV-001"
              value={dealFunderAdvanceId}
              onValueChange={setDealFunderAdvanceId}
            />
          </div>
          <div className="grid grid-cols-2 gap-4">
            <Input
              label="FICO"
              placeholder="e.g. 720"
              type="number"
              value={dealFico}
              onValueChange={setDealFico}
            />
            <Input
              label="Buy Rate"
              placeholder="e.g. 1.31"
              type="number"
              step="0.01"
              value={dealBuyRate}
              onValueChange={setDealBuyRate}
            />
          </div>
          <div className="grid grid-cols-2 gap-4">
            <Input
              label="Commission"
              placeholder="e.g. 0.13"
              type="number"
              step="0.01"
              value={dealCommission}
              onValueChange={setDealCommission}
            />
            <Input
              label="Total Amount Funded"
              placeholder="e.g. 50000"
              type="number"
              value={dealTotalAmountFunded}
              onValueChange={setDealTotalAmountFunded}
            />
          </div>
          <div className="grid grid-cols-2 gap-4">
            <Input
              label="Daily Payments"
              placeholder="e.g. 200"
              type="number"
              value={dealNumDailyPayments}
              onValueChange={setDealNumDailyPayments}
            />
            <Input
              label="Weekly Payments"
              placeholder="e.g. 0"
              type="number"
              value={dealNumWeeklyPayments}
              onValueChange={setDealNumWeeklyPayments}
            />
          </div>
          <div className="grid grid-cols-2 gap-4">
            <Input
              label="Deal Length (months)"
              placeholder="e.g. 10.8"
              type="number"
              step="0.1"
              value={dealLengthMonths}
              onValueChange={setDealLengthMonths}
            />
            <Input
              label="Participation Amount"
              placeholder="e.g. 25000"
              type="number"
              value={dealParticipationOnAmount}
              onValueChange={setDealParticipationOnAmount}
            />
          </div>
          <div className="grid grid-cols-2 gap-4">
            <Input
              label="Date Funded"
              placeholder="Date funded"
              type="datetime-local"
              value={dealDateFunded}
              onValueChange={setDealDateFunded}
            />
            <Input
              label="Default Date"
              placeholder="Default date"
              type="datetime-local"
              value={dealDefaultDate}
              onValueChange={setDealDefaultDate}
            />
          </div>
          <div className="flex gap-6">
            <Switch isSelected={dealNewDollars} onValueChange={setDealNewDollars}>
              New Dollars
            </Switch>
            <Switch isSelected={dealRtr} onValueChange={setDealRtr}>
              RTR
            </Switch>
            <Switch isSelected={dealIsDefault} onValueChange={setDealIsDefault}>
              Default
            </Switch>
          </div>
          <Textarea
            label="Default Notes (JSON)"
            placeholder='e.g. {"reason": "late payments"}'
            value={dealDefaultNotes}
            onValueChange={setDealDefaultNotes}
            minRows={2}
          />
        </>
      );
    }

    if (tableName === "portfolio_funders") {
      return (
        <>
          <Select
            label="Portfolio"
            placeholder="Select a portfolio"
            selectedKeys={pfPortfolioId ? [pfPortfolioId] : []}
            onSelectionChange={(keys) => setPfPortfolioId(Array.from(keys)[0] as string ?? "")}
            isRequired
          >
            {lookups.portfolios.map((p) => (
              <SelectItem key={String(p.id)}>{p.name}</SelectItem>
            ))}
          </Select>
          <Select
            label="Funder"
            placeholder="Select a funder"
            selectedKeys={pfFunderId ? [pfFunderId] : []}
            onSelectionChange={(keys) => setPfFunderId(Array.from(keys)[0] as string ?? "")}
            isRequired
          >
            {lookups.funders.map((f) => (
              <SelectItem key={String(f.id)}>{f.name}</SelectItem>
            ))}
          </Select>
        </>
      );
    }

    return (
      <>
        <Input
          label={`${editLabel} Name`}
          placeholder={tableName === "industries" ? "e.g. Healthcare" : tableName === "portfolios" ? "e.g. Alder" : "e.g. Libertas"}
          value={newName}
          onValueChange={setNewName}
          autoFocus
        />
        {tableName === "funders" && (
          <Input
            label="Funder Code"
            placeholder="e.g. LIB"
            value={newCode}
            onValueChange={setNewCode}
          />
        )}
      </>
    );
  };

  return (
    <div className="flex flex-col gap-4 p-6">
      <div className="flex items-center gap-2">
        <Button
          isIconOnly
          variant="light"
          size="sm"
          onPress={() => navigate("/database")}
          aria-label="Back to database"
        >
          <Icon icon="solar:arrow-left-outline" width={20} />
        </Button>
        <Icon icon="solar:table-outline" width={24} />
        <h1 className="text-2xl font-bold font-mono">{tableName}</h1>
      </div>

      <div className="flex justify-between items-center">
        <p className="text-default-500">{rows.length} row{rows.length !== 1 ? "s" : ""}</p>
        {editLabel && (
          <Button color="primary" startContent={<Icon icon="solar:add-circle-outline" width={18} />} onPress={openAdd}>
            Add {editLabel}
          </Button>
        )}
      </div>

      {loading ? (
        <div className="flex justify-center py-12">
          <Spinner size="lg" />
        </div>
      ) : (
        <Table aria-label={`${tableName} data`} classNames={{ base: "max-h-[600px] overflow-auto" }}>
          <TableHeader columns={allColumns.map((col) => ({ key: col, label: col === "__actions" ? "ACTIONS" : col.toUpperCase().replace(/_/g, " ") }))}>
            {(column) => (
              <TableColumn key={column.key} width={column.key === "__actions" ? 80 : undefined}>
                {column.label}
              </TableColumn>
            )}
          </TableHeader>
          <TableBody items={rows.map((row, i) => ({ ...row, _key: (row.id as string) ?? String(i) }))} emptyContent="No data found">
            {(item) => (
              <TableRow key={item._key}>
                {allColumns.map((col) => (
                  <TableCell key={col}>{renderCell(item, col)}</TableCell>
                ))}
              </TableRow>
            )}
          </TableBody>
        </Table>
      )}

      <Modal isOpen={isOpen} onClose={handleClose} size={tableName === "merchants" || tableName === "deals" ? "2xl" : "md"}>
        <ModalContent>
          <ModalHeader>{editingRow ? `Edit ${editLabel}` : `Add ${editLabel}`}</ModalHeader>
          <ModalBody>
            {renderModalBody()}
          </ModalBody>
          <ModalFooter>
            <Button variant="light" onPress={handleClose}>
              Cancel
            </Button>
            <Button color="primary" onPress={handleSave} isLoading={saving} isDisabled={isSaveDisabled}>
              {editingRow ? "Save" : "Add"}
            </Button>
          </ModalFooter>
        </ModalContent>
      </Modal>
    </div>
  );
}
