package org.acme.functions;

import static io.restassured.RestAssured.given;
import static org.junit.jupiter.api.Assertions.assertEquals;

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

        assertEquals(2, ok);
        assertEquals(3, tooManyRequests);
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
