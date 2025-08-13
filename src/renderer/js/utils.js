/**
 * Utility Functions for AI Chatbot Frontend
 * 
 * This file contains common utility functions used throughout the client-side
 * application. These utilities handle DOM manipulation, event handling,
 * data formatting, and other helper functions.
 */

// ===== DOM Utilities =====

/**
 * Safely selects a DOM element by ID
 * @param {string} id - Element ID
 * @returns {HTMLElement|null} Element or null if not found
 */
function getElementById(id) {
  const element = document.getElementById(id);
  if (!element && window.AppConfig?.debug?.enabled) {
    console.warn(`Element with ID '${id}' not found`);
  }
  return element;
}

/**
 * Safely selects DOM elements by class name
 * @param {string} className - Class name
 * @returns {HTMLElement[]} Array of elements
 */
function getElementsByClassName(className) {
  return Array.from(document.getElementsByClassName(className));
}

/**
 * Creates a DOM element with attributes and content
 * @param {string} tag - HTML tag name
 * @param {Object} attributes - Element attributes
 * @param {string|HTMLElement|HTMLElement[]} content - Element content
 * @returns {HTMLElement} Created element
 */
function createElement(tag, attributes = {}, content = '') {
  const element = document.createElement(tag);
  
  // Set attributes
  for (const [key, value] of Object.entries(attributes)) {
    if (key === 'className') {
      element.className = value;
    } else if (key === 'dataset') {
      for (const [dataKey, dataValue] of Object.entries(value)) {
        element.dataset[dataKey] = dataValue;
      }
    } else {
      element.setAttribute(key, value);
    }
  }
  
  // Set content
  if (typeof content === 'string') {
    element.textContent = content;
  } else if (content instanceof HTMLElement) {
    element.appendChild(content);
  } else if (Array.isArray(content)) {
    content.forEach(child => {
      if (child instanceof HTMLElement) {
        element.appendChild(child);
      }
    });
  }
  
  return element;
}

/**
 * Adds event listener with error handling
 * @param {HTMLElement} element - Target element
 * @param {string} event - Event type
 * @param {Function} handler - Event handler
 * @param {Object} options - Event options
 */
function addEventListenerSafe(element, event, handler, options = {}) {
  try {
    element.addEventListener(event, (e) => {
      try {
        handler(e);
      } catch (error) {
        console.error(`Error in ${event} handler:`, error);
        if (window.AppConfig?.debug?.enabled) {
          showToast('error', `Event handler error: ${error.message}`);
        }
      }
    }, options);
  } catch (error) {
    console.error(`Failed to add ${event} listener:`, error);
  }
}

// ===== String Utilities =====

/**
 * Sanitizes HTML content to prevent XSS
 * @param {string} str - String to sanitize
 * @returns {string} Sanitized string
 */
function sanitizeHtml(str) {
  const div = document.createElement('div');
  div.textContent = str;
  return div.innerHTML;
}

/**
 * Escapes HTML special characters
 * @param {string} str - String to escape
 * @returns {string} Escaped string
 */
function escapeHtml(str) {
  const htmlEscapeMap = {
    '&': '&amp;',
    '<': '&lt;',
    '>': '&gt;',
    '"': '&quot;',
    "'": '&#39;',
    '/': '&#x2F;'
  };
  
  return str.replace(/[&<>"'/]/g, (char) => htmlEscapeMap[char] || char);
}

/**
 * Truncates a string to a maximum length
 * @param {string} str - String to truncate
 * @param {number} maxLength - Maximum length
 * @param {string} suffix - Suffix to add if truncated
 * @returns {string} Truncated string
 */
function truncateString(str, maxLength, suffix = '...') {
  if (str.length <= maxLength) {
    return str;
  }
  return str.substring(0, maxLength - suffix.length) + suffix;
}

/**
 * Formats a timestamp for display
 * @param {Date|string|number} timestamp - Timestamp to format
 * @param {Object} options - Formatting options
 * @returns {string} Formatted timestamp
 */
function formatTimestamp(timestamp, options = {}) {
  const date = new Date(timestamp);
  const now = new Date();
  const diff = now - date;
  
  const {
    showDate = true,
    showTime = true,
    relative = false,
    format = 'short'
  } = options;
  
  if (relative && diff < 24 * 60 * 60 * 1000) { // Less than 24 hours
    if (diff < 60 * 1000) return 'Just now';
    if (diff < 60 * 60 * 1000) return `${Math.floor(diff / (60 * 1000))}m ago`;
    return `${Math.floor(diff / (60 * 60 * 1000))}h ago`;
  }
  
  const timeOptions = {
    hour: '2-digit',
    minute: '2-digit'
  };
  
  const dateOptions = {
    month: format === 'long' ? 'long' : 'short',
    day: 'numeric'
  };
  
  if (date.getFullYear() !== now.getFullYear()) {
    dateOptions.year = 'numeric';
  }
  
  let result = '';
  if (showDate) {
    result += date.toLocaleDateString(undefined, dateOptions);
  }
  if (showTime) {
    if (result) result += ' ';
    result += date.toLocaleTimeString(undefined, timeOptions);
  }
  
  return result;
}

// ===== File Utilities =====

/**
 * Formats file size in bytes to human readable format
 * @param {number} bytes - Size in bytes
 * @param {number} decimals - Number of decimal places
 * @returns {string} Formatted size string
 */
function formatFileSize(bytes, decimals = 2) {
  if (bytes === 0) return '0 B';

  const k = 1024;
  const dm = decimals < 0 ? 0 : decimals;
  const sizes = ['B', 'KB', 'MB', 'GB', 'TB'];

  const i = Math.floor(Math.log(bytes) / Math.log(k));

  return parseFloat((bytes / Math.pow(k, i)).toFixed(dm)) + ' ' + sizes[i];
}

/**
 * Validates file type and size
 * @param {File} file - File to validate
 * @param {Object} options - Validation options
 * @returns {Object} Validation result
 */
function validateFile(file, options = {}) {
  const {
    allowedTypes = window.getConfig('voice.supportedFormats', []),
    maxSize = window.getConfig('voice.maxFileSize', 10 * 1024 * 1024)
  } = options;
  
  const errors = [];
  
  // Check file type
  if (allowedTypes.length > 0 && !allowedTypes.includes(file.type)) {
    errors.push(`File type ${file.type} is not supported`);
  }
  
  // Check file size
  if (file.size > maxSize) {
    errors.push(`File size ${formatFileSize(file.size)} exceeds maximum of ${formatFileSize(maxSize)}`);
  }
  
  return {
    valid: errors.length === 0,
    errors
  };
}

// ===== Animation Utilities =====

/**
 * Smoothly scrolls an element to the bottom
 * @param {HTMLElement} element - Element to scroll
 * @param {number} duration - Animation duration in ms
 */
function scrollToBottom(element, duration = 300) {
  const start = element.scrollTop;
  const target = element.scrollHeight - element.clientHeight;
  const distance = target - start;
  const startTime = performance.now();
  
  function animate(currentTime) {
    const elapsed = currentTime - startTime;
    const progress = Math.min(elapsed / duration, 1);
    
    // Easing function (ease-out)
    const eased = 1 - Math.pow(1 - progress, 3);
    
    element.scrollTop = start + distance * eased;
    
    if (progress < 1) {
      requestAnimationFrame(animate);
    }
  }
  
  requestAnimationFrame(animate);
}

/**
 * Animates element opacity
 * @param {HTMLElement} element - Element to animate
 * @param {number} targetOpacity - Target opacity (0-1)
 * @param {number} duration - Animation duration in ms
 * @returns {Promise} Promise that resolves when animation completes
 */
function animateOpacity(element, targetOpacity, duration = 300) {
  return new Promise((resolve) => {
    const startOpacity = parseFloat(getComputedStyle(element).opacity);
    const distance = targetOpacity - startOpacity;
    const startTime = performance.now();
    
    function animate(currentTime) {
      const elapsed = currentTime - startTime;
      const progress = Math.min(elapsed / duration, 1);
      
      element.style.opacity = startOpacity + distance * progress;
      
      if (progress < 1) {
        requestAnimationFrame(animate);
      } else {
        resolve();
      }
    }
    
    requestAnimationFrame(animate);
  });
}

// ===== Toast Notification System =====

/**
 * Shows a toast notification
 * @param {string} type - Toast type ('success', 'error', 'warning', 'info')
 * @param {string} message - Toast message
 * @param {number} duration - Display duration in ms
 */
function showToast(type, message, duration = null) {
  const container = getElementById('toast-container');
  if (!container) return;
  
  const toastDuration = duration || window.getConfig('ui.toast.duration', 5000);
  const maxToasts = window.getConfig('ui.toast.maxToasts', 5);
  
  // Remove oldest toasts if at limit
  const existingToasts = container.children;
  while (existingToasts.length >= maxToasts) {
    container.removeChild(existingToasts[0]);
  }
  
  // Create toast element
  const toast = createElement('div', {
    className: `toast ${type}`,
    'data-type': type
  });
  
  // Create toast content
  const content = createElement('div', { className: 'toast-content' }, message);
  const closeBtn = createElement('button', {
    className: 'toast-close',
    'aria-label': 'Close notification'
  }, '×');
  
  toast.appendChild(content);
  toast.appendChild(closeBtn);
  
  // Add to container
  container.appendChild(toast);
  
  // Close handler
  function closeToast() {
    animateOpacity(toast, 0, 200).then(() => {
      if (toast.parentNode) {
        toast.parentNode.removeChild(toast);
      }
    });
  }
  
  // Add event listeners
  addEventListenerSafe(closeBtn, 'click', closeToast);
  
  // Auto-remove after duration
  if (toastDuration > 0) {
    setTimeout(closeToast, toastDuration);
  }
}

// ===== Local Storage Utilities =====

/**
 * Safely gets item from localStorage
 * @param {string} key - Storage key
 * @param {*} defaultValue - Default value if key not found
 * @returns {*} Stored value or default
 */
function getStorageItem(key, defaultValue = null) {
  try {
    const item = localStorage.getItem(key);
    return item ? JSON.parse(item) : defaultValue;
  } catch (error) {
    console.warn(`Failed to get storage item '${key}':`, error);
    return defaultValue;
  }
}

/**
 * Safely sets item in localStorage
 * @param {string} key - Storage key
 * @param {*} value - Value to store
 * @returns {boolean} Success status
 */
function setStorageItem(key, value) {
  try {
    localStorage.setItem(key, JSON.stringify(value));
    return true;
  } catch (error) {
    console.error(`Failed to set storage item '${key}':`, error);
    return false;
  }
}

/**
 * Safely removes item from localStorage
 * @param {string} key - Storage key
 * @returns {boolean} Success status
 */
function removeStorageItem(key) {
  try {
    localStorage.removeItem(key);
    return true;
  } catch (error) {
    console.error(`Failed to remove storage item '${key}':`, error);
    return false;
  }
}

// ===== Debounce and Throttle =====

/**
 * Debounces a function call
 * @param {Function} func - Function to debounce
 * @param {number} wait - Wait time in ms
 * @param {boolean} immediate - Execute immediately on first call
 * @returns {Function} Debounced function
 */
function debounce(func, wait, immediate = false) {
  let timeout;
  
  return function executedFunction(...args) {
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

/**
 * Throttles a function call
 * @param {Function} func - Function to throttle
 * @param {number} limit - Time limit in ms
 * @returns {Function} Throttled function
 */
function throttle(func, limit) {
  let inThrottle;
  
  return function throttledFunction(...args) {
    if (!inThrottle) {
      func.apply(this, args);
      inThrottle = true;
      setTimeout(() => inThrottle = false, limit);
    }
  };
}

// ===== URL and Query Parameters =====

/**
 * Gets URL query parameter value
 * @param {string} name - Parameter name
 * @param {string} defaultValue - Default value if not found
 * @returns {string} Parameter value
 */
function getQueryParam(name, defaultValue = '') {
  const urlParams = new URLSearchParams(window.location.search);
  return urlParams.get(name) || defaultValue;
}

/**
 * Sets URL query parameter without page reload
 * @param {string} name - Parameter name
 * @param {string} value - Parameter value
 */
function setQueryParam(name, value) {
  const url = new URL(window.location);
  url.searchParams.set(name, value);
  window.history.replaceState({}, '', url);
}

// ===== Device and Browser Detection =====

/**
 * Checks if device supports touch
 * @returns {boolean} True if touch is supported
 */
function isTouchDevice() {
  return 'ontouchstart' in window || navigator.maxTouchPoints > 0;
}

/**
 * Checks if device is mobile
 * @returns {boolean} True if mobile device
 */
function isMobileDevice() {
  return /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(navigator.userAgent);
}

/**
 * Gets browser information
 * @returns {Object} Browser information
 */
function getBrowserInfo() {
  const ua = navigator.userAgent;
  const browsers = {
    chrome: /Chrome/i.test(ua) && !/Edge/i.test(ua),
    firefox: /Firefox/i.test(ua),
    safari: /Safari/i.test(ua) && !/Chrome/i.test(ua),
    edge: /Edge/i.test(ua),
    opera: /Opera/i.test(ua)
  };
  
  const browser = Object.keys(browsers).find(key => browsers[key]) || 'unknown';
  
  return {
    name: browser,
    userAgent: ua,
    isMobile: isMobileDevice(),
    isTouch: isTouchDevice()
  };
}

// ===== Export utilities to global scope =====
window.Utils = {
  // DOM utilities
  getElementById,
  getElementsByClassName,
  createElement,
  addEventListenerSafe,
  
  // String utilities
  sanitizeHtml,
  escapeHtml,
  truncateString,
  formatTimestamp,
  
  // File utilities
  formatFileSize,
  validateFile,
  
  // Animation utilities
  scrollToBottom,
  animateOpacity,
  
  // Toast notifications
  showToast,
  
  // Storage utilities
  getStorageItem,
  setStorageItem,
  removeStorageItem,
  
  // Function utilities
  debounce,
  throttle,
  
  // URL utilities
  getQueryParam,
  setQueryParam,
  
  // Device detection
  isTouchDevice,
  isMobileDevice,
  getBrowserInfo
};

// Log utilities loaded in debug mode
if (window.AppConfig?.debug?.enabled) {
  console.log('Frontend utilities loaded successfully');
}
