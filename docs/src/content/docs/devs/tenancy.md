---
title: Tenancy
description: How one PurplePanda install serves several sites, and what that means for your own code.
---

One install serves any number of sites ("tenants"). Each tenant has its own pages, content types,
templates, media, documents, forms, settings, redirects, tags, roles and audit log, and answers on
one or more domains (`example.com` and `www.example.com`, or `blog.example.com`, …). The code —
`src/puck.config.tsx`, `src/plugins.ts`, your own routes — is shared by all of them. A component
can still be limited to particular sites, and kept out of this repository: see
[Site Components](/devs/site-components).

# Domains and the root site

Every request is served for the tenant whose domain matches its hostname exactly. Each hostname is
its own row in `tenant_domains`, so `example.com` and `www.example.com` are two domains of the same
tenant. By default both serve its site as-is; set one as the site's **primary domain** (on its
edit page under Admin → Sites) and the others permanently redirect to it, path and query kept —
`www.example.com/about` → `example.com/about`, or the other way round (301 for GET/HEAD, 308 for
anything else, so a form post keeps its method). Each hostname has its own sign-in, since cookies
are per hostname. A hostname no tenant lists, or any domain of a disabled tenant, gets a
plain `404 Site not found`. The dev server and Astro's forwarded-host handling
accept any hostname for this reason (`astro.config.ts`), so put the server behind a proxy that
passes the original `Host` (or `X-Forwarded-Host`) header through.

Exactly one domain across all tenants is the **root domain**. Its tenant is the root site, and
besides being a site like any other it hosts the account pages: `/login`, `/dashboard`, and — for
super admins — **Admin** (`/dashboard/admin`), where every site and every account on the install is
managed. The root site's own `/admin` is just that site's admin. Under **Sites** a
super admin can create sites, edit their domains, move the root domain, and disable a site (every
one of its domains then 404s, admin included, until it's enabled again; nothing is deleted). The
root site can't be disabled.

A new site starts empty apart from one "Administrator" role with admin access.

## Pointing domains here

Every site also answers on its **hosting hostname**, `<site id>.<HOSTING_DOMAIN>` (by default
`HOSTING_DOMAIN` is `hosting.` plus the root domain; set it explicitly in production, since moving
the root domain would otherwise change every site's hostname). A site's own domains point their DNS
at that: a `CNAME` for a subdomain, and for an apex domain whatever its DNS provider offers instead —
CNAME flattening, or an `ALIAS` or `ANAME` record. A provider with none of those (GoDaddy) is
told to move the domain's nameservers to Cloudflare; the form never suggests an `A` record to the
server's address, which would silently break if the server moved.
The new/edit site form walks through the records per provider. One wildcard record serves every
hosting hostname: `*.hosting.example.com` `A`/`AAAA` → the server.

Certificates are issued on demand by the proxy, on each hostname's first visit. With Caddy:

```
{
	on_demand_tls {
		ask http://localhost:3012/purplepanda/tls-ask
	}
}

https:// {
	tls {
		on_demand
	}
	reverse_proxy localhost:3012
}
```

`/purplepanda/tls-ask?domain=<hostname>` answers 200 for every hostname an enabled site answers on
(its domains and its hosting hostname) and 404 otherwise, so nobody can have certificates issued
just by pointing a domain at the server. It's served on any hostname, outside any site.

`astro.config.ts` trusts `X-Forwarded-Host`/`-Proto` from any client, so the proxy in front must
overwrite those headers rather than pass a client's through — otherwise a request for one site can
be made to render another's, and a shared cache would store it under the wrong URL.

# Accounts

Accounts are shared across sites: one email, one password, one account. An account can be a
**member** of any number of sites, and holds roles per site. Signing in to a site's admin needs:

- a super admin account, which can sign in to every site's admin without being a member, **or**
- membership of that site, enabled there, plus one of its roles with admin access.

Everyone signs in once, at `/login` on the root domain (every site's `/admin/login` redirects
there). Any active account can sign in; `/dashboard` then lists the sites it can administer, and
opening one hands the account over to that site's domain, already signed in. Browsers won't share
a cookie between unrelated domains, so the hand-over is a one-time token (valid for a minute) that
the site's `/admin/sso` redeems for a session of its own — still bound to that one site, and still
subject to the site's own access check. Signing out on any site ends that sign-in on every site, in
that browser only; the account stays signed in wherever else it signed in separately.
`/login` and `/dashboard` only exist on the root domain.

In a site's **Users** admin, only its members are listed, and new ones are **invited** by email.
Nobody sets another account's password: inviting an email with no account creates one and emails
it a link (valid for 7 days) to choose its own password; inviting an email that already has an
account adds that account to the site as it is — name and password unchanged — and emails it to say
so. Since no admin ever knows an invited account's password, any site's admins can invite an
existing account. From a member's edit page an admin can also email them a password reset link,
which changes nothing until they use it. Account email is sent with the site's own mail settings,
or the root site's when it has none.

An account is enabled or disabled at two levels. Each membership has its own state
(`user_tenants.state`): a site's admin enables or disables an account **on that site** (the state
toggle, bulk Publish/Unpublish), the same way for every admin, super admins included. A member
disabled on a site keeps its roles there but can't open that site's admin and isn't offered in its
user pickers or form notifications; its other sites don't change. The account's own state
(`users.state`) applies everywhere: a disabled account can't sign in at all. Only **Admin → Users**
on the root domain changes it, and disabling an account there also ends every sign-in it has.

Because an account's name applies everywhere it's used, a site's admins can only change it for
accounts that belong to their site alone; for a shared account they can change its roles on their
site. An account's email and password are only ever changed by its owner. Super admins can change any account's name. Bulk delete in a site's admin deletes
an account only when it belongs to that site alone (and isn't a super admin's); any other account is
removed from the site instead — its membership and roles there — whoever is deleting.

**Admin → Users** on the root domain lists every account on the install, with the sites it belongs
to. It's where an account is enabled, disabled or deleted everywhere (one at a time or in bulk), and
where super admin is granted or revoked (never by an account on itself, for any of these). A
deleted account keeps its memberships and roles, so enabling it again restores it. Each account's page there adds it to another
site — optionally with one of that site's roles — or removes it from one.

# How isolation works

Every tenant-owned table has a `tenant_id` column and a Postgres row-level security policy that
limits it to the tenant in the connection's `app.tenant_id` setting. The middleware resolves the
request's tenant and runs the rest of the request inside it (`runWithTenant()`,
`src/tenant/context.ts`); the pool in `src/db/client.ts` sets `app.tenant_id` on each connection as
it's checked out. So:

- queries don't filter on `tenant_id` — Postgres does it, whatever the query, raw SQL included
- inserts don't set `tenant_id` — its column default reads the same setting
- code running outside a request (no tenant in context) sees no tenant rows and can't insert any

`users`, `sessions`, `tenants`, `tenant_domains`, `user_tenants` and `action_schemas` are not
tenant-scoped. Anything listing accounts for a site should filter on membership with
`isMemberOfCurrentTenant()` from `src/auth/accounts.ts`, or `isActiveMemberOfCurrentTenant()` to
leave out members disabled on the site (anything offering accounts to pick or notify).

`drizzle-kit push` creates each policy *without* its expression and can't set
`FORCE ROW LEVEL SECURITY` (needed because the app's role owns the tables, and owners are otherwise
exempt), so both are applied by hand once per table. A later push leaves them alone. The app's
database role must not be a superuser or have `BYPASSRLS`, or row-level security doesn't apply.

## Your own tables

A table of your own in `src/db/schema.ts` that holds per-site data should follow the same pattern:

```ts
export const products = pgTable("products", {
  id: uuid("id").defaultRandom().primaryKey(),
  tenantId: tenantIdColumn(),
  // ...
}, (t) => [
  index("products_tenant_id_idx").on(t.tenantId),
  tenantIsolationPolicy(),
]);
```

then `drizzle-kit push`, and finish the policy by hand — until then the table returns no rows:

```sql
ALTER POLICY tenant_isolation ON products
  USING (tenant_id = NULLIF(current_setting('app.tenant_id', true), '')::uuid)
  WITH CHECK (tenant_id = NULLIF(current_setting('app.tenant_id', true), '')::uuid);
ALTER TABLE products FORCE ROW LEVEL SECURITY;
```

## Running as another tenant

To do something for a tenant other than the current request's (as the tenant admin does when it
seeds a new site's role), wrap it in `runWithTenant()`:

```ts
await runWithTenant({ id: tenantId, name, isRoot: false }, () =>
  db.insert(roles).values({ title: "Editor", adminAccess: false }),
);
```

In-process caches (`src/db/content-cache.ts`) are kept per tenant, and invalidating one only clears
the current tenant's.
