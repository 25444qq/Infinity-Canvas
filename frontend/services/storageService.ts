/**
 * 存储服务 - 管理本地文件存储和缓存
 * 支持浏览器环境和未来的 Electron/Tauri 打包
 */

const DB_NAME = 'canvas_storage_db';
const DB_VERSION = 2;
const STORE_HANDLES = 'handles';
const STORE_SETTINGS = 'settings';
const STORE_CACHE = 'cache';

const KEY_DIR_HANDLE = 'download_dir_handle';
const KEY_SETTINGS = 'app_settings';

// 默认设置
const DEFAULT_SETTINGS: AppSettings = {
    defaultSavePath: 'downloads', // 默认保存到下载文件夹
    autoSaveWorkflow: true,
    maxCacheSize: 500 * 1024 * 1024, // 500MB
    cacheEnabled: true,
    imageQuality: 0.9,
};

// 设置接口
export interface AppSettings {
    defaultSavePath: string;
    autoSaveWorkflow: boolean;
    maxCacheSize: number;
    cacheEnabled: boolean;
    imageQuality: number;
}

// 缓存条目接口
export interface CacheEntry {
    key: string;
    data: Blob;
    size: number;
    timestamp: number;
    type: 'image' | 'workflow' | 'other';
}

// 存储统计
export interface StorageStats {
    indexedDBUsage: number;
    indexedDBQuota: number;
    cacheAPIUsage: number;
    localStorageUsage: number;
    totalUsage: number;
    cacheEntries: number;
    oldestCacheTime: number | null;
}

// TypeScript interfaces for File System Access API
interface FileSystemHandle {
    kind: 'file' | 'directory';
    name: string;
    isSameEntry(other: FileSystemHandle): Promise<boolean>;
}

interface FileSystemDirectoryHandle extends FileSystemHandle {
    kind: 'directory';
    getFileHandle(name: string, options?: { create?: boolean }): Promise<FileSystemFileHandle>;
    getDirectoryHandle(name: string, options?: { create?: boolean }): Promise<FileSystemDirectoryHandle>;
    removeEntry(name: string, options?: { recursive?: boolean }): Promise<void>;
    resolve(possibleDescendant: FileSystemHandle): Promise<string[] | null>;
    values(): AsyncIterableIterator<FileSystemHandle>;
}

interface FileSystemFileHandle extends FileSystemHandle {
    kind: 'file';
    getFile(): Promise<File>;
    createWritable(options?: { keepExistingData?: boolean }): Promise<FileSystemWritableFileStream>;
}

interface FileSystemWritableFileStream extends WritableStream {
    write(data: BufferSource | Blob | string): Promise<void>;
    seek(position: number): Promise<void>;
    truncate(size: number): Promise<void>;
}

declare global {
    interface Window {
        showDirectoryPicker(options?: { id?: string, mode?: 'read' | 'readwrite' }): Promise<FileSystemDirectoryHandle>;
        // Electron/Tauri API hooks (将来使用)
        electronAPI?: {
            getDefaultDownloadPath(): Promise<string>;
            saveFile(path: string, data: ArrayBuffer): Promise<boolean>;
            selectDirectory(): Promise<string | null>;
        };
    }
}

class StorageService {
    private dbPromise: Promise<IDBDatabase>;
    private settings: AppSettings = DEFAULT_SETTINGS;
    private isElectron: boolean = false;

    constructor() {
        this.dbPromise = this.initDB();
        this.isElectron = !!(window as any).electronAPI;
        this.loadSettings();
    }

    private initDB(): Promise<IDBDatabase> {
        return new Promise((resolve, reject) => {
            const request = indexedDB.open(DB_NAME, DB_VERSION);
            
            request.onerror = () => reject(request.error);
            request.onsuccess = () => resolve(request.result);
            
            request.onupgradeneeded = (event) => {
                const db = (event.target as IDBOpenDBRequest).result;
                
                if (!db.objectStoreNames.contains(STORE_HANDLES)) {
                    db.createObjectStore(STORE_HANDLES);
                }
                if (!db.objectStoreNames.contains(STORE_SETTINGS)) {
                    db.createObjectStore(STORE_SETTINGS);
                }
                if (!db.objectStoreNames.contains(STORE_CACHE)) {
                    const cacheStore = db.createObjectStore(STORE_CACHE, { keyPath: 'key' });
                    cacheStore.createIndex('timestamp', 'timestamp', { unique: false });
                    cacheStore.createIndex('type', 'type', { unique: false });
                }
            };
        });
    }

    private async getStore(storeName: string, mode: IDBTransactionMode): Promise<IDBObjectStore> {
        const db = await this.dbPromise;
        const tx = db.transaction(storeName, mode);
        return tx.objectStore(storeName);
    }

    // ================== 设置管理 ==================

    private async loadSettings(): Promise<void> {
        try {
            const store = await this.getStore(STORE_SETTINGS, 'readonly');
            const request = store.get(KEY_SETTINGS);
            
            return new Promise((resolve) => {
                request.onsuccess = () => {
                    if (request.result) {
                        this.settings = { ...DEFAULT_SETTINGS, ...request.result };
                    }
                    resolve();
                };
                request.onerror = () => resolve();
            });
        } catch (e) {
            console.warn('Failed to load settings:', e);
        }
    }

    async saveSettings(settings: Partial<AppSettings>): Promise<void> {
        this.settings = { ...this.settings, ...settings };
        
        try {
            const store = await this.getStore(STORE_SETTINGS, 'readwrite');
            return new Promise((resolve, reject) => {
                const request = store.put(this.settings, KEY_SETTINGS);
                request.onsuccess = () => resolve();
                request.onerror = () => reject(request.error);
            });
        } catch (e) {
            console.error('Failed to save settings:', e);
        }
    }

    getSettings(): AppSettings {
        return { ...this.settings };
    }

    // ================== 目录管理 ==================

    async setDownloadDirectory(): Promise<string | null> {
        // Electron 环境
        if (this.isElectron && window.electronAPI) {
            const path = await window.electronAPI.selectDirectory();
            if (path) {
                await this.saveSettings({ defaultSavePath: path });
                return path;
            }
            return null;
        }

        // 浏览器环境 - 使用 File System Access API
        try {
            const handle = await window.showDirectoryPicker({ mode: 'readwrite' });
            const store = await this.getStore(STORE_HANDLES, 'readwrite');
            
            return new Promise((resolve, reject) => {
                const request = store.put(handle, KEY_DIR_HANDLE);
                request.onsuccess = () => resolve(handle.name);
                request.onerror = () => reject(request.error);
            });
        } catch (error) {
            console.warn('Directory selection cancelled or failed:', error);
            return null;
        }
    }

    async getDownloadDirectoryName(): Promise<string | null> {
        if (this.isElectron) {
            return this.settings.defaultSavePath || null;
        }

        try {
            const store = await this.getStore(STORE_HANDLES, 'readonly');
            return new Promise((resolve) => {
                const request = store.get(KEY_DIR_HANDLE);
                request.onsuccess = () => {
                    const handle = request.result as FileSystemDirectoryHandle;
                    resolve(handle ? handle.name : null);
                };
                request.onerror = () => resolve(null);
            });
        } catch (e) {
            return null;
        }
    }

    async clearDownloadDirectory(): Promise<void> {
        if (this.isElectron) {
            await this.saveSettings({ defaultSavePath: 'downloads' });
            return;
        }

        const store = await this.getStore(STORE_HANDLES, 'readwrite');
        return new Promise((resolve, reject) => {
            const request = store.delete(KEY_DIR_HANDLE);
            request.onsuccess = () => resolve();
            request.onerror = () => reject(request.error);
        });
    }

    // ================== 文件保存 ==================

    async saveFile(blob: Blob, filename: string): Promise<boolean> {
        // Electron 环境
        if (this.isElectron && window.electronAPI) {
            const buffer = await blob.arrayBuffer();
            const path = `${this.settings.defaultSavePath}/${filename}`;
            return window.electronAPI.saveFile(path, buffer);
        }

        // 浏览器环境
        try {
            const store = await this.getStore(STORE_HANDLES, 'readonly');
            
            const handle = await new Promise<FileSystemDirectoryHandle | undefined>((resolve, reject) => {
                const request = store.get(KEY_DIR_HANDLE);
                request.onsuccess = () => resolve(request.result);
                request.onerror = () => reject(request.error);
            });

            if (!handle) {
                return false;
            }

            // @ts-ignore
            const permission = await handle.queryPermission({ mode: 'readwrite' });
            if (permission !== 'granted') {
                // @ts-ignore
                const request = await handle.requestPermission({ mode: 'readwrite' });
                if (request !== 'granted') {
                    return false;
                }
            }

            const fileHandle = await handle.getFileHandle(filename, { create: true });
            const writable = await fileHandle.createWritable();
            await writable.write(blob);
            await writable.close();
            
            return true;
        } catch (error) {
            console.error('Failed to save to directory:', error);
            return false;
        }
    }

    // ================== 缓存管理 ==================

    async addToCache(key: string, data: Blob, type: CacheEntry['type'] = 'other'): Promise<void> {
        if (!this.settings.cacheEnabled) return;

        const entry: CacheEntry = {
            key,
            data,
            size: data.size,
            timestamp: Date.now(),
            type
        };

        try {
            const store = await this.getStore(STORE_CACHE, 'readwrite');
            return new Promise((resolve, reject) => {
                const request = store.put(entry);
                request.onsuccess = () => {
                    this.cleanupCacheIfNeeded();
                    resolve();
                };
                request.onerror = () => reject(request.error);
            });
        } catch (e) {
            console.error('Failed to add to cache:', e);
        }
    }

    async getFromCache(key: string): Promise<Blob | null> {
        try {
            const store = await this.getStore(STORE_CACHE, 'readonly');
            return new Promise((resolve) => {
                const request = store.get(key);
                request.onsuccess = () => {
                    const entry = request.result as CacheEntry;
                    resolve(entry ? entry.data : null);
                };
                request.onerror = () => resolve(null);
            });
        } catch (e) {
            return null;
        }
    }

    async removeFromCache(key: string): Promise<void> {
        try {
            const store = await this.getStore(STORE_CACHE, 'readwrite');
            return new Promise((resolve, reject) => {
                const request = store.delete(key);
                request.onsuccess = () => resolve();
                request.onerror = () => reject(request.error);
            });
        } catch (e) {
            console.error('Failed to remove from cache:', e);
        }
    }

    private async cleanupCacheIfNeeded(): Promise<void> {
        const stats = await this.getCacheStats();
        if (stats.totalSize <= this.settings.maxCacheSize) return;

        // 删除最旧的缓存直到低于限制
        try {
            const store = await this.getStore(STORE_CACHE, 'readwrite');
            const index = store.index('timestamp');
            
            let cursor = await new Promise<IDBCursorWithValue | null>((resolve) => {
                const request = index.openCursor();
                request.onsuccess = () => resolve(request.result);
                request.onerror = () => resolve(null);
            });

            let currentSize = stats.totalSize;
            while (cursor && currentSize > this.settings.maxCacheSize * 0.8) {
                const entry = cursor.value as CacheEntry;
                currentSize -= entry.size;
                cursor.delete();
                cursor = await new Promise<IDBCursorWithValue | null>((resolve) => {
                    cursor!.continue();
                    resolve(cursor);
                });
            }
        } catch (e) {
            console.error('Cache cleanup failed:', e);
        }
    }

    async getCacheStats(): Promise<{ count: number, totalSize: number, byType: Record<string, number> }> {
        try {
            const store = await this.getStore(STORE_CACHE, 'readonly');
            
            return new Promise((resolve) => {
                const result = { count: 0, totalSize: 0, byType: {} as Record<string, number> };
                const request = store.openCursor();
                
                request.onsuccess = () => {
                    const cursor = request.result;
                    if (cursor) {
                        const entry = cursor.value as CacheEntry;
                        result.count++;
                        result.totalSize += entry.size;
                        result.byType[entry.type] = (result.byType[entry.type] || 0) + entry.size;
                        cursor.continue();
                    } else {
                        resolve(result);
                    }
                };
                request.onerror = () => resolve(result);
            });
        } catch (e) {
            return { count: 0, totalSize: 0, byType: {} };
        }
    }

    async clearCache(type?: CacheEntry['type']): Promise<void> {
        try {
            const store = await this.getStore(STORE_CACHE, 'readwrite');
            
            if (!type) {
                // 清除所有缓存
                return new Promise((resolve, reject) => {
                    const request = store.clear();
                    request.onsuccess = () => resolve();
                    request.onerror = () => reject(request.error);
                });
            }

            // 清除特定类型的缓存
            const index = store.index('type');
            const request = index.openCursor(IDBKeyRange.only(type));
            
            return new Promise((resolve) => {
                request.onsuccess = () => {
                    const cursor = request.result;
                    if (cursor) {
                        cursor.delete();
                        cursor.continue();
                    } else {
                        resolve();
                    }
                };
                request.onerror = () => resolve();
            });
        } catch (e) {
            console.error('Failed to clear cache:', e);
        }
    }

    // ================== 存储统计 ==================

    async getStorageStats(): Promise<StorageStats> {
        const stats: StorageStats = {
            indexedDBUsage: 0,
            indexedDBQuota: 0,
            cacheAPIUsage: 0,
            localStorageUsage: 0,
            totalUsage: 0,
            cacheEntries: 0,
            oldestCacheTime: null,
        };

        // Storage API 估算
        if (navigator.storage && navigator.storage.estimate) {
            const estimate = await navigator.storage.estimate();
            stats.indexedDBUsage = estimate.usage || 0;
            stats.indexedDBQuota = estimate.quota || 0;
        }

        // Cache API
        if (window.caches) {
            try {
                const keys = await window.caches.keys();
                for (const key of keys) {
                    const cache = await window.caches.open(key);
                    const cacheKeys = await cache.keys();
                    stats.cacheAPIUsage += cacheKeys.length * 100000; // 估算
                }
            } catch (e) {}
        }

        // LocalStorage
        try {
            let total = 0;
            for (const key in localStorage) {
                if (localStorage.hasOwnProperty(key)) {
                    total += (localStorage[key].length + key.length) * 2;
                }
            }
            stats.localStorageUsage = total;
        } catch (e) {}

        // 缓存条目统计
        const cacheStats = await this.getCacheStats();
        stats.cacheEntries = cacheStats.count;

        stats.totalUsage = stats.indexedDBUsage + stats.cacheAPIUsage + stats.localStorageUsage;

        return stats;
    }

    async clearAllData(): Promise<void> {
        // 清除 IndexedDB 缓存
        await this.clearCache();

        // 清除 Cache API
        if (window.caches) {
            const keys = await window.caches.keys();
            await Promise.all(keys.map(key => window.caches.delete(key)));
        }

        // 注意：不清除设置和目录句柄
    }

    async resetAllSettings(): Promise<void> {
        // 重置所有设置到默认值
        this.settings = { ...DEFAULT_SETTINGS };
        await this.saveSettings(this.settings);
        await this.clearDownloadDirectory();
    }

    // ================== 工具函数 ==================

    formatBytes(bytes: number, decimals = 2): string {
        if (!+bytes) return '0 B';
        const k = 1024;
        const dm = decimals < 0 ? 0 : decimals;
        const sizes = ['B', 'KB', 'MB', 'GB', 'TB'];
        const i = Math.floor(Math.log(bytes) / Math.log(k));
        return `${parseFloat((bytes / Math.pow(k, i)).toFixed(dm))} ${sizes[i]}`;
    }

    isFileSystemAccessSupported(): boolean {
        return 'showDirectoryPicker' in window;
    }
}

export const storageService = new StorageService();
