1. Keep admin as is

No need to throw it away.

Use the current dashboard-style UI for:

/admin/*
/apf/*

That part is fine.

2. Redesign the worker side separately

Build /worker/* as a different app experience.

Worker should land on:

Available Requests
My Assignments
Availability
Notifications

Not on a dashboard.

3. Change the worker visual style

Worker UI should be:

card-based
larger touch targets
fewer columns
almost no dense tables
fast accept/decline actions
mobile-first
4. Fix navigation by role

After login:

worker → worker home
org admin → admin dashboard
APF → APF overview

Do not send all roles into the same shell.

5. Immediate page list to build

Worker side first:

/worker/requests
/worker/assignments
/worker/availability
/worker/profile

That is the correction.

6. Don’t pause backend work entirely

But frontend priority should now be:

role-based layouts
role-based landing pages
worker-first UX

Bluntly:
you currently have the admin console, not the full product.

The next best step is:
split the frontend into true role-based experiences, starting with worker UI.