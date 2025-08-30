// src/components/UploadcareWidget.tsx
'use client';

import { useMemo } from 'react';
import dynamic from 'next/dynamic';
import '@uploadcare/react-uploader/core.css';
import Image from 'next/image';

type UploadedFile = {
  cdnUrl: string;
  name?: string;
  size?: number;
  mime?: string;
};

type Props = {
  value: UploadedFile[];
  onChange: (files: UploadedFile[]) => void;
  maxFiles?: number;
  maxFileSizeMB?: number;
  acceptImagesOnly?: boolean;
};

// لفّ FileUploaderRegular بديناميك مع تعطيل SSR
const FileUploaderRegular = dynamic(
  () => import('@uploadcare/react-uploader').then((m) => m.FileUploaderRegular),
  { ssr: false }
);

// أنواع خفيفة علشان أي تغيّرات في lib
type UploaderFileInfo =
  | {
      cdnUrl?: string;
      name?: string;
      size?: number;
      mimeType?: string;
      mime?: string;
    }
  | null;

type UploaderState = {
  allEntries?: Array<{ fileInfo?: UploaderFileInfo }>;
};

export default function UploadcareWidget({
  value,
  onChange,
  maxFiles = Number(process.env.NEXT_PUBLIC_UPLOADCARE_MAX_FILES || 5),
  maxFileSizeMB = Number(process.env.NEXT_PUBLIC_UPLOADCARE_MAX_FILE_SIZE_MB || 8),
  acceptImagesOnly = true,
}: Props) {
  const pubkey = process.env.NEXT_PUBLIC_UPLOADCARE_PUBLIC_KEY || '';

  const accept = useMemo<string | undefined>(
    () => (acceptImagesOnly ? 'image/*' : undefined),
    [acceptImagesOnly]
  );
  const maxSize = maxFileSizeMB * 1024 * 1024;

  if (!pubkey) {
    return (
      <div className="text-sm text-red-600">
        ضع مفتاح Uploadcare في <code>NEXT_PUBLIC_UPLOADCARE_PUBLIC_KEY</code>.
      </div>
    );
  }

  return (
    <div dir="rtl" className="space-y-2">
      <FileUploaderRegular
        pubkey={pubkey}
        multiple
        maxLocalFileSizeBytes={maxSize}
        sourceList="local, camera, url, dropbox, gdrive"
        accept={accept}
        onChange={(filesState?: UploaderState) => {
          const entries = filesState?.allEntries ?? [];
          const ready = entries
            .map((e) => e.fileInfo)
            .filter((fi): fi is NonNullable<UploaderFileInfo> => Boolean(fi && fi.cdnUrl))
            .map((fi) => ({
              cdnUrl: String(fi!.cdnUrl),
              name: fi!.name,
              size: fi!.size,
              mime: fi!.mimeType || fi!.mime,
            }))
            .slice(0, maxFiles);

          onChange(ready);
        }}
      />

      {value?.length > 0 && (
        <div className="grid grid-cols-3 gap-2">
          {value.map((f, i) => (
            <div key={i} className="border rounded-lg p-1 overflow-hidden">
              <Image
                src={`${f.cdnUrl}-/resize/300x/`}
                alt={f.name || `image-${i}`}
                width={300}
                height={180}
                className="w-full h-24 object-cover rounded-md"
              />
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
