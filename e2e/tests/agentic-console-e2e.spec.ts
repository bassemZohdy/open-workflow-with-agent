import { test, expect } from "@playwright/test";

test.describe("Orchestrator OpenWorkflow Console & API E2E Verification", () => {
  test("loads console UI and verifies title and health status", async ({
    page,
  }) => {
    await page.goto("/");
    await expect(page.locator("h1")).toHaveText("Agentic OpenWorkflow Console");
    await expect(page.locator("#health")).toBeVisible();
  });

  test("loads the packaged Studio and preserves history fallback", async ({
    page,
  }) => {
    const studioResponse = await page.goto("/studio/");
    expect(studioResponse).not.toBeNull();
    expect(studioResponse?.headers()["content-security-policy"]).toContain(
      "script-src 'self'",
    );
    expect(studioResponse?.headers()["content-security-policy"]).not.toContain(
      "unsafe-inline",
    );
    await expect(page).toHaveTitle("OpenWorkflow Studio");
    await expect(
      page.getByRole("option", { name: /agent-call\.sw\.yaml/ }),
    ).toBeVisible();
    await expect(
      page.getByRole("option", { name: /agent-rest\.yaml/ }),
    ).toBeVisible();
    await expect(
      page.getByText("Local file import only", { exact: true }),
    ).toBeVisible();
    await page.getByRole("button", { name: /Issues/ }).click();
    await expect(
      page.getByRole("heading", { name: "Issues", level: 2 }),
    ).toBeVisible();
    await expect(
      page.getByText(
        /Local validation · studio-validation-2026-08-20\.1 · no remote schemas/,
      ),
    ).toBeVisible();
    await expect(
      page.getByText(/No diagnostics detected|No matching issues/),
    ).toBeVisible();
    await page.getByRole("button", { name: /Issues/ }).click();

    await page.getByPlaceholder("Search documents").fill("boolean");
    const booleanDocument = page.getByRole("option", {
      name: /boolean-decision\.sw\.yaml/,
    });
    await expect(booleanDocument).toBeVisible();
    await booleanDocument.click();
    await expect(page).toHaveURL(/\/studio\/workflows\/workflow-[a-f0-9]{32}$/);
    await expect(
      page.getByRole("heading", { name: "Boolean Decision", level: 1 }),
    ).toBeVisible();
    const sourceEditor = page.getByRole("textbox", {
      name: "Editable canonical source",
    });
    await expect(sourceEditor).toBeVisible();
    await expect(sourceEditor).toHaveValue(/specVersion/);
    await page.getByPlaceholder("Find").fill("specVersion");
    await expect(page.locator(".source-status")).toContainText("1 match");

    await page.getByRole("tab", { name: "Form" }).click();
    await expect(
      page.getByRole("heading", { name: "Workflow metadata", level: 2 }),
    ).toBeVisible();
    await expect(
      page.getByText("Form projection · source-preserving draft", {
        exact: true,
      }),
    ).toBeVisible();
    await expect(page.getByText("Field classifications")).toBeVisible();
    await expect(
      page.getByRole("heading", { name: "0.8 authoring guidance", level: 3 }),
    ).toBeVisible();
    await expect(
      page.getByText("start: Validate Request", { exact: true }),
    ).toBeVisible();
    await expect(
      page.getByRole("heading", { name: "State authoring", level: 3 }),
    ).toBeVisible();
    const stateAuthoring = page.getByLabel("State authoring");
    await expect(
      stateAuthoring.getByRole("button", { name: "Duplicate" }),
    ).toBeVisible();
    await expect(
      stateAuthoring.getByRole("button", { name: "Add state" }),
    ).toBeVisible();
    await expect(
      stateAuthoring.getByRole("textbox", { name: "Data conditions" }),
    ).toBeVisible();
    await expect(
      stateAuthoring.getByRole("textbox", { name: "Event conditions" }),
    ).toBeVisible();
    await expect(
      stateAuthoring.getByRole("textbox", { name: "Default branch" }),
    ).toBeVisible();
    await expect(
      stateAuthoring.getByText("Other state properties", { exact: true }),
    ).toBeVisible();
    await stateAuthoring
      .getByText("Other state properties", { exact: true })
      .click();
    await expect(
      stateAuthoring.getByRole("textbox", { name: "New property name" }),
    ).toBeVisible();
    await expect(
      stateAuthoring.getByRole("button", { name: "Add property" }),
    ).toBeVisible();
    const definitions = page.locator(".definition-editor");
    await expect(
      definitions.getByRole("heading", {
        name: "Functions, events, and errors",
        level: 3,
      }),
    ).toBeVisible();
    await expect(
      definitions.getByRole("tab", { name: /Functions/ }),
    ).toBeVisible();
    await expect(
      definitions.getByRole("button", { name: "Add function" }),
    ).toBeVisible();
    await expect(
      definitions.locator('input[list="catalog-operation-options"]'),
    ).toHaveValue("openaiCatalog#chatCompletions");
    await expect(
      page.locator(
        '#catalog-operation-options option[value="openaiCatalog#chatCompletions"]',
      ),
    ).toHaveCount(1);
    await expect(
      definitions.getByRole("heading", { name: "Catalog aliases", level: 4 }),
    ).toBeVisible();
    await expect(
      definitions.getByRole("combobox", { name: "Selected catalog alias" }),
    ).toHaveValue("openaiCatalog");
    await expect(
      definitions.getByRole("combobox", { name: "Catalog file for alias" }),
    ).toHaveValue("classpath:/catalogs/openai-compatible.yaml");
    await definitions
      .getByRole("button", { name: "Delete catalog alias", exact: true })
      .click();
    await expect(
      definitions.getByRole("heading", { name: "Alias dependency impact" }),
    ).toBeVisible();
    await expect(definitions.getByText(/operation on line/)).toBeVisible();
    await definitions.getByRole("button", { name: "Keep alias" }).click();
    await expect(definitions.getByText(/Usage count:/)).toBeVisible();
    const usageReference = definitions.getByRole("button", {
      name: /refName on line/,
    });
    await expect(usageReference).toBeVisible();
    await usageReference.click();
    await expect(page.getByRole("tab", { name: "Source" })).toHaveAttribute(
      "aria-selected",
      "true",
    );
    await page.getByRole("tab", { name: "Form" }).click();
    await expect(
      page.getByRole("button", { name: "Save draft" }),
    ).toBeDisabled();

    await page.getByRole("tab", { name: "Details" }).click();
    await expect(
      page.getByRole("heading", { name: "Identity and compatibility" }),
    ).toBeVisible();
    await expect(page.getByText("States", { exact: true })).toBeVisible();
    const sourceLink = page.getByRole("button", {
      name: /Open id at source line/,
    });
    await expect(sourceLink).toBeVisible();
    await sourceLink.click();
    await expect(page.getByRole("tab", { name: "Source" })).toHaveAttribute(
      "aria-selected",
      "true",
    );
    await expect(
      page.getByRole("button", { name: /Go to source line/ }).first(),
    ).toBeVisible();

    await page.getByRole("tab", { name: "Graph" }).click();
    await expect(
      page.getByRole("application", { name: /Interactive workflow graph/ }),
    ).toBeVisible();
    await expect(
      page.getByRole("button", { name: /Validate Input, switch state/ }),
    ).toBeVisible();
    await expect(
      page.getByRole("heading", { name: "State palette" }),
    ).toBeVisible();
    await expect(
      page.getByRole("button", { name: "parallel", exact: true }),
    ).toBeVisible();
    await expect(page.getByText(/positions snap to a 24px grid/)).toBeVisible();
    await expect(
      page.getByRole("button", {
        name: /^if .* transition from Validate Input/,
      }),
    ).toBeVisible();
    await expect(
      page.getByRole("heading", { name: "Add a direct connection" }),
    ).toBeVisible();
    await page.getByRole("tab", { name: "Source" }).click();
    const draftSourceEditor = page.getByRole("textbox", {
      name: "Editable canonical source",
    });
    const originalDraftSource = await draftSourceEditor.inputValue();
    const advancedDraftSource = originalDraftSource.replace(
      "transition: Invalid Input",
      "transition: Return Yes",
    );
    expect(advancedDraftSource).not.toBe(originalDraftSource);
    await draftSourceEditor.fill(advancedDraftSource);
    await page.getByRole("tab", { name: "Graph" }).click();
    await expect(
      page.getByRole("button", {
        name: "default transition from Validate Input to Return Yes",
      }),
    ).toBeVisible();
    await page
      .getByRole("button", { name: /Validate Input, switch state/ })
      .click();
    await expect(
      page.getByRole("heading", { name: "Validate Input" }),
    ).toBeVisible();
    await expect(
      page.getByRole("button", { name: /Open source line/ }),
    ).toBeVisible();
    await expect(
      page.getByRole("button", { name: "Delete selected (1)" }),
    ).toBeEnabled();
    const conditionGroup = page
      .locator("details.graph-detail-list")
      .filter({ hasText: "Conditions (1)" });
    await expect(conditionGroup.locator("summary")).toBeVisible();
    await expect(conditionGroup).not.toHaveAttribute("open", "");
    await conditionGroup.locator("summary").click();
    await expect(conditionGroup).toHaveAttribute("open", "");
    await page
      .getByRole("textbox", { name: "New graph state name" })
      .fill("Graph Draft State");
    await page.getByRole("button", { name: "Add inject state" }).click();
    await expect(
      page.getByRole("button", { name: /Graph Draft State, inject state/ }),
    ).toBeVisible();
    await page.getByRole("tab", { name: "Form" }).click();
    const draftStateAuthoring = page.getByLabel("State authoring");
    await expect(
      draftStateAuthoring.getByRole("button", { name: "Graph Draft State" }),
    ).toBeVisible();
    await expect(
      page
        .getByLabel("Start state")
        .locator("option", { hasText: "Graph Draft State" }),
    ).toHaveCount(1);
    await page.getByRole("tab", { name: "Graph" }).click();
    await page.getByRole("button", { name: "Text view" }).click();
    await expect(page.getByRole("table")).toBeVisible();
    await expect(page.getByText("Accessible graph outline")).toBeVisible();
    const textGraph = page.locator(".text-graph");
    await textGraph
      .getByRole("button", { name: "Validate Input", exact: true })
      .click();
    await expect(
      page.getByRole("button", { name: "Delete selected (1)" }),
    ).toBeEnabled();
    await textGraph
      .getByRole("button", { name: "Edit Validate Input in Form", exact: true })
      .click();
    await expect(page.getByRole("tab", { name: "Form" })).toHaveAttribute(
      "aria-selected",
      "true",
    );
    await page.getByRole("tab", { name: "Graph" }).click();
    await page.getByRole("button", { name: "Text view" }).click();
    await page
      .getByRole("button", { name: /transition →/ })
      .first()
      .click();
    await page
      .getByRole("button", { name: "Edit selected transition in Form" })
      .click();
    await expect(page.getByRole("tab", { name: "Form" })).toHaveAttribute(
      "aria-selected",
      "true",
    );
    await expect(
      page.getByRole("button", { name: "Save draft" }),
    ).toBeEnabled();
    await page.getByRole("tab", { name: "Source" }).click();
    await page.getByRole("button", { name: "Undo" }).click();
    await page.getByRole("button", { name: "Undo" }).click();
    await expect(
      page.getByRole("button", { name: "Save", exact: true }),
    ).toBeDisabled();

    await page.getByPlaceholder("Search documents").fill("agent-rest");
    const agentCatalog = page.getByRole("option", { name: /agent-rest\.yaml/ });
    await expect(agentCatalog).toBeVisible();
    await agentCatalog.click();
    await page.getByRole("tab", { name: "Form" }).click();
    await expect(
      page.getByRole("heading", { name: "Catalog authoring", level: 2 }),
    ).toBeVisible();
    await expect(
      page.getByRole("textbox", { name: "Catalog title" }),
    ).toHaveValue(/Agent REST API Catalog/);
    await expect(
      page.getByRole("textbox", { name: "Servers (JSON array)" }),
    ).toBeVisible();
    await expect(
      page.getByRole("combobox", { name: "Selected operation" }),
    ).toBeVisible();
    await expect(
      page.getByRole("textbox", { name: "Operation ID" }),
    ).toHaveValue("agentSyncCall");
    await expect(
      page.getByRole("textbox", { name: "Responses (YAML or JSON)" }),
    ).toHaveValue(/'200'/);
    await expect(
      page.getByRole("textbox", { name: "Request body (YAML or JSON)" }),
    ).toBeVisible();
    await expect(
      page.getByRole("heading", {
        name: "Schema previews and examples",
        level: 4,
      }),
    ).toBeVisible();
    await expect(
      page.getByRole("textbox", { name: "Editable request body example" }),
    ).toHaveValue(/payload/);
    await expect(
      page.getByRole("textbox", { name: "Editable response 200 example" }),
    ).toBeVisible();
    await page
      .getByRole("button", { name: "Delete operation", exact: true })
      .click();
    await expect(
      page.getByRole("heading", { name: "Operation dependency impact" }),
    ).toBeVisible();
    await expect(
      page.getByText("workflows/agent-call.sw.yaml", { exact: true }),
    ).toBeVisible();
    await page.getByRole("button", { name: "Keep operation" }).click();
    await expect(
      page.getByRole("combobox", { name: "Component type" }),
    ).toHaveValue("schemas");
    await expect(
      page.getByRole("combobox", { name: "Component type" }).locator("option"),
    ).toHaveCount(9);
    await expect(
      page.getByRole("combobox", { name: "Selected component" }),
    ).toBeVisible();
    await expect(
      page.getByRole("textbox", {
        name: "Component definition (YAML or JSON)",
      }),
    ).toBeVisible();
    await page.getByRole("tab", { name: "Details" }).click();
    await expect(
      page.getByRole("heading", { name: "Paths and operations" }),
    ).toBeVisible();
    await expect(
      page.getByRole("heading", { name: "Agent REST API Catalog", level: 2 }),
    ).toBeVisible();
    await expect(
      page.getByText("agentSyncCall", { exact: true }),
    ).toBeVisible();
    await page.getByText("agentSyncCall", { exact: true }).click();
    await expect(
      page.getByText("Referenced by", { exact: true }).first(),
    ).toBeVisible();
    await expect(
      page.getByRole("button", { name: "Agent Call", exact: true }),
    ).toBeVisible();

    await page.getByPlaceholder("Search documents").fill("boolean");
    await page
      .getByRole("option", { name: /boolean-decision\.sw\.yaml/ })
      .click();
    await page.getByRole("tab", { name: "Details" }).click();
    await expect(
      page.getByRole("heading", { name: "Subflow contract" }),
    ).toBeVisible();
    await expect(page.getByText("Inputs", { exact: true })).toBeVisible();
    await expect(page.getByText("Outputs", { exact: true })).toBeVisible();
    const subflowContract = page.locator(".subflow-contract");
    await expect(
      subflowContract.getByText("Errors", { exact: true }),
    ).toBeVisible();
    await expect(
      subflowContract.getByText("Timeouts", { exact: true }),
    ).toBeVisible();

    await page.goto("/studio/workflows/example");
    await expect(page).toHaveTitle("OpenWorkflow Studio");
    await expect(page.locator("#page-title")).toBeVisible();
    await expect(
      page.getByRole("option", { name: /agent-call\.sw\.yaml/ }),
    ).toBeVisible();

    await page.goto("/");
    await expect(page.locator("h1")).toHaveText("Agentic OpenWorkflow Console");
  });

  test("executes the bundled agent from the Studio without exposing credentials", async ({
    page,
  }) => {
    await page.goto("/studio/");
    await page.getByPlaceholder("Search documents").fill("agent-call");
    await page.getByRole("option", { name: /agent-call\.sw\.yaml/ }).click();
    await expect(
      page.getByRole("heading", { name: "Execution and debugging", level: 2 }),
    ).toBeVisible();
    await expect(
      page.getByText("never asks for, stores, or logs an API key", {
        exact: false,
      }),
    ).toBeVisible();
    await page
      .getByRole("combobox", { name: "Execution preset" })
      .selectOption("agent_sync");
    await page
      .getByRole("textbox", { name: "Agent task" })
      .fill("studio execution check");
    await page
      .getByRole("button", { name: "Execute request", exact: true })
      .click();
    await expect(page.locator(".execution-panel")).toContainText("completed", {
      timeout: 10_000,
    });
    await expect(page.locator(".execution-result")).toContainText(
      "mock-rest-agent",
    );
    await expect(page.locator(".execution-panel")).not.toContainText(
      "UTILITY_API_KEY",
    );
  });

  test("autosaves an opt-in valid draft after the configured idle period", async ({
    page,
  }) => {
    let currentDocument: Record<string, any> | null = null;
    const putBodies: string[] = [];

    await page.route(
      "**/api/studio/v1/documents/workflow/**",
      async (route) => {
        const request = route.request();
        if (request.method() === "GET") {
          const response = await route.fetch();
          const body = await response.json();
          currentDocument = body;
          await route.fulfill({ response, body: JSON.stringify(body) });
          return;
        }
        if (
          request.method() === "POST" &&
          request.url().endsWith("/validate")
        ) {
          await route.fulfill({
            status: 200,
            contentType: "application/json",
            body: JSON.stringify({
              valid: true,
              diagnostics: [],
              etag: currentDocument?.etag ?? '"e2e"',
              compatibility: "editable",
            }),
          });
          return;
        }
        if (request.method() === "PUT") {
          const requestBody = JSON.parse(request.postData() ?? "{}");
          putBodies.push(requestBody.content);
          currentDocument = {
            ...currentDocument,
            content: requestBody.content,
            sizeBytes: requestBody.content.length,
            etag: '"autosaved"',
            revisionNumber: (currentDocument?.revisionNumber ?? 0) + 1,
          };
          await route.fulfill({
            status: 200,
            contentType: "application/json",
            body: JSON.stringify(currentDocument),
          });
          return;
        }
        await route.continue();
      },
    );

    await page.goto("/studio/");
    await page.getByPlaceholder("Search documents").fill("boolean");
    await page
      .getByRole("option", { name: /boolean-decision\.sw\.yaml/ })
      .click();
    await page.getByRole("link", { name: "Settings" }).click();
    await page.getByRole("checkbox", { name: "Enable autosave" }).check();
    await page.getByLabel("Autosave after idle").selectOption("1000");
    await page.getByRole("button", { name: "Close settings" }).click();

    const sourceEditor = page.getByRole("textbox", {
      name: "Editable canonical source",
    });
    await sourceEditor.fill(
      `${await sourceEditor.inputValue()}\n# autosave e2e`,
    );
    await expect
      .poll(() => putBodies.length, { timeout: 8_000, intervals: [200] })
      .toBe(1);
    expect(putBodies[0]).toContain("# autosave e2e");
    await expect(page.getByText(/Autosaved .*boolean-decision/)).toBeVisible();
  });

  test("edits and navigates a version-aware subflow action", async ({
    page,
  }) => {
    await page.goto("/studio/");
    await page.getByPlaceholder("Search documents").fill("boolean");
    await page
      .getByRole("option", { name: /boolean-decision\.sw\.yaml/ })
      .click();
    await page.getByRole("tab", { name: "Source" }).click();
    const sourceEditor = page.getByRole("textbox", {
      name: "Editable canonical source",
    });
    const source = await sourceEditor.inputValue();
    const marker = "    transition: Evaluate Boolean Answer";
    expect(source).toContain(marker);
    await sourceEditor.fill(
      source.replace(
        marker,
        "      - name: Delegate decision\n" +
          "        subFlowRef: choice_decision\n" +
          "        version: '1.0'\n" +
          marker,
      ),
    );
    await page.getByRole("tab", { name: "Form" }).click();
    const stateAuthoring = page.getByLabel("State authoring");
    await stateAuthoring
      .getByRole("button", { name: /^Ask Boolean Question/ })
      .click();
    await expect(
      stateAuthoring.getByRole("heading", {
        name: "Subflow invocation",
        level: 4,
      }),
    ).toBeVisible();
    const target = stateAuthoring.getByRole("combobox", {
      name: "Target subflow",
    });
    await expect(
      target.locator("option", { hasText: "choice_decision" }),
    ).toHaveCount(1);
    await target.selectOption("boolean_decision");
    await stateAuthoring
      .getByRole("textbox", { name: "Subflow version" })
      .fill("2.0");
    await page.getByRole("tab", { name: "Source" }).click();
    await expect(sourceEditor).toHaveValue(/subFlowRef: 'boolean_decision'/);
    await expect(sourceEditor).toHaveValue(/version: '2.0'/);
    await page.getByRole("tab", { name: "Form" }).click();
    await stateAuthoring
      .getByRole("button", { name: /^Ask Boolean Question/ })
      .click();
    const contractPreview = stateAuthoring.locator(".subflow-contract-preview");
    await expect(
      contractPreview.getByText("Errors", { exact: true }),
    ).toBeVisible();
    await expect(
      contractPreview.getByText("Timeouts", { exact: true }),
    ).toBeVisible();
    page.once("dialog", (dialog) => dialog.accept());
    await stateAuthoring.getByRole("button", { name: "Open target" }).click();
    await expect(page).toHaveURL(/\/studio\/workflows\/workflow-[a-f0-9]{32}$/);
    await page.getByRole("tab", { name: "Details" }).click();
    await expect(
      page.getByRole("heading", { name: "Subflow contract" }),
    ).toBeVisible();
  });

  test("reviews a subflow extraction before writing either document", async ({
    page,
  }) => {
    let writes = 0;
    await page.route("**/api/studio/v1/documents", async (route) => {
      if (route.request().method() === "POST") writes += 1;
      await route.continue();
    });
    await page.route(
      "**/api/studio/v1/documents/workflow/**",
      async (route) => {
        if (["POST", "PUT", "DELETE"].includes(route.request().method()))
          writes += 1;
        await route.continue();
      },
    );

    await page.goto("/studio/");
    await page.getByPlaceholder("Search documents").fill("boolean");
    await page
      .getByRole("option", { name: /boolean-decision\.sw\.yaml/ })
      .click();
    await page.getByRole("tab", { name: "Source" }).click();
    await page.getByRole("textbox", { name: "Editable canonical source" }).fill(
      `start: First
version: '1.0'
specVersion: '0.8'
states:
  - name: First
    type: inject
    transition: Second
  - name: Second
    type: inject
    end: true
`,
    );
    await page.getByRole("tab", { name: "Graph" }).click();
    await page.locator('.graph-node[aria-label="First, inject state"]').click();
    let prompt = 0;
    page.on("dialog", (dialog) => {
      void dialog.accept(
        prompt++ === 0 ? "Reviewed extraction" : "reviewed-extraction",
      );
    });
    await page.getByRole("button", { name: "Extract selected range" }).click();

    await expect(
      page.getByRole("heading", { name: "Review extracted subflow" }),
    ).toBeVisible();
    await expect(
      page.getByText(/Caller · workflows\/sub_flows\/boolean-decision/),
    ).toBeVisible();
    await expect(
      page.getByText(/New subflow · sub_flows\/reviewed-extraction/),
    ).toBeVisible();
    await expect(
      page.getByText("Dependency report", { exact: true }),
    ).toBeVisible();
    expect(writes).toBe(0);

    await page.getByRole("button", { name: "Cancel extraction" }).click();
    await expect(
      page.getByRole("heading", { name: "Review extracted subflow" }),
    ).not.toBeVisible();
    expect(writes).toBe(0);
  });

  test("reviews dependency impact before deleting a referenced catalog", async ({
    page,
  }) => {
    await page.goto("/studio/");
    await page.getByPlaceholder("Search documents").fill("agent-rest");
    await page.getByRole("option", { name: /agent-rest\.yaml/ }).click();
    page.once("dialog", (dialog) => dialog.accept());
    await page.getByRole("button", { name: "Delete", exact: true }).click();
    await expect(
      page.getByRole("heading", {
        name: /Delete workflows\/catalogs\/agent-rest\.yaml\?/,
      }),
    ).toBeVisible();
    await expect(
      page.getByText("workflows/agent-call.sw.yaml", { exact: true }),
    ).toBeVisible();
    await page.getByRole("button", { name: "Keep document" }).click();
    await expect(
      page.getByRole("heading", {
        name: /Delete workflows\/catalogs\/agent-rest\.yaml\?/,
      }),
    ).not.toBeVisible();
  });

  test("executes the bundled mock agent synchronously", async ({ request }) => {
    const response = await request.post("/agent/sync", {
      data: { payload: { task: "25 * 4" } },
    });
    expect(response.status()).toBe(200);
    const body = await response.json();
    expect(body.agent).toBe("mock-rest-agent");
    expect(body.output).toContain("25 * 4");
  });

  test("rejects an invalid async agent request contract", async ({
    request,
  }) => {
    const response = await request.post("/agent/async", {
      data: { payload: { task: "x" } }, // missing callback_url / workflow_instance_id
    });
    expect(response.status()).toBe(400);
  });

  test("agent_call workflow completes in sync mode", async ({ request }) => {
    const response = await request.post("/agent_call", {
      data: {
        mode: "sync",
        agent_request: { task: "e2e sync check" },
      },
    });
    expect(response.status()).toBe(201);
    const body = await response.json();
    expect(body.workflowdata.agent_response.agent).toBe("mock-rest-agent");
    expect(body.workflowdata.agent_response.output).toContain("e2e sync check");
  });

  test("agent_call workflow accepts an async request and suspends", async ({
    request,
  }) => {
    // The start call returns while the instance is suspended in the callback state; then
    // poll until the mock agent's authenticated CloudEvent resumes and completes it.
    const response = await request.post("/agent_call", {
      data: {
        mode: "async",
        agent_request: { task: "e2e async check" },
        callback_url: "http://localhost:8080/agent/response-event",
      },
    });
    expect(response.status()).toBe(201);
    const body = await response.json();
    expect(body.id).toBeTruthy();
    // While suspended the response either carries agent_response: null or omits the key.
    expect(body.workflowdata.agent_response ?? null).toBeNull();

    await expect
      .poll(
        async () => {
          const completed = await request.get(`/agent_call/${body.id}`);
          if (completed.status() === 404 || completed.status() === 410)
            return "evicted";
          if (completed.status() !== 200) return `http-${completed.status()}`;
          const completedBody = await completed.json();
          return (
            completedBody.workflowdata?.agent_response?.agent || "suspended"
          );
        },
        { timeout: 30_000, intervals: [500] },
      )
      .toMatch(/^(evicted|mock-rest-agent)$/);
  });

  test("agent_call workflow rejects an invalid mode", async ({ request }) => {
    const response = await request.post("/agent_call", {
      data: {
        mode: "queued",
        agent_request: { task: "x" },
      },
    });
    expect(response.status()).toBe(201);
    const body = await response.json();
    expect(body.workflowdata.error).toContain("mode");
  });
});
