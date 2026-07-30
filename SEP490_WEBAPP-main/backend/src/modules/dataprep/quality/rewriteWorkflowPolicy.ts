export const STAFF_REWRITE_SUBMITTABLE_STATUSES = ['assigned', 'redo', 'rejected'] as const;
export const CHECKER_REWRITE_REVIEWABLE_STATUSES = ['submitted', 'checker_approved'] as const;

export function canStaffSubmitRewrite(status: string): boolean {
  return (STAFF_REWRITE_SUBMITTABLE_STATUSES as readonly string[]).includes(status);
}

export function canCheckerReviewRewrite(status: string): boolean {
  return (CHECKER_REWRITE_REVIEWABLE_STATUSES as readonly string[]).includes(status);
}
