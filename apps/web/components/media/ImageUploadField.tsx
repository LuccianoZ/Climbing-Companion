'use client';

import { useEffect, useId, useRef, useState } from 'react';
import { CameraIcon, CheckIcon, CloseIcon } from '@/components/shell/icons';
import { uploadMedia } from '@/lib/api';
import { messageFor } from '@/lib/errors';
import {
  ALLOWED_MEDIA_MIME_TYPES,
  MAX_MEDIA_BYTES,
  type MediaAsset,
  type MediaPurpose,
} from '@/lib/types';

// BL-008. AR-24: this is a component that owns a complete round trip, not a
// styled file input. That distinction is the story:
// Sprint1-Frontend-Scope section 4 specifies upload-first, then reference the
// resulting media_asset_id -- the verification endpoints take a mediaAssetId
// and never a file -- so something has to perform POST /api/media and hand
// the id back. Doing it here rather than inside each verification form means
// the two verify sheets (and BL-045's review photos later) share one
// implementation of the pre-check, the progress state and the failure copy.
//
// `purpose` is a prop rather than inferred, matching AR-15's server-side
// convention exactly: the calling endpoint supplies it, the gateway just
// persists what it is given.

interface ImageUploadFieldProps {
  purpose: MediaPurpose;
  label: string;
  hint?: string;
  asset: MediaAsset | null;
  onUploaded: (asset: MediaAsset | null) => void;
  disabled?: boolean;
}

function formatBytes(bytes: number): string {
  if (bytes < 1024) {
    return `${bytes} B`;
  }
  if (bytes < 1024 * 1024) {
    return `${Math.round(bytes / 1024)} KB`;
  }
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

// The client half of the gateway's two rules. The server enforces both
// regardless (multer aborts an oversized parse mid-stream, and fileFilter
// throws 415 on a bad type), so this is not the security boundary -- it
// exists to fail in a tenth of a second instead of after pushing 5MB up a
// phone's uplink at a crag, which is exactly where this component is used.
function preCheck(file: File): string | null {
  if (!ALLOWED_MEDIA_MIME_TYPES.includes(file.type)) {
    return 'Photos must be JPEG or PNG.';
  }
  if (file.size > MAX_MEDIA_BYTES) {
    return `That photo is ${formatBytes(file.size)} — the limit is 5MB. Try a smaller image.`;
  }
  return null;
}

export function ImageUploadField({
  purpose,
  label,
  hint,
  asset,
  onUploaded,
  disabled = false,
}: ImageUploadFieldProps) {
  const inputId = useId();
  const inputRef = useRef<HTMLInputElement>(null);
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [fileName, setFileName] = useState<string | null>(null);

  // The preview is a local object URL rather than a fetch of
  // GET /api/media/:id: the bytes are already in the browser, and the served
  // copy is byte-identical. Revoking on replace and on unmount is what keeps
  // a form that swaps photos a few times from leaking them all.
  useEffect(() => {
    return () => {
      if (previewUrl) {
        URL.revokeObjectURL(previewUrl);
      }
    };
  }, [previewUrl]);

  async function onFileChosen(file: File | undefined) {
    if (!file) {
      return;
    }
    setError(null);

    const rejection = preCheck(file);
    if (rejection) {
      setError(rejection);
      // Clear the input so choosing the *same* bad file again still fires a
      // change event and re-shows the message.
      if (inputRef.current) {
        inputRef.current.value = '';
      }
      return;
    }

    setPending(true);
    try {
      const uploaded = await uploadMedia(file, purpose);
      setPreviewUrl((current) => {
        if (current) {
          URL.revokeObjectURL(current);
        }
        return URL.createObjectURL(file);
      });
      setFileName(file.name);
      onUploaded(uploaded);
    } catch (uploadError) {
      setError(messageFor('UPLOAD', uploadError));
      onUploaded(null);
    } finally {
      setPending(false);
    }
  }

  function clear() {
    setPreviewUrl((current) => {
      if (current) {
        URL.revokeObjectURL(current);
      }
      return null;
    });
    setFileName(null);
    setError(null);
    onUploaded(null);
    if (inputRef.current) {
      inputRef.current.value = '';
    }
  }

  return (
    <div className="space-y-1.5" data-testid="image-upload">
      <input
        ref={inputRef}
        id={inputId}
        type="file"
        // The allowlist twice over: `accept` filters the OS picker so most
        // wrong files are never chosen, and preCheck catches the rest (a
        // picker can be bypassed, and `accept` is advisory).
        accept={ALLOWED_MEDIA_MIME_TYPES.join(',')}
        disabled={disabled || pending}
        data-testid="image-upload-input"
        onChange={(event) => void onFileChosen(event.target.files?.[0])}
        className="sr-only"
      />

      {asset && previewUrl ? (
        <div
          data-testid="image-upload-preview"
          data-media-asset-id={asset.id}
          className="flex items-center gap-3 rounded-[12px] border-[1.5px] border-line bg-surface p-2.5"
        >
          {/* eslint-disable-next-line @next/next/no-img-element --
              next/image cannot optimise a blob: URL, and this is a local
              preview of bytes the browser already holds. */}
          <img
            src={previewUrl}
            alt="Selected verification photo"
            className="h-14 w-14 shrink-0 rounded-[8px] border border-line-soft object-cover"
          />
          <div className="min-w-0 flex-1">
            <p className="flex items-center gap-1.5 text-[12px] font-semibold text-moss-deep">
              <CheckIcon className="h-3.5 w-3.5" />
              Photo uploaded
            </p>
            <p className="truncate text-[10.5px] text-ink-faint">
              {fileName} · {formatBytes(asset.byteSize)}
            </p>
          </div>
          <button
            type="button"
            aria-label="Remove photo"
            data-testid="image-upload-clear"
            onClick={clear}
            disabled={disabled}
            className="shrink-0 rounded-full border border-line-soft p-1 text-ink-soft"
          >
            <CloseIcon className="h-3.5 w-3.5" />
          </button>
        </div>
      ) : (
        <label
          htmlFor={inputId}
          data-testid="image-upload-dropzone"
          className={[
            'flex cursor-pointer flex-col items-center gap-2 rounded-[12px] border-[1.5px] border-dashed border-line px-4 py-6 text-center',
            disabled || pending ? 'opacity-60' : 'bg-surface',
          ].join(' ')}
        >
          <span className="flex h-11 w-11 items-center justify-center rounded-full border-[1.5px] border-line bg-paper">
            <CameraIcon className="h-5 w-5 text-ink" />
          </span>
          <span className="text-[12.5px] font-semibold text-ink">
            {pending ? 'Uploading…' : label}
          </span>
          <span className="text-[10.5px] text-ink-faint">
            {hint ?? 'Max 5MB (JPEG or PNG only)'}
          </span>
        </label>
      )}

      {error ? (
        <p
          role="alert"
          data-testid="image-upload-error"
          className="text-[10.5px] leading-snug text-clay-deep"
        >
          {error}
        </p>
      ) : null}
    </div>
  );
}
