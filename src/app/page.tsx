import fs from 'node:fs/promises';
import path from 'node:path';
import ImagePicker from './components/ImagePicker';

type LocationRow = {
  city: string;
  country: string;
  type?: string;
  filename?: string;
};

async function loadLocations(): Promise<LocationRow[]> {
  const csvPath = path.join(process.cwd(), 'src', 'app', 'file.csv');
  const text = await fs.readFile(csvPath, 'utf8');
  const lines = text.split(/\r?\n/);
  if (lines.length <= 1) return [];
  const header = lines[0].split(',').map((h) => h.trim().toLowerCase());
  const cityIdx = header.indexOf('city');
  const countryIdx = header.indexOf('country');
  const typeIdx = header.indexOf('type');
  const filenameIdx = header.indexOf('filename');
  const rows: LocationRow[] = [];
  for (let i = 1; i < lines.length; i++) {
    const line = lines[i];
    if (!line || line.trim() === '') continue;
    const fields = line.split(',');
    const city = fields[cityIdx] ? String(fields[cityIdx]).trim() : '';
    const country = fields[countryIdx] ? String(fields[countryIdx]).trim() : '';
    if (!city || !country) continue;
    const type =
      typeIdx >= 0 ? String(fields[typeIdx] || '').trim() : undefined;
    const filename =
      filenameIdx >= 0 ? String(fields[filenameIdx] || '').trim() : undefined;
    rows.push({ city, country, type, filename });
  }
  return rows;
}

export default async function Home() {
  const locations = await loadLocations();
  const incomplete = locations.filter((l) => !l.filename);
  return (
    <div className="font-sans min-h-screen p-8 sm:p-12">
      <div className="mx-auto flex flex-col gap-6 ">
        <h1 className="text-2xl font-semibold tracking-tight">
          Travel Image Downloader
        </h1>
        <p className="text-sm text-foreground/80">
          Pick a location from CSV, choose an image from Pixabay, download it
          locally, and we will update the CSV with the filename.
        </p>
        <ImagePicker locations={incomplete} />
      </div>
    </div>
  );
}
