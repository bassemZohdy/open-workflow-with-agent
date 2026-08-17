package org.acme.functions;

import static org.junit.jupiter.api.Assertions.assertTrue;

import java.io.IOException;
import java.io.InputStream;
import java.nio.charset.StandardCharsets;

import org.junit.jupiter.api.Test;

import io.quarkus.test.common.QuarkusTestResource;
import io.quarkus.test.junit.QuarkusTest;

import static io.restassured.RestAssured.given;
import static org.hamcrest.Matchers.equalTo;

@QuarkusTest
@QuarkusTestResource(OpenAiMockApiResource.class)
class DecisionSubflowContractTest {
    @Test
    void booleanDecisionRequiresStrictYesOrNoAndReturnsTypedDecision() throws IOException {
        String workflow = resource("sub_flows/boolean-decision.sw.yaml");

        assertTrue(workflow.contains("id: boolean_decision"));
        assertTrue(workflow.contains("Answer with exactly one"));
        assertTrue(workflow.contains("decision: true"));
        assertTrue(workflow.contains("decision: false"));
        assertTrue(workflow.contains("Invalid Model Answer"));
        assertTrue(workflow.contains("question is required"));
    }

    @Test
    void choiceDecisionValidatesAgainstCallerProvidedOptions() throws IOException {
        String workflow = resource("sub_flows/choice-decision.sw.yaml");

        assertTrue(workflow.contains("id: choice_decision"));
        assertTrue(workflow.contains("Allowed options:"));
        assertTrue(workflow.contains("any($root.options[]"));
        assertTrue(workflow.contains("selected_option:"));
        assertTrue(workflow.contains("Invalid Model Answer"));
        assertTrue(workflow.contains("question and a non-empty options list are required"));
    }

    @Test
    void booleanDecisionExecutesThroughTheProviderAndReturnsTypedResult() {
        given()
                .contentType("application/json")
                .body("{\"question\":\"Is the sky blue?\"}")
                .when()
                .post("/boolean_decision")
                .then()
                .statusCode(201)
                .body("workflowdata.valid", equalTo(true))
                .body("workflowdata.decision", equalTo(true))
                .body("workflowdata.answer", equalTo("yes"));
    }

    @Test
    void invalidBooleanAnswerIsReportedWithoutCoercion() {
        given()
                .contentType("application/json")
                .body("{\"question\":\"ambiguous-answer\"}")
                .when()
                .post("/boolean_decision")
                .then()
                .statusCode(201)
                .body("workflowdata.valid", equalTo(false));
    }

    @Test
    void choiceDecisionAcceptsOnlyOneCallerProvidedOption() {
        given()
                .contentType("application/json")
                .body("{\"question\":\"pick a color\",\"options\":[\"red\",\"blue\"]}")
                .when()
                .post("/choice_decision")
                .then()
                .statusCode(201)
                .body("workflowdata.valid", equalTo(true))
                .body("workflowdata.selected_option", equalTo("blue"));
    }

    @Test
    void invalidChoiceAnswerIsReportedWithoutCoercion() {
        given()
                .contentType("application/json")
                .body("{\"question\":\"invalid-answer\",\"options\":[\"red\",\"blue\"]}")
                .when()
                .post("/choice_decision")
                .then()
                .statusCode(201)
                .body("workflowdata.valid", equalTo(false));
    }

    private static String resource(String path) throws IOException {
        try (InputStream stream = DecisionSubflowContractTest.class.getClassLoader().getResourceAsStream(path)) {
            if (stream == null) {
                throw new IOException("Missing test resource: " + path);
            }
            return new String(stream.readAllBytes(), StandardCharsets.UTF_8);
        }
    }
}
