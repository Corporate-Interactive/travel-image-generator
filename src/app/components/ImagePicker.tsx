"use client";

import { useEffect, useMemo, useRef, useState, startTransition } from "react";
import { useActionState } from "react";
import { downloadImageAndUpdateCsv } from "../actions";

type LocationRow = {
  city: string;
  country: string;
  type?: string;
  filename?: string;
};

type PixabayHit = {
  id: string;
  tags: string;
  previewURL: string;
  webformatURL: string;
  largeImageURL: string;
  imageWidth?: number;
  imageHeight?: number;
};

type Props = {
  locations: LocationRow[];
};

type ActionState = {
  status: "idle" | "success" | "error";
  message?: string;
  filename?: string;
};

export default function ImagePicker({ locations }: Props) {
  const [locationIndex, setLocationIndex] = useState(0);
  const [images, setImages] = useState<PixabayHit[]>([]);
  const [loading, setLoading] = useState(false);
  const [selectedImage, setSelectedImage] = useState<PixabayHit | null>(null);
  const [refreshing, setRefreshing] = useState(false);
  const [pageNum, setPageNum] = useState(1);
  const seenIdsRef = useRef<Set<string>>(new Set());
  const [source, setSource] = useState<"pixabay" | "unsplash" | "pexels">(
    "pixabay"
  );

  const [actionState, formAction, isPending] = useActionState<
    ActionState,
    FormData
  >(downloadImageAndUpdateCsv, { status: "idle" });

  const selectedLocation = locations[locationIndex];
  const isDone = !selectedLocation;

  const query = useMemo(() => {
    if (!selectedLocation) return "";
    const city = selectedLocation.city ?? "";
    const country = selectedLocation.country ?? "";
    return `${city} ${country}`.trim();
  }, [selectedLocation]);

  // Reset pagination and seen IDs when the location (query) changes
  useEffect(() => {
    setImages([]);
    setSelectedImage(null);
    setPageNum(1);
    seenIdsRef.current = new Set();
  }, [query, source]);

  // Load up to 6 unique images not seen before for this location
  useEffect(() => {
    let aborted = false;
    async function loadUnique() {
      if (!query) return;
      setLoading(true);
      try {
        const collected: PixabayHit[] = [];
        let page = pageNum;
        let attempts = 0;
        const currentSeen = new Set<string>(seenIdsRef.current);
        while (collected.length < 6 && attempts < 5) {
          const url = new URL("/api/search", window.location.origin);
          url.searchParams.set("q", query);
          url.searchParams.set("per_page", "18");
          url.searchParams.set("page", String(page));
          url.searchParams.set("source", source);
          const res = await fetch(url.toString());
          if (!res.ok) throw new Error("Search failed");
          const data = await res.json();
          const hits: PixabayHit[] = Array.isArray(data?.hits) ? data.hits : [];
          for (const h of hits) {
            if (
              !currentSeen.has(h.id) &&
              !collected.some((c) => c.id === h.id)
            ) {
              collected.push(h);
              currentSeen.add(h.id);
              if (collected.length >= 6) break;
            }
          }
          page += 1;
          attempts += 1;
          if (hits.length === 0) break;
        }
        if (!aborted) {
          seenIdsRef.current = currentSeen;
          setImages(collected);
        }
      } catch (e) {
        if (!aborted) setImages([]);
      } finally {
        if (!aborted) {
          setLoading(false);
          setRefreshing(false);
        }
      }
    }
    loadUnique();
    return () => {
      aborted = true;
    };
  }, [query, pageNum, source]);

  function goNext() {
    setSelectedImage(null);
    setLocationIndex((i) => i + 1);
  }

  useEffect(() => {
    if (actionState.status === "success") {
      goNext();
    }
  }, [actionState.status]);

  async function handlePick(img: PixabayHit) {
    if (!selectedLocation || isPending) return;
    setSelectedImage(img);
    const fd = new FormData();
    fd.set("city", selectedLocation.city);
    fd.set("country", selectedLocation.country);
    fd.set("imageId", String(img.id));
    fd.set("imageUrl", img.largeImageURL || img.webformatURL);
    startTransition(() => {
      formAction(fd);
    });
  }

  function handleRefresh() {
    if (loading || refreshing || isPending) return;
    setRefreshing(true);
    setPageNum((p) => p + 1);
  }
  if (isDone) {
    return (
      <div className="w-full max-w-5xl mx-auto flex flex-col items-center gap-4 py-12 text-center">
        <h2 className="text-xl font-semibold">All locations are complete 🎉</h2>
        <p className="text-sm text-foreground/80">
          No rows without a filename were found.
        </p>
      </div>
    );
  }

  return (
    <div className="w-full mx-auto flex flex-col gap-6">
      <div className="flex items-end justify-between">
        <div>
          <p className="text-xs uppercase tracking-wide text-foreground/60">
            Location
          </p>
          <h2 className="text-lg font-medium">
            {selectedLocation.city}, {selectedLocation.country}
          </h2>
        </div>
        <div className="text-sm text-foreground/70">
          {locationIndex + 1} / {locations.length}
        </div>
      </div>

      <div className="flex items-center justify-between">
        <p className="text-sm text-foreground/80">Query: {query}</p>
        <div className="flex items-center gap-3">
          <div className="flex items-center gap-2">
            <label className="text-xs text-foreground/70">Source</label>
            <select
              value={source}
              disabled={loading || refreshing || isPending}
              onChange={(e) =>
                setSource(e.target.value as "pixabay" | "unsplash" | "pexels")
              }
              className="bg-transparent border border-black/10 dark:border-white/10 rounded px-2 py-1 text-sm hover:bg-black/5 dark:hover:bg-white/5"
            >
              <option value="pixabay">Pixabay</option>
              <option value="unsplash">Unsplash</option>
              <option value="pexels">Pexels</option>
            </select>
          </div>
          {loading ? (
            <span className="text-sm">Loading…</span>
          ) : (
            <span className="text-sm">Showing {images.length} options</span>
          )}
          <button
            type="button"
            onClick={handleRefresh}
            disabled={loading || refreshing || isPending}
            className="rounded border border-black/10 dark:border-white/10 px-3 py-2 text-sm hover:bg-black/5 dark:hover:bg-white/5 disabled:opacity-50"
            title="Show more options"
          >
            {refreshing ? "Refreshing…" : "Refresh"}
          </button>
        </div>
      </div>

      <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-3 gap-4">
        {images.map((img) => {
          const isSelected = selectedImage?.id === img.id && isPending;
          return (
            <button
              key={img.id}
              type="button"
              onClick={() => handlePick(img)}
              disabled={isPending}
              className={`group relative rounded-lg overflow-hidden border transition duration-200 ease-out hover:shadow-lg hover:-translate-y-0.5 active:translate-y-0 ${
                isSelected
                  ? "border-foreground ring-2 ring-foreground/40"
                  : "border-black/10 dark:border-white/10"
              }`}
            >
              <img
                src={img.webformatURL || img.previewURL}
                alt={img.tags}
                className="w-full h-56 object-cover transition-transform duration-200 ease-out group-hover:scale-[1.03]"
                loading="lazy"
              />
              <div className="absolute inset-0 bg-gradient-to-t from-black/40 via-black/0 to-black/0 opacity-0 group-hover:opacity-100 transition" />
              <div className="absolute bottom-0 left-0 right-0 p-2 flex items-center justify-between text-white text-xs">
                <span className="truncate">{img.tags}</span>
                <span className="px-2 py-0.5 rounded bg-white/20 backdrop-blur-sm">
                  Select
                </span>
              </div>
            </button>
          );
        })}
      </div>

      <div className="flex items-center justify-between">
        {actionState.status === "error" ? (
          <span className="text-sm text-red-600">{actionState.message}</span>
        ) : actionState.status === "success" && actionState.filename ? (
          <span className="text-sm">
            Saved as /downloads/{actionState.filename}
          </span>
        ) : (
          <span />
        )}
        <div className="flex gap-2">
          <button
            type="button"
            onClick={goNext}
            disabled={isPending}
            className="rounded border border-black/10 dark:border-white/10 px-3 py-2 text-sm hover:bg-black/5 dark:hover:bg-white/5"
          >
            Skip
          </button>
        </div>
      </div>
    </div>
  );
}
