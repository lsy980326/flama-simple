declare module "mammoth" {
  export interface Result<T> {
    value: T;
    messages: Array<{
      type: "warning" | "error";
      message: string;
    }>;
  }

  export function extractRawText(options: {
    arrayBuffer: ArrayBuffer;
  }): Promise<Result<string>>;

  export function convertToHtml(options: {
    arrayBuffer: ArrayBuffer;
  }): Promise<Result<string>>;

  export function convertToMarkdown(options: {
    arrayBuffer: ArrayBuffer;
  }): Promise<Result<string>>;
}

