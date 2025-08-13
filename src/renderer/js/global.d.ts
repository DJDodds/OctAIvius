// Global window augmentations for legacy script usage in TS
export {};

declare global {
  interface Window {
  AppConfig: any;
  getConfig: (path: string, defaultValue?: any) => any;
  setConfig: (path: string, value: any) => boolean;
  saveUserSettings: () => boolean;
  Utils: any;
  }
}
