import { useEffect, useMemo, useState } from "react";
import {
  Autocomplete,
  AutocompleteItem,
  Button,
  Checkbox,
  Input,
  Modal,
  ModalBody,
  ModalContent,
  ModalFooter,
  ModalHeader,
  Select,
  SelectItem,
} from "@heroui/react";
import { Icon } from "@iconify/react";
import {
  createDeal,
  updateDeal,
  validateDealForm,
  EMPTY_DEAL_FORM,
  type DealFormValues,
  type EditorLookups,
  type PaymentCadence,
} from "@services/deal-editor-service";

const NumberSelect = ({
  label,
  items,
  selected,
  onChange,
  isRequired,
}: {
  label: string;
  items: { id: number; label: string }[];
  selected: number | null;
  onChange: (id: number | null) => void;
  isRequired?: boolean;
}) => (
  <Select
    aria-label={label}
    label={label}
    size="sm"
    isRequired={isRequired}
    selectedKeys={selected != null ? [String(selected)] : []}
    onSelectionChange={(keys) => {
      const key = Array.from(keys)[0];
      onChange(key != null ? Number(key) : null);
    }}
  >
    {items.map((item) => (
      <SelectItem key={String(item.id)}>{item.label}</SelectItem>
    ))}
  </Select>
);

const DealFormModal = ({
  isOpen,
  onClose,
  lookups,
  /** null → create; otherwise the deal being edited with its loaded inputs. */
  editing,
  onSaved,
}: {
  isOpen: boolean;
  onClose: () => void;
  lookups: EditorLookups;
  editing: { dealId: string; values: DealFormValues } | null;
  onSaved: () => void;
}) => {
  const [values, setValues] = useState<DealFormValues>(EMPTY_DEAL_FORM);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (isOpen) {
      setValues(editing?.values ?? EMPTY_DEAL_FORM);
      setError(null);
    }
  }, [isOpen, editing]);

  const set = <K extends keyof DealFormValues>(key: K, value: DealFormValues[K]) =>
    setValues((current) => ({ ...current, [key]: value }));

  // Offer merchants already under the chosen portfolio + funder first; the
  // user can still type a brand-new name.
  const merchantOptions = useMemo(() => {
    const scoped = lookups.merchants.filter(
      (m) =>
        (values.portfolioId == null || m.portfolio_id === values.portfolioId) &&
        (values.funderId == null || m.funder_id === values.funderId)
    );
    return scoped.length > 0 ? scoped : lookups.merchants;
  }, [lookups.merchants, values.portfolioId, values.funderId]);

  const pickMerchant = (id: string | null) => {
    if (id == null) {
      set("merchantId", null);
      return;
    }
    const merchant = lookups.merchants.find((m) => m.id === id);
    if (!merchant) return;
    setValues((current) => ({
      ...current,
      merchantId: merchant.id,
      merchantName: merchant.name,
      industryId: merchant.industry_id,
      stateId: merchant.state_id,
      website: merchant.website ?? "",
    }));
  };

  const submit = async () => {
    const problem = validateDealForm(values);
    if (problem != null) {
      setError(problem);
      return;
    }
    setSaving(true);
    setError(null);
    try {
      if (editing != null) {
        await updateDeal(editing.dealId, values);
      } else {
        await createDeal(values);
      }
      onSaved();
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setSaving(false);
    }
  };

  return (
    <Modal
      isOpen={isOpen}
      onOpenChange={(open) => !open && onClose()}
      size="2xl"
      scrollBehavior="inside"
    >
      <ModalContent>
        <ModalHeader>{editing != null ? "Edit Deal" : "New Deal"}</ModalHeader>
        <ModalBody>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <NumberSelect
              label="Portfolio"
              isRequired
              items={lookups.portfolios.map((p) => ({ id: p.id, label: p.name }))}
              selected={values.portfolioId}
              onChange={(portfolioId) => set("portfolioId", portfolioId)}
            />
            <NumberSelect
              label="Funder"
              isRequired
              items={lookups.funders.map((f) => ({ id: f.id, label: f.name }))}
              selected={values.funderId}
              onChange={(funderId) => set("funderId", funderId)}
            />
            <Autocomplete
              aria-label="Merchant"
              label="Merchant"
              size="sm"
              isRequired
              allowsCustomValue
              className="sm:col-span-2"
              placeholder="Pick an existing merchant or type a new name"
              inputValue={values.merchantName}
              selectedKey={values.merchantId}
              onInputChange={(name) => {
                setValues((current) => ({
                  ...current,
                  merchantName: name,
                  // typing a different name detaches from the picked merchant
                  merchantId:
                    current.merchantId != null &&
                    lookups.merchants.find((m) => m.id === current.merchantId)?.name === name
                      ? current.merchantId
                      : null,
                }));
              }}
              onSelectionChange={(key) => pickMerchant(key != null ? String(key) : null)}
            >
              {merchantOptions.map((merchant) => (
                <AutocompleteItem key={merchant.id}>{merchant.name}</AutocompleteItem>
              ))}
            </Autocomplete>
            <NumberSelect
              label="Industry"
              items={lookups.industries.map((i) => ({ id: i.id, label: i.name }))}
              selected={values.industryId}
              onChange={(industryId) => set("industryId", industryId)}
            />
            <NumberSelect
              label="State"
              items={lookups.states.map((s) => ({ id: s.id, label: s.code }))}
              selected={values.stateId}
              onChange={(stateId) => set("stateId", stateId)}
            />
            <Input
              label="Website"
              size="sm"
              value={values.website}
              onValueChange={(website) => set("website", website)}
            />
            <Input
              label="Advance ID"
              size="sm"
              value={values.funderAdvanceId}
              onValueChange={(funderAdvanceId) => set("funderAdvanceId", funderAdvanceId)}
            />
            <Input
              label="Date funded"
              size="sm"
              type="date"
              isRequired
              value={values.dateFunded}
              onValueChange={(dateFunded) => set("dateFunded", dateFunded)}
            />
            <Input
              label="FICO"
              size="sm"
              value={values.fico}
              onValueChange={(fico) => set("fico", fico)}
            />
            <Input
              label="Buy rate"
              size="sm"
              placeholder="e.g. 1.15"
              value={values.buyRate}
              onValueChange={(buyRate) => set("buyRate", buyRate)}
            />
            <Input
              label="Commission rate"
              size="sm"
              placeholder="e.g. 0.10"
              value={values.commission}
              onValueChange={(commission) => set("commission", commission)}
            />
            <Input
              label="Amount funded"
              size="sm"
              placeholder="e.g. 100000"
              startContent={<span className="text-default-400 text-small">$</span>}
              value={values.totalAmountFunded}
              onValueChange={(totalAmountFunded) => set("totalAmountFunded", totalAmountFunded)}
            />
            <Input
              label="Participation"
              size="sm"
              placeholder="e.g. 50000"
              startContent={<span className="text-default-400 text-small">$</span>}
              value={values.participation}
              onValueChange={(participation) => set("participation", participation)}
            />
            <Select
              aria-label="Payment cadence"
              label="Payment cadence"
              size="sm"
              selectedKeys={[values.cadence]}
              onSelectionChange={(keys) => {
                const key = Array.from(keys)[0];
                if (key != null) set("cadence", key as PaymentCadence);
              }}
            >
              <SelectItem key="weekly">Weekly</SelectItem>
              <SelectItem key="daily">Daily</SelectItem>
            </Select>
            <Input
              label={values.cadence === "daily" ? "Daily payments" : "Weekly payments"}
              size="sm"
              placeholder="payment count"
              value={values.numPayments}
              onValueChange={(numPayments) => set("numPayments", numPayments)}
            />
            <Input
              label="Deal length (months)"
              size="sm"
              value={values.dealLengthMonths}
              onValueChange={(dealLengthMonths) => set("dealLengthMonths", dealLengthMonths)}
            />
            <Input
              label="Date closed"
              size="sm"
              type="date"
              value={values.dateClosed}
              onValueChange={(dateClosed) => set("dateClosed", dateClosed)}
            />
          </div>

          <div className="flex flex-wrap items-center gap-4 pt-1">
            <Checkbox
              size="sm"
              isSelected={values.newDollars}
              onValueChange={(newDollars) => set("newDollars", newDollars)}
            >
              New dollars
            </Checkbox>
            <Checkbox
              size="sm"
              isSelected={values.rtrReinvestment}
              onValueChange={(rtrReinvestment) => set("rtrReinvestment", rtrReinvestment)}
            >
              RTR reinvestment
            </Checkbox>
            <Checkbox
              size="sm"
              isSelected={values.isDefault}
              onValueChange={(isDefault) => set("isDefault", isDefault)}
            >
              Defaulted
            </Checkbox>
            {values.isDefault && (
              <Input
                aria-label="Default date"
                label="Default date"
                size="sm"
                type="date"
                className="max-w-[180px]"
                value={values.defaultDate}
                onValueChange={(defaultDate) => set("defaultDate", defaultDate)}
              />
            )}
          </div>

          {error && (
            <div className="flex items-center gap-2 text-danger text-small">
              <Icon icon="solar:danger-triangle-bold" width={16} />
              {error}
            </div>
          )}
        </ModalBody>
        <ModalFooter>
          <Button size="sm" variant="light" onPress={onClose} isDisabled={saving}>
            Cancel
          </Button>
          <Button size="sm" color="primary" isLoading={saving} onPress={submit}>
            {editing != null ? "Save changes" : "Create deal"}
          </Button>
        </ModalFooter>
      </ModalContent>
    </Modal>
  );
};

export default DealFormModal;
