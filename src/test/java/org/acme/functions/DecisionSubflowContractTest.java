package org.acme.functions;

import static org.junit.jupiter.api.Assertions.assertTrue;

import java.io.IOException;
import java.io.InputStream;
import java.nio.charset.StandardCharsets;

import org.junit.jupiter.api.Test;

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

    private static String resource(String path) throws IOException {
        try (InputStream stream = DecisionSubflowContractTest.class.getClassLoader().getResourceAsStream(path)) {
            if (stream == null) {
                throw new IOException("Missing test resource: " + path);
            }
            return new String(stream.readAllBytes(), StandardCharsets.UTF_8);
        }
    }
}
