import { AssignmentSubmissionStatus, DatasetAssignmentSubmission } from '../models/DatasetAssignmentSubmission';
import { User } from '../models/User';
import { sendTransactionalEmail } from './emailService';
import mongoose from 'mongoose';

const REMINDER_WINDOW_MS = 48 * 60 * 60 * 1000;
const CHECK_INTERVAL_MS = 15 * 60 * 1000;
const STAFF_OPEN_STATUSES: AssignmentSubmissionStatus[] = ['pending', 'in_progress', 'draft', 'rejected'];
const CHECKER_OPEN_STATUSES: AssignmentSubmissionStatus[] = ['submitted'];

async function userEmails(ids: unknown[]): Promise<string[]> {
  const cleanIds = [...new Set(ids
    .map((id) => String(id || '').trim())
    .filter((id) => mongoose.Types.ObjectId.isValid(id)))];
  if (!cleanIds.length) return [];
  const users = await User.find({ _id: { $in: cleanIds } }).select('email').lean();
  return [...new Set(users.map((user: any) => String(user.email || '')).filter((email) => email.includes('@')))];
}

function formatDeadline(value: Date): string {
  return new Intl.DateTimeFormat('vi-VN', {
    dateStyle: 'full',
    timeStyle: 'short',
    timeZone: process.env.APP_TIMEZONE || 'Asia/Ho_Chi_Minh',
  }).format(value);
}

async function sendAndMark(submission: any, params: {
  recipients: unknown[];
  subject: string;
  text: string;
  marker: 'staffReminderSentAt' | 'staffOverdueNotifiedAt' | 'checkerReminderSentAt' | 'checkerOverdueNotifiedAt';
}) {
  const emails = await userEmails(params.recipients);
  if (!emails.length) return;
  const result = await sendTransactionalEmail({ to: emails, subject: params.subject, text: params.text });
  if (result.sent) {
    await DatasetAssignmentSubmission.updateOne(
      { _id: submission._id, [params.marker]: { $exists: false } },
      { $set: { [params.marker]: new Date() } },
    );
  } else if (result.reason !== 'email_not_configured') {
    console.warn(`[DeadlineReminder] ${params.marker} skipped:`, result.reason);
  }
}

export async function runAssignmentDeadlineReminders(): Promise<void> {
  const now = new Date();
  const reminderLimit = new Date(now.getTime() + REMINDER_WINDOW_MS);

  const staffDueSoon = await DatasetAssignmentSubmission.find({
    active: { $ne: false },
    status: { $in: STAFF_OPEN_STATUSES },
    staffReminderSentAt: { $exists: false },
    $or: [
      { staffDeadline: { $gt: now, $lte: reminderLimit } },
      { staffDeadline: { $exists: false }, deadline: { $gt: now, $lte: reminderLimit } },
    ],
  }).lean();
  for (const submission of staffDueSoon) {
    const deadline = new Date((submission as any).staffDeadline || submission.deadline!);
    await sendAndMark(submission, {
      recipients: [submission.assigneeId],
      marker: 'staffReminderSentAt',
      subject: `[SEP490] Sắp đến hạn nộp: ${submission.name}`,
      text: `Task "${submission.name}" của Staff sẽ hết hạn lúc ${formatDeadline(deadline)}. Vui lòng hoàn tất và nộp bài trước hạn.`,
    });
  }

  const staffOverdue = await DatasetAssignmentSubmission.find({
    active: { $ne: false },
    status: { $in: STAFF_OPEN_STATUSES },
    staffOverdueNotifiedAt: { $exists: false },
    $or: [
      { staffDeadline: { $lt: now } },
      { staffDeadline: { $exists: false }, deadline: { $lt: now } },
    ],
  }).lean();
  for (const submission of staffOverdue) {
    const deadline = new Date((submission as any).staffDeadline || submission.deadline!);
    await sendAndMark(submission, {
      recipients: [submission.assigneeId, submission.supervisor],
      marker: 'staffOverdueNotifiedAt',
      subject: `[SEP490] Task Staff đã quá hạn: ${submission.name}`,
      text: `Task "${submission.name}" đã quá hạn Staff từ ${formatDeadline(deadline)}. Bài nộp sau thời điểm này vẫn được nhận nhưng sẽ bị ghi nhận là nộp trễ.`,
    });
  }

  const checkerDueSoon = await DatasetAssignmentSubmission.find({
    active: { $ne: false },
    status: { $in: CHECKER_OPEN_STATUSES },
    checker: { $nin: [null, ''] },
    checkerDeadline: { $gt: now, $lte: reminderLimit },
    checkerReminderSentAt: { $exists: false },
  }).lean();
  for (const submission of checkerDueSoon) {
    await sendAndMark(submission, {
      recipients: [submission.checker],
      marker: 'checkerReminderSentAt',
      subject: `[SEP490] Sắp đến hạn review: ${submission.name}`,
      text: `Task "${submission.name}" của Checker sẽ hết hạn review lúc ${formatDeadline(new Date((submission as any).checkerDeadline))}. Vui lòng xử lý các mẫu chờ review trước hạn.`,
    });
  }

  const checkerOverdue = await DatasetAssignmentSubmission.find({
    active: { $ne: false },
    status: { $in: CHECKER_OPEN_STATUSES },
    checker: { $nin: [null, ''] },
    checkerDeadline: { $lt: now },
    checkerOverdueNotifiedAt: { $exists: false },
  }).lean();
  for (const submission of checkerOverdue) {
    await sendAndMark(submission, {
      recipients: [submission.checker, submission.supervisor],
      marker: 'checkerOverdueNotifiedAt',
      subject: `[SEP490] Review của Checker đã quá hạn: ${submission.name}`,
      text: `Task "${submission.name}" đã quá hạn review từ ${formatDeadline(new Date((submission as any).checkerDeadline))}. Kết quả review muộn sẽ được ghi nhận trên màn hình quản lý.`,
    });
  }
}

export function startAssignmentDeadlineReminderService(): NodeJS.Timeout {
  void runAssignmentDeadlineReminders().catch((error) => console.error('[DeadlineReminder] Initial run failed:', error));
  const timer = setInterval(() => {
    void runAssignmentDeadlineReminders().catch((error) => console.error('[DeadlineReminder] Run failed:', error));
  }, CHECK_INTERVAL_MS);
  timer.unref();
  return timer;
}
