/**
 * Type declarations for the `cookie` package (version 0.7.2).
 *
 * Local declaration file to avoid adding the external `@types/cookie` dev dependency.
 * Declares only `parse` and `serialize` as used by the application per Rule 04/ADR-027.
 */
declare module 'cookie' {
  export interface CookieParseOptions {
    decode?: (val: string) => string;
  }

  export interface CookieSerializeOptions {
    encode?: (val: string) => string;
    maxAge?: number;
    domain?: string;
    path?: string;
    expires?: Date;
    httpOnly?: boolean;
    secure?: boolean;
    priority?: 'low' | 'medium' | 'high';
    sameSite?: true | false | 'lax' | 'strict' | 'none';
  }

  export function parse(
    str: string,
    options?: CookieParseOptions,
  ): Record<string, string | undefined>;

  export function serialize(
    name: string,
    val: string,
    options?: CookieSerializeOptions,
  ): string;
}
