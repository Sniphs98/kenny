# User management and project access

Kenny separates authentication from project permissions. Email/password and Microsoft Entra ID accounts use the same roles and memberships.

## Instance administrators

Open **Users** in the user menu to search accounts, change instance roles, and deactivate or reactivate users. Only instance administrators can use this page and the administration API.

Instance administrators can manage every project without a membership. Regular users can create projects and become their project administrator; access to other projects requires a membership.

Deactivation revokes all sessions and deletes personal API tokens. It prevents new sessions, including Microsoft sign-in, while preserving tickets, accounts, and assignments. Reactivation allows sign-in again but never restores revoked tokens. Permissions and account status are checked against the database on every authenticated request.

The last active instance administrator cannot be deactivated or demoted. Promote another active account before transferring that responsibility.

## Project memberships

Project administrators can open **Members** to add an existing account by email, change its role, or remove access. This does not send an invitation or create an account.

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

| Endpoint                                         | Purpose                                           | Required access        |
| ------------------------------------------------ | ------------------------------------------------- | ---------------------- |
| `GET /api/v1/admin/users`                        | List accounts and sign-in providers               | Instance administrator |
| `PATCH /api/v1/admin/users/:user`                | Change `role` (`admin`/`user`) or `active`        | Instance administrator |
| `GET /api/v1/projects/:project/members`          | List memberships                                  | Project read access    |
| `POST /api/v1/projects/:project/members`         | Add `{ "user": "email-or-id", "role": "member" }` | Project administrator  |
| `PATCH /api/v1/projects/:project/members/:user`  | Change `{ "role": "reader" }`                     | Project administrator  |
| `DELETE /api/v1/projects/:project/members/:user` | Remove membership                                 | Project administrator  |

`GET /api/v1/projects` returns accessible projects. `GET /api/v1/users` returns active users sharing a project with the caller, plus the caller; instance administrators see all active users. Neither endpoint returns credentials or authentication tokens.

## Microsoft Entra ID and next steps

The existing provider remains available through `MICROSOFT_CLIENT_ID`, `MICROSOFT_CLIENT_SECRET`, and `MICROSOFT_TENANT_ID`. Use a fixed tenant ID for a company installation and configure `<BETTER_AUTH_URL>/api/auth/callback/microsoft` as the redirect URI in Entra ID.

After a Microsoft user's first sign-in creates their account, a project administrator can add it to a project. Signing in does not grant access to existing projects. Public email/password registration remains enabled in this first stage.

Invitations, registration restrictions, explicit account linking, Entra group mapping, and automatic provisioning are follow-up work. Actual Entra sign-in requires a registered application and tenant credentials; local permission tests do not verify that external integration in a specific tenant.
