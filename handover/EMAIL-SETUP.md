# Email and the contact form

Written on 13 September 2026.

## Where things stand

| What | Status |
|---|---|
| Contact form on `/contact/` | **Works now.** FormSubmit (formsubmit.co) delivers each message to **hivenexis6@gmail.com**. You need to activate it once; see step 1 |
| contact@calculatemytax.uk | **Not working yet.** The domain calculatemytax.uk is not registered, so mail to it bounces. See step 2 |
| Replying as contact@calculatemytax.uk | Optional. See step 3 |

No accounts were created and no passwords were used to set any of this up. Each step below is one you do yourself, signed in to your own accounts.

## 1. Activate the contact form (once, about 2 minutes)

1. Once the site is live, open https://muhammadaliseo.github.io/CalculateMyTax/contact/ and send a test message.
2. FormSubmit sends an email to hivenexis6@gmail.com asking you to confirm the form. Open it and click **Activate Form**. If you can't see it, check the Spam and Promotions folders.
3. Send one more test message. It should arrive in Gmail as a table showing the name, email, phone, topic and message.
4. **Recommended:** hide your Gmail address from the page source.
   - The activation email gives the form a random string, such as `a1b2c3...`, to use in place of your email address.
   - In `data/site.json`, replace `hivenexis6@gmail.com` with that string in both `formAction` and `formAjax`. They then read `https://formsubmit.co/a1b2c3...` and `https://formsubmit.co/ajax/a1b2c3...`.
   - Run `npm run build`, then commit and push.

Until the form is activated, the form shows "Sorry, your message could not be sent", because FormSubmit refuses messages for forms that have not been confirmed.

**How the form works:**
- **With JavaScript on**, which is almost every visitor, it checks the fields and sends the message in the background. It then shows "Thank you. Your message has been sent" on the page.
- **Without JavaScript**, it posts to FormSubmit, which may show a quick check page, and then returns the visitor to `/contact/thank-you/`.
- **Automated spam** is caught by a hidden field that people never see but bots fill in.

## 2. Forward contact@calculatemytax.uk to Gmail (after registering the domain)

Email forwarding needs the domain, because it works through the domain's DNS records. Once calculatemytax.uk is registered, pick one of these options. Both are free for this use.

### Option A: Cloudflare Email Routing (recommended)

1. **Register calculatemytax.uk.** Any registrar works; Cloudflare Registrar keeps the domain and its DNS in one place.
2. **Add the domain to a free Cloudflare account.** If you registered it elsewhere, change the nameservers at your registrar to the two Cloudflare gives you.
3. **Turn on routing.** In the Cloudflare dashboard, open the domain, then **Email**, then **Email Routing**, and click **Enable Email Routing**. Cloudflare adds the MX and TXT (SPF) records it needs; accept them.
4. **Add Gmail as the destination.** Under **Destination addresses**, add **hivenexis6@gmail.com**. Cloudflare emails that inbox a verification link; click it.
5. **Create the address.** Under **Routing rules**, create a custom address **contact@calculatemytax.uk** with the action **Send to an email**, going to hivenexis6@gmail.com.
6. **Test it.** From a different email account, send a message to contact@calculatemytax.uk. It should arrive in hivenexis6@gmail.com within a minute.

### Option B: ImprovMX

1. Sign up at improvmx.com with hivenexis6@gmail.com and add calculatemytax.uk.
2. Create the alias **contact**, forwarding to hivenexis6@gmail.com.
3. At your domain's DNS provider, add the MX and TXT records ImprovMX lists on its dashboard. They are normally `mx1.improvmx.com` and `mx2.improvmx.com`, plus an SPF record. Always copy the values from the dashboard.
4. Wait for ImprovMX to show the domain as active, then send a test email.

### Also point the website at the domain

The domain's DNS records also need to point the website at GitHub Pages. The steps are in `README.md` under "When calculatemytax.uk is registered". In short:
1. Add GitHub's records for the domain.
2. In `data/site.json`, set `brand.url` to `https://calculatemytax.uk`, set `customDomain`, and set `basePath` back to `/`.
3. Rebuild and push.

The email forwarding records (MX and TXT) and the website records (A and CNAME) sit side by side and do not conflict.

## 3. Reply from contact@calculatemytax.uk (optional)

Forwarding only receives mail, so your replies will come from hivenexis6@gmail.com. To send replies that show contact@calculatemytax.uk:

1. **Get an app password.** In your Google Account, turn on 2-Step Verification, then create an **App password** for Mail.
2. **Add the address in Gmail.** Open **Settings**, then **Accounts and Import**, then **Send mail as**, and choose **Add another email address**. Enter contact@calculatemytax.uk and untick "Treat as an alias" if you prefer.
3. **Enter the sending server.**
   - SMTP server: `smtp.gmail.com`
   - Port: `587` with TLS
   - Username: `hivenexis6@gmail.com`
   - Password: the app password
4. **Confirm the address.** Gmail sends a code to contact@calculatemytax.uk, which step 2 forwards to your inbox; enter it.
5. **Update SPF so replies are not marked as spam.** Edit the domain's SPF TXT record to include Google as well as your forwarding service. With Cloudflare Email Routing, for example: `v=spf1 include:_spf.mx.cloudflare.net include:_spf.google.com ~all`. Keep only one SPF record for the domain.

When you reply, choose contact@calculatemytax.uk in the **From** box.
