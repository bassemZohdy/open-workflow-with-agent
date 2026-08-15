package org.acme.functions;

import java.util.Map;

import jakarta.ws.rs.BadRequestException;
import jakarta.ws.rs.Consumes;
import jakarta.ws.rs.POST;
import jakarta.ws.rs.Path;
import jakarta.ws.rs.Produces;
import jakarta.ws.rs.core.MediaType;
import org.jboss.logging.Logger;

/**
 * Local calculator function backing {@code utility-functions.yaml#calculate}.
 *
 * <p>Expressions are rejected up front if they exceed a fixed nesting depth: catching a
 * {@link StackOverflowError} and continuing is explicitly unreliable per the JLS (the JVM makes
 * no guarantee the thread is in a recoverable state), so recursion is bounded *before* parsing.
 */
@Path("/functions/calculator")
@Produces(MediaType.APPLICATION_JSON)
public class CalculatorResource {
    private static final Logger LOG = Logger.getLogger(CalculatorResource.class);
    private static final int MAX_EXPRESSION_LENGTH = 256;
    private static final int MAX_PAREN_DEPTH = 50;

    @POST
    @Consumes(MediaType.APPLICATION_JSON)
    public Map<String, Object> calculate(Map<String, String> request) {
        String expression = request == null ? null : request.get("expression");
        if (expression == null || expression.isBlank()) {
            throw new BadRequestException("expression is required");
        }
        if (expression.length() > MAX_EXPRESSION_LENGTH) {
            throw new BadRequestException("expression exceeds maximum length of " + MAX_EXPRESSION_LENGTH);
        }
        rejectExcessiveNesting(expression);
        double result;
        try {
            result = new ExpressionParser(expression).parse();
        } catch (RuntimeException e) {
            throw new BadRequestException("invalid arithmetic expression");
        }
        if (Double.isInfinite(result) || Double.isNaN(result)) {
            throw new BadRequestException("expression result is not a finite number");
        }
        LOG.infof("utility calculator executed expression=%s result=%s", LogSanitizer.safe(expression), result);
        return Map.of("expression", expression, "result", result);
    }

    /**
     * Rejects expressions whose total parenthesis depth exceeds {@link #MAX_PAREN_DEPTH} before
     * the recursive-descent parser runs, so a hostile expression can never trigger unbounded
     * recursion / {@link StackOverflowError}. A negative depth (closing paren with no opener)
     * is left for the parser, which rejects it as invalid arithmetic anyway.
     */
    private static void rejectExcessiveNesting(String expression) {
        int depth = 0;
        for (int i = 0; i < expression.length(); i++) {
            char c = expression.charAt(i);
            if (c == '(') {
                depth++;
                if (depth > MAX_PAREN_DEPTH) {
                    throw new BadRequestException("expression is too deeply nested (max " + MAX_PAREN_DEPTH + " levels)");
                }
            } else if (c == ')') {
                depth--;
            }
        }
    }

    private static final class ExpressionParser {
        private final String input;
        private int position;

        ExpressionParser(String input) {
            this.input = input;
        }

        double parse() {
            double value = expression();
            skipWhitespace();
            if (position != input.length()) {
                throw new IllegalArgumentException();
            }
            return value;
        }

        private double expression() {
            double value = term();
            while (true) {
                skipWhitespace();
                if (match('+')) {
                    value += term();
                } else if (match('-')) {
                    value -= term();
                } else {
                    return value;
                }
            }
        }

        private double term() {
            double value = factor();
            while (true) {
                skipWhitespace();
                if (match('*')) {
                    value *= factor();
                } else if (match('/')) {
                    value /= factor();
                } else {
                    return value;
                }
            }
        }

        private double factor() {
            skipWhitespace();
            if (match('(')) {
                double value = expression();
                if (!match(')')) {
                    throw new IllegalArgumentException();
                }
                return value;
            }
            int start = position;
            if (match('-')) {
                return -factor();
            }
            while (position < input.length() && (Character.isDigit(input.charAt(position)) || input.charAt(position) == '.')) {
                position++;
            }
            if (start == position) {
                throw new IllegalArgumentException();
            }
            return Double.parseDouble(input.substring(start, position));
        }

        private boolean match(char expected) {
            if (position < input.length() && input.charAt(position) == expected) {
                position++;
                return true;
            }
            return false;
        }

        private void skipWhitespace() {
            while (position < input.length() && Character.isWhitespace(input.charAt(position))) {
                position++;
            }
        }
    }
}
