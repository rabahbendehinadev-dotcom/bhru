import { useState, type ReactNode } from 'react';
import { ChevronDown, ChevronUp, Pencil, Trash2 } from 'lucide-react';

export function PartnerImageControls({ index, count, enabled, editing, replace, onToggle, onEdit, onMove, onDelete }: {
  index: number; count: number; enabled: boolean; editing: boolean; replace: ReactNode;
  onToggle: () => void; onEdit: () => void; onMove: (direction: number) => void; onDelete: () => void;
}) {
  const [confirmDelete, setConfirmDelete] = useState(false);
  const name = `logo-${index}`;
  const touchStyle = { height: 44, minHeight: 44 };
  return (
    <div className="grid min-w-0 grid-cols-2 gap-2 sm:flex sm:flex-wrap sm:items-center">
      <button type="button" className="btn" style={touchStyle} aria-label={`${enabled ? 'Disable' : 'Enable'} image ${index + 1}`}
        aria-pressed={enabled} onClick={onToggle} data-testid={`button-toggle-${name}`}>{enabled ? 'Disable' : 'Enable'}</button>
      <div className="min-w-0">{replace}</div>
      <button type="button" className="btn" style={touchStyle} onClick={() => onMove(-1)} disabled={index === 0}
        aria-label={`Move image ${index + 1} up`} data-testid={`button-up-${name}`}><ChevronUp size={16} />Move up</button>
      <button type="button" className="btn" style={touchStyle} onClick={() => onMove(1)} disabled={index === count - 1}
        aria-label={`Move image ${index + 1} down`} data-testid={`button-down-${name}`}><ChevronDown size={16} />Move down</button>
      <button type="button" className="btn" style={touchStyle} aria-expanded={editing} onClick={onEdit}
        data-testid={`button-edit-${name}`}><Pencil size={16} />Edit details</button>
      <button type="button" className="btn" style={touchStyle} onClick={() => setConfirmDelete(true)}
        data-testid={`button-delete-${name}`}><Trash2 size={16} />Delete</button>
      {confirmDelete && <div className="col-span-2 flex min-w-0 flex-wrap items-center gap-2" role="group" aria-label={`Confirm deletion of image ${index + 1}`}>
        <span className="gs-help m-0" role="alert">Delete this image?</span>
        <button type="button" className="btn" style={touchStyle} onClick={() => { setConfirmDelete(false); onDelete(); }}
          data-testid={`button-confirm-delete-${name}`}>Yes, delete</button>
        <button type="button" className="btn" style={touchStyle} onClick={() => setConfirmDelete(false)}>Cancel</button>
      </div>}
    </div>
  );
}
