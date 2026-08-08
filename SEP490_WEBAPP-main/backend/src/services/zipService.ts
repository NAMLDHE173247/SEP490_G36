import AdmZip from 'adm-zip';
import fs from 'fs';
import path from 'path';

export interface DatasetMetadata {
  totalTest?: number;
  totalTrain?: number;
  exportedAt?: string;
  projectName?: string;
  systemPrompt?: string;
  totalValidation?: number;
  datasetVersionId?: string;
  datasetVersionName?: string;
  systemPromptVersion?: string;
  datasetHashes?: {
    train_sha256?: string;
    validation_sha256?: string;
    test_sha256?: string;
  };
}

export interface ZipExtractionResult {
  /** Path to the extracted data file (train or test JSON) */
  dataFilePath: string;
  /** Original filename of the data file inside the ZIP */
  dataFileName: string;
  /** Optional validation dataset bundled with a training ZIP. */
  validationFilePath?: string;
  validationFileName?: string;
  /** Parsed metadata from _metadata.json, or null if not found */
  metadata: DatasetMetadata | null;
  /** Temporary directory created for extraction (caller should clean up) */
  tempDir: string;
}

/**
 * Check if a file is a ZIP archive based on extension.
 */
export function isZipFile(filename: string): boolean {
  return path.extname(filename).toLowerCase() === '.zip';
}

/**
 * Join a base directory with an untrusted filename and guarantee the result
 * stays inside the base directory (defense-in-depth against Zip Slip).
 */
function safeJoin(baseDir: string, filename: string): string {
  const target = path.resolve(baseDir, path.basename(filename));
  const normalizedBase = path.resolve(baseDir) + path.sep;
  if (!target.startsWith(normalizedBase)) {
    throw new Error('Refusing to write ZIP entry outside the extraction directory.');
  }
  return target;
}

/**
 * Extract a ZIP file uploaded for Training.
 * Looks for `train_dataset.json` as the primary data file,
 * and `_metadata.json` for traceability info.
 *
 * If no `train_dataset.json` is found, falls back to the first `.json`/`.jsonl` file.
 */
export function extractForTraining(zipFilePath: string): ZipExtractionResult {
  return extractZip(zipFilePath, 'train');
}

/**
 * Extract a ZIP file uploaded for Model Evaluation.
 * Looks for `test_dataset.json` as the primary data file,
 * and `_metadata.json` for traceability info.
 *
 * If no `test_dataset.json` is found, falls back to the first `.json`/`.jsonl` file.
 */
export function extractForEvaluation(zipFilePath: string): ZipExtractionResult {
  return extractZip(zipFilePath, 'test');
}

function extractZip(zipFilePath: string, mode: 'train' | 'test'): ZipExtractionResult {
  const zip = new AdmZip(zipFilePath);
  const entries = zip.getEntries();

  // Zip bomb guard: cap the total uncompressed size we are willing to write.
  const MAX_TOTAL_UNCOMPRESSED = 500 * 1024 * 1024; // 500MB
  const totalUncompressed = entries.reduce((sum, e) => sum + (e.header?.size || 0), 0);
  if (totalUncompressed > MAX_TOTAL_UNCOMPRESSED) {
    throw new Error('ZIP archive exceeds the maximum allowed uncompressed size.');
  }

  const hasDatasetExtension = (name: string) => /\.jsonl?$/.test(name);
  const matchesSplitSuffix = (entryName: string, aliases: string[]) => {
    const basename = path.basename(entryName).toLowerCase();
    if (!hasDatasetExtension(basename)) return false;
    const stem = basename.replace(/\.jsonl?$/, '');
    return aliases.some((alias) => stem === alias || stem.endsWith(`_${alias}`));
  };

  // Create a temp directory for extraction inside local uploads folder on Drive D to avoid C: ENOSPC errors
  const uploadBaseDir = path.join(__dirname, '../../uploads');
  if (!fs.existsSync(uploadBaseDir)) {
    fs.mkdirSync(uploadBaseDir, { recursive: true });
  }
  const tempDir = fs.mkdtempSync(path.join(uploadBaseDir, 'dataset-zip-'));

  // 1. Look for _metadata.json
  let metadata: DatasetMetadata | null = null;
  const metadataEntry = entries.find(
    (e) => !e.isDirectory && path.basename(e.entryName) === '_metadata.json'
  );
  if (metadataEntry) {
    try {
      const metadataContent = metadataEntry.getData().toString('utf-8');
      metadata = JSON.parse(metadataContent) as DatasetMetadata;
    } catch (err) {
      console.warn('[ZipService] Failed to parse _metadata.json:', err);
    }
  }

  // 2. Look for data file
  const preferredNames = mode === 'train'
    ? ['train_dataset.json', 'train.json', 'train_dataset.jsonl', 'train.jsonl']
    : ['test_dataset.json', 'test.json', 'test_dataset.jsonl', 'test.jsonl'];
  const preferredName = preferredNames[0];

  let dataEntry = entries.find((e) =>
    !e.isDirectory && preferredNames.includes(path.basename(e.entryName).toLowerCase())
  );

  // Data Prep exports preserve descriptive version prefixes, for example
  // `socratic_math_v4_train.json`. Recognize those files before the generic
  // fallback so train/test/validation cannot be confused by ZIP entry order.
  if (!dataEntry) {
    const aliases = mode === 'train' ? ['train_dataset', 'train'] : ['test_dataset', 'test'];
    dataEntry = entries.find((e) => !e.isDirectory && matchesSplitSuffix(e.entryName, aliases));
  }

  // Fallback: find any .json or .jsonl file that isn't _metadata.json
  if (!dataEntry) {
    dataEntry = entries.find((e) => {
      if (e.isDirectory) return false;
      const basename = path.basename(e.entryName);
      if (basename === '_metadata.json') return false;
      const ext = path.extname(basename).toLowerCase();
      return ext === '.json' || ext === '.jsonl';
    });
  }

  if (!dataEntry) {
    // Cleanup temp dir on failure
    fs.rmSync(tempDir, { recursive: true, force: true });
    throw new Error(
      `ZIP file does not contain a valid dataset file. Expected '${preferredName}' or any .json/.jsonl file.`
    );
  }

  // 3. Extract data file to temp directory
  const dataFileName = path.basename(dataEntry.entryName);
  const dataFilePath = safeJoin(tempDir, dataFileName);
  fs.writeFileSync(dataFilePath, dataEntry.getData());

  // A V2 training archive may contain a locked validation partition. Extract it
  // separately so AutoTrain does not silently re-split the training partition.
  let validationFilePath: string | undefined;
  let validationFileName: string | undefined;
  if (mode === 'train') {
    const validationNames = [
      'validation_dataset.json', 'validation.json', 'val_dataset.json', 'val.json',
      'validation_dataset.jsonl', 'validation.jsonl', 'val_dataset.jsonl', 'val.jsonl',
    ];
    let validationEntry = entries.find((e) =>
      !e.isDirectory && validationNames.includes(path.basename(e.entryName).toLowerCase())
    );
    if (!validationEntry) {
      validationEntry = entries.find((e) =>
        !e.isDirectory && matchesSplitSuffix(e.entryName, ['validation_dataset', 'validation', 'val_dataset', 'val'])
      );
    }
    if (validationEntry) {
      validationFileName = path.basename(validationEntry.entryName);
      validationFilePath = safeJoin(tempDir, validationFileName);
      fs.writeFileSync(validationFilePath, validationEntry.getData());
    }
  }

  return {
    dataFilePath,
    dataFileName,
    validationFilePath,
    validationFileName,
    metadata,
    tempDir,
  };
}

/**
 * Cleanup the temporary directory created during extraction.
 */
export function cleanupTempDir(tempDir: string): void {
  try {
    if (tempDir && fs.existsSync(tempDir)) {
      fs.rmSync(tempDir, { recursive: true, force: true });
    }
  } catch (err) {
    console.warn('[ZipService] Failed to cleanup temp dir:', tempDir, err);
  }
}
