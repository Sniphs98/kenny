# Microsoft Teams

Kenny can be used as an app in Microsoft Teams:

- **Personal app:** Kenny appears in the Teams app bar and shows the project overview.
- **Channel tab:** Add “Kenny” as a tab to a channel or group chat and pick a project; the tab shows its board.
- **Automatic sign-in (Teams SSO):** Opening Kenny in Teams signs the user in with their Microsoft account, without a login form.

- **Channel notifications:** A project posts new, completed and assigned tickets to a Teams channel ([see below](#channel-notifications)). This works without the Teams app and without `TEAMS_ENABLED`.

“Create ticket from message” and preview cards for ticket links will follow separately; they need an endpoint that Microsoft can reach from the internet.

The status overview and every value to copy are available in Kenny under **user menu → Microsoft Teams** (instance administrators only).

## Requirements

| What                                                                                                      | Why                                                                                                                                                                                                            |
| --------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Microsoft sign-in is configured (`MICROSOFT_CLIENT_ID`, `MICROSOFT_CLIENT_SECRET`, `MICROSOFT_TENANT_ID`) | Teams SSO uses the same app registration; see [User management](user-management.md). Use the fixed tenant ID for a company installation, not `common`.                                                         |
| Kenny runs on **HTTPS**, port 443, and `BETTER_AUTH_URL` is that address                                  | Teams only loads tabs over HTTPS.                                                                                                                                                                              |
| Users' devices **trust the certificate**                                                                  | With a company CA, its root certificate must be installed on the devices, usually via group policy or Intune. Teams desktop uses the Windows certificate store. Teams on phones needs the CA deployed via MDM. |
| Users **can reach the server** (company network or VPN)                                                   | Teams loads Kenny directly from the user's device, not through Microsoft's cloud.                                                                                                                              |
| The Kenny server can reach **`https://login.microsoftonline.com`** (outbound)                             | Kenny verifies Teams tokens with Microsoft's public signing keys.                                                                                                                                              |

A publicly reachable server or a public certificate is **not** required for tabs and SSO.

## 1. App registration in Entra ID

In the [Entra admin center](https://entra.microsoft.com) → **App registrations**, open the registration Kenny already uses for Microsoft sign-in. `<host>` is Kenny's host name (e.g. `kenny.company.internal`), `<client-id>` the application ID.

1. **Authentication:** The “Web” platform has the redirect URI `https://<host>/api/auth/callback/microsoft` (already required for regular Microsoft sign-in).
2. **Expose an API:**
   - Set the **Application ID URI** to `api://<host>/<client-id>`.
   - **Add a scope** named `access_as_user`, consent by admins and users, any display names, state enabled.
   - **Add a client application** for each of the following and select the `access_as_user` scope:
     - `1fec8e78-bce4-4aaf-ab1b-5451cc387264` (Teams desktop and mobile)
     - `5e3ce6c0-2b1f-4285-8d4b-75ee78787346` (Teams on the web)
3. **Manifest:** Set `"requestedAccessTokenVersion": 2` in the `api` section (older manifest view: `accessTokenAcceptedVersion: 2`). Otherwise Microsoft issues version 1 tokens, which Kenny rejects.
4. **Token configuration (recommended):** Add the optional claim **`email`** for the **Access** token type. Without it, Kenny uses the sign-in name (UPN) as email address.
5. **API permissions:** Keep the default Microsoft Graph permissions (`openid`, `profile`, `email`, `User.Read`) and **grant admin consent**, so users are not asked on first use.

## 2. Configure Kenny

```env
TEAMS_ENABLED=true

# Optional
# TEAMS_APP_VERSION=1.0.0    # increase when uploading a changed app package
# TEAMS_APP_ID=              # fixed Teams app ID; otherwise derived from address and client ID
# TEAMS_DEVELOPER_NAME=Kenny # publisher shown in the Teams app details
```

Restart Kenny. Under **user menu → Microsoft Teams**, all three status checks should show “OK”.

## 3. Publish the app in Teams

1. Under **user menu → Microsoft Teams**, **download the app package** (`kenny-teams.zip` with `manifest.json` and icons).
2. In the [Teams admin center](https://admin.teams.microsoft.com) → **Teams apps → Manage apps → Upload**, upload the package and make it available through permission and setup policies.
   For a quick test, Teams users can also use **Apps → Manage your apps → Upload an app → Upload a custom app** if the policy allows it.
3. When the address, the client ID or the package changes, increase `TEAMS_APP_VERSION` and upload the new package as an update.

## Channel notifications

Kenny posts project events as cards to a Teams channel through a Teams **workflow**. Kenny only sends outbound requests, so this also works on servers inside the company network.

1. In Teams, open the channel → **⋯ → Workflows** → template **“Post to a channel when a webhook request is received”**, follow the steps and copy the address shown at the end.
2. In Kenny, open the project → **Settings → Teams notifications** (project administrators), paste the address, choose the events and the language of the messages and save.
3. **Send test message** checks the connection.

| Event                                                                 | Card                      |
| --------------------------------------------------------------------- | ------------------------- |
| New ticket (including submissions through forms, which name the form) | “New ticket WEB-12”       |
| Ticket completed (moved to a done column or closed)                   | “Ticket WEB-12 completed” |
| Ticket assigned (also when created with an assignee)                  | “WEB-12 assigned to Anna” |

Each card shows title, project, priority, assignee and due date and links to the ticket in Kenny.

- **Requirement:** the Kenny server can reach the workflow address (outbound HTTPS to `*.logic.azure.com`, `*.powerautomate.com` or `*.powerplatform.com`).
- **Secret address:** the workflow address contains a signature. Kenny stores it, never shows it again (only its host) and never returns it through the API. To change it, paste a new one; **Remove** deletes it.
- **Only Microsoft workflow hosts:** Kenny accepts only `https://` addresses on the hosts above and does not follow redirects. A project administrator therefore cannot make the server call other systems in the network.
- **Plain text:** ticket titles and names appear as plain text, so submissions through public forms cannot inject links or formatting into the channel.
- **Delivery:** one attempt per event with a 10-second timeout, without blocking the change in Kenny. The settings show the last delivery or the last error.

## Security

- **Only in Teams mode** may Teams and Microsoft 365 (`teams.microsoft.com`, `*.teams.microsoft.com`, `*.cloud.microsoft`, `*.office.com`, `*.microsoft365.com`, Outlook) frame Kenny (`Content-Security-Policy: frame-ancestors`). All other sites stay blocked.
- **Session cookies** are `SameSite=None; Secure; Partitioned` in Teams mode so they work inside the Teams iframe. Partitioning keeps the Teams session separate from the regular browser session and prevents other sites from sending it. SvelteKit's and Better Auth's origin checks (CSRF) still protect forms and API calls.
- **Tokens** are fully verified: signature (Microsoft's keys), issuer and tenant, audience (Kenny's client ID) and expiry.
- **Accounts** are matched like regular Microsoft sign-in, by Entra object ID (`oid`). An existing Kenny password account is not linked automatically by email address.
- As everywhere, the very first account of a new instance becomes administrator. On a fresh installation, create the administrator in the browser first.

## Known limitations

- **Safari** blocks cookies in third-party iframes, so Teams in Safari is not supported (Teams desktop, Edge, Chrome and Firefox work).
- **Chrome and Edge** ask before an internet site (Teams) loads a server on the local network (“local network access”). Users allow it once, or IT allows it for `https://teams.microsoft.com` through policy.
- **Signing out** in Teams only ends the Teams session; Teams SSO signs in again the next time the tab opens.
- Microsoft sign-in through redirect (the button on the login page) does not work inside Teams; always enter through the app or tab.

## Troubleshooting

| Message in Teams                                                                       | Cause                                                                                                                                                                |
| -------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Tab stays empty or “content cannot be displayed”                                       | The certificate is not trusted, the server is unreachable (VPN?) or `TEAMS_ENABLED` is missing, so Kenny forbids framing.                                            |
| “Signing in through Teams failed” with `resourceRequiresConsent` or `invalid_resource` | Application ID URI, the `access_as_user` scope or the authorized Teams clients are missing or do not match the host in the manifest.                                 |
| “Signing in through Teams failed” with `Invalid token`                                 | Usually `requestedAccessTokenVersion: 2` is missing, `MICROSOFT_TENANT_ID` does not match the user's tenant, or the server cannot reach `login.microsoftonline.com`. |
| “This page is meant for Microsoft Teams”                                               | `/teams` was opened directly in the browser; this is expected.                                                                                                       |
| Notifications: “Last delivery failed: HTTP 401” or “HTTP 404”                          | The workflow was deleted or turned off in Teams, or the address is incomplete. Create the workflow again and paste the new address.                                  |
| Notifications: “fetch failed”, `ENOTFOUND` or a timeout                                | The Kenny server cannot reach `*.logic.azure.com` (firewall or outbound proxy).                                                                                      |
