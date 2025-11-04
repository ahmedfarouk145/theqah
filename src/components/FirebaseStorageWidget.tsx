'use client';

import { useState, useRef } from 'react';
import { ref, uploadBytes, getDownloadURL, deleteObject } from 'firebase/storage';
import { storage } from '@/lib/firebase';
import Image from 'next/image';
import { Upload, X, Loader2 } from 'lucide-react';

type UploadedFile = {
  url: string;
  name: string;
  size?: number;
  path: string;
};

type Props = {
  value: UploadedFile[];
  onChange: (files: UploadedFile[]) => void;
  maxFiles?: number;
  maxFileSizeMB?: number;
  acceptImagesOnly?: boolean;
};

export default function FirebaseStorageWidget({
  value = [],
  onChange,
  maxFiles = 5,
  maxFileSizeMB = 8,
  acceptImagesOnly = true,
}: Props) {
  const [uploading, setUploading] = useState(false);
  const [uploadProgress, setUploadProgress] = useState<{ [key: string]: number }>({});
  const [storageError, setStorageError] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleFileSelect = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const files = event.target.files;
    if (!files || files.length === 0) return;

    const filesArray = Array.from(files);
    const validFiles = filesArray.filter(file => {
      if (acceptImagesOnly && !file.type.startsWith('image/')) {
        alert('يرجى اختيار ملفات صور فقط');
        return false;
      }
      if (file.size > maxFileSizeMB * 1024 * 1024) {
        alert(`حجم الملف يجب أن يكون أقل من ${maxFileSizeMB}MB`);
        return false;
      }
      return true;
    });

    if (validFiles.length === 0) return;

    const remainingSlots = maxFiles - value.length;
    if (validFiles.length > remainingSlots) {
      alert(`يمكنك رفع ${remainingSlots} ملفات فقط`);
      return;
    }

    setUploading(true);
    setStorageError(null);
    const newFiles: UploadedFile[] = [];

    for (const file of validFiles) {
      try {
        const fileName = `${Date.now()}_${file.name}`;
        const storageRef = ref(storage, `uploads/${fileName}`);
        
        setUploadProgress(prev => ({ ...prev, [fileName]: 0 }));

        const snapshot = await uploadBytes(storageRef, file);
        const downloadURL = await getDownloadURL(snapshot.ref);

        newFiles.push({
          url: downloadURL,
          name: file.name,
          size: file.size,
          path: snapshot.ref.fullPath,
        });

        setUploadProgress(prev => ({ ...prev, [fileName]: 100 }));
      } catch (error) {
        console.error('Upload error:', error);
        const errorMsg = error instanceof Error ? error.message : String(error);
        
        if (errorMsg.includes('storage/no-default-bucket') || errorMsg.includes('storage/unknown')) {
          setStorageError('Firebase Storage غير مفعل بعد. سيتم تفعيله قريباً.');
        } else {
          alert(`خطأ في رفع الملف: ${file.name}`);
        }
      }
    }

    onChange([...value, ...newFiles]);
    setUploading(false);
    setUploadProgress({});
    
    // Reset file input
    if (fileInputRef.current) {
      fileInputRef.current.value = '';
    }
  };

  const handleRemoveFile = async (index: number) => {
    const fileToRemove = value[index];
    
    try {
      // Delete from Firebase Storage
      const storageRef = ref(storage, fileToRemove.path);
      await deleteObject(storageRef);
      
      // Remove from state
      const newFiles = value.filter((_, i) => i !== index);
      onChange(newFiles);
    } catch (error) {
      console.error('Delete error:', error);
      // Still remove from UI even if delete fails
      const newFiles = value.filter((_, i) => i !== index);
      onChange(newFiles);
    }
  };

  const handleDrop = (event: React.DragEvent) => {
    event.preventDefault();
    const files = event.dataTransfer.files;
    if (files.length > 0) {
      const fakeEvent = {
        target: { files }
      } as React.ChangeEvent<HTMLInputElement>;
      handleFileSelect(fakeEvent);
    }
  };

  const handleDragOver = (event: React.DragEvent) => {
    event.preventDefault();
  };

  return (
    <div dir="rtl" className="space-y-4">
      {/* Storage Error Message */}
      {storageError && (
        <div className="bg-yellow-50 border border-yellow-200 rounded-lg p-4">
          <div className="flex items-center">
            <div className="text-yellow-600 text-sm">
              ⚠️ {storageError}
            </div>
          </div>
        </div>
      )}

      {/* Upload Area */}
      <div
        className="border-2 border-dashed border-gray-300 rounded-lg p-6 text-center hover:border-gray-400 transition-colors cursor-pointer"
        onDrop={handleDrop}
        onDragOver={handleDragOver}
        onClick={() => fileInputRef.current?.click()}
      >
        <input
          ref={fileInputRef}
          type="file"
          multiple
          accept={acceptImagesOnly ? "image/*" : "*"}
          onChange={handleFileSelect}
          className="hidden"
          disabled={uploading}
        />
        
        <Upload className="mx-auto h-12 w-12 text-gray-400 mb-4" />
        <p className="text-lg font-medium text-gray-700 mb-2">
          {uploading ? 'جاري الرفع...' : 'اسحب الملفات هنا أو انقر للاختيار'}
        </p>
        <p className="text-sm text-gray-500">
          يمكنك رفع {maxFiles - value.length} ملفات أخرى
        </p>
        <p className="text-xs text-gray-400 mt-1">
          الحد الأقصى: {maxFileSizeMB}MB لكل ملف
        </p>
      </div>

      {/* Upload Progress */}
      {Object.keys(uploadProgress).length > 0 && (
        <div className="space-y-2">
          {Object.entries(uploadProgress).map(([fileName, progress]) => (
            <div key={fileName} className="bg-gray-100 rounded p-2">
              <div className="flex items-center justify-between mb-1">
                <span className="text-sm font-medium">{fileName}</span>
                <span className="text-sm text-gray-500">{progress}%</span>
              </div>
              <div className="w-full bg-gray-200 rounded-full h-2">
                <div
                  className="bg-blue-600 h-2 rounded-full transition-all duration-300"
                  style={{ width: `${progress}%` }}
                />
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Uploaded Files */}
      {value.length > 0 && (
        <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4">
          {value.map((file, index) => (
            <div key={index} className="relative group border rounded-lg overflow-hidden">
              <Image
                src={file.url}
                alt={file.name}
                width={200}
                height={150}
                className="w-full h-32 object-cover"
                unoptimized={true}  // تجاوز next/image optimization للـ Firebase Storage
                onError={(e) => {
                  console.error('Firebase Storage image load failed:', e);
                }}
              />
              
              {/* File Info */}
              <div className="p-2 bg-white">
                <p className="text-xs font-medium text-gray-700 truncate">
                  {file.name}
                </p>
                {file.size && (
                  <p className="text-xs text-gray-500">
                    {(file.size / 1024 / 1024).toFixed(2)} MB
                  </p>
                )}
              </div>

              {/* Remove Button */}
              <button
                onClick={() => handleRemoveFile(index)}
                className="absolute top-2 right-2 bg-red-500 text-white rounded-full p-1 opacity-0 group-hover:opacity-100 transition-opacity"
                disabled={uploading}
              >
                <X className="h-4 w-4" />
              </button>
            </div>
          ))}
        </div>
      )}

      {/* Loading State */}
      {uploading && (
        <div className="flex items-center justify-center py-4">
          <Loader2 className="h-6 w-6 animate-spin text-blue-600" />
          <span className="ml-2 text-gray-600">جاري الرفع...</span>
        </div>
      )}
    </div>
  );
}
