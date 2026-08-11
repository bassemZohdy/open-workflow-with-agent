package org.acme.functions;

import static io.restassured.RestAssured.given;
import static org.hamcrest.Matchers.equalTo;

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
    }
}
