/**
 * Utility Functions
 *
 * This module provides common utility functions used throughout the application.
 * These utilities handle various tasks like ID generation, validation, formatting,
 * and other helper functions.
 */

import { v4 as uuidv4 } from "uuid";
import crypto from "crypto";

/**
 * Generates a unique identifier
 * @returns A UUID v4 string
 */
export function generateId(): string {
  return uuidv4();
}

/**
 * Generates a unique request ID for tracking requests
 * @returns A short, unique identifier
 */
export function generateRequestId(): string {
  return crypto.randomBytes(8).toString("hex");
}

/**
 * Generates a secure random string
 * @param length - The length of the random string
 * @returns A random hex string
 */
export function generateSecureToken(length: number = 32): string {
  return crypto.randomBytes(length).toString("hex");
}

/**
 * Sleeps for a specified number of milliseconds
 * @param ms - Number of milliseconds to sleep
 */
export function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * Validates if a string is a valid UUID
 * @param str - String to validate
 * @returns True if valid UUID, false otherwise
 */
export function isValidUUID(str: string): boolean {
  const uuidRegex =
    /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
  return uuidRegex.test(str);
}

/**
 * Validates if a string is a valid email address
 * @param email - Email string to validate
 * @returns True if valid email, false otherwise
 */
export function isValidEmail(email: string): boolean {
  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  return emailRegex.test(email);
}

/**
 * Sanitizes a string by removing potentially dangerous characters
 * @param str - String to sanitize
 * @returns Sanitized string
 */
export function sanitizeString(str: string): string {
  return str
    .replace(/[<>]/g, "") // Remove HTML tags
    .replace(/['"]/g, "") // Remove quotes
    .replace(/[\x00-\x1f\x7f-\x9f]/g, "") // Remove control characters
    .trim();
}

/**
 * Truncates a string to a maximum length
 * @param str - String to truncate
 * @param maxLength - Maximum length
 * @param suffix - Suffix to add if truncated (default: '...')
 * @returns Truncated string
 */
export function truncateString(
  str: string,
  maxLength: number,
  suffix: string = "..."
): string {
  if (str.length <= maxLength) {
    return str;
  }
  return str.substring(0, maxLength - suffix.length) + suffix;
}

/**
 * Formats a file size in bytes to human readable format
 * @param bytes - Size in bytes
 * @param decimals - Number of decimal places (default: 2)
 * @returns Formatted size string
 */
export function formatFileSize(bytes: number, decimals: number = 2): string {
  if (bytes === 0) return "0 B";

  const k = 1024;
  const dm = decimals < 0 ? 0 : decimals;
  const sizes = ["B", "KB", "MB", "GB", "TB"];

  const i = Math.floor(Math.log(bytes) / Math.log(k));

  return parseFloat((bytes / Math.pow(k, i)).toFixed(dm)) + " " + sizes[i];
}

/**
 * Formats a duration in milliseconds to human readable format
 * @param ms - Duration in milliseconds
 * @returns Formatted duration string
 */
export function formatDuration(ms: number): string {
  const seconds = Math.floor(ms / 1000);
  const minutes = Math.floor(seconds / 60);
  const hours = Math.floor(minutes / 60);
  const days = Math.floor(hours / 24);

  if (days > 0) {
    return `${days}d ${hours % 24}h ${minutes % 60}m`;
  } else if (hours > 0) {
    return `${hours}h ${minutes % 60}m ${seconds % 60}s`;
  } else if (minutes > 0) {
    return `${minutes}m ${seconds % 60}s`;
  } else {
    return `${seconds}s`;
  }
}

/**
 * Deep clones an object
 * @param obj - Object to clone
 * @returns Deep cloned object
 */
export function deepClone<T>(obj: T): T {
  if (obj === null || typeof obj !== "object") {
    return obj;
  }

  if (obj instanceof Date) {
    return new Date(obj.getTime()) as unknown as T;
  }

  if (obj instanceof Array) {
    return obj.map((item) => deepClone(item)) as unknown as T;
  }

  if (obj instanceof Object) {
    const clonedObj: any = {};
    for (const key in obj) {
      if (obj.hasOwnProperty(key)) {
        clonedObj[key] = deepClone((obj as any)[key]);
      }
    }
    return clonedObj;
  }

  return obj;
}

/**
 * Merges multiple objects deeply
 * @param target - Target object to merge into
 * @param sources - Source objects to merge from
 * @returns Merged object
 */
export function deepMerge<T extends Record<string, any>>(
  target: T,
  ...sources: Partial<T>[]
): T {
  if (!sources.length) return target;
  const source = sources.shift();

  if (isObject(target) && isObject(source)) {
    for (const key in source) {
      if (source[key] && isObject(source[key])) {
        if (!target[key]) Object.assign(target, { [key]: {} });
        deepMerge(
          target[key],
          source[key] as Partial<T[Extract<keyof T, string>]>
        );
      } else {
        Object.assign(target, { [key]: source[key] });
      }
    }
  }

  return deepMerge(target, ...sources);
}

/**
 * Checks if a value is a plain object
 * @param item - Item to check
 * @returns True if object, false otherwise
 */
function isObject(item: any): boolean {
  return item && typeof item === "object" && !Array.isArray(item);
}

/**
 * Debounces a function call
 * @param func - Function to debounce
 * @param wait - Wait time in milliseconds
 * @param immediate - Execute immediately on first call
 * @returns Debounced function
 */
export function debounce<T extends (...args: any[]) => any>(
  func: T,
  wait: number,
  immediate?: boolean
): (...args: Parameters<T>) => void {
  let timeout: number | null = null;

  return function executedFunction(...args: Parameters<T>) {
    const later = () => {
      timeout = null;
      if (!immediate) func(...args);
    };

    const callNow = immediate && !timeout;

    if (timeout) clearTimeout(timeout);
    timeout = setTimeout(later, wait) as any;

    if (callNow) func(...args);
  };
}

/**
 * Throttles a function call
 * @param func - Function to throttle
 * @param limit - Time limit in milliseconds
 * @returns Throttled function
 */
export function throttle<T extends (...args: any[]) => any>(
  func: T,
  limit: number
): (...args: Parameters<T>) => void {
  let inThrottle: boolean;

  return function throttledFunction(this: any, ...args: Parameters<T>) {
    if (!inThrottle) {
      func.apply(this, args);
      inThrottle = true;
      setTimeout(() => (inThrottle = false), limit);
    }
  };
}

/**
 * Retries an async function with exponential backoff
 * @param fn - Async function to retry
 * @param maxRetries - Maximum number of retries
 * @param baseDelay - Base delay in milliseconds
 * @returns Promise that resolves with the function result
 */
export async function retryWithBackoff<T>(
  fn: () => Promise<T>,
  maxRetries: number = 3,
  baseDelay: number = 1000
): Promise<T> {
  let lastError: Error;

  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    try {
      return await fn();
    } catch (error) {
      lastError = error as Error;

      if (attempt === maxRetries) {
        throw lastError;
      }

      const delay = baseDelay * Math.pow(2, attempt);
      await sleep(delay);
    }
  }

  throw lastError!;
}

/**
 * Creates a timeout promise that rejects after specified time
 * @param ms - Timeout in milliseconds
 * @param message - Error message for timeout
 * @returns Promise that rejects after timeout
 */
export function createTimeoutPromise(
  ms: number,
  message: string = "Operation timed out"
): Promise<never> {
  return new Promise((_, reject) => {
    setTimeout(() => reject(new Error(message)), ms);
  });
}

/**
 * Races a promise against a timeout
 * @param promise - Promise to race
 * @param timeoutMs - Timeout in milliseconds
 * @param timeoutMessage - Error message for timeout
 * @returns Promise that resolves with the original promise or rejects on timeout
 */
export async function withTimeout<T>(
  promise: Promise<T>,
  timeoutMs: number,
  timeoutMessage?: string
): Promise<T> {
  return Promise.race([
    promise,
    createTimeoutPromise(timeoutMs, timeoutMessage),
  ]);
}

/**
 * Calculates the percentage difference between two numbers
 * @param oldValue - Original value
 * @param newValue - New value
 * @returns Percentage difference (positive for increase, negative for decrease)
 */
export function calculatePercentageChange(
  oldValue: number,
  newValue: number
): number {
  if (oldValue === 0) {
    return newValue === 0 ? 0 : 100;
  }
  return ((newValue - oldValue) / oldValue) * 100;
}

/**
 * Rounds a number to specified decimal places
 * @param num - Number to round
 * @param decimals - Number of decimal places
 * @returns Rounded number
 */
export function roundToDecimals(num: number, decimals: number): number {
  const factor = Math.pow(10, decimals);
  return Math.round(num * factor) / factor;
}

/**
 * Checks if a value is empty (null, undefined, empty string, empty array, empty object)
 * @param value - Value to check
 * @returns True if empty, false otherwise
 */
export function isEmpty(value: any): boolean {
  if (value == null) return true;
  if (typeof value === "string") return value.length === 0;
  if (Array.isArray(value)) return value.length === 0;
  if (typeof value === "object") return Object.keys(value).length === 0;
  return false;
}

/**
 * Converts a string to camelCase
 * @param str - String to convert
 * @returns camelCase string
 */
export function toCamelCase(str: string): string {
  return str
    .replace(/(?:^\w|[A-Z]|\b\w)/g, (word, index) => {
      return index === 0 ? word.toLowerCase() : word.toUpperCase();
    })
    .replace(/\s+/g, "");
}

/**
 * Converts a string to snake_case
 * @param str - String to convert
 * @returns snake_case string
 */
export function toSnakeCase(str: string): string {
  return str
    .replace(/\W+/g, " ")
    .split(/ |\B(?=[A-Z])/)
    .map((word) => word.toLowerCase())
    .join("_");
}

/**
 * Capitalizes the first letter of a string
 * @param str - String to capitalize
 * @returns Capitalized string
 */
export function capitalize(str: string): string {
  if (!str) return str;
  return str.charAt(0).toUpperCase() + str.slice(1).toLowerCase();
}

/**
 * Escapes HTML special characters
 * @param str - String to escape
 * @returns HTML-escaped string
 */
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

/**
 * Creates a hash of a string using SHA-256
 * @param str - String to hash
 * @returns SHA-256 hash
 */
export function createHash(str: string): string {
  return crypto.createHash("sha256").update(str).digest("hex");
}

/**
 * Compares two strings in constant time (prevents timing attacks)
 * @param a - First string
 * @param b - Second string
 * @returns True if strings are equal, false otherwise
 */
export function constantTimeEquals(a: string, b: string): boolean {
  if (a.length !== b.length) {
    return false;
  }

  let result = 0;
  for (let i = 0; i < a.length; i++) {
    result |= a.charCodeAt(i) ^ b.charCodeAt(i);
  }

  return result === 0;
}
