/**
 * Centralized configuration for the application.
 * All environment-dependent values should be accessed through this module.
 */

const isDevelopment = process.env.NODE_ENV === 'development';

// API Configuration
export const API_CONFIG = {
  baseUrl: process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8080',
  wsUrl: process.env.NEXT_PUBLIC_WS_URL || 'ws://localhost:8080',
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
