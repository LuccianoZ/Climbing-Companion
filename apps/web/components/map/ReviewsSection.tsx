'use client';

import { useEffect, useState } from 'react';
import { createReview, fetchReviews } from '@/lib/api';
import { messageFor } from '@/lib/errors';
import {
  MAX_REVIEW_LENGTH,
  type ReviewTargetType,
  type ReviewView,
} from '@/lib/types';

// BL-045. Reviews for one crag / route / gym, shown in its detail panel
// (Foundation §9). Any lifecycle status is fair game -- the server does no
// status filter. Reading is public; the compose box only renders for a
// signed-in viewer. A photo is out of MVP scope for this first cut of the
// UI (the API accepts one); the "photo pending" flag from the server is
// still surfaced so a withheld image reads as intentional.
export function ReviewsSection({
  targetType,
  targetId,
  canWrite,
}: {
  targetType: ReviewTargetType;
  targetId: string;
  canWrite: boolean;
}) {
  const [reviews, setReviews] = useState<ReviewView[] | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [draft, setDraft] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);

  useEffect(() => {
    const controller = new AbortController();
    let live = true;
    fetchReviews(targetType, targetId, controller.signal)
      .then((rows) => {
        if (live) {
          setReviews(rows);
          setLoadError(null);
        }
      })
      .catch((error: unknown) => {
        if (live) setLoadError(messageFor('REVIEWS', error));
      });
    return () => {
      live = false;
      controller.abort();
    };
  }, [targetType, targetId]);

  async function submit() {
    const body = draft.trim();
    if (body.length === 0) return;
    setSubmitting(true);
    setSubmitError(null);
    try {
      await createReview({ targetType, targetId, body });
      setDraft('');
      setReviews(await fetchReviews(targetType, targetId));
    } catch (error) {
      setSubmitError(messageFor('CREATE_REVIEW', error));
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div data-testid="reviews-section" className="space-y-3">
      <p className="label-caps text-[9.5px] text-ink-faint">
        Reviews{reviews ? ` (${reviews.length})` : ''}
      </p>

      {loadError ? (
        <p data-testid="reviews-error" className="text-[11px] text-clay-deep">
          {loadError}
        </p>
      ) : null}

      {reviews && reviews.length === 0 ? (
        <p data-testid="reviews-empty" className="text-[11px] text-ink-faint">
          No reviews yet.
        </p>
      ) : null}

      {reviews && reviews.length > 0 ? (
        <ul data-testid="reviews-list" className="space-y-2">
          {reviews.map((review) => (
            <li
              key={review.id}
              data-testid="review-row"
              className="rounded-[10px] border-[1.5px] border-line bg-paper px-3 py-2"
            >
              <p className="text-[12px] leading-relaxed text-ink">
                {review.body}
              </p>
              {review.photoMediaId ? (
                <>
                  {/* eslint-disable-next-line @next/next/no-img-element --
                      streamed from our own gateway (GET /api/media/:id),
                      which next/image can't optimise. */}
                  <img
                    src={`/api/media/${review.photoMediaId}`}
                    alt="Review photo"
                    data-testid="review-photo"
                    className="mt-1.5 aspect-[4/3] w-full rounded-[8px] object-cover"
                  />
                </>
              ) : review.photoPending ? (
                <p
                  data-testid="review-photo-pending"
                  className="mt-1.5 text-[10px] text-ink-faint"
                >
                  Photo pending admin approval
                </p>
              ) : null}
              <p className="mt-1 text-[9.5px] text-ink-faint">
                {review.authorDisplayName} ·{' '}
                {new Date(review.createdAt).toLocaleDateString()}
              </p>
            </li>
          ))}
        </ul>
      ) : null}

      {canWrite ? (
        <div data-testid="review-compose" className="space-y-1.5">
          <textarea
            data-testid="review-input"
            value={draft}
            maxLength={MAX_REVIEW_LENGTH}
            onChange={(e) => setDraft(e.target.value)}
            placeholder="Share how it went…"
            rows={3}
            className="w-full rounded-[8px] border-[1.5px] border-line bg-surface px-2.5 py-1.5 text-[12px] text-ink"
          />
          <div className="flex items-center justify-between">
            <span className="text-[9.5px] text-ink-faint">
              {draft.trim().length}/{MAX_REVIEW_LENGTH}
            </span>
            <button
              type="button"
              data-testid="review-submit"
              disabled={submitting || draft.trim().length === 0}
              onClick={submit}
              className="rounded-[8px] border-[1.5px] border-line bg-moss-wash px-3 py-1 text-[11px] font-bold text-moss-deep disabled:opacity-50"
            >
              {submitting ? 'Posting…' : 'Post review'}
            </button>
          </div>
          {submitError ? (
            <p
              data-testid="review-submit-error"
              className="text-[11px] text-clay-deep"
            >
              {submitError}
            </p>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}
