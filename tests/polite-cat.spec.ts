import { test, expect, Page, Request } from "@playwright/test";

async function listenForRequests(
  page: Page,
  endpoint: string,
  expectations: Array<{
    method: string;
    validate: (
      request: Request,
      done: (
        /** You can pass a name to distinguish which test is passed or not */
        name?: string
      ) => void
    ) => void;
  }>
) {
  // Array to store all captured requests matching the endpoint
  const capturedRequests: Array<Request> = [];

  // Create an array of promises, one for each expectation
  const requestPromises: Array<Promise<void>> = Array.from({
    length: expectations.length,
  }).map(() => new Promise<void>(() => {}));

  // Store the resolve functions to manually resolve each promise
  const resolvers: Array<() => void> = [];

  // Initialize each promise and resolver
  requestPromises.forEach((_, index) => {
    requestPromises[index] = new Promise<void>((resolve) => {
      resolvers[index] = resolve;
    });
  });

  // Capture all requests that match the given endpoint
  page.on("request", (request) => {
    const url = new URL(request.url());

    // Check if the request is for the correct endpoint
    if (!url.toString().includes(endpoint)) return;

    capturedRequests.push(request); // Store matching requests in the array
  });

  // Check all expectations against captured requests
  page.on("requestfinished", (request) => {
    const url = new URL(request.url());
    // Check if the request is for the correct endpoint
    if (!url.toString().includes(endpoint)) return;

    expectations.forEach((expectation, index) => {
      if (!resolvers[index]) return; // Skip if already resolved

      // Find a matching request in the captured requests array
      const matchingRequestIndex = capturedRequests.findIndex(
        (request) => request.method() === expectation.method
      );

      capturedRequests.forEach((request, i) => {
        if (request.method() !== expectation.method) return;

        expectation.validate(
          capturedRequests[matchingRequestIndex],
          (name = "") => {
            // Manually resolve the corresponding promise
            resolvers[index]();
            name && console.log(`${name} expectation meets!`);
            capturedRequests.splice(i, 1);
          }
        );
      });
    });
  });

  // Return a promise that resolves when all expectations are fulfilled
  return Promise.all(requestPromises);
}

test("test", async ({ page }) => {
  // Define the expectations for GET and POST requests
  const expectations: Parameters<typeof listenForRequests>["2"] = [
    {
      method: "GET",
      validate: (request: Request, done) => {
        const url = new URL(request.url());
        const params = url.searchParams;

        if (params.get("t") === "pageview") {
          done("home pageview");
        }
      },
    },
    {
      method: "POST",
      validate: (request: Request, done) => {
        const params = new URLSearchParams(request.postData() ?? "");

        if (params.get("t") === "pageview") {
          done("search pageview");
        }
      },
    },
    {
      method: "GET",
      validate: (request: Request, done) => {
        const url = new URL(request.url());
        const params = url.searchParams;

        if (params.get("el") === JSON.stringify({ search_string: "toy" })) {
          done("search string");
        }
      },
    },
  ];

  // Call the helper function to start listening for requests with expectations
  const requestPromise = listenForRequests(
    page,
    "https://staging.omnicloud.tech/collect",
    expectations
  );

  // Trigger the necessary actions on the page to fire the requests
  await page.goto("https://quickstart-5bd70c0b.myshopify.com/password");
  await page.getByLabel("Enter store password").click();
  await page.getByLabel("Enter store password").fill("omni1234");
  await page.getByRole("button", { name: "Enter" }).click();
  await page.getByRole("button", { name: "Search" }).click();
  await page.getByPlaceholder("Search").click();
  await page.getByPlaceholder("Search").fill("toy");
  await page
    .getByRole("search")
    .getByRole("button", { name: "Search", exact: true })
    .click();

  // Wait for all the request expectations to be met
  await requestPromise;
});
