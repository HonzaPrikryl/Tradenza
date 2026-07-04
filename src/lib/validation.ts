import { z } from 'zod'

// Shared input-validation primitives for server actions.
//
// Server actions are a public HTTP surface: anything callable from the client
// can be invoked with arbitrary arguments, so identifiers and scalars that flow
// into SQL must be validated at the boundary. These schemas give every action a
// single, consistent guard rail — an invalid id throws a clean ZodError instead
// of surfacing as a Postgres uuid-cast error (or, worse, a silent no-op).

/** A v4-style UUID, matching the `uuid` primary keys used across the schema. */
export const uuid = z.string().uuid()

/** A list of UUIDs (e.g. bulk selections, reorder payloads). */
export const uuidArray = z.array(uuid)

/** A calendar day key in `YYYY-MM-DD` form (timezone-agnostic). */
export const dateKey = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Invalid date')

/** A four-digit calendar year. */
export const year = z.coerce.number().int().min(1970).max(9999)

/** A calendar month, 1–12. */
export const month = z.coerce.number().int().min(1).max(12)

/** Parse and return a single UUID, throwing on invalid input. */
export const parseUuid = (value: unknown): string => uuid.parse(value)

/** Parse and return a UUID list, throwing on invalid input. */
export const parseUuids = (value: unknown): string[] => uuidArray.parse(value)
