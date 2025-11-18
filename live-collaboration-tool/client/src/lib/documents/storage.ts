import {
  DocumentBundle,
  DocumentBundleExportOptions,
  DocumentBundleImportResult,
  DocumentStorageContext,
  DocumentStorageListOptions,
  DocumentStorageListResult,
  DocumentStorageProvider,
  DocumentStorageProviderCapabilities,
  DocumentStorageResult,
  DocumentStorageTarget,
} from "./types";
import { SerializedAnnotationState } from "../annotations/types";

export interface DocumentStorageManagerOptions {
  defaultProviderId?: string;
}

export interface SaveDocumentOptions extends DocumentBundleExportOptions {
  annotations?: SerializedAnnotationState;
}

export interface LoadDocumentOptions {
  withAnnotations?: boolean;
  withAssets?: boolean;
  revision?: string;
  signal?: AbortSignal;
}

export class DocumentStorageManager {
  private readonly providers = new Map<string, DocumentStorageProvider>();
  private readonly options: DocumentStorageManagerOptions;

  constructor(options?: DocumentStorageManagerOptions) {
    this.options = options ?? {};
  }

  registerProvider(provider: DocumentStorageProvider): void {
    this.providers.set(provider.id, provider);
  }

  unregisterProvider(providerId: string): void {
    this.providers.delete(providerId);
  }

  listProviders(): DocumentStorageProvider[] {
    return Array.from(this.providers.values());
  }

  getProvider(providerId: string): DocumentStorageProvider | undefined {
    return this.providers.get(providerId);
  }

  getProviderCapabilities(providerId: string): DocumentStorageProviderCapabilities | undefined {
    return this.providers.get(providerId)?.capabilities;
  }

  async save(
    target: DocumentStorageTarget,
    bundle: DocumentBundle,
    options?: SaveDocumentOptions
  ): Promise<DocumentStorageResult> {
    const provider = this.resolveProvider(target);
    const context: DocumentStorageContext = {
      extra: options?.customMetadata,
    };

    if (options?.annotations) {
      bundle = {
        ...bundle,
        annotations: options.annotations,
      };
    }

    return provider.save(target, bundle, options, context);
  }

  async load(
    target: DocumentStorageTarget,
    options?: LoadDocumentOptions
  ): Promise<DocumentBundleImportResult> {
    const provider = this.resolveProvider(target);
    const context: DocumentStorageContext = {
      signal: options?.signal,
    };
    return provider.load(target, options, context);
  }

  async list(
    providerId: string,
    options?: DocumentStorageListOptions
  ): Promise<DocumentStorageListResult> {
    const provider = this.providers.get(providerId);
    if (!provider || !provider.list) {
      throw new Error(`Provider '${providerId}'는 목록 조회를 지원하지 않습니다.`);
    }
    return provider.list(options);
  }

  async delete(target: DocumentStorageTarget): Promise<void> {
    const provider = this.resolveProvider(target);
    if (!provider.delete) {
      throw new Error(`Provider '${provider.id}'는 삭제 기능을 지원하지 않습니다.`);
    }
    return provider.delete(target);
  }

  private resolveProvider(target: DocumentStorageTarget): DocumentStorageProvider {
    if (target.provider) {
      const provider = this.providers.get(target.provider);
      if (!provider) {
        throw new Error(`Provider '${target.provider}'를 찾을 수 없습니다.`);
      }
      if (!provider.canHandle(target)) {
        throw new Error(`Provider '${target.provider}'가 대상 ${target.uri}를 처리할 수 없습니다.`);
      }
      return provider;
    }

    const provider = this.findProviderForTarget(target);
    if (!provider) {
      throw new Error(`대상 ${target.uri}를 처리할 수 있는 Provider가 등록되어 있지 않습니다.`);
    }
    return provider;
  }

  private findProviderForTarget(target: DocumentStorageTarget): DocumentStorageProvider | undefined {
    if (this.options.defaultProviderId) {
      const provider = this.providers.get(this.options.defaultProviderId);
      if (provider && provider.canHandle(target)) {
        return provider;
      }
    }
    return Array.from(this.providers.values()).find((provider) =>
      provider.canHandle(target)
    );
  }
}

