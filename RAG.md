# pw-element-repository — AI Reference
**Purpose:** A JSON-based locator repository for Playwright. It externalizes selectors (CSS, XPath, ID, Text) from test code, allowing tests to reference elements by pageName and elementName strings.
## JSON Schema
```json
{
  "pages": [
    {
      "name": "StringPageName",
      "elements": [
        {
          "elementName": "StringElementName",
          "selector": {
            "css": "selector",
            "xpath": "selector",
            "id": "id",
            "text": "text"
          }
        }
      ]
    }
  ]
}
```

## Usage Example:

```ts

await test.step('✅ Open Forms Page and verify navigation', async () => {
  const repo = new ElementRepository("tests/data/page-repository.json");
  const formsCategory = await repo.getByText(page, 'HomePage', 'categories', 'Forms');
  await formsCategory?.click();
  await steps.verifyAbsence('HomePage', 'categories');
});
```

## Setup
```ts
// Constructor: (pathOrData: string | object, timeout?: number)
const repo = new ElementRepository('path/to/locators.json', 15000);
```

## API (all async, return Playwright `Locator` unless noted)
- `get(page, pageName, elementName)` — single `Locator`, waits for DOM attachment
- `getAll(page, pageName, elementName)` — `Locator[]` for iteration
- `getRandom(page, pageName, elementName, strict?)` — random `Locator`, waits for visibility
- `getByText(page, pageName, elementName, desiredText, strict?)` — first `Locator` containing `desiredText`
- `getSelector(pageName, elementName)` — **sync**, returns raw selector string (e.g. `css=.btn`)

