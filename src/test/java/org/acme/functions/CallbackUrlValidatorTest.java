package org.acme.functions;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertThrows;

import java.net.URI;

import org.junit.jupiter.api.Test;

class CallbackUrlValidatorTest {

    @Test
    void permitsExplicitlyAllowlistedLocalHost() {
        URI uri = new CallbackUrlValidator("localhost").validate("http://localhost:8080/agent/response-event");
        assertEquals("localhost", uri.getHost());
    }

    @Test
    void rejectsPrivateAddressesUnlessExplicitlyAllowlisted() {
        CallbackUrlValidator validator = new CallbackUrlValidator("");
        assertThrows(IllegalArgumentException.class,
                () -> validator.validate("http://127.0.0.1:8080/agent/response-event"));
        assertThrows(IllegalArgumentException.class,
                () -> validator.validate("http://[::1]:8080/agent/response-event"));
    }

    @Test
    void rejectsNonHttpSchemesAndOversizedUrls() {
        CallbackUrlValidator validator = new CallbackUrlValidator("localhost");
        assertThrows(IllegalArgumentException.class, () -> validator.validate("file:///etc/passwd"));
        assertThrows(IllegalArgumentException.class,
                () -> validator.validate("http://localhost/" + "x".repeat(CallbackUrlValidator.MAX_URL_LENGTH)));
    }
}
