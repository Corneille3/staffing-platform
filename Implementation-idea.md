Right now it sounds like the UI is biased toward the organization admin workflow, not the full product.

This platform is not only an admin platform. It has at least 3 distinct products inside it:

worker experience
organization admin experience
APF oversight experience

If the current look feels like an admin dashboard, then the product identity is off.

What should change

You need to treat the app as role-based from the UI level, not just from permissions.

1. Worker side should feel completely different

A worker should not land in something that looks like a management dashboard.

Worker UI should feel like:

simple
mobile-friendly
action-oriented
task-focused
very few menus

Worker screens should feel more like:

Available Requests
My Assignments
Availability
Notifications
Profile

Not:

dashboards
tables everywhere
admin cards
heavy metrics
2. Organization admin can keep dashboard style

For org admins, dashboard/admin style is fine.

They need:

requests overview
response tracking
assignment controls
history
site management

That part can remain operational and table-driven.

3. APF should feel like oversight/reporting

APF should look like:

network summary
reports
organization activity
workforce visibility

Not like a local staffing console.

What this means in practice

You should split the product shell into three different UX modes:

Worker app feel
large buttons
card-based requests
clear accept/decline actions
minimal text
mobile-first layout
Admin app feel
dashboard
filters
tables
detail panels
operational controls
APF app feel
analytics/reporting
maps/regions later
aggregate metrics
read-only visibility
Blunt recommendation

Do not keep one generic dashboard shell for everyone.

That will make the whole product feel wrong.

The worker side should almost feel like a lightweight job-response app.
The admin side can stay like an operations console.

Best correction now

Refactor the frontend structure into:

/worker/* → worker-first UI
/admin/* → operations/admin UI
/apf/* → oversight/reporting UI

And give each:

different landing page
different nav
different layout density
different component style priorities
Most important design rule

For workers:
do not make them manage the system
Make them simply:

see matching requests
respond fast
manage availability
see assigned work