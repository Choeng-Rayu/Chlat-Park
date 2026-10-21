/**
 * A UUID check.
 *
 * The API's identifiers are UUIDs (`@chlat/contracts`'s `UuidSchema`). A
 * malformed id is rejected in the browser before the request is made: there
 * is no point asking the API about an id that cannot exist, and the answer
 * would be a 404 that tells the user nothing.
 */

/** Is the given string a UUID (any version)? */
export function isUuid(value: string): boolean {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(value);
}
