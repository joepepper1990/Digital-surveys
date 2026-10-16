# ESG 1-to-1 1.3.0.2 — Flow 7 activation repair

Use `ESGOneToOne_1_3_0_2_unmanaged.zip` in place of 1.3.0.1. It retains the earlier Daily Scheduler secureData fix and changes only Flow 7 plus SolutionManifest/Version.

## Reported failure and diagnosis limits

Power Automate rejected Flow 7 on activation with `WorkflowOperationParametersExtraParameter` for `item/ChallengeTechAgreedOn`. The user reports that the corresponding column is visible. That does not establish the target field's internal name, editability or connector metadata state. The package's bundled schema does define the field on Manager Reviews. No live EDF schema, connection, import or activation has been inspected or changed by this repair.

The failure is a generated SharePoint Update item parameter-schema rejection. Removing the field write would lose agreement behavior. This package instead uses the existing standard SharePoint connector's HttpRequest action for the three affected writes, avoiding those generated item parameters.

## Changes

- `Open_on_review`, `Update_review`, `Clear_review_agreement`: changed SharePoint `PatchItem` to SharePoint `HttpRequest`, POST with `X-HTTP-Method: MERGE`, `IF-MATCH: *` and `application/json;odata=nometadata` headers.
- Resolve the target Manager Reviews list by the existing `Ids.mgrList` GUID and keep the same `Mr.ID` item.
- Add one masked Compose payload before each write. Preserve every original field value/expression, including Title, challenge sections/state/IDs/dates and true JSON nulls. Flatten the connector-specific `ChallengeState/Value` wrapper to SharePoint REST `ChallengeState`.
- Serialize the payload as JSON via `@{string(outputs(...))}` to preserve quotes/newlines safely. Keep existing HTTP-action masking and move each original dependency to its payload action.
- Keep every permission step and all seven other flows byte-identical to 1.3.0.1. Keep all component IDs, environment variables and connection references unchanged.
- Increment unmanaged solution version to 1.3.0.2. Only solution.xml and the Challenge workflow member change; three Compose actions are added.

## No premium connector introduced

All connector references are unchanged:

| Connector | Classification |
|---|---|
| SharePoint (`shared_sharepointonline`) | Standard |
| Office 365 Outlook (`shared_office365`) | Standard |
| Office 365 Users (`shared_office365users`) | Standard |

“Send an HTTP request to SharePoint” is an action of the SharePoint connector. This package does not introduce the generic premium HTTP connector, HTTP with Microsoft Entra ID, a custom connector or a Dataverse flow action. The solution container's existing environment requirements are unchanged. Target tenant permissions and policies still apply.

## Verification

- The new regression checks failed against the old package's three PatchItem actions before repair.
- **14 focused checks pass against the actual 1.3.0.2 ZIP**, covering the three writes, original payload/dependency/masking preservation, absence of new connectors, all eight flows, archive membership/version and no unrelated Flow 7 changes.
- The prior 25 regression checks still pass against retained 1.3.0.1. These are compatibility checks of the earlier deliverable, not additional 1.3.0.2 test counts.
- **220/220 existing workflow simulation checks pass with all workflow definitions loaded from the actual 1.3.0.2 ZIP**, rather than regenerated definitions. Includes challenge opening, rejection, agreement, reopening, permission changes and timeout handling. The simulated connectors do not validate EDF's live API metadata or licensing.
- **25/25 existing validator mutation checks pass**, also using the actual 1.3.0.2 definitions as their baseline.
- Offline audit passes across all eight workflows: 501 actions, 1,184 expression occurrences and unchanged connection/environment bindings. This remains a static preflight rather than the Power Automate compiler.
- ZIP CRC/member integrity passes. PAC 2.11.2 solution unpack and pack pass; its round-trip archive retains all components and semantically identical workflow definitions. PAC retains the existing two warnings about separately sharded environment-variable definitions; both files remain present.

SHA-256: `6cda67d2453011ca25413d670d6d20c98dde2c8747bbe74e6c9b60ac19bb6a9e`

## Deployment and remaining checks

Pause operational flows during a controlled import; leave automatic activation unchecked. Bind the existing standard connections and retain the existing site/email values. Retry Flow 7 activation after import, and leave Daily Scheduler until last. Do not rerun Setup solely to refresh connector metadata when the required list/fields already exist; run Setup only when provisioning is actually incomplete, noting that it also reapplies list settings/permissions.

The REST writes still require the real Manager Reviews fields to have the expected internal names and be writable, with adequate SharePoint connection permissions. If the error moves from activation to a runtime REST error, inspect that response and the actual list field metadata. No target-field data has been inspected here. Verify masking, challenge agreement/reopen behavior and item access isolation in an approved test environment before production use.

Live EDF import, activation and runtime behavior remain **unverified**. Nothing has been changed in a live EDF environment. The generated source files and original build scripts on the branch are not regenerated by this package-only repair; rebuilding from those older sources will not reproduce these two repairs. The corrected ZIP is the deployment artifact.
