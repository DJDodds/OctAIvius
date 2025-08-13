/**
 * Utility Functions for AI Chatbot Frontend (TypeScript)
 */

// DOM Utilities
export function getElementById(id: string): HTMLElement | null {
  const element = document.getElementById(id);
  if (!element && (window as any).AppConfig?.debug?.enabled) {
    console.warn(`Element with ID '${id}' not found`);
  }
  return element;
}

export function getElementsByClassName(className: string): HTMLElement[] {
  return Array.from(document.getElementsByClassName(className)) as HTMLElement[];
}

type ElementContent = string | HTMLElement | HTMLElement[];
export function createElement(
  tag: string,
  attributes: Record<string, any> = {},
  content: ElementContent = ""
): HTMLElement {
  const element = document.createElement(tag);
  for (const [key, value] of Object.entries(attributes)) {
    if (key === "className") {
      (element as any).className = value;
    } else if (key === "dataset" && value && typeof value === "object") {
      for (const [dataKey, dataValue] of Object.entries(value)) {
        (element as any).dataset[dataKey] = String(dataValue);
      }
    } else {
      element.setAttribute(key, String(value));
    }
  }
  if (typeof content === "string") {
    element.textContent = content;
  } else if (content instanceof HTMLElement) {
    element.appendChild(content);
  } else if (Array.isArray(content)) {
    content.forEach((child) => {
      if (child instanceof HTMLElement) element.appendChild(child);
    });
  }
  return element;
}

export function addEventListenerSafe(
  element: HTMLElement,
  event: string,
  handler: (e: Event) => void,
  options: AddEventListenerOptions | boolean = {}
): void {
  try {
    element.addEventListener(
      event,
      (e) => {
        try {
          handler(e);
        } catch (error: any) {
          console.error(`Error in ${event} handler:`, error);
          if ((window as any).AppConfig?.debug?.enabled) {
            if ((window as any).Utils?.showToast) {
              (window as any).Utils.showToast("error", `Event handler error: ${error.message}`);
            }
          }
        }
      },
      options as any
    );
  } catch (error) {
    console.error(`Failed to add ${event} listener:`, error);
  }
}

// String Utilities
export function sanitizeHtml(str: string): string {
  const div = document.createElement("div");
  div.textContent = str;
  return div.innerHTML;
}

export function escapeHtml(str: string): string {
  const htmlEscapeMap: Record<string, string> = {
    "&": "&amp;",
    "<": "&lt;",
    ">": "&gt;",
    '"': "&quot;",
    "'": "&#39;",
    "/": "&#x2F;",
  };
  return str.replace(/[&<>"'/]/g, (char) => htmlEscapeMap[char] || char);
}

export function truncateString(str: string, maxLength: number, suffix = "..."): string {
  if (str.length <= maxLength) return str;
  return str.substring(0, Math.max(0, maxLength - suffix.length)) + suffix;
}

export function formatTimestamp(
  timestamp: Date | string | number,
  options: {
    showDate?: boolean;
    showTime?: boolean;
    relative?: boolean;
    format?: "short" | "long";
  } = {}
): string {
  const date = new Date(timestamp);
  const now = new Date();
  const diff = now.getTime() - date.getTime();
  const { showDate = true, showTime = true, relative = false, format = "short" } = options;
  if (relative && diff < 24 * 60 * 60 * 1000) {
    if (diff < 60 * 1000) return "Just now";
    if (diff < 60 * 60 * 1000) return `${Math.floor(diff / (60 * 1000))}m ago`;
    return `${Math.floor(diff / (60 * 60 * 1000))}h ago`;
  }
  const timeOptions: Intl.DateTimeFormatOptions = { hour: "2-digit", minute: "2-digit" };
  const dateOptions: Intl.DateTimeFormatOptions = {
    month: format === "long" ? "long" : "short",
    day: "numeric",
  };
  if (date.getFullYear() !== now.getFullYear()) dateOptions.year = "numeric";
  let result = "";
  if (showDate) result += date.toLocaleDateString(undefined, dateOptions);
  if (showTime) {
    if (result) result += " ";
    result += date.toLocaleTimeString(undefined, timeOptions);
  }
  return result;
}

// File Utilities
export function formatFileSize(bytes: number, decimals = 2): string {
  if (bytes === 0) return "0 B";
  const k = 1024;
  const dm = decimals < 0 ? 0 : decimals;
  const sizes = ["B", "KB", "MB", "GB", "TB"];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return parseFloat((bytes / Math.pow(k, i)).toFixed(dm)) + " " + sizes[i];
}

export function validateFile(
  file: File,
  options: { allowedTypes?: string[]; maxSize?: number } = {}
): { valid: boolean; errors: string[] } {
  const {
    allowedTypes = (window as any).getConfig?.("voice.supportedFormats", []) || [],
    maxSize = (window as any).getConfig?.("voice.maxFileSize", 10 * 1024 * 1024) || 10 * 1024 * 1024,
  } = options;
  const errors: string[] = [];
  if (allowedTypes.length > 0 && !allowedTypes.includes(file.type)) {
    errors.push(`File type ${file.type} is not supported`);
  }
  if (file.size > maxSize) {
    errors.push(
      `File size ${formatFileSize(file.size)} exceeds maximum of ${formatFileSize(maxSize)}`
    );
  }
  return { valid: errors.length === 0, errors };
}

// Animation Utilities
export function scrollToBottom(element: HTMLElement, duration = 300): void {
  const start = element.scrollTop;
  const target = element.scrollHeight - element.clientHeight;
  const distance = target - start;
  const startTime = performance.now();
  function animate(currentTime: number) {
    const elapsed = currentTime - startTime;
    const progress = Math.min(elapsed / duration, 1);
    const eased = 1 - Math.pow(1 - progress, 3);
    element.scrollTop = start + distance * eased;
    if (progress < 1) requestAnimationFrame(animate);
  }
  requestAnimationFrame(animate);
}

export function animateOpacity(element: HTMLElement, targetOpacity: number, duration = 300): Promise<void> {
  return new Promise((resolve) => {
    const startOpacity = parseFloat(getComputedStyle(element).opacity);
    const distance = targetOpacity - startOpacity;
    const startTime = performance.now();
    function animate(currentTime: number) {
      const elapsed = currentTime - startTime;
      const progress = Math.min(elapsed / duration, 1);
      element.style.opacity = String(startOpacity + distance * progress);
      if (progress < 1) requestAnimationFrame(animate);
      else resolve();
    }
    requestAnimationFrame(animate);
  });
}

// Toasts
export function showToast(type: "success" | "error" | "warning" | "info", message: string, duration: number | null = null) {
  const container = getElementById("toast-container");
  if (!container) return;
  const toastDuration = duration ?? ((window as any).getConfig?.("ui.toast.duration", 5000) || 5000);
  const maxToasts = (window as any).getConfig?.("ui.toast.maxToasts", 5) || 5;
  while (container.children.length >= maxToasts) {
    const first = container.firstElementChild;
    if (first) {
      container.removeChild(first);
    } else {
      break;
    }
  }
  const toast = createElement("div", { className: `toast ${type}`, "data-type": type });
  const content = createElement("div", { className: "toast-content" }, message);
  const closeBtn = createElement("button", { className: "toast-close", "aria-label": "Close notification" }, "×");
  toast.appendChild(content);
  toast.appendChild(closeBtn);
  container.appendChild(toast);
  const closeToast = () => {
    animateOpacity(toast, 0, 200).then(() => toast.parentNode?.removeChild(toast));
  };
  addEventListenerSafe(closeBtn, "click", closeToast);
  if (toastDuration > 0) setTimeout(closeToast, toastDuration);
}

// Storage
export function getStorageItem<T = any>(key: string, defaultValue: T | null = null): T | null {
  try {
    const item = localStorage.getItem(key);
    return item ? (JSON.parse(item) as T) : defaultValue;
  } catch (error) {
    console.warn(`Failed to get storage item '${key}':`, error);
    return defaultValue;
  }
}

export function setStorageItem(key: string, value: any): boolean {
  try {
    localStorage.setItem(key, JSON.stringify(value));
    return true;
  } catch (error) {
    console.error(`Failed to set storage item '${key}':`, error);
    return false;
  }
}

export function removeStorageItem(key: string): boolean {
  try {
    localStorage.removeItem(key);
    return true;
  } catch (error) {
    console.error(`Failed to remove storage item '${key}':`, error);
    return false;
  }
}

// Debounce & Throttle
export function debounce<T extends (...args: any[]) => any>(func: T, wait: number, immediate = false) {
  let timeout: any;
  return function (this: any, ...args: Parameters<T>) {
    const later = () => {
      timeout = null;
      if (!immediate) func.apply(this, args);
    };
    const callNow = immediate && !timeout;
    clearTimeout(timeout);
    timeout = setTimeout(later, wait);
    if (callNow) func.apply(this, args);
  };
}

export function throttle<T extends (...args: any[]) => any>(func: T, limit: number) {
  let inThrottle = false;
  return function (this: any, ...args: Parameters<T>) {
    if (!inThrottle) {
      func.apply(this, args);
      inThrottle = true;
      setTimeout(() => (inThrottle = false), limit);
    }
  };
}

// URL utils
export function getQueryParam(name: string, defaultValue = ""): string {
  const urlParams = new URLSearchParams(window.location.search);
  return urlParams.get(name) || defaultValue;
}

export function setQueryParam(name: string, value: string): void {
  const url = new URL(window.location.href);
  url.searchParams.set(name, value);
  window.history.replaceState({}, "", url);
}

// Device detection
export function isTouchDevice(): boolean {
  return "ontouchstart" in window || navigator.maxTouchPoints > 0;
}

export function isMobileDevice(): boolean {
  return /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(navigator.userAgent);
}

export function getBrowserInfo() {
  const ua = navigator.userAgent;
  const browsers = {
    chrome: /Chrome/i.test(ua) && !/Edge/i.test(ua),
    firefox: /Firefox/i.test(ua),
    safari: /Safari/i.test(ua) && !/Chrome/i.test(ua),
    edge: /Edge/i.test(ua),
    opera: /Opera/i.test(ua),
  } as const;
  const browser = (Object.keys(browsers) as Array<keyof typeof browsers>).find((k) => (browsers as any)[k]) || "unknown";
  return { name: browser, userAgent: ua, isMobile: isMobileDevice(), isTouch: isTouchDevice() };
}

// Expose to global for legacy inline scripts
;(window as any).Utils = {
  getElementById,
  getElementsByClassName,
  createElement,
  addEventListenerSafe,
  sanitizeHtml,
  escapeHtml,
  truncateString,
  formatTimestamp,
  formatFileSize,
  validateFile,
  scrollToBottom,
  animateOpacity,
  showToast,
  getStorageItem,
  setStorageItem,
  removeStorageItem,
  debounce,
  throttle,
  getQueryParam,
  setQueryParam,
  isTouchDevice,
  isMobileDevice,
  getBrowserInfo,
};

if ((window as any).AppConfig?.debug?.enabled) {
  console.log("Frontend utilities (TS) loaded successfully");
}
