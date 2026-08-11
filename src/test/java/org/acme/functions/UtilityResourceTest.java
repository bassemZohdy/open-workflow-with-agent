package org.acme.functions;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertThrows;

import java.util.Map;

import org.junit.jupiter.api.Test;

import jakarta.ws.rs.BadRequestException;

class UtilityResourceTest {
    private final UtilityResource resource = new UtilityResource();

    @Test
    void calculatesOperatorPrecedenceAndParentheses() {
        assertEquals(42.0, resource.calculate(Map.of("expression", "(7 + 5) * 3.5")).get("result"));
    }

    @Test
    void rejectsInvalidExpression() {
        assertThrows(BadRequestException.class,
                () -> resource.calculate(Map.of("expression", "7 + nope")));
    }

    @Test
    void returnsTimeForValidTimezone() {
        Map<String, String> result = resource.time("UTC");
        assertEquals("UTC", result.get("timezone"));
    }

    @Test
    void rejectsInvalidTimezone() {
        assertThrows(BadRequestException.class, () -> resource.time("Not/A_Timezone"));
    }
}
