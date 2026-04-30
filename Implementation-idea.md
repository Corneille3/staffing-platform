

Coverage urgency workflow

The app should understand:

urgent same-day replacement
planned absence
recurring coverage need
emergency staffing gap

This is more specific than generic scheduling.

3. Response tracking built for substitutes

The app should track:

notified
viewed
accepted
declined
no response
assigned
cancelled

That is the real operational workflow.

4. Controlled assignment

Do not let the product become an open job board.

The correct workflow is:

eligible substitutes are notified
they respond
coordinator confirms one
assignment is logged

That makes it safer and more professional.

5. Network-wide visibility

For umbrella organizations like APF or others:

fill rate
time to fill
shortage by region
active substitute pool
unfilled requests
demand trends

For organization coordinators
Coverage Board
New Coverage Request
Responses
Assignments
Coverage History
Substitute Directory
For substitutes
Available Coverage
My Assignments
My Availability
My Profile
Notifications
For network/association admins
Network Overview
Organizations
Substitute Pool
Coverage Analytics
Activity History
UI direction


The GOAL:

The app should feel like:

operational command center for admins
simple opportunity/assignment app for substitutes
reporting layer for umbrella organizations

A specialized replacement staffing and coverage coordination platform for care-based organizations.

That includes:

childcare centres
family daycares
school-based services
community centres
long-term care homes
assisted living settings
home care agencies
other care or support-service organizations

The key common pain is not “childcare.”
The key common pain is:

last-minute staffing gaps in regulated or trust-based care environments.

Better product definition

Presentation of the app:

A bilingual replacement staffing and coverage coordination platform built for care-based organizations that need to quickly fill urgent or planned staffing gaps with eligible substitutes, track responses, confirm assignments, and maintain full operational history.

Updated domain focus

Instead of:

childcare-specific

Use:

care-sector-specific

Fields can adapt by organization type.

Examples:

Childcare
age group
educator certification
French/English language requirement
child-to-staff ratio relevance

Long-term care
PSW / HCA qualification
shift type
unit/floor
resident support level
medication-related restriction if applicable

Community care
program type
vulnerable-sector clearance
support role
language requirement

What to build into the MVP

Do not hardcode childcare too deeply.

Use flexible fields:

organization type
coverage request type
role needed
required qualifications
required certifications
language requirement
site/location
shift date/time
urgency
notes/instructions

The app should not look like a CRM

Avoid making the main objects feel like:

customers
leads
generic tasks
tickets
projects

Use domain-specific language:

Instead of Task, use:

Staffing Request
Replacement Request
Substitution Request
Coverage Request

Instead of Worker, use:

Substitute
Relief Educator
Available Educator
Care Staff

Instead of Admin Dashboard, use:

Coverage Desk
Replacement Desk
Staffing Coordination
Coverage Board

Worker UI goal

The worker should be able to answer 3 questions fast:

What coverage opportunities are available for me?
What am I assigned to?
Am I available or unavailable?

That’s it.

Main worker navigation

Use only 4–5 sections:

Available
Assignments
Availability
Notifications
Profile

Avoid:

dashboard-heavy layout
reports
tables
admin terminology
too many menus
1. Worker home screen

This should not be a generic dashboard.

It should show:

Top card
Hi Josimar
You are currently: Available
Receiving urgent alerts: Yes

With quick buttons:

Set unavailable
Update availability
View available coverage
Main section
Available Coverage Near You

Each item should be a card, not a table.

Example card:

Urgent Coverage Needed

Little Stars Daycare
Regina, SK

Today
1:00 PM – 5:30 PM

Role: Childcare Assistant
Language: French preferred
Requirements: ECE Level 1, Vulnerable Sector Check

[View Details] [Accept] [Decline]

2. Available coverage screen

This is the most important worker screen.

It should show only requests the worker is eligible for.

Each card should include:

organization name
location/city
date
start/end time
urgency
role needed
required qualifications
language requirement
estimated duration
response deadline if any
status

Suggested tabs:

All
Urgent
Today
This Week

Filters should be simple:

city
date
urgent only

Do not overload workers with advanced filters.

Summary
organization
location
date/time
role needed
request type: urgent / planned / open need
language requirement
certifications required
Instructions
arrival notes
contact person
parking/access notes
special instructions
Eligibility status

This is important and unique.

Example:

You match this request:
✓ City: Regina
✓ Language: French
✓ Required qualification: ECE Level 1
✓ Availability: Available

Or:

Missing requirement:
You do not have the required certification for this request.

If not eligible, ideally they should not see it at all. But if they do, show why.

Actions
Accept
Decline
Ask a question / contact coordinator later
Save for later maybe, not MVP-critical
4. Accept flow

Do not make accept one click only. Add a small confirmation.

Example:

Confirm availability

You are accepting:
Little Stars Daycare
Today, 1:00 PM – 5:30 PM

By accepting, you confirm you are available for this time.

[Confirm Accept] [Cancel]

After accepting:

Response sent.
The coordinator will confirm the final assignment.

This matters because we agreed workers respond, but admins confirm.

5. Decline flow

Decline should be fast.

Optional reason:

Why are you declining?
- Not available
- Too far
- Not interested
- Conflict with another assignment
- Other

Do not require a reason in MVP. Make it optional.
6. My assignments screen

This shows confirmed work only.

Tabs:

Upcoming
Past
Cancelled

Assignment card:

Confirmed Assignment

Little Stars Daycare
Regina, SK

Friday, May 3
8:30 AM – 4:30 PM

Role: Childcare Assistant
Contact: Marie Dupont
Status: Confirmed

[View Details] [Add to Calendar]

This screen should be very clean.
7. Assignment detail screen

Include:

site name
address
date/time
role
contact person
phone/email
instructions
language requirement
required documents/certifications
status
add-to-calendar button
cancel/withdraw request button, if allowed

For MVP, cancellation by worker should probably be:

Request cancellation

Not direct cancellation.

The admin should be notified and confirm.

8. Availability screen

Keep this simple at first.

Current availability
I am currently:
[Available] [Unavailable]
Urgent alerts
Receive urgent coverage alerts
[On/Off]
Preferred locations
Regina
Saskatoon
Moose Jaw
Other

Preferred days/times — optional for MVP

Simple checkboxes:

Monday
Tuesday
Wednesday
Thursday
Friday
Weekend

Later you can add full calendar availability.

9. Profile screen

Worker profile should include:

Personal info
name
email
phone
preferred language
Work preferences
cities served
travel radius
urgent alerts yes/no
Qualifications
role types
certifications
languages
vulnerable sector check status
expiry dates if needed later

Documents later

Not MVP unless needed:

certificates upload
background check document
resume

For MVP, keep certification fields as structured data, not file upload.

10. Notifications screen

Worker notifications should be grouped by importance.

Examples:

New urgent coverage request
You were matched for a same-day request in Regina.

Assignment confirmed
Your assignment at Little Stars Daycare has been confirmed.

Request filled
The coverage request you responded to has already been assigned.

Notification types:

new request
urgent request
response received
assigned
not selected
cancelled
reminder

11. Worker status labels

Use human-friendly language.

Instead of technical statuses:

accepted
assigned
cancelled

Use:

Response sent
Waiting for confirmation
Confirmed
Not selected
Cancelled
Completed
12. Worker UI should be mobile-first

Even for web MVP, design worker screens like mobile screens.

Reason:
workers will likely respond from phones.

Rules:

large buttons
card layout
minimal typing
no dense tables
clear date/time
clear location
sticky bottom action buttons on detail pages

Example bottom action area:

[Decline] [Accept]

13. Worker-specific features that make the app unique

These are important.

Eligibility badge

Show why the worker matches.

Good match
Matches your city, language, and qualifications.
Urgency badge
Urgent - Today
Response deadline
Respond by 11:30 AM
Assignment confirmation state

Workers must understand:

You accepted. Waiting for coordinator confirmation.

Not:

You are assigned.

Those are different.

Request filled notice

If someone else is assigned:

This request has been filled.

Calendar button

Every confirmed assignment should have:

Add to Calendar
14. Recommended worker homepage layout
[Header]
Cornevia
Available

[Availability Card]
You are available for coverage requests.
Urgent alerts: On
[Update Availability]

[Urgent Requests]
2 urgent requests near you

[Available Coverage]
Card
Card
Card

[Upcoming Assignment]
Next confirmed assignment

[Bottom Nav]
Available | Assignments | Availability | Profile