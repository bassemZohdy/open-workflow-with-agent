package org.acme.functions;

import static io.restassured.RestAssured.given;
import static org.hamcrest.Matchers.equalTo;
import static org.junit.jupiter.api.Assertions.assertEquals;

import org.junit.jupiter.api.Test;

import io.quarkus.test.common.QuarkusTestResource;
import io.quarkus.test.junit.QuarkusTest;

@QuarkusTest
@QuarkusTestResource(OpenAiMockApiResource.class)
class AgentLoopSubflowTest {
    @Test
    void parentWorkflowExecutesAgentLoopSubflowAndReturnsFinalAnswer() {
        given()
                .contentType("application/json")
                .body("{\"messages\":[{\"role\":\"user\",\"content\":\"calculate 7 * 6\"}],\"temperature\":0,\"max_tokens\":32}")
                .when()
                .post("/llm_tool_agent")
                .then()
                .statusCode(201)
                .body("workflowdata.choices[0].message.content", equalTo("42"));

        // Regression guard: the openaiCatalog REST client must actually send the configured
        // OPENAI_API_KEY as a bearer token on every call - see OpenAiBearerTokenFilter for why
        // quarkus-openapi-generator's own auth wiring can't be trusted to do this.
        assertEquals("Bearer dummy-key", OpenAiMockApiResource.lastAuthorizationHeader);
    }
}
