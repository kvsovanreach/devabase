/**
 * Centralized configuration for the application.
 * All environment-dependent values should be accessed through this module.
 */

const isDevelopment = process.env.NODE_ENV === 'development';

/**
 * Get the API base URL.
 * Priority:
 * 1. NEXT_PUBLIC_API_URL environment variable (set at build time)
 * 2. Same host as frontend with backend port (for server deployments)
 * 3. Fallback to localhost:9002 (for local development)
 */
function getApiUrl(): string {
  // If explicitly set via env var, use it
  if (process.env.NEXT_PUBLIC_API_URL) {
    return process.env.NEXT_PUBLIC_API_URL;
  }

  // In browser, derive from current location
  if (typeof window !== 'undefined') {
    const { protocol, hostname } = window.location;
    // Use same host with backend port
    return `${protocol}//${hostname}:9002`;
  }

  // SSR fallback
  return 'http://localhost:9002';
}

function getWsUrl(): string {
  if (process.env.NEXT_PUBLIC_WS_URL) {
    return process.env.NEXT_PUBLIC_WS_URL;
  }

  if (typeof window !== 'undefined') {
    const { hostname } = window.location;
    const wsProtocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
    return `${wsProtocol}//${hostname}:9002`;
  }

  return 'ws://localhost:9002';
}

// API Configuration
export const API_CONFIG = {
  get baseUrl() { return getApiUrl(); },
  get wsUrl() { return getWsUrl(); },
  timeout: 60000, // 60 seconds for regular requests
  uploadTimeout: 300000, // 5 minutes for file uploads
  longRunningTimeout: 300000, // 5 minutes for long-running operations (knowledge extraction, etc.)
  retryAttempts: 3,
} as const;

// Security Configuration
export const SECURITY_CONFIG = {
  // Token storage keys
  tokenKey: 'devabase_token',
  refreshTokenKey: 'devabase_refresh_token',
  projectIdKey: 'devabase_project_id',

  // Password requirements
  password: {
    minLength: 8,
    requireUppercase: true,
    requireLowercase: true,
    requireNumber: true,
    requireSpecial: false,
  },

  // Rate limiting (client-side)
  maxRequestsPerMinute: 60,

  // Session
  sessionTimeout: 30 * 60 * 1000, // 30 minutes
} as const;

// Feature Flags
export const FEATURES = {
  enableRag: true,
  enableImportExport: true,
  enablePlayground: true,
  enableRealtime: true,
  debugMode: isDevelopment,
} as const;

// Logging utility that respects debug mode
export const logger = {
  debug: (...args: unknown[]) => {
    if (FEATURES.debugMode) {
      console.debug('[DEBUG]', ...args);
    }
  },
  info: (...args: unknown[]) => {
    if (FEATURES.debugMode) {
      console.log('[INFO]', ...args);
    }
  },
  warn: (...args: unknown[]) => {
    console.warn('[WARN]', ...args);
  },
  error: (...args: unknown[]) => {
    console.error('[ERROR]', ...args);
  },
};

// Validation helpers
export const validateEmail = (email: string): boolean => {
  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  return emailRegex.test(email);
};

export const validatePassword = (password: string): { valid: boolean; errors: string[] } => {
  const errors: string[] = [];
  const { minLength, requireUppercase, requireLowercase, requireNumber } = SECURITY_CONFIG.password;

  if (password.length < minLength) {
    errors.push(`Password must be at least ${minLength} characters`);
  }
  if (requireUppercase && !/[A-Z]/.test(password)) {
    errors.push('Password must contain at least one uppercase letter');
  }
  if (requireLowercase && !/[a-z]/.test(password)) {
    errors.push('Password must contain at least one lowercase letter');
  }
  if (requireNumber && !/\d/.test(password)) {
    errors.push('Password must contain at least one number');
  }

  return { valid: errors.length === 0, errors };
};

export const sanitizeInput = (input: string): string => {
  return input
    .replace(/[<>]/g, '') // Remove potential HTML tags
    .trim();
};
