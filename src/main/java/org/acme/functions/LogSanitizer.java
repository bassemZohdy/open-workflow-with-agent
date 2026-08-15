package org.acme.functions;

/**
 * Sanitization helpers for anything user/LLM-controlled that is written to the application
 * log file. Guards against newline log-injection ({@code %0a} / CRLF) and unbounded prompt
 * payloads being persisted verbatim (OWASP LLM01 / log-injection hardening).
 */
final class LogSanitizer {
    /** Maximum number of characters logged for any single value before truncation. */
    static final int MAX_LENGTH = 200;

    private LogSanitizer() {
    }

    /**
     * Renders a value safely for logging: CR/LF are escaped so a crafted payload cannot forge
     * log lines, and the value is truncated so multi-MB prompt bodies are never persisted raw.
     */
    static String safe(String value) {
        if (value == null) {
            return "null";
        }
        String sanitized = value.replace("\r", "\\r").replace("\n", "\\n");
        if (sanitized.length() > MAX_LENGTH) {
            sanitized = sanitized.substring(0, MAX_LENGTH) + "…(truncated)";
        }
        return sanitized;
    }
}
