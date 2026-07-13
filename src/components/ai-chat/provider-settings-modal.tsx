import { useEffect, useState } from "react";
import {
  Button,
  Input,
  Modal,
  ModalBody,
  ModalContent,
  ModalFooter,
  ModalHeader,
  Select,
  SelectItem,
} from "@heroui/react";
import {
  PROVIDER_LABELS,
  saveAiSettings,
  type AiProvider,
  type AiSettings,
} from "@services/ai-chat-service";
import { toast } from "@services/toast-service";

interface Props {
  isOpen: boolean;
  onClose: () => void;
  settings: AiSettings;
  onSaved: (settings: AiSettings) => void;
}

export function ProviderSettingsModal({ isOpen, onClose, settings, onSaved }: Props) {
  const [draft, setDraft] = useState<AiSettings>(settings);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (isOpen) setDraft(settings);
  }, [isOpen, settings]);

  const set = (patch: Partial<AiSettings>) => setDraft((d) => ({ ...d, ...patch }));

  const handleSave = async () => {
    setSaving(true);
    try {
      await saveAiSettings(draft);
      onSaved(draft);
      toast.success("AI settings saved");
      onClose();
    } catch (error) {
      toast.error("Failed to save AI settings", String(error));
    } finally {
      setSaving(false);
    }
  };

  return (
    <Modal isOpen={isOpen} onClose={onClose} size="lg" scrollBehavior="inside">
      <ModalContent>
        <ModalHeader>AI Provider Settings</ModalHeader>
        <ModalBody className="gap-4">
          <p className="text-tiny text-default-500">
            API keys are stored locally on this machine and sent only to the selected provider.
          </p>
          <Select
            label="Default provider"
            selectedKeys={[draft.default_provider]}
            onSelectionChange={(keys) => {
              const key = Array.from(keys)[0] as AiProvider | undefined;
              if (key) set({ default_provider: key });
            }}
          >
            {(Object.keys(PROVIDER_LABELS) as AiProvider[]).map((provider) => (
              <SelectItem key={provider}>{PROVIDER_LABELS[provider]}</SelectItem>
            ))}
          </Select>

          <div className="flex flex-col gap-2">
            <p className="text-small font-semibold">Anthropic</p>
            <Input
              label="API key"
              type="password"
              value={draft.anthropic_api_key}
              onValueChange={(v) => set({ anthropic_api_key: v })}
              placeholder="sk-ant-…"
            />
            <Input
              label="Model"
              value={draft.anthropic_model}
              onValueChange={(v) => set({ anthropic_model: v })}
            />
          </div>

          <div className="flex flex-col gap-2">
            <p className="text-small font-semibold">OpenAI</p>
            <Input
              label="API key"
              type="password"
              value={draft.openai_api_key}
              onValueChange={(v) => set({ openai_api_key: v })}
              placeholder="sk-…"
            />
            <Input
              label="Model"
              value={draft.openai_model}
              onValueChange={(v) => set({ openai_model: v })}
            />
          </div>

          <div className="flex flex-col gap-2">
            <p className="text-small font-semibold">Google</p>
            <Input
              label="API key"
              type="password"
              value={draft.google_api_key}
              onValueChange={(v) => set({ google_api_key: v })}
              placeholder="AIza…"
            />
            <Input
              label="Model"
              value={draft.google_model}
              onValueChange={(v) => set({ google_model: v })}
            />
          </div>
        </ModalBody>
        <ModalFooter>
          <Button variant="flat" onPress={onClose}>
            Cancel
          </Button>
          <Button color="primary" onPress={handleSave} isLoading={saving}>
            Save
          </Button>
        </ModalFooter>
      </ModalContent>
    </Modal>
  );
}
