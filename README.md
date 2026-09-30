# Interactive AI Training Plan Generator

## New Features (v6.0)
- ✅ Proper Vertical Integration sequencing (Speed → Power → Strength → Hypertrophy → Strength Endurance)
- ✅ Exercises categorized by Effort (Dynamic Effort, Max Effort, Submaximal Effort, Repetition Effort) and by Adaptation (Relative Strength, Functional Hypertrophy, Hypertrophy, and Strength Endurance)
- ✅ Enhanced exercise database with 20+ movements
- ✅ 3 Anchor methodology implementation (Block Periodization, Vertical Integration, High-Low Planning)
- ✅ Medium Day support for 4-day Upper/Lower splits 
- ✅ Improved program templates with phase-specific adaptations

## Demo
[Live Dashboard](https://jlerm13.github.io/ai-training-assistant-coach)

## Login & Saved Programs (Supabase)
The app is invite-only: users log in with email + password and each user's programs are saved to Supabase. Code lives in `auth.js`; the database setup is `supabase/setup.sql`.

One-time Supabase setup:
1. **SQL Editor** → paste `supabase/setup.sql` → Run.
2. **Authentication → Sign In / Providers** → turn off "Allow new users to sign up".
3. **Authentication → URL Configuration** → set Site URL to `https://jlerm13.github.io/ai-training-assistant-coach/` and add the same URL under Redirect URLs.

Adding a user: **Authentication → Users → Add user**
- *Create new user*: enter their email and a temporary password, check "Auto Confirm User", and send them the password. They can change it with the "Change Password" button.
- *Send invitation*: they get an email with a link to set their own password. Requires custom SMTP (Authentication → Emails → SMTP Settings); Supabase's built-in email only delivers to your project's team members. The "Forgot password?" link has the same requirement.
