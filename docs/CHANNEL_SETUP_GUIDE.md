# Channel setup guide

This guide connects WhatsApp, Instagram, Gmail, and Shopify from **Settings**.

Every URL you paste into Meta or Google comes from **Settings → Callback URLs**. Choose the channel, copy **Webhook**, **Login redirect**, or **Push URL**, and paste it exactly — do not add or remove a trailing slash.

Work in this order: WhatsApp → Instagram → Gmail → Shopify.

## 1. Before you start

You need:

- A login to this site, with access to **Settings**
- A Meta developer account and a Business-type app (WhatsApp and Instagram)
- A Google Cloud project you can administer (Gmail)
- Shopify admin or Partner access (optional, for orders)

Keep **Settings → Callback URLs** open in a second tab while you work in Meta or Google.

## 2. WhatsApp

Settings → WhatsApp → **Connect** asks for four required fields. Gather them first, then paste them into the form in one step.

| Field | Required | Source |
|-------|----------|--------|
| Phone Number ID | Yes | Meta → WhatsApp → API Setup |
| Access Token | Yes | System User token (step 2.4). Do not use the token shown on API Setup; it expires in about 24 hours. |
| Verify Token | Yes | A string you invent. Write it down. You will enter the same value in the Meta webhook after Connect. |
| App Secret | Yes | Meta → App settings → Basic, for the same app that has WhatsApp |
| Business Account ID | No | WhatsApp Business Account ID, if Meta shows it |

### 2.1 Create the Meta app

1. Open https://developers.facebook.com/apps/
2. Create an app of type **Business**, or open an existing Business app.
3. Add the **WhatsApp** product.

### 2.2 Phone Number ID

1. Open WhatsApp → API Setup.
2. Copy **Phone number ID**.
3. If **WhatsApp Business Account ID** is shown, copy that too.

Use a production WhatsApp Cloud API number for live customers. In Development mode, only numbers Meta lists as test numbers will work.

### 2.3 App Secret

1. Open App settings → Basic.
2. Show and copy **App Secret**.

This App Secret belongs to WhatsApp. Instagram uses a different App ID and App Secret (section 3).

### 2.4 System User access token

1. Open https://business.facebook.com/latest/settings
2. Users → System users → Add. Give the user Admin access.
3. Assign assets: this Meta app (Full control) and the WhatsApp account.
4. Generate a token for this Meta app with:
   - `whatsapp_business_messaging`
   - `whatsapp_business_management`
   - `business_management` (if Meta lists it)
5. Choose a non-expiring token when Meta offers it.
6. Copy the token and store it securely until you paste it into Connect.

### 2.5 Connect in Settings

1. Settings → WhatsApp → **Connect**.
2. Paste Phone Number ID, Access Token, Verify Token, and App Secret. Add Business Account ID if you have it.
3. Click **Connect**.

The webhook cannot be verified until this step succeeds, because Meta checks the Verify Token against what was just saved.

### 2.6 Webhook

1. In the Meta app, open WhatsApp → Configuration (or Webhooks).
2. Callback URL: Settings → Callback URLs → WhatsApp → copy **Webhook**.
3. Verify token: the same string you entered in step 2.5.
4. Verify and save. If verification fails, Connect was not completed, or the Verify Token does not match exactly.
5. Subscribe to **`messages`**.

If agents will also reply from the WhatsApp Business app on the phone, the number must use Meta Coexistence, and you should also subscribe to **`smb_message_echoes`**. A Cloud API–only number will not show those phone replies.

### 2.7 Confirm

Send a WhatsApp message from a customer phone to the business number. Open **Inbox** and reply from there.

## 3. Instagram

Settings → Instagram → **Connect** asks only for Instagram App ID, Instagram App Secret, and Verify Token. Access Token and Username are created after Instagram login. Do not enter a Page ID.

**Use the Instagram App ID and Instagram App Secret from Instagram → API setup with Instagram login.** They are not the App ID and App Secret under App settings → Basic.

### 3.1 Add Instagram and copy credentials

1. In the Meta app, add the **Instagram** product.
2. Open **Instagram → API setup with Instagram login**.
3. Copy **Instagram app ID** and **Instagram app secret**.
4. Invent a Verify Token (no spaces) and write it down. You will use it in Connect and again in the webhook.

After Connect, login requests these scopes:

- `instagram_business_basic`
- `instagram_business_manage_messages`
- `instagram_business_manage_comments`

For live customer DMs, complete Meta App Review for Instagram messaging. While the app is in Development mode, only Instagram accounts that have a role on the app can send DMs that appear in Inbox. Add those accounts as testers in Meta.

### 3.2 Login redirect in Meta

Instagram login will not complete unless this URL is saved in Meta first.

1. Settings → Callback URLs → Instagram → copy **Login redirect**.
2. Open https://developers.facebook.com/apps/ and select the same app.
3. Open **Instagram → API setup with Instagram login → Business login settings**.
4. Paste the copied value into **OAuth redirect URIs**. The host and path must match exactly.
5. Save in Meta.

If Meta also asks for a Deauthorize callback URL or a Data deletion request URL, use the same host as Login redirect, with `/oauth/instagram/deauthorize` and `/oauth/instagram/data-deletion`. If it asks for a Privacy policy URL, use the same host with `/privacy`.

### 3.3 Connect in Settings

1. Confirm step 3.2 is saved.
2. Settings → Instagram → **Connect**.
3. Enter Instagram App ID, Instagram App Secret, and Verify Token.
4. Click **Connect**. Instagram login opens.
5. Sign in as the **business Instagram account** that should receive DMs, and approve access.
6. You return to Settings. Instagram is connected.

If login fails with a redirect error, the URL in step 3.2 does not match Login redirect. If it fails with an app ID error, you used App settings → Basic instead of Instagram API setup.

The webhook cannot be verified until this step succeeds.

### 3.4 Webhook

1. In the Meta app, open Webhooks and subscribe the Instagram product (messaging).
2. Callback URL: Settings → Callback URLs → Instagram → copy **Webhook**.
3. Verify token: the same string you entered in step 3.3.
4. Verify and save.
5. Subscribe to **`messages`**.

Replies sent in the Instagram app appear in Inbox automatically.

### 3.5 Confirm

From a customer Instagram account (a tester, if the app is still in Development), send a DM to the business account. Open **Inbox** → Instagram and reply.

The business cannot start an Instagram thread. The customer must message first.

## 4. Gmail

Settings → Gmail → **Connect** asks for Client ID, Client Secret, and Pub/Sub Topic. Tokens are created after Google login. Mail watch starts automatically after Connect and is renewed while this site’s API is running.

### 4.1 Enable APIs

Use a Google account that can administer the project (Owner, or the ability to enable APIs and edit IAM).

1. Open https://console.cloud.google.com/ and select or create a project.
2. Enable **Gmail API**: https://console.cloud.google.com/apis/library/gmail.googleapis.com
3. Enable **Cloud Pub/Sub API**: https://console.cloud.google.com/apis/library/pubsub.googleapis.com

Both must show **Enabled**. If either is off, Connect or mail delivery will fail.

### 4.2 OAuth consent screen

1. Open https://console.cloud.google.com/apis/credentials/consent
2. Configure the app. External is typical. Add an app name and a support email.
3. Add these scopes:
   - `https://www.googleapis.com/auth/gmail.readonly`
   - `https://www.googleapis.com/auth/gmail.send`
4. Publish the app. If you leave it in Testing, add the support mailbox under **Test users**. Otherwise Google shows `access_denied` at login.

### 4.3 OAuth client and login redirect

Google login will not complete unless this URL is saved on the OAuth client first.

1. Settings → Callback URLs → Gmail → copy **Login redirect**.
2. Open https://console.cloud.google.com/apis/credentials
3. Create credentials → OAuth client ID → **Web application**.
4. Under **Authorized redirect URIs**, paste the copied value. The host and path must match exactly.
5. Save. Copy **Client ID** and **Client Secret**.

### 4.4 Pub/Sub topic and push subscription

You need permission to create topics and edit topic IAM (Owner, or Pub/Sub Admin).

1. Open https://console.cloud.google.com/cloudpubsub/topic/list
2. Create a topic. Example name: `gmail-events`.
3. Open the topic → **Permissions**.
4. Grant access:
   - Principal: `gmail-api-push@system.gserviceaccount.com` (Google’s Gmail push account, not your user)
   - Role: **Pub/Sub Publisher**
5. Create a subscription on that topic:
   - Delivery type: **Push**
   - Endpoint URL: Settings → Callback URLs → Gmail → copy **Push URL**
   - Leave authentication and payload unwrapping off
6. Copy the topic resource name. It must look like `projects/YOUR_PROJECT_ID/topics/gmail-events`. Do not copy the subscription name.

Without the Publisher grant in step 4, mail watch will fail.

### 4.5 Connect in Settings

1. Confirm the login redirect from step 4.3 is saved.
2. Settings → Gmail → **Connect**.
3. Paste Client ID, Client Secret, and the Pub/Sub topic name from step 4.4.
4. Click **Connect**. Google login opens.
5. Sign in as the **support mailbox** that should receive customer email, and approve both scopes.
6. You return to Settings. Gmail is connected and mail watch starts on its own.

If Google shows `redirect_uri_mismatch`, the Authorized redirect URI does not match Login redirect. If Google does not issue a refresh token, revoke this app at https://myaccount.google.com/permissions and Connect again.

### 4.6 Confirm

Send a test email to the support mailbox. Open **Inbox** → Email and reply.

Replies sent in Gmail appear in Inbox automatically.

## 5. Shopify

Shopify shows customer and order details in the inbox.

| Field | Required | Value |
|-------|----------|--------|
| Shop subdomain | Yes | The subdomain only. For `yourbrand.myshopify.com`, enter `yourbrand`. |
| Client ID | Yes | App client ID |
| Client Secret | Yes | App client secret |

### 5.1 App and scopes

Create or open a custom app in the Shopify admin or Partner dashboard. Install it on the store with at least:

- `read_customers`
- `read_orders`

### 5.2 Login redirect in Shopify

Shopify login will not complete unless this URL is saved on the app first.

1. Settings → Callback URLs → Shopify → copy **Login redirect**.
2. Open the app in the Shopify Dev Dashboard → **Settings**.
3. Paste the copied value into **Allowed redirection URL(s)**. The host and path must match exactly.
4. Save in Shopify.

### 5.3 Connect in Settings

1. Confirm step 5.2 is saved. The app must already be installed on the store (`read_customers`, `read_orders`).
2. Settings → Shopify → **Connect**.
3. Enter shop subdomain, Client ID, and Client Secret.
4. Click **Connect**. Shopify may open for you to approve access. Approve while logged into that store.
5. You return to Settings. Shopify is connected.

If Connect fails with a redirect error, the URL in step 5.2 does not match Login redirect.

### 5.4 Confirm

Open a contact in **Inbox** that has an email or WhatsApp number that exists on the Shopify customer. The customer panel should show profile and orders.

Instagram threads have no email or phone, so Shopify cannot match those contacts.
