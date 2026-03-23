# Playwright Element Repository

[![NPM Version](https://img.shields.io/npm/v/@civitas-cerebrum/element-repository?color=rgb(88%2C%20171%2C%2070))](https://www.npmjs.com/package/@civitas-cerebrum/element-repository)

A lightweight, robust package that decouples your Playwright UI selectors from your test code. By externalizing locators into a central JSON repository, you make your test automation framework cleaner, easier to maintain, and accessible to non-developers.

## 📦 Installation

Install the package via your preferred package manager:

```bash
npm i @civitas-cerebrum/element-repository
```

**Peer Dependencies:**
This package requires `@playwright/test` or `playwright` to be installed in your project.

## 🚀 What is it good for?

* **Zero Hardcoded Selectors:** Keep your Page Objects and Step Definitions completely free of complex DOM queries.
* **Dynamic Parsing:** Automatically converts your JSON configuration into native Playwright CSS, XPath, ID, Text, Test ID, Role, Placeholder, or Label selectors.
* **Smart Locators:** Built-in methods for handling arrays, randomized element selection (great for catalog/PLP testing), text-filtering, attribute-filtering, and visibility checks.
* **Soft Waiting:** Seamlessly waits for elements to attach and become visible before returning a locator to prevent flake.

## 🏗️ Configuration

Create a JSON file in your project to hold your selectors. The file must adhere to the standard schema:

**`locators.json`**

```json
{
  "pages": [
    {
      "name": "HomePage",
      "elements": [
        {
          "elementName": "search-input",
          "selector": { "css": "input[name='search']" }
        },
        {
          "elementName": "submit-button",
          "selector": { "id": "btn-submit" }
        },
        {
          "elementName": "login-button",
          "selector": { "testid": "login-btn" }
        },
        {
          "elementName": "nav-links",
          "selector": { "role": "link" }
        },
        {
          "elementName": "search-field",
          "selector": { "placeholder": "Search..." }
        },
        {
          "elementName": "close-button",
          "selector": { "label": "Close" }
        }
      ]
    },
    {
      "name": "ProductList",
      "elements": [
        {
          "elementName": "product-cards",
          "selector": { "xpath": "//article[@class='product']" }
        }
      ]
    }
  ]
}

```

### Supported Selector Keys

| Key | Resolves To | Example |
|-----|-------------|---------|
| `css` | `css=<value>` | `"css": "button.primary"` |
| `xpath` | `xpath=<value>` | `"xpath": "//button[@id='submit']"` |
| `id` | `#<value>` | `"id": "btn-submit"` |
| `text` | `text=<value>` | `"text": "Submit"` |
| `testid` | `[data-testid='<value>']` | `"testid": "login-btn"` |
| `role` | `[role='<value>']` | `"role": "button"` |
| `placeholder` | `[placeholder='<value>']` | `"placeholder": "Search..."` |
| `label` | `[aria-label='<value>']` | `"label": "Close"` |

> **Note:** The `testid` key uses the standard `data-testid` attribute.

## 💻 Usage

You can initialize the `ElementRepository` either by passing the **file path** to your JSON, or by passing the **parsed JSON object** directly.

### Initialization

```typescript
import { test } from '@playwright/test';
import { ElementRepository } from '@civitas-cerebrum/element-repository';

// Option A: Pass the path to your JSON (relative to your project root)
const repo = new ElementRepository('tests/data/locators.json', 15000);

// Option B: Import the JSON directly (requires resolveJsonModule in tsconfig)
import locatorData from '../data/locators.json';
const repo = new ElementRepository(locatorData, 15000);

```

### Retrieving Elements

The repository exposes clean, asynchronous methods that return Playwright `Locator` objects, ready for interaction.

```typescript
test('Search and select random product', async ({ page }) => {
  await page.goto('/');

  // 1. Get a standard element
  const searchInput = await repo.get(page, 'HomePage', 'search-input');
  await searchInput.fill('Trousers');

  const submitBtn = await repo.get(page, 'HomePage', 'submit-button');
  await submitBtn.click();

  // 2. Select a random element from a list
  const randomProduct = await repo.getRandom(page, 'ProductList', 'product-cards');
  await randomProduct?.click();

  // 3. Find a specific element by text within a list
  const specificProduct = await repo.getByText(page, 'ProductList', 'product-cards', 'Blue Chinos');
  await specificProduct?.click();

  // 4. Find an element by HTML attribute
  const activeCard = await repo.getByAttribute(page, 'ProductList', 'product-cards', 'data-status', 'active');
  await activeCard?.click();

  // 5. Get a specific element by index
  const thirdProduct = await repo.getByIndex(page, 'ProductList', 'product-cards', 2);
  await thirdProduct?.click();

  // 6. Get the first visible element (filters out hidden duplicates)
  const visibleModal = await repo.getVisible(page, 'HomePage', 'modal');
  await visibleModal?.click();

  // 7. Filter elements by ARIA role
  const navLink = await repo.getByRole(page, 'HomePage', 'nav-links', 'link');
  await navLink?.click();
});

```

## 🛠️ API Reference

### `get(page, pageName, elementName)`

Returns a single Playwright Locator. Waits for the selector to attach to the DOM based on your configured timeout.

### `getAll(page, pageName, elementName)`

Returns an array of resolved Locator handles (`Locator[]`). Useful when you need to iterate over multiple elements.

### `getRandom(page, pageName, elementName, strict?)`

Counts the matching elements and randomly selects one. Safely waits for the specific randomized element to become visible.

### `getByText(page, pageName, elementName, desiredText, strict?)`

Returns the first Locator matching the mapped selector that also contains the `desiredText`.

### `getByAttribute(page, pageName, elementName, attribute, value, options?)`

Returns the first Locator whose HTML attribute matches the given value. Iterates through all matching elements and checks the specified attribute.

**Options:**
- `exact` (boolean, default: `true`) — If `true`, requires an exact attribute match. If `false`, matches when the attribute contains the value.
- `strict` (boolean, default: `false`) — If `true`, throws an error when no matching element is found.

```typescript
// Exact match (default)
const active = await repo.getByAttribute(page, 'Dashboard', 'cards', 'data-status', 'active');

// Partial (contains) match
const dashLink = await repo.getByAttribute(page, 'Nav', 'links', 'href', '/dashboard', { exact: false });
```

### `getByIndex(page, pageName, elementName, index, strict?)`

Returns the Locator at the specified zero-based index from the list of matching elements. Returns `null` (or throws in strict mode) if the index is out of bounds.

```typescript
const thirdCard = await repo.getByIndex(page, 'ProductList', 'product-cards', 2);
```

### `getVisible(page, pageName, elementName, strict?)`

Returns the first visible element matching the selector. Unlike `get()`, which returns the locator after a basic wait, this method explicitly filters to only visible elements — useful when hidden duplicates exist in the DOM.

```typescript
const visibleModal = await repo.getVisible(page, 'Dashboard', 'modal');
```

### `getByRole(page, pageName, elementName, role, strict?)`

Filters elements by their explicit `role` HTML attribute and returns the first match.

```typescript
const navButton = await repo.getByRole(page, 'Header', 'navItems', 'button');
```

### `getSelector(pageName, elementName)`

Returns the raw string selector mapped to the given element (e.g., `"css=input[name='search']"` or `"xpath=//div"`). This is a synchronous method primarily useful for debugging, custom logging, or passing raw selector strings directly into native Playwright APIs that require strings instead of Locator objects.

### `setDefaultTimeout(timeout)`

Updates the default timeout (in milliseconds) for all subsequent element retrievals.
