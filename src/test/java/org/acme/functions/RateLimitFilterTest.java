package org.acme.functions;

import static io.restassured.RestAssured.given;
import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertTrue;

import java.util.ArrayList;
import java.util.List;
import java.util.Map;

import org.junit.jupiter.api.Test;

import io.quarkus.test.junit.QuarkusTest;
import io.quarkus.test.junit.QuarkusTestProfile;
import io.quarkus.test.junit.TestProfile;

@QuarkusTest
@TestProfile(RateLimitFilterTest.WithLowRateLimit.class)
class RateLimitFilterTest {

    @Test
    void rejectsRequestsOnceTheWindowLimitIsExceeded() {
        List<Integer> statusCodes = new ArrayList<>();
        for (int i = 0; i < 5; i++) {
            statusCodes.add(
                given().when().get("/functions/time?timezone=UTC").then().extract().statusCode()
            );
        }

        long tooManyRequests = statusCodes.stream().filter(code -> code == 429).count();
        long ok = statusCodes.stream().filter(code -> code == 200).count();

        // The fixed 60s window can roll over during the test run, so assert on the
        // ceiling/floor rather than exact counts: at most 2 requests are allowed through.
        assertEquals(5, ok + tooManyRequests);
        assertTrue(ok <= 2, "expected at most 2 accepted requests, got " + ok);
        assertTrue(tooManyRequests >= 3, "expected at least 3 rejected requests, got " + tooManyRequests);
    }

    @Test
    void neverGatesManagementEndpoints() {
        for (int i = 0; i < 5; i++) {
            given().when().get("/q/health").then().statusCode(200);
        }
    }

    public static final class WithLowRateLimit implements QuarkusTestProfile {
        @Override
        public Map<String, String> getConfigOverrides() {
            return Map.of("utility.rate-limit.requests-per-minute", "2");
        }
    }
}
