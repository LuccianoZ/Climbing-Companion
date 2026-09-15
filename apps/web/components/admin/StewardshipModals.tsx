'use client';

import { useState, type ReactNode } from 'react';
import type { LifecycleStatus } from '@/lib/types';

// AR-51 BL-x07: the two confirmation gates the Owner asked for.
//   * Applying edits shows a side-by-side before/after of exactly what
//     changed and requires typing SAVE.
//   * Deleting is offered two ways: Archive (reversible, no typed gate) or
//     permanent Delete (requires typing DELETE).

function ModalShell({
  title,
  children,
  onCancel,
  testId,
}: {
  title: string;
  children: ReactNode;
  onCancel: () => void;
  testId: string;
}) {
  return (
    <div
      role="dialog"
      aria-label={title}
      data-testid={testId}
      className="fixed inset-0 z-[2000] flex items-center justify-center bg-ink/40 p-4"
    >
      <div className="relative max-h-[85vh] w-full max-w-lg overflow-y-auto rounded-card border border-line bg-surface p-5 shadow-overlay">
        <div className="mb-3 flex items-start justify-between gap-3">
          <h2 className="text-heading font-bold text-ink">{title}</h2>
          <button
            type="button"
            aria-label="Close"
            onClick={onCancel}
            className="rounded-full border border-line-soft px-2 text-small text-ink-soft"
          >
            ×
          </button>
        </div>
        {children}
      </div>
    </div>
  );
}

export interface FieldChange {
  label: string;
  before: string;
  after: string;
}

export function ChangeDiffModal({
  changes,
  pending,
  onConfirm,
  onCancel,
}: {
  changes: FieldChange[];
  pending: boolean;
  onConfirm: () => void;
  onCancel: () => void;
}) {
  const [typed, setTyped] = useState('');
  const ready = typed === 'SAVE' && changes.length > 0;

  return (
    <ModalShell
      title="Review changes"
      onCancel={onCancel}
      testId="change-diff-modal"
    >
      {changes.length === 0 ? (
        <p className="text-small text-ink-soft">
          Nothing has changed. Close this and edit a field first.
        </p>
      ) : (
        <>
          <table
            data-testid="change-diff-table"
            className="w-full border-collapse text-left text-small"
          >
            <thead>
              <tr className="border-b-[1.5px] border-line">
                <th className="label-caps py-1.5 pr-2 text-caption text-ink-faint">
                  Field
                </th>
                <th className="label-caps py-1.5 pr-2 text-caption text-ink-faint">
                  Was
                </th>
                <th className="label-caps py-1.5 text-caption text-ink-faint">
                  Now
                </th>
              </tr>
            </thead>
            <tbody>
              {changes.map((change) => (
                <tr
                  key={change.label}
                  data-testid="change-diff-row"
                  data-field={change.label}
                  className="border-b border-line-soft align-top last:border-b-0"
                >
                  <td className="py-1.5 pr-2 font-semibold text-ink">
                    {change.label}
                  </td>
                  <td className="py-1.5 pr-2 text-ink-faint line-through">
                    {change.before || '—'}
                  </td>
                  <td className="py-1.5 font-medium text-moss-deep">
                    {change.after || '—'}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>

          <label className="mt-4 block">
            <span className="text-small text-ink-soft">
              Type <span className="font-mono font-bold">SAVE</span> to apply
              these changes.
            </span>
            <input
              value={typed}
              onChange={(e) => setTyped(e.target.value)}
              data-testid="change-diff-confirm-input"
              autoComplete="off"
              className="mt-1 w-full rounded-control border border-line bg-surface px-3 py-2 font-mono text-small text-ink"
            />
          </label>

          <div className="mt-3 flex gap-2">
            <button
              type="button"
              data-testid="change-diff-apply"
              disabled={!ready || pending}
              onClick={onConfirm}
              className="rounded-control border border-ink bg-ink px-4 py-2 text-small font-bold text-paper disabled:opacity-45"
            >
              {pending ? 'Applying…' : 'Apply changes'}
            </button>
            <button
              type="button"
              onClick={onCancel}
              className="rounded-control border border-line-soft px-3 py-2 text-small text-ink-soft"
            >
              Keep editing
            </button>
          </div>
        </>
      )}
    </ModalShell>
  );
}

export function DeleteEntityModal({
  entityName,
  status,
  cascadeNote,
  pending,
  onArchive,
  onRestore,
  onDelete,
  onCancel,
}: {
  entityName: string;
  status: LifecycleStatus;
  cascadeNote?: string;
  pending: boolean;
  onArchive: () => void;
  onRestore: () => void;
  onDelete: () => void;
  onCancel: () => void;
}) {
  const [typed, setTyped] = useState('');
  const archived = status === 'ARCHIVED';
  const canDelete = typed === 'DELETE';

  return (
    <ModalShell
      title={`Remove "${entityName}"`}
      onCancel={onCancel}
      testId="delete-entity-modal"
    >
      {cascadeNote ? (
        <p
          data-testid="delete-cascade-note"
          className="mb-3 rounded-control border border-clay-deep bg-clay-wash px-3 py-2 text-small text-clay-deep"
        >
          {cascadeNote}
        </p>
      ) : null}

      <div className="space-y-4">
        {archived ? (
          <div className="rounded-control border border-line-soft p-3">
            <p className="text-small font-semibold text-ink">
              Currently archived
            </p>
            <p className="mt-0.5 text-caption text-ink-soft">
              It is hidden from the map but the row and its history are intact.
            </p>
            <button
              type="button"
              data-testid="delete-modal-restore"
              disabled={pending}
              onClick={onRestore}
              className="mt-2 rounded-control border border-ink bg-ink px-3.5 py-1.5 text-small font-bold text-paper disabled:opacity-45"
            >
              Restore to the map
            </button>
          </div>
        ) : (
          <div className="rounded-control border border-line-soft p-3">
            <p className="text-small font-semibold text-ink">
              Archive (reversible)
            </p>
            <p className="mt-0.5 text-caption text-ink-soft">
              Hides it from the map and search. The row and every log stay. You
              can restore it later.
            </p>
            <button
              type="button"
              data-testid="delete-modal-archive"
              disabled={pending}
              onClick={onArchive}
              className="mt-2 rounded-control border border-line px-3.5 py-1.5 text-small font-bold text-ink disabled:opacity-45"
            >
              Archive it
            </button>
          </div>
        )}

        <div className="rounded-control border border-clay-deep p-3">
          <p className="text-small font-semibold text-clay-deep">
            Delete permanently
          </p>
          <p className="mt-0.5 text-caption text-ink-soft">
            Erases the row and its verifications, votes and logs. This cannot be
            undone.
          </p>
          <label className="mt-2 block">
            <span className="text-caption text-ink-soft">
              Type <span className="font-mono font-bold">DELETE</span> to
              confirm.
            </span>
            <input
              value={typed}
              onChange={(e) => setTyped(e.target.value)}
              data-testid="delete-confirm-input"
              autoComplete="off"
              className="mt-1 w-full rounded-control border border-clay-deep bg-surface px-3 py-2 font-mono text-small text-ink"
            />
          </label>
          <button
            type="button"
            data-testid="delete-modal-delete"
            disabled={!canDelete || pending}
            onClick={onDelete}
            className="mt-2 rounded-control border border-clay-deep bg-clay-deep px-3.5 py-1.5 text-small font-bold text-paper disabled:opacity-45"
          >
            {pending ? 'Deleting…' : 'Delete permanently'}
          </button>
        </div>
      </div>
    </ModalShell>
  );
}
