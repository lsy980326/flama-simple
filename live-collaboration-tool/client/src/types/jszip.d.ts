declare module "jszip" {
  export interface JSZipObject {
    name: string;
    async(type: "text"): Promise<string>;
    async(type: "arraybuffer"): Promise<ArrayBuffer>;
    async(type: "blob"): Promise<Blob>;
  }

  export interface JSZip {
    file(name: string): JSZipObject | null;
    file(name: string, data: string | ArrayBuffer | Blob): JSZip;
    loadAsync(data: ArrayBuffer | Uint8Array | Blob | string): Promise<JSZip>;
  }

  interface JSZipStatic {
    new (): JSZip;
    (): JSZip;
    loadAsync(data: ArrayBuffer | Uint8Array | Blob | string): Promise<JSZip>;
  }

  interface JSZipModule {
    default: JSZipStatic;
  }

  const JSZip: JSZipStatic;
  export default JSZip;
  export type { JSZipModule };
}

