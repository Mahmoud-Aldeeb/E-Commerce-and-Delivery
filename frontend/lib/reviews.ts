// A review counts as edited when its last change came more than a minute after it was written
// (saving a review sets both dates a few milliseconds apart)
const EDITED_AFTER_MS = 60_000;

export const wasEdited = (review: {
  createdAt: string;
  updatedAt: string;
}): boolean =>
  new Date(review.updatedAt).getTime() - new Date(review.createdAt).getTime() >
  EDITED_AFTER_MS;
