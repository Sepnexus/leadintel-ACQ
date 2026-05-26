import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { PipelineSelectionPanel } from "./PipelineSelectionPanel";

interface Props {
  tenantId: string;
  tenantName?: string | null;
  isOpen: boolean;
  onClose: () => void;
  onSaved: () => void;
}

export function PipelineSelectionModal({ tenantId, tenantName, isOpen, onClose, onSaved }: Props) {
  return (
    <Dialog open={isOpen} onOpenChange={(o) => { if (!o) onClose(); }}>
      <DialogContent className="max-w-2xl bg-[#0a0a0a] border-[#222]">
        <DialogHeader>
          <DialogTitle className="text-white">Select pipelines to monitor</DialogTitle>
          <DialogDescription className="text-[#888]">
            Lead Intel will only sync opportunities from the pipelines you check below
            {tenantName ? ` for ${tenantName}` : ""}. You can change this any time in
            Settings → Pipelines.
          </DialogDescription>
        </DialogHeader>
        <PipelineSelectionPanel
          tenantId={tenantId}
          variant="modal"
          onSaved={() => { onSaved(); onClose(); }}
        />
      </DialogContent>
    </Dialog>
  );
}