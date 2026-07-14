import { Button, Modal, ModalBody, ModalContent, ModalFooter, ModalHeader } from "@heroui/react";
import type { ChangelogEntry } from "@utils/changelog";

interface Props {
  isOpen: boolean;
  onClose: () => void;
  entries: ChangelogEntry[];
}

export function ReleaseNotesModal({ isOpen, onClose, entries }: Props) {
  return (
    <Modal isOpen={isOpen} onClose={onClose} size="lg" scrollBehavior="inside">
      <ModalContent>
        <ModalHeader>What&rsquo;s new in Excelerate</ModalHeader>
        <ModalBody className="gap-6 pb-6">
          {entries.length === 0 && (
            <p className="text-sm text-default-500">No release notes available.</p>
          )}
          {entries.map((entry) => (
            <div key={entry.version} className="space-y-3">
              <div className="flex items-baseline gap-2">
                <h3 className="text-lg font-semibold">v{entry.version}</h3>
                <span className="text-tiny text-default-500">{entry.date}</span>
              </div>
              {entry.sections.map((section) => (
                <div key={section.heading}>
                  <p className="text-small font-semibold text-default-600 mb-1">
                    {section.heading}
                  </p>
                  <ul className="list-disc list-inside space-y-1 text-small text-default-600">
                    {section.items.map((item) => (
                      <li key={item}>{item}</li>
                    ))}
                  </ul>
                </div>
              ))}
            </div>
          ))}
        </ModalBody>
        <ModalFooter>
          <Button color="primary" onPress={onClose}>
            Got it
          </Button>
        </ModalFooter>
      </ModalContent>
    </Modal>
  );
}
