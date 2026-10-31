# Supabase setup

This project uses Supabase Free for sign-in, private recipe data, and meal-photo storage.

## 1. Create the project

1. Sign in at https://supabase.com/dashboard.
2. Create a new organization if prompted, then choose **New project**.
3. Name it `cires-family-meal-planner`.
4. Choose the **Free** plan.
5. Choose a strong database password and keep it somewhere safe.
6. Choose a region close to you (for example, a European region).
7. Wait until the project is ready.

Do not enable paid add-ons or upgrade the project.

## 2. Create the database tables and private photo bucket

1. Open **SQL Editor** in the Supabase project.
2. Choose **New query**.
3. Copy the complete contents of [schema.sql](./schema.sql) into the editor.
4. Click **Run**.

This creates the meals, ingredients, and planned-meals tables, enables row-level security, and creates a private `meal-photos` storage bucket. Policies restrict records and photos to their signed-in owner.

## 3. Get the browser connection details

Open **Project Settings → API** (or **Data API**, depending on the dashboard layout) and copy:

- Project URL
- Publishable key (the newer `sb_publishable_...` key) or the legacy anon/public key

These two values are intended for the browser when Row Level Security is correctly enabled. **Never put the service_role or secret key in website code or share it in chat.**

The website integration will be completed after the project exists and its URL and publishable key are available.


## 4. Configure sign-in redirects

In Supabase, open **Authentication → URL Configuration**.

Set **Site URL** to:

`https://ciresannamaria.github.io/cires-family-meal-planner/`

Add the same address under **Redirect URLs** and save.

The app uses email and password authentication. If email confirmation is enabled, new users must click the confirmation link sent by Supabase before signing in. In **Authentication → Providers → Email**, keep the Email provider enabled. For a first test, email confirmation can remain enabled; make sure the confirmation redirect URL above is configured.

## 5. Deploy and test

After the website changes have deployed through GitHub Pages:

1. Open the website URL.
2. Choose **Create account** and register your email and a password.
3. If prompted, confirm your email from the message Supabase sends.
4. Sign in and add a test meal.
5. Refresh the page and sign in from another device to verify that the meal appears there.

## Data model

- `meals`: one row per saved recipe, owned by a Supabase user.
- `meal_ingredients`: structured ingredient rows belonging to a recipe.
- `planned_meals`: a recipe assigned to a date and meal slot with a portion count.
- `meal-photos`: private image storage, with each user's files under their user ID.

The database uses Row Level Security so each account can only access its own records and photos.
