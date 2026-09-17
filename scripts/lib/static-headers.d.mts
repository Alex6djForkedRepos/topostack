export function finalizeStaticHeaders(template: string, pages: Map<string, string>, siteEnvironment: string): string;
export function validateStaticHeaders(headers: string): void;
export function pageSecurityPolicy(headers: string, path: string): string | undefined;
