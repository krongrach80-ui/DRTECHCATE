import { AuditService } from './service';

export * from './schema';
export * from './repository';
export * from './service';

// Global singleton instance of AuditService used throughout the application
export const audit = new AuditService();
