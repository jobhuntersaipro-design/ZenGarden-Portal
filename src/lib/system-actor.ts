/**
 * "System" is not a person. An automated lifecycle event — the confirm-time
 * row every purchase order opens with — is attributed to it rather than to
 * whoever happened to be signed in.
 *
 * Here rather than in `components/ui/person`, so the pure lifecycle sentences
 * (`po-activity.ts`) can name it without importing a component.
 */
export const SYSTEM_ACTOR = "System";
