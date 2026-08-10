const crypto = require('crypto');
const fs = require('fs');
const path = require('path');
const AdmZip = require('adm-zip');

const [sourcePath, outputPath, subjectOverride] = process.argv.slice(2);
if (!sourcePath || !outputPath) {
  throw new Error('Usage: node normalize_locked_eval_zip.cjs <source.zip> <output.zip>');
}

const LOCKED_PROMPT =
  'Bạn là một trợ lý giáo dục chuyên nghiệp. Nhiệm vụ của bạn là hỗ trợ học sinh theo phương pháp Socratic: không đưa ra câu trả lời trực tiếp mà sử dụng các câu hỏi gợi mở để học sinh tự tìm ra đáp án trong mô hình Lớp học đảo ngược.';
const PROMPT_VERSION = 'embedded-test-prompt-v1';

function readJson(zip, entryName) {
  const entry = zip.getEntry(entryName);
  if (!entry) throw new Error('Missing ' + entryName);
  return JSON.parse(zip.readAsText(entry, 'utf8'));
}

function contentHash(value) {
  return crypto.createHash('sha256').update(JSON.stringify(value), 'utf8').digest('hex');
}

function findEntry(zip, suffix) {
  const entry = zip.getEntries().find((candidate) => candidate.entryName.endsWith(suffix));
  if (!entry) throw new Error('Archive does not contain ' + suffix);
  return entry.entryName;
}

const source = new AdmZip(sourcePath);
const trainEntry = findEntry(source, 'train_dataset.json');
const validationEntry = findEntry(source, 'validation_dataset.json');
const testEntry = findEntry(source, 'test_dataset.json');
const metadataEntry = findEntry(source, '_metadata.json');
const root = path.posix.dirname(testEntry);

const train = readJson(source, trainEntry);
const validation = readJson(source, validationEntry);
const oldTest = readJson(source, testEntry);
const sourceMetadata = readJson(source, metadataEntry);
if (!Array.isArray(oldTest) || oldTest.length !== 50) {
  throw new Error('Expected exactly 50 held-out test rows');
}

const subject = String(subjectOverride || sourceMetadata.subject || oldTest[0]?.subject || '').trim().toUpperCase();
if (!/^[A-Z_]+$/.test(subject)) throw new Error('Invalid subject: ' + (subject || '(empty)'));
const normalizeSubject = (rows) => rows.map((record) => ({ ...record, subject }));
const normalizedTrain = normalizeSubject(train);
const normalizedValidation = normalizeSubject(validation);

const test = oldTest.map((record, index) => {
  const messages = Array.isArray(record.messages) ? record.messages : [];
  const userMessages = messages.filter((message) => message?.role === 'user' && String(message.content || '').trim());
  const assistantMessages = messages.filter((message) => message?.role === 'assistant' && String(message.content || '').trim());
  if (userMessages.length !== 1 || assistantMessages.length < 1) {
    throw new Error('Row ' + (index + 1) + ': expected one user and at least one assistant message');
  }
  const referenceAnswer = String(assistantMessages.at(-1).content).trim();
  return {
    item_id: subject + '-TEST-' + String(index + 1).padStart(3, '0'),
    subject,
    messages: [
      { role: 'system', content: LOCKED_PROMPT },
      { role: 'user', content: String(userMessages[0].content).trim() },
    ],
    reference_answer: referenceAnswer,
    gold_key_points: [],
    reference_source: 'dataset_assistant_response',
    metadata: {
      original_conversation_id: String(record.conversation_id || record.conversationId || record.id || subject.toLowerCase() + '-test-' + (index + 1)),
      labels: record.labels || {},
    },
  };
});

const metadata = {
  projectName: sourceMetadata.projectName || subject.toLowerCase() + '-messages',
  subject,
  totalTrain: normalizedTrain.length,
  totalValidation: normalizedValidation.length,
  totalTest: test.length,
  exportedAt: new Date().toISOString(),
  lockedProtocol: 'RP5_BASE_FT_SINGLE_TURN_V1',
  systemPrompt: LOCKED_PROMPT,
  systemPromptVersion: PROMPT_VERSION,
  datasetHashes: {
    test_sha256: contentHash(test),
    train_sha256: contentHash(normalizedTrain),
    validation_sha256: contentHash(normalizedValidation),
  },
  referencePolicy: 'assistant target separated from model input; human review required before confirmatory claims',
  testHashSemantics: 'sha256(JSON.stringify(parsed_test_records))',
};

const output = new AdmZip();
output.addFile(root + '/_metadata.json', Buffer.from(JSON.stringify(metadata, null, 2), 'utf8'));
output.addFile(root + '/train_dataset.json', Buffer.from(JSON.stringify(normalizedTrain, null, 2), 'utf8'));
output.addFile(root + '/validation_dataset.json', Buffer.from(JSON.stringify(normalizedValidation, null, 2), 'utf8'));
output.addFile(root + '/test_dataset.json', Buffer.from(JSON.stringify(test, null, 2), 'utf8'));
const outputDirectory = path.dirname(outputPath);
if (!fs.existsSync(outputDirectory)) fs.mkdirSync(outputDirectory, { recursive: true });
output.writeZip(outputPath);

console.log(JSON.stringify({
  outputPath,
  subject,
  train: metadata.totalTrain,
  validation: metadata.totalValidation,
  test: metadata.totalTest,
  testSha256: metadata.datasetHashes.test_sha256,
  firstItemId: test[0].item_id,
}, null, 2));
