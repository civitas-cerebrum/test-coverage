import * as fs from 'fs';
import * as path from 'path';

import { PageRepository } from './schema/repository';
import { Page } from './schema/page';
import { pickRandomIndex } from './utils/math';

export class ElementRepository {
  private pageData: PageRepository;
  private defaultTimeout: number;

  /**
   * Initializes the repository with a path to a JSON file.
   * @param filePath Path to the JSON file (relative to the project root).
   * @param defaultTimeout Default wait timeout in milliseconds (defaults to 15000).
   */
  constructor(filePath: string, defaultTimeout?: number);

  /**
   * Initializes the repository with pre-parsed JSON data.
   * @param data The parsed JSON object matching the PageObjectSchema.
   * @param defaultTimeout Default wait timeout in milliseconds (defaults to 15000).
   */
  constructor(data: PageRepository, defaultTimeout?: number);

  constructor(dataOrPath: string | PageRepository, defaultTimeout: number = 15000) {
    if (typeof dataOrPath === 'string') {
      const absolutePath = path.resolve(process.cwd(), dataOrPath);
      const rawData = fs.readFileSync(absolutePath, 'utf-8');
      this.pageData = JSON.parse(rawData);
    } else {
      this.pageData = dataOrPath;
    }

    this.defaultTimeout = defaultTimeout;
  }

  /**
   * Updates the default timeout for all subsequent element retrievals.
   * @param timeout The new timeout in milliseconds.
   */
  public setDefaultTimeout(timeout: number): void {
    this.defaultTimeout = timeout;
  }

  /**
   * Retrieves a single Playwright Locator based on the externalized JSON mapping.
   * @param page The Playwright Page instance.
   * @param pageName The name of the page block in the JSON repository.
   * @param elementName The specific element name to look up.
   * @returns A promise that resolves to a dynamically typed Playwright Locator.
   */
  public async get<P extends Page>(page: P, pageName: string, elementName: string): Promise<ReturnType<P['locator']>> {
    const selector = this.getSelector(pageName, elementName);
    await page.waitForSelector(selector, { timeout: this.defaultTimeout }).catch(() => { });
    return page.locator(selector);
  }

  /**
   * Retrieves an array of Playwright Locators matching the mapped selector.
   * @param page The Playwright Page instance.
   * @param pageName The name of the page block in the JSON repository.
   * @param elementName The specific element name to look up.
   * @returns A promise that resolves to an array of dynamically typed Playwright Locators.
   */
  public async getAll<P extends Page>(page: P, pageName: string, elementName: string): Promise<ReturnType<P['locator']>[]> {
    const locator = await this.get(page, pageName, elementName);
    return locator.all();
  }

  /**
   * Randomly selects one element from a list of locators matching the given selector.
   * Automatically waits for the randomly selected element to be attached and visible.
   * @param page The Playwright Page instance.
   * @param pageName The name of the page block in the JSON repository.
   * @param elementName The specific element name to look up.
   * @param strict If true, throws an error if no elements are found. Defaults to false.
   * @returns A promise that resolves to a randomly selected Playwright Locator, or null if none are found.
   */
  public async getRandom<P extends Page>(page: P, pageName: string, elementName: string, strict: boolean = false): Promise<ReturnType<P['locator']> | null> {
    const baseLocator = await this.get(page, pageName, elementName);
    const count = await baseLocator.count();

    if (count === 0) {
      const msg = `No elements found for '${elementName}' on '${pageName}'`;
      if (strict) throw new Error(msg);
      console.warn(msg);
      return null;
    }

    const index = pickRandomIndex(count);
    const randomElement = baseLocator.nth(index);

    await Promise.all([
      randomElement.waitFor({ state: 'attached', timeout: this.defaultTimeout }),
      randomElement.waitFor({ state: 'visible', timeout: this.defaultTimeout })
    ]);

    return randomElement;
  }

  /**
   * Filters a locator list and returns the first element that contains the specified text.
   * @param page The Playwright Page instance.
   * @param pageName The name of the page block in the JSON repository.
   * @param elementName The specific element name to look up.
   * @param desiredText The string of text to search for within the elements.
   * @param strict If true, throws an error if the element is not found. Defaults to false.
   * @returns A promise that resolves to the matched Playwright Locator, or null if not found.
   */
  public async getByText<P extends Page>(page: P, pageName: string, elementName: string, desiredText: string, strict: boolean = false): Promise<ReturnType<P['locator']> | null> {
    const baseLocator = await this.get(page, pageName, elementName);
    const locator = baseLocator.filter({ hasText: desiredText }).first();

    if ((await locator.count()) === 0) {
      const msg = `Element '${elementName}' on '${pageName}' with text "${desiredText}" not found.`;
      if (strict) throw new Error(msg);
      console.warn(msg);
      return null;
    }

    return locator;
  }

  /**
   * Filters elements by a specific HTML attribute value.
   * Iterates through all matching elements and returns the first one whose attribute matches.
   * @param page The Playwright Page instance.
   * @param pageName The name of the page block in the JSON repository.
   * @param elementName The specific element name to look up.
   * @param attribute The HTML attribute name to filter by (e.g., 'data-status', 'href').
   * @param value The attribute value to match against.
   * @param options Optional configuration.
   * @param options.exact If true (default), requires an exact attribute match. If false, matches when the attribute contains the value.
   * @param options.strict If true, throws an error when no matching element is found. Defaults to false.
   * @returns A promise that resolves to the matched Playwright Locator, or null if not found.
   *
   * @example
   * // Exact match (default)
   * const activeItem = await repo.getByAttribute(page, 'Dashboard', 'statusCards', 'data-status', 'active');
   *
   * @example
   * // Partial (contains) match
   * const item = await repo.getByAttribute(page, 'Dashboard', 'links', 'href', '/dashboard', { exact: false });
   */
  public async getByAttribute<P extends Page>(
    page: P,
    pageName: string,
    elementName: string,
    attribute: string,
    value: string,
    options: { exact?: boolean; strict?: boolean } = {}
  ): Promise<ReturnType<P['locator']> | null> {
    const { exact = true, strict = false } = options;
    const allElements = await this.getAll(page, pageName, elementName);

    for (const element of allElements) {
      const attrValue = await element.getAttribute(attribute);
      if (attrValue === null) continue;

      const matches = exact ? attrValue === value : attrValue.includes(value);
      if (matches) return element;
    }

    const matchType = exact ? 'equal to' : 'containing';
    const msg = `Element '${elementName}' on '${pageName}' with attribute [${attribute}] ${matchType} "${value}" not found.`;
    if (strict) throw new Error(msg);
    console.warn(msg);
    return null;
  }

  /**
   * Returns the nth matching element from a list of locators.
   * @param page The Playwright Page instance.
   * @param pageName The name of the page block in the JSON repository.
   * @param elementName The specific element name to look up.
   * @param index The zero-based index of the element to retrieve.
   * @param strict If true, throws an error if the index is out of bounds. Defaults to false.
   * @returns A promise that resolves to the Playwright Locator at the given index, or null if out of bounds.
   *
   * @example
   * const thirdCard = await repo.getByIndex(page, 'ProductList', 'product-cards', 2);
   * await thirdCard?.click();
   */
  public async getByIndex<P extends Page>(
    page: P,
    pageName: string,
    elementName: string,
    index: number,
    strict: boolean = false
  ): Promise<ReturnType<P['locator']> | null> {
    const baseLocator = await this.get(page, pageName, elementName);
    const count = await baseLocator.count();

    if (index < 0 || index >= count) {
      const msg = `Index ${index} out of bounds for '${elementName}' on '${pageName}' (found ${count} elements).`;
      if (strict) throw new Error(msg);
      console.warn(msg);
      return null;
    }

    return baseLocator.nth(index);
  }

  /**
   * Returns the first visible element matching the selector.
   * Unlike `get()`, which returns the locator after a basic wait, this method
   * explicitly filters to only visible elements and waits for visibility.
   * @param page The Playwright Page instance.
   * @param pageName The name of the page block in the JSON repository.
   * @param elementName The specific element name to look up.
   * @param strict If true, throws an error if no visible element is found. Defaults to false.
   * @returns A promise that resolves to a visible Playwright Locator, or null if none are visible.
   *
   * @example
   * const visibleModal = await repo.getVisible(page, 'Dashboard', 'modal');
   * await visibleModal?.click();
   */
  public async getVisible<P extends Page>(
    page: P,
    pageName: string,
    elementName: string,
    strict: boolean = false
  ): Promise<ReturnType<P['locator']> | null> {
    const baseLocator = await this.get(page, pageName, elementName);
    const allElements = await baseLocator.all();

    for (const element of allElements) {
      if (await element.isVisible()) return element;
    }

    const msg = `No visible elements found for '${elementName}' on '${pageName}'.`;
    if (strict) throw new Error(msg);
    console.warn(msg);
    return null;
  }

  /**
   * Filters elements by their ARIA role attribute and returns the first match.
   * This checks the explicit `role` HTML attribute on elements.
   * @param page The Playwright Page instance.
   * @param pageName The name of the page block in the JSON repository.
   * @param elementName The specific element name to look up.
   * @param role The ARIA role value to filter by (e.g., 'button', 'link', 'tab').
   * @param strict If true, throws an error if no matching element is found. Defaults to false.
   * @returns A promise that resolves to the matched Playwright Locator, or null if not found.
   *
   * @example
   * const navLink = await repo.getByRole(page, 'Header', 'navItems', 'link');
   * await navLink?.click();
   */
  public async getByRole<P extends Page>(
    page: P,
    pageName: string,
    elementName: string,
    role: string,
    strict: boolean = false
  ): Promise<ReturnType<P['locator']> | null> {
    return this.getByAttribute(page, pageName, elementName, 'role', role, { exact: true, strict });
  }

  /**
   * Parses the JSON schema and returns a Playwright-friendly selector string.
   *
   * Supported selector keys:
   * - `css` — CSS selector (e.g., `"css": "button.primary"`)
   * - `xpath` — XPath expression (e.g., `"xpath": "//button[@id='submit']"`)
   * - `id` — Element ID, converted to CSS `#id` selector
   * - `text` — Text content selector
   * - `testid` / `testId` — Test ID attribute selector (configurable via constructor, defaults to `data-testid`)
   * - `role` — ARIA role attribute selector (e.g., `"role": "button"`)
   * - `placeholder` — Placeholder attribute selector
   * - `label` — `aria-label` attribute selector
   *
   * @param pageName The name of the page block in the JSON repository.
   * @param elementName The specific element name to look up.
   * @returns The raw string selector formatted for Playwright (e.g., 'css=...', 'xpath=...').
   * @throws Error if the page, element, or selector is not found.
   */
  public getSelector(pageName: string, elementName: string): string {
    const page = this.pageData.pages.find((p) => p.name === pageName);
    if (!page) throw new Error(`ElementRepository: Page '${pageName}' not found.`);

    const element = page.elements.find((e) => e.elementName === elementName);
    if (!element) throw new Error(`ElementRepository: Element '${elementName}' not found on page '${pageName}'.`);

    const selector = element.selector;
    if (!selector || Object.keys(selector).length === 0) {
      throw new Error(`ElementRepository: Invalid selector for '${elementName}'.`);
    }

    const key = Object.keys(selector)[0] as string;
    const value = selector[key] as string;

    switch (key.toLowerCase()) {
      case 'xpath': return `xpath=${value}`;
      case 'text': return `text=${value}`;
      case 'id': return `#${value}`;
      case 'css': return `css=${value}`;
      case 'testid': return `[data-testid='${value}']`;
      case 'role': return `[role='${value}']`;
      case 'placeholder': return `[placeholder='${value}']`;
      case 'label': return `[aria-label='${value}']`;
      default: return value;
    }
  }
}
