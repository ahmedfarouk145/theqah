// src/types/uploadcare.d.ts
declare global {
  interface UploadcareFile {
    cdnUrl?: string;
    promise?: () => Promise<UploadcareFile>;
  }
  interface UploadcareFilesGroup {
    files(): UploadcareFile[];
    promise(): Promise<UploadcareFilesGroup>;
    cdnUrl?: string;
  }
  interface UploadcareWidget {
    value(): UploadcareFile | UploadcareFilesGroup | null;
    onChange(cb: (file: UploadcareFile | UploadcareFilesGroup | null) => void): void;
    openDialog?: () => void;
  }
  interface UploadcareNamespace {
    Widget(el: HTMLInputElement): UploadcareWidget;
  }
  interface Window {
    uploadcare?: UploadcareNamespace;
  }
}
export {};
