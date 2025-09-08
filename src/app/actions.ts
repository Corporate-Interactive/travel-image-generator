'use server';

import path from 'node:path';
import fs from 'node:fs/promises';

type ActionState = {
  status: 'idle' | 'success' | 'error';
  message?: string;
  filename?: string;
};

function toSlug(input: string): string {
  return input
    .toLowerCase()
    .normalize('NFKD')
    .replace(/[^\w\s-]/g, '')
    .trim()
    .replace(/[\s_]+/g, '-');
}

async function ensureDir(dirPath: string): Promise<void> {
  await fs.mkdir(dirPath, { recursive: true });
}

function getFileExtensionFromUrl(url: string): string {
  try {
    const pathname = new URL(url).pathname;
    const lastSegment = pathname.split('/').pop() || '';
    const clean = lastSegment.split('?')[0];
    const parts = clean.split('.');
    if (parts.length > 1) return parts.pop()!.toLowerCase();
    return 'jpg';
  } catch {
    return 'jpg';
  }
}

async function downloadImageToPublic(
  imageUrl: string,
  baseName: string
): Promise<string> {
  const ext = getFileExtensionFromUrl(imageUrl);
  const filename = `${baseName}.${ext}`;
  const downloadsDir = path.join(process.cwd(), 'public', 'downloads');
  await ensureDir(downloadsDir);

  const res = await fetch(imageUrl);
  if (!res.ok) {
    throw new Error(
      `Failed to download image: ${res.status} ${res.statusText}`
    );
  }
  const arrayBuffer = await res.arrayBuffer();
  const buffer = Buffer.from(arrayBuffer);
  const filePath = path.join(downloadsDir, filename);
  await fs.writeFile(filePath, buffer);
  return filename;
}

function parseCsvLine(line: string): string[] {
  // Simple CSV: no quotes in provided data. Split by comma and trim.
  return line.split(',').map((v) => v);
}

function stringifyCsvLine(fields: string[]): string {
  return fields.join(',');
}

async function updateCsvWithFilename(
  city: string,
  country: string,
  filename: string
): Promise<void> {
  const csvPath = path.join(process.cwd(), 'src', 'app', 'file.csv');
  const original = await fs.readFile(csvPath, 'utf8');
  const lines = original.split(/\r?\n/);
  if (lines.length === 0) throw new Error('CSV file is empty');

  // Header handling
  const header = parseCsvLine(lines[0]);
  const normalizedHeader = header.map((h) => h.trim().toLowerCase());
  let filenameIndex = normalizedHeader.indexOf('filename');
  let headerChanged = false;
  if (filenameIndex === -1) {
    header.push('filename');
    filenameIndex = header.length - 1;
    headerChanged = true;
  }

  // Update first matching row (preferring one without filename yet)
  let updated = false;
  let updatedIndex: number | null = null;
  for (let i = 1; i < lines.length; i++) {
    const raw = lines[i];
    if (!raw || raw.trim() === '') continue;
    const fields = parseCsvLine(raw);
    // Pad fields to header length
    while (fields.length < header.length) fields.push('');

    const [rowCity, rowCountry] = [fields[0].trim(), fields[1].trim()];
    if (rowCity === city && rowCountry === country) {
      // Prefer updating a row without filename, else overwrite first match
      if (
        !updated &&
        (!fields[filenameIndex] || fields[filenameIndex].trim() === '')
      ) {
        fields[filenameIndex] = filename;
        lines[i] = stringifyCsvLine(fields);
        updated = true;
        updatedIndex = i;
        break;
      }
      if (updatedIndex === null) {
        updatedIndex = i;
      }
    }
  }

  if (!updated) {
    // If we saw a matching row earlier, overwrite its filename
    if (updatedIndex !== null) {
      const fields = parseCsvLine(lines[updatedIndex]);
      while (fields.length < header.length) fields.push('');
      fields[filenameIndex] = filename;
      lines[updatedIndex] = stringifyCsvLine(fields);
    } else {
      // No existing row matched; append a new line with filename
      const newRow: string[] = [];
      newRow[0] = city;
      newRow[1] = country;
      newRow[2] = '';
      // pad
      while (newRow.length < header.length) newRow.push('');
      newRow[filenameIndex] = filename;
      lines.push(stringifyCsvLine(newRow));
    }
  }

  // Write back header (possibly extended) and lines
  lines[0] = stringifyCsvLine(header);
  const updatedCsv = lines.join('\n');
  await fs.writeFile(csvPath, updatedCsv, 'utf8');
}

export async function downloadImageAndUpdateCsv(
  prevState: ActionState,
  formData: FormData
): Promise<ActionState> {
  try {
    const city = String(formData.get('city') || '').trim();
    const country = String(formData.get('country') || '').trim();
    const imageUrl = String(formData.get('imageUrl') || '').trim();
    const imageIdRaw = String(formData.get('imageId') || '').trim();

    if (!city || !country || !imageUrl || !imageIdRaw) {
      return { status: 'error', message: 'Missing required fields' };
    }

    // Allow string IDs (e.g., Unsplash) and numbers (Pixabay)
    const safeId = imageIdRaw.replace(/[^a-zA-Z0-9_-]/g, '');
    if (!safeId) {
      return { status: 'error', message: 'Invalid image id' };
    }

    const baseName = `${toSlug(city)}-${toSlug(country)}-${safeId}`;
    const filename = await downloadImageToPublic(imageUrl, baseName);
    await updateCsvWithFilename(city, country, filename);

    return {
      status: 'success',
      filename,
      message: 'Downloaded and CSV updated',
    };
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Unknown error';
    return { status: 'error', message };
  }
}
