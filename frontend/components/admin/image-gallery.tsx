"use client";

import { useState } from "react";
import Image from "next/image";
import { ImageIcon, StarIcon, Trash2Icon } from "lucide-react";
import { useUploadImage } from "@/lib/queries/admin";
import { MAX_GALLERY_IMAGES } from "@/lib/variants";

const MAX_IMAGE_BYTES = 4 * 1024 * 1024; // the API refuses bigger uploads
const IMAGE_TYPES = ["image/jpeg", "image/png", "image/webp", "image/gif", "image/avif"];

interface ImageGalleryProps {
  /** The images of the product. The first one is the main image */
  images: string[];
  onAdd: (url: string) => void;
  onMakeMain: (url: string) => void;
  onRemove: (url: string) => void;
  /** The form must not be saved while an image is still going up */
  onUploadingChange: (uploading: boolean) => void;
  error?: string;
}

export default function ImageGallery({
  images,
  onAdd,
  onMakeMain,
  onRemove,
  onUploadingChange,
  error,
}: ImageGalleryProps) {
  const upload = useUploadImage();
  const [pending, setPending] = useState(0); // images that are going up right now
  const [problem, setProblem] = useState<string>();

  const room = MAX_GALLERY_IMAGES - images.length - pending;

  async function handleFiles(event: React.ChangeEvent<HTMLInputElement>) {
    const input = event.currentTarget;
    const files = Array.from(input.files ?? []);
    input.value = ""; // so the same file can be chosen again
    if (files.length === 0) return;

    let found: string | undefined;
    const valid: File[] = [];
    for (const file of files) {
      if (!IMAGE_TYPES.includes(file.type)) found = "Use JPEG, PNG, WebP, GIF or AVIF images.";
      else if (file.size > MAX_IMAGE_BYTES) found = "Each image must be 4 MB or smaller.";
      else valid.push(file);
    }
    if (valid.length > room) {
      found = `Only ${Math.max(room, 0)} more ${room === 1 ? "image fits" : "images fit"} (up to ${MAX_GALLERY_IMAGES}).`;
    }
    setProblem(found);

    const toUpload = valid.slice(0, Math.max(room, 0));
    if (toUpload.length === 0) return;

    setPending(toUpload.length);
    onUploadingChange(true);
    try {
      // One after the other: the upload route has a rate limit, and a failure stops the rest
      for (const file of toUpload) {
        try {
          onAdd(await upload.mutateAsync(file));
        } catch {
          break; // the hook already showed why
        } finally {
          setPending((count) => count - 1);
        }
      }
    } finally {
      setPending(0);
      onUploadingChange(false);
    }
  }

  const shownError = error ?? problem;

  return (
    <div>
      {images.length === 0 && pending === 0 ? (
        <div className="flex aspect-square items-center justify-center rounded-card border border-dashed border-line bg-canvas text-line-strong">
          <ImageIcon className="size-12" />
        </div>
      ) : (
        <ul className="grid grid-cols-2 gap-2 sm:grid-cols-4 lg:grid-cols-2">
          {images.map((src, index) => (
            <li
              key={src}
              className="relative aspect-square overflow-hidden rounded-control border border-line bg-canvas"
            >
              <Image
                src={src}
                alt={index === 0 ? "Main image" : `Image ${index + 1}`}
                fill
                sizes="160px"
                className="object-cover"
              />
              {index === 0 && <span className="badge badge-primary absolute left-1 top-1">Main</span>}
              <span className="absolute bottom-1 left-1 rounded bg-black/60 px-1.5 text-xs font-medium text-white">
                {index + 1}
              </span>
              <div className="absolute right-1 top-1 flex gap-1">
                {index > 0 && (
                  <button
                    type="button"
                    onClick={() => onMakeMain(src)}
                    title="Make it the main image"
                    aria-label={`Make image ${index + 1} the main image`}
                    className="rounded-control bg-surface/90 p-1.5 text-ink-soft hover:text-primary-700"
                  >
                    <StarIcon className="size-3.5" />
                  </button>
                )}
                <button
                  type="button"
                  onClick={() => onRemove(src)}
                  title="Remove"
                  aria-label={`Remove image ${index + 1}`}
                  className="rounded-control bg-surface/90 p-1.5 text-ink-soft hover:text-danger"
                >
                  <Trash2Icon className="size-3.5" />
                </button>
              </div>
            </li>
          ))}
          {Array.from({ length: pending }, (_, index) => (
            <li key={`uploading-${index}`} className="skeleton aspect-square rounded-control" aria-busy="true" />
          ))}
        </ul>
      )}

      <input
        type="file"
        multiple
        accept={IMAGE_TYPES.join(",")}
        onChange={handleFiles}
        disabled={room <= 0}
        aria-label="Add product images"
        aria-invalid={Boolean(shownError)}
        className="mt-3 block w-full text-sm file:mr-3 file:cursor-pointer file:rounded-control file:border-0 file:bg-primary-50 file:px-3 file:py-2 file:text-sm file:font-medium file:text-primary-800 hover:file:bg-primary-100 disabled:opacity-60"
      />
      {shownError ? (
        <p role="alert" className="field-error">
          {shownError}
        </p>
      ) : (
        <p className="mt-1 text-xs text-ink-muted">
          The first image is the main one: the cards and the orders show it. Up to {MAX_GALLERY_IMAGES} images,
          4 MB each. JPEG, PNG, WebP, GIF or AVIF.
        </p>
      )}
    </div>
  );
}