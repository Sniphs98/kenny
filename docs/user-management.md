# User management and project access

Kenny separates authentication from project permissions. Email/password and Microsoft Entra ID accounts use the same roles and memberships.

## Instance administrators

Open **Users** in the user menu to search accounts, change instance roles, and deactivate or reactivate users. Choose **Projects** in a user’s row to review their project memberships, assign a project from the searchable list, change project roles, or remove a membership. This central view and its API require instance administrator access; project administrators continue to manage their own project through **Members**. Disabled accounts retain their memberships but cannot receive new assignments. Instance administrators retain access to all projects regardless of their explicit memberships. Only instance administrators can use this page and the administration API.

Instance administrators can manage every project without a membership. Regular users can create projects and become their project administrator; access to other projects requires a membership.

Deactivation revokes all sessions and deletes personal API tokens. It prevents new sessions, including Microsoft sign-in, while preserving tickets, accounts, and assignments. Reactivation allows sign-in again but never restores revoked tokens. Permissions and account status are checked against the database on every authenticated request.

The last active instance administrator cannot be deactivated or demoted. Promote another active account before transferring that responsibility.

## Project memberships

Project administrators can open **Members** to choose an existing account from a searchable list or enter its email, change its role, or remove access. Instance administrators can select any active account; project administrators see active users already visible to them through shared projects. Accounts that are disabled or already members of the target project are omitted from the list. This does not send an invitation or create an account.

| Role                  | View project, tickets, and attachments | Edit tickets, links, and attachments | Manage settings and members |
| --------------------- | -------------------------------------- | ------------------------------------ | --------------------------- |
| Reader                | Yes                                    | No                                   | No                          |
| Member                | Yes                                    | Yes                                  | No                          |
| Project administrator | Yes                                    | Yes                                  | Yes                         |

These rules apply to server-rendered pages, the REST API, and attachment downloads. Readers cannot move cards, reschedule tasks, or change ticket fields. New assignments require an active project membership. Existing assignments remain when a member is removed or deactivated.

At least one project administrator membership must remain. Instance administrators can repair access if a project's administrators are deactivated. Removing their project membership does not remove their instance-wide access.

Creating cross-project ticket links requires edit access to both projects. Existing linked tickets are omitted from ticket details if the viewer cannot access their project.

## First administrator and upgrades

In a new installation, the first registered account becomes the instance administrator. Register it before making the installation available to others. Later accounts receive no access to existing projects automatically.

The migration for existing installations:

- Makes the oldest account the instance administrator, ordered by creation time and then account ID.
- Gives all existing users membership in all existing projects, preserving project visibility and ticket editing.
- Gives each project's recorded owner its project administrator role. Projects without an owner receive the bootstrapped administrator as project administrator.

Other existing users become regular project members; changing settings requires a project administrator role.

After upgrading, review **Users** and each project's **Members**, transfer instance administration if needed, and narrow access where appropriate. This backfill runs once; restarting does not restore removed memberships or promote later accounts. Back up the database before upgrading.

## REST endpoints

Personal API tokens use their owner's current permissions.

| Endpoint                                         | Purpose                                                                   | Required access        |
| ------------------------------------------------ | ------------------------------------------------------------------------- | ---------------------- |
| `GET /api/v1/admin/users`                        | List accounts and sign-in providers                                       | Instance administrator |
| `POST /api/v1/admin/users`                       | Create `{ "name": "Name", "email": "user@example.com", "password": "…" }` | Instance administrator |
| `PATCH /api/v1/admin/users/:user`                | Change `role` (`admin`/`user`) or `active`                                | Instance administrator |
| `GET /api/v1/projects/:project/members`          | List memberships                                                          | Project read access    |
| `POST /api/v1/projects/:project/members`         | Add `{ "user": "email-or-id", "role": "member" }`                         | Project administrator  |
| `PATCH /api/v1/projects/:project/members/:user`  | Change `{ "role": "reader" }`                                             | Project administrator  |
| `DELETE /api/v1/projects/:project/members/:user` | Remove membership                                                         | Project administrator  |

`GET /api/v1/projects` returns accessible projects. `GET /api/v1/users` returns active users sharing a project with the caller, plus the caller; instance administrators see all active users. Neither endpoint returns credentials or authentication tokens.

## Microsoft Entra ID and next steps

The existing provider remains available through `MICROSOFT_CLIENT_ID`, `MICROSOFT_CLIENT_SECRET`, and `MICROSOFT_TENANT_ID`. Use a fixed tenant ID for a company installation and configure `<BETTER_AUTH_URL>/api/auth/callback/microsoft` as the redirect URI in Entra ID.

After a Microsoft user's first sign-in creates their account, a project administrator can add it to a project. Signing in does not grant access to existing projects. After the first account has been created, public registration is disabled, including creation of new Microsoft accounts. Instance administrators create accounts under **Users** (name, email and password) or through `POST /api/v1/admin/users`. Existing Microsoft accounts continue to sign in. Creating an account does not replace the administrator’s session or grant project membership.

### Connect an existing account to Microsoft

An existing password user can open **user menu → Account settings → Connect Microsoft account**, select their work account and complete Microsoft sign-in. The connection is added to the existing Kenny user: their name, email, password, roles, memberships and assignments stay unchanged. They can then use **Sign in with Microsoft** on the login page or keep using their password.

This requires a configured Microsoft provider and a fixed directory (tenant) GUID in `MICROSOFT_TENANT_ID`; `common`, `organizations` and `consumers` do not enable linking. Keep the initiating Kenny session active until the callback completes. The callback must authenticate that same active user and a Microsoft identity from the configured tenant. Microsoft and Kenny email addresses may differ: matching emails never automatically connect accounts. Each Microsoft identity belongs to at most one Kenny user, and each Kenny user can connect one Microsoft identity. There is currently no self-service disconnect or replacement UI.

If Microsoft sign-in returns an account-linking error, first sign in with the existing Kenny password and connect the account from Account settings. Do not create a second Kenny account for the same person. New Microsoft users still require a local account created by a Kenny administrator, followed by this connection step.

Migration `0020` adds database uniqueness constraints for provider identities and Microsoft connections. Existing duplicate authentication identities must be investigated before upgrading; the migration never deletes or merges accounts automatically.

Invitations, Entra group mapping, and automatic provisioning are follow-up work. Actual Entra sign-in requires a registered application and tenant credentials; local permission tests do not verify that external integration in a specific tenant.

## API token lifetime and permissions

New personal API tokens expire after 90 days by default; choose 30, 90, or 365 days in the API settings. The server accepts lifetimes from 1 to 365 days. Choose **Read only** to prevent REST mutations, including administrator operations. Read-only tokens can still use the read-only MCP endpoint, whose transport uses POST. An explicit Bearer token takes precedence over a browser session. Tokens always use their owner’s current project permissions.

Existing tokens retain their previous permissions and do not expire automatically. Review and replace these tokens if you want an expiry date. Deactivation and manual revocation invalidate both old and new tokens. Per-project token scopes are not yet supported.

### Central project assignment API

`GET /api/v1/admin/users/:user/projects` returns explicit memberships with `projectId`, `key`, `name` and `role`. `POST` assigns `{ "projectId": 1, "role": "reader" }`. `PATCH /api/v1/admin/users/:user/projects/:project` changes `{ "role": "member" }`; `DELETE` removes the membership. The existing duplicate membership, active account, project scope and last project administrator checks apply. These endpoints require instance administrator access.
