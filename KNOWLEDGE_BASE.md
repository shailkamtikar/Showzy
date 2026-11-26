# KNOWLEDGE_BASE.md

## Ticket Booking 3D -- Optimised

### Immersive ticketing with Agentic AI, cybersecurity, anti-scalping, and simulated payments

**Document status:** Product and technical specification\
**Research date:** 26 November 2026\
**Deployment target:** Vercel (frontend) + Render (FastAPI backend)\
**Database and authentication:** Supabase PostgreSQL + Supabase Auth\
**AI direction:** Gemini API free tier, orchestrated with LangGraph\
**Payment mode:** Demo-only simulated payment; no real money is
collected\
**Primary experience:** Event/movie discovery, venue-specific 3D seat
selection, price-aware booking, and secure demo checkout

------------------------------------------------------------------------

## 0. Document control, evidence, and decision status

This document is the standalone source of truth for the proposed
project. It consolidates the project requirements and separates
confirmed choices from proposals and unresolved decisions.

### 0.1 Confirmed project context

-   Project name: **Ticket Booking 3D -- Optimised**.
-   The product is a demo/portfolio project, not a commercial ticketing
    business.
-   The visual/product inspiration includes 3D stadium seat selection
    and 3D cinema seat selection with a view preview from a selected
    seat.
-   The product must include Agentic AI and cybersecurity as meaningful
    parts of the system.
-   Anti-scalping, bot detection, suspicious booking detection, and
    seat-hoarding prevention are core security use cases.
-   Frontend hosting: **Vercel**.
-   Backend hosting: **Render**.
-   SQL database: **Supabase PostgreSQL**.
-   Authentication: **Supabase Auth**.
-   AI model: **Gemini** is the intended primary model, subject to
    free-tier availability and quotas.
-   The demo must not collect real money.
-   Checkout should lead to a gateway-like payment experience and ask
    the user to enter a generated random string/code to simulate
    transaction confirmation.
-   The application must show multiple movies and events, not just one
    hard-coded event.
-   Different events and movie sessions may use different venues,
    screens, stadiums, seating layouts, and seat positions.
-   Prices must vary by event/session, section/category, and potentially
    seat.
-   Ticket listings should clearly show prices or ranges, such as ₹500,
    ₹1,000, or a range across the venue.

### 0.2 Proposed decisions

The following are recommended implementation decisions, not evidence of
an already implemented system:

-   React + Vite + TypeScript for the frontend.
-   Three.js through React Three Fiber for interactive 3D.
-   Tailwind CSS for styling.
-   Python + FastAPI for the backend.
-   LangGraph for controlled agent workflows.
-   Python rule-based detection for deterministic anti-abuse controls.
-   A dedicated **Demo Payment Gateway** module that creates a simulated
    payment attempt and validates a one-time challenge code.
-   Supabase Row Level Security (RLS) for user-scoped data access.
-   Server-authoritative seat holds and booking state.
-   Versioned venue layouts so a movie/session or event can point to the
    correct auditorium/stadium and geometry.

### 0.3 Assumptions and TBD items

  -----------------------------------------------------------------------
  Item                    Status                  Notes
  ----------------------- ----------------------- -----------------------
  Launch currency         Assumed INR (₹)         Fits examples and
                                                  likely demo context;
                                                  make currency
                                                  configurable

  Initial event types     Confirmed direction     Cinema movies/sessions
                                                  and live events/sports

  IPL affiliation         Not confirmed           IPL is an example
                                                  scenario, not a claimed
                                                  partnership

  Ticket provider         TBD                     Initial demo owns its
  integration                                     own sample inventory

  Exact 3D assets         TBD                     Use original, licensed,
                                                  or appropriately
                                                  attributed assets

  Payment gateway vendor  Not required for first  The initial gateway is
                          demo                    an internal simulator

  Real payment processing Explicitly out of scope No live keys, bank
                                                  transfers, or real
                                                  charges

  Gemini model identifier TBD at implementation   Select an available
                                                  free-tier model at
                                                  build time

  Admin roles and         Proposed                Scope can be simplified
  operator workflows                              for a portfolio demo

  Production readiness    Not intended            Free-tier services and
                                                  simulated payment are
                                                  demo constraints
  -----------------------------------------------------------------------

**Critical distinction:** A successful demo transaction is a simulated
application state. It is not a real payment, settlement, bank
authorisation, or proof of funds received.

------------------------------------------------------------------------

## Table of contents

1.  [Executive overview](#1-executive-overview)
2.  [Product scope and objectives](#2-product-scope-and-objectives)
3.  [Users and core concepts](#3-users-and-core-concepts)
4.  [Catalog, events, movies, venues, and
    pricing](#4-catalog-events-movies-venues-and-pricing)
5.  [Customer journeys and functional
    requirements](#5-customer-journeys-and-functional-requirements)
6.  [3D venue and seat experience](#6-3d-venue-and-seat-experience)
7.  [Booking, seat holds, and inventory
    correctness](#7-booking-seat-holds-and-inventory-correctness)
8.  [Demo payment gateway](#8-demo-payment-gateway)
9.  [Agentic AI and anti-scalping
    security](#9-agentic-ai-and-anti-scalping-security)
10. [System architecture](#10-system-architecture)
11. [Recommended technology stack](#11-recommended-technology-stack)
12. [Data model and Supabase schema](#12-data-model-and-supabase-schema)
13. [API design](#13-api-design)
14. [Security, authentication, and
    authorisation](#14-security-authentication-and-authorisation)
15. [Performance and optimisation](#15-performance-and-optimisation)
16. [Accessibility and responsive
    design](#16-accessibility-and-responsive-design)
17. [Testing and quality assurance](#17-testing-and-quality-assurance)
18. [Deployment and operations](#18-deployment-and-operations)
19. [Risks, limitations, and
    trade-offs](#19-risks-limitations-and-trade-offs)
20. [Development phases and acceptance
    criteria](#20-development-phases-and-acceptance-criteria)
21. [Open decisions](#21-open-decisions)
22. [Glossary](#22-glossary)
23. [Research references](#23-research-references)

------------------------------------------------------------------------

# 1. Executive overview

Ticket Booking 3D -- Optimised is a web-based demonstration platform for
discovering movies and live events, exploring their specific venues in
3D, selecting priced seats, and completing a simulated checkout. It
combines four connected product capabilities:

1.  **Ticket discovery and booking:** A catalog of multiple movies,
    cinema showtimes, sports matches, concerts, and other events.
2.  **Venue-specific 3D experiences:** Each show/session points to the
    correct stadium, arena, auditorium, screen, seating arrangement, and
    seat geometry.
3.  **Agentic AI and cybersecurity:** A security event pipeline detects
    suspicious booking patterns, bots, seat hoarding, and account abuse.
    Gemini-powered agents assist with investigation and explanation
    under deterministic policy controls.
4.  **Demo payment:** Checkout opens an explicitly labelled simulated
    payment gateway. The backend generates a short-lived challenge code.
    The user re-enters the code to complete a simulated transaction. No
    real money is collected.

The main product differentiator is that the customer can understand the
seat before booking. The 3D experience should help answer practical
questions: Where is this seat? How far is it from the screen or pitch?
Which section is it in? What is its price? Is it available?

The system must not depend on 3D rendering for core booking correctness.
The backend and Supabase database remain authoritative for seat
inventory, holds, prices, orders, and simulated payment status. The 3D
scene is a visual representation of venue data.

## 1.1 Product objectives

-   Show a useful catalog of multiple movies and events.
-   Display price labels and price ranges clearly before seat selection.
-   Map each event/session to the correct venue layout and 3D
    experience.
-   Support different venue types: stadiums, arenas, cinema auditoriums,
    and potentially theatres.
-   Support different screen/pitch/stage positions and seating
    geometries.
-   Show seat availability, category, and price.
-   Preview the view from a selected seat where suitable camera/geometry
    data exists.
-   Prevent double-booking through server-side inventory locking and
    expiring holds.
-   Provide a convincing but explicitly simulated checkout and
    confirmation flow.
-   Demonstrate useful Agentic AI and cybersecurity engineering,
    especially anti-scalping.
-   Run within free-tier hosting and API constraints as far as
    practical.

## 1.2 Explicit non-goals

-   Accepting real money or storing real payment credentials.
-   Claiming a simulated transaction is a real gateway authorisation.
-   Operating as a production ticket marketplace.
-   Guaranteeing exact real-world sightlines without calibrated geometry
    and validation.
-   Building a full commercial ticket-provider integration in the
    initial version.
-   Running expensive, always-on AI agents or continuous LLM polling.
-   Allowing an LLM to independently ban users, confiscate tickets, or
    modify payment/booking state.

------------------------------------------------------------------------

# 2. Product scope and objectives

## 2.1 Product surfaces

  -----------------------------------------------------------------------
  Surface                             Responsibility
  ----------------------------------- -----------------------------------
  Customer web app                    Browse movies/events, select show,
                                      explore venue, choose seats,
                                      preview, checkout, view demo ticket

  3D viewer                           Render venue-specific geometry and
                                      synchronise visual selection with
                                      inventory

  Demo payment gateway                Display order summary and generated
                                      confirmation challenge; simulate
                                      success/failure

  Security dashboard                  Show detected events, risk levels,
                                      investigations, agent reasoning
                                      summaries, and audit records

  Backend API                         Enforce business rules, inventory
                                      holds, pricing, payment simulation,
                                      and security policies

  Supabase                            Authentication, relational data,
                                      RLS, and persistent
                                      booking/security records

  AI orchestration                    Coordinate bounded investigations
                                      using Gemini and trusted evidence
  -----------------------------------------------------------------------

## 2.2 Demo-first principle

The project is a demonstration of engineering capability. It should look
and behave coherently, but must be honest about what is simulated. Use
visible labels such as:

-   "DEMO -- No real payment will be taken."
-   "Simulated transaction."
-   "Demo ticket -- Not valid for entry."
-   "AI-assisted risk assessment -- not a definitive finding."

Never collect real card numbers, CVVs, UPI PINs, bank passwords, or
actual OTPs in the custom demo gateway.

------------------------------------------------------------------------

# 3. Users and core concepts

## 3.1 Users

-   **Guest:** Can browse catalog and inspect event/movie details.
-   **Customer:** Authenticated user who can hold seats, complete demo
    checkout, and view their demo bookings.
-   **Administrator:** Manages catalog entries, venues, layout versions,
    prices, sample inventory, and support records.
-   **Security analyst:** Reviews suspicious activity and AI-assisted
    investigations. For a small demo, this role may be combined with
    administrator but should remain a distinct permission.

## 3.2 Domain terminology

-   **Movie:** A film title in the catalog.
-   **Event:** A scheduled sports match, concert, performance, or other
    live occurrence.
-   **Show/session:** A particular scheduled screening or event
    occurrence at a date/time.
-   **Venue:** Physical location containing one or more seating spaces.
-   **Venue type:** Stadium, arena, cinema, theatre, etc.
-   **Auditorium:** A particular cinema room.
-   **Screen:** The display surface in an auditorium. Different
    auditoriums may have different screen dimensions, formats, and
    positions.
-   **Layout version:** A versioned spatial representation of a
    venue/auditorium, including sections, rows, seats, and camera
    transforms.
-   **Section/block/stand:** A group of seats, such as North Stand,
    Balcony, Gold, or Screen-side zone.
-   **Seat:** A stable physical seat identity within a layout.
-   **Show seat / inventory item:** The availability and price of a
    physical seat for one specific show/session.
-   **Price tier:** A named pricing class, such as Standard, Premium,
    VIP, or Balcony.
-   **Seat hold:** A temporary server-side reservation of seat
    inventory.
-   **Order:** A checkout record with selected inventory and a total.
-   **Demo payment attempt:** A simulated payment state machine; it
    never moves money.
-   **Challenge code:** A short-lived, server-generated random string
    the customer re-enters on the demo gateway screen.
-   **Ticket:** A demo entitlement generated after successful simulated
    checkout; clearly marked as not valid for admission.
-   **Security event:** A structured record of a suspicious or
    noteworthy action.
-   **Risk score:** A bounded score from detection signals. It is an aid
    to policy and review, not proof of wrongdoing.

------------------------------------------------------------------------

# 4. Catalog, events, movies, venues, and pricing

This is a core product requirement. The home/catalog experience must not
open directly into one hard-coded 3D stadium. It should first show
multiple movies and events, each with its own available shows/sessions,
venue, price information, and appropriate 3D layout.

## 4.1 Catalog landing page

The landing page should provide categories or tabs such as:

-   Movies
-   Sports
-   Concerts
-   Live events
-   Upcoming / popular (optional)

Each card should display, where relevant:

-   Poster or event image.
-   Movie/event title.
-   Category and language/genre/team/performer details.
-   Venue or venue city.
-   Date and available showtimes.
-   Starting price or price range.
-   Availability summary (for example, "Seats available" or "Limited
    seats").
-   A clear "View shows" or "Book tickets" action.

Example cards (illustrative data only):

  ------------------------------------------------------------------------
  Listing          Available        Venue type             Displayed price
                   show/session                      
  ---------------- ---------------- ---------------- ---------------------
  Movie: Example   14:00, 18:30,    Cinema                      ₹250--₹650
  Film A           21:45            auditorium       

  Movie: Example   12:15, 16:00,    Premium cinema              ₹350--₹900
  Film B           20:00                             

  Cricket: Example 19:30, 27 Dec    Stadium                   ₹500--₹5,000
  Match                                              

  Concert: Example 18:00, 28 Dec    Arena                   ₹1,000--₹8,000
  Live Show                                          
  ------------------------------------------------------------------------

These are sample values to demonstrate variable pricing, not real
listings or verified market prices.

## 4.2 Show/session selection

A movie may have multiple showtimes, and each showtime may use a
different auditorium. A live event has a specific date/time and venue. A
venue can host many events over time.

The data relationship should be:

`Catalog item → show/session → venue + layout version → show inventory + price rules`

Do not assume one movie always uses one screen, or that all events use
the same stadium. The show/session record determines which venue and
layout to load.

## 4.3 Venue-specific configuration

Each show/session should resolve to:

-   Venue ID.
-   Optional auditorium/room ID.
-   Venue layout version ID.
-   Screen, stage, pitch, or field metadata.
-   Section/block list.
-   Row and seat coordinates.
-   Seat labels.
-   Seat preview camera transforms or preview media.
-   Pricing rules for the show.
-   Seat restrictions and accessibility metadata.

A cinema show in Auditorium 1 and a different show in Auditorium 3 must
be able to use different layouts, screen positions, seat counts, and
pricing. A cricket event must load its stadium model and stand/seat map,
not a cinema model.

## 4.4 Price display and price ranges

Prices are determined by the selected show/session and its pricing
rules. A catalog card may display a **starting price** or a
**minimum--maximum range** across currently saleable inventory.

Recommended calculation:

-   `min_price`: minimum active price among saleable seats for the show.
-   `max_price`: maximum active price among saleable seats for the show.
-   `starting_price`: minimum active price.
-   `currency`: explicit ISO currency code, initially likely INR
    (`INR`).

Price examples: - Standard: ₹500 - Premium: ₹1,000 - VIP: ₹2,500 - Venue
range: ₹500--₹5,000

Do not calculate price range from all seats if some are unavailable,
hidden, disabled, or not for sale. The API should return the display
range and its freshness timestamp. The final order amount must be
recalculated on the server from the selected inventory and active price
rules. Never trust a price sent by the browser.

## 4.5 Pricing model

Potential pricing dimensions:

-   Event/show-specific price.
-   Section or stand category.
-   Row or seat-specific premium.
-   Seat type (standard, accessible, companion, recliner).
-   Time-limited promotion (optional).
-   Fees/taxes (for demo, clearly itemised and configurable).

The first demo can use static price tiers rather than dynamic pricing.
This is easier to explain, test, and audit. Any later dynamic pricing
must be transparent and must not create unexplained price changes
between selection and checkout.

------------------------------------------------------------------------

# 5. Customer journeys and functional requirements

## 5.1 Primary customer journey

1.  User opens the catalog landing page.
2.  User browses movies or events.
3.  User opens a listing and sees its available showtimes/events.
4.  User selects a specific show/session.
5.  The application fetches the show details, venue, layout version,
    pricing, and inventory.
6.  The 3D viewer loads the matching stadium, arena, or cinema
    auditorium.
7.  User chooses a section/block or uses the equivalent accessible 2D
    list.
8.  User selects one or more seats.
9.  User sees seat labels, category, individual price, fees, and total.
10. User may preview the view from a selected seat.
11. User proceeds to checkout.
12. Backend revalidates inventory and creates an expiring hold.
13. Backend creates a demo order and payment attempt.
14. Browser navigates to a dedicated Demo Payment Gateway page.
15. Gateway page clearly states that no real money will be taken.
16. Backend generates a random, one-time challenge code and returns it
    for display in this demo flow.
17. User re-enters the displayed code into the confirmation field.
18. Backend validates the code, expiry, payment-attempt state, and order
    association.
19. If valid, the simulated payment attempt becomes successful and the
    order becomes confirmed in one controlled transaction.
20. A demo ticket is generated and shown in the user's bookings.
21. If the code is wrong or expires, the payment remains pending/failed
    and the hold is released or remains until its expiry according to
    the documented policy.

## 5.2 Functional requirements

  -----------------------------------------------------------------------
  ID                      Requirement             Priority
  ----------------------- ----------------------- -----------------------
  FR-01                   Landing page lists      Must
                          multiple movies and     
                          events                  

  FR-02                   Catalog supports        Should
                          categories and basic    
                          filters                 

  FR-03                   Each listing shows a    Must
                          starting price or price 
                          range                   

  FR-04                   Each movie/event        Must
                          exposes its own         
                          shows/sessions          

  FR-05                   Each show maps to a     Must
                          specific venue and      
                          layout version          

  FR-06                   Different cinema        Must
                          sessions can map to     
                          different               
                          auditoriums/screens     

  FR-07                   Live events can map to  Must
                          different               
                          stadiums/arenas         

  FR-08                   Venue layout contains   Must
                          its own sections, rows, 
                          and seats               

  FR-09                   Seat availability and   Must
                          pricing are             
                          show-specific           

  FR-10                   Seat selection works in Must
                          3D and accessible 2D    
                          mode                    

  FR-11                   Selected seat view can  Core differentiator
                          be previewed where data 
                          exists                  

  FR-12                   Server creates expiring Must
                          holds and prevents      
                          double booking          

  FR-13                   Checkout shows itemised Must
                          order total             

  FR-14                   Checkout opens a        Must
                          clearly labelled demo   
                          gateway                 

  FR-15                   Gateway requires a      Must
                          one-time generated      
                          challenge string        

  FR-16                   Successful challenge    Must
                          creates a simulated     
                          transaction only        

  FR-17                   Failed/expired          Must
                          challenge does not      
                          confirm an order        

  FR-18                   Confirmation produces a Must
                          demo ticket marked      
                          invalid for entry       

  FR-19                   AI/security monitors    Must
                          suspicious booking      
                          patterns                

  FR-20                   Admin can manage        Should
                          catalog, sessions,      
                          venues, layout          
                          versions, and prices    

  FR-21                   All core functions      Must
                          remain usable without   
                          3D                      
  -----------------------------------------------------------------------

## 5.3 Edge cases

-   Show/session sells out between catalog view and seat selection.
-   Seat becomes unavailable between selection and hold creation.
-   Two customers attempt to hold the same seat simultaneously.
-   User refreshes or opens the payment page in another tab.
-   User enters the wrong challenge code repeatedly.
-   Challenge code expires.
-   User closes the browser during checkout.
-   Backend sleeps and takes time to wake on Render free tier.
-   Supabase is temporarily unavailable.
-   AI quota is exhausted.
-   3D model fails to load or is too large for the device.
-   Venue layout version changes after a show is created.
-   Show is cancelled or rescheduled.
-   User attempts to change order amount from browser developer tools.
-   User attempts to confirm a payment attempt belonging to another
    user.
-   A hold expires while the payment challenge page is open.

------------------------------------------------------------------------

# 6. 3D venue and seat experience

## 6.1 Scene types

### Stadium / arena

-   Pitch/field/court/stage.
-   Stands and seating blocks.
-   Seat rows and seat identifiers.
-   Entry gates and major landmarks where useful.
-   Camera viewpoints from selected seats.

### Cinema auditorium

-   Screen plane and screen metadata.
-   Auditorium floor and seating rake.
-   Rows, aisles, and seats.
-   Seat-specific camera position and orientation.
-   Optional screen-format metadata (standard, large format, etc.) only
    when accurate.

Different shows must not share a generic scene if their venue geometry
differs. Reuse the same venue layout when two sessions genuinely take
place in the same room with unchanged geometry.

## 6.2 Scene states

`catalog → show-selected → venue-loading → venue-overview → section-focused → seat-selected → seat-preview → checkout`

The 3D scene should be synchronised with server-provided IDs. Selecting
a visual seat updates the selected seat ID; inventory and price details
are fetched or resolved from trusted API data.

## 6.3 Seat preview accuracy

A preview may be: - A geometric camera view from the seat coordinates. -
A pre-rendered image. - A calibrated photograph. - An illustrative
approximation.

The UI should disclose which type is being shown. Exact sightline claims
require validated dimensions, camera calibration, screen/pitch geometry,
and obstruction modelling. Temporary staging, people standing, and
real-world conditions may change the view.

## 6.4 3D accessibility and fallback

Provide: - A list or 2D map of sections and seats. - Keyboard-operable
controls. - Text labels and price descriptions. - High-contrast state
indicators. - Reduced-motion support. - A "reset view" control. - A way
to skip the 3D scene and continue with 2D selection.

------------------------------------------------------------------------

# 7. Booking, seat holds, and inventory correctness

The database, not the 3D client, controls seat ownership.

## 7.1 Seat inventory state machine

Possible states:

-   `available`
-   `held`
-   `sold`
-   `blocked`
-   `disabled`

Transitions should be enforced on the backend. A seat is available only
if it is saleable and has no active hold or confirmed booking for the
selected show.

## 7.2 Hold lifecycle

A hold contains: - User ID. - Show/session ID. - Seat inventory IDs. -
Creation timestamp. - Expiration timestamp. - State. - Associated order
ID where applicable.

Use a short configurable duration suitable for a demo (for example, five
minutes). The exact duration is a product setting, not a fixed technical
requirement.

## 7.3 Concurrency

The backend must atomically claim seats. A read-then-write sequence
without a transaction or locking is unsafe because two users can read
"available" at the same time.

Recommended approach: - Implement a PostgreSQL function/RPC or backend
transaction that locks the relevant inventory rows. - Check all
requested seats are still available. - Create the hold and update
inventory in the same transaction. - Reject the entire request if any
seat is unavailable, unless partial selection is an explicitly designed
feature. - Use a unique constraint or equivalent invariant to prevent
overlapping active holds/sales. - Expire holds with a backend job or
opportunistic cleanup plus query-time expiry checks.

## 7.4 Server-authoritative price

The browser submits seat inventory IDs, not trusted amounts. Backend
loads active price values, calculates subtotal/fees/total, and persists
a price snapshot on the order. Once an order is created, the snapshot
ensures the displayed total cannot be silently changed by a later price
edit.

------------------------------------------------------------------------

# 8. Demo payment gateway

## 8.1 Purpose

The payment experience is a **simulation** for demonstrating checkout
state transitions. It must not collect real money, call a live payment
API, or imply that a real financial transaction occurred.

A custom internal page can look and behave like a payment gateway while
remaining clearly labelled:

> **DEMO PAYMENT GATEWAY --- No real money will be charged.**

The order amount is displayed to make the flow realistic, but it is only
a simulated amount.

## 8.2 Challenge-code interaction

Recommended flow:

1.  Backend creates `demo_payment_attempt` for a specific order.
2.  Backend generates a cryptographically random challenge string, for
    example `DEMO-7KQ4-P9MX` (illustrative format; each attempt gets a
    fresh value).
3.  Backend stores only a secure hash of the challenge, its expiry,
    attempt count, payment-attempt ID, and order association.
4.  The demo gateway displays the challenge with an explanation: "For
    this demo, re-enter the code shown below to simulate approval."
5.  User types the code into the input field.
6.  Frontend sends the typed code and payment-attempt ID to FastAPI.
7.  Backend validates the authenticated user, attempt ownership, order
    status, hold expiry, challenge hash, challenge expiry, and attempt
    limit.
8.  On success, a single database transaction marks the payment attempt
    `succeeded_simulated`, order `confirmed_demo`, seat inventory
    `sold`, and issues demo tickets.
9.  On failure, record a failed attempt and apply a small attempt
    limit/rate limit.
10. The UI clearly labels the result as simulated.

**Important limitation:** Because the code is displayed to the same user
on the same page, retyping it is a confirmation interaction, not a
meaningful second factor or proof of identity. It must never be
described as secure payment authentication. The real security properties
come from server-side ownership checks, expiry, one-time use, rate
limiting, and database state transitions.

## 8.3 Payment states

`created → challenge_issued → succeeded_simulated`

Alternative outcomes: - `failed` - `expired` - `cancelled`

A payment attempt must be idempotent. Repeating a successful
confirmation request must return the existing successful result rather
than issue duplicate tickets.

## 8.4 Demo gateway data

Store: - Payment attempt ID. - Order ID. - User ID. - Amount and
currency snapshot. - Status. - Challenge hash (never plaintext after
initial response). - Challenge expiry. - Failed attempt count. -
Created/updated timestamps. - Simulated provider reference, such as
`DEMO_TXN_<uuid>`.

Do not store card details, bank details, UPI PINs, CVVs, or real OTPs.

## 8.5 Optional real gateway sandbox

If a later demonstration needs an external gateway UI, a provider's
**test/sandbox mode** may be evaluated separately. Razorpay
documentation states that test mode uses separate test keys and
simulates payment without deducting real money. Its test checkout flow
uses mock payment methods and test values. This is optional and is not
required for the initial custom challenge-code flow.

Never put live payment keys in this demo. Never silently switch from
sandbox to live mode.

------------------------------------------------------------------------

# 9. Agentic AI and anti-scalping security

## 9.1 Security design principle

The AI layer supports investigation and analyst understanding. It is not
the authoritative security control plane. Deterministic application
code, database constraints, and explicit policy rules enforce the actual
actions.

## 9.2 Threats to detect

  -----------------------------------------------------------------------
  Threat                  Possible signals        Safe response
  ----------------------- ----------------------- -----------------------
  Automated ticket bot    High request rate,      Rate limit, challenge,
                          repeated timing         investigate
                          patterns, low           
                          interaction variance    

  Seat hoarding           Repeated holds followed Limit active holds,
                          by expiry/cancellation  cool-down, risk review

  Bulk reservation abuse  Unusual quantities or   Enforce per-show
                          repeated multi-seat     limits, verify
                          requests                

  Account takeover        New device/IP pattern,  Re-authentication,
                          unusual login/booking   session revocation
                          sequence                review

  Credential stuffing     Repeated failed logins  Rate limiting,
                          across accounts         progressive delays,
                                                  alert

  API scraping            High-volume             Rate limits, caching,
                          catalog/seat-map calls  abuse monitoring

  Checkout automation     Abnormally fast         Rate limit and
                          repeated checkout       behavioural review
                          attempts                

  Payment simulation      Repeated invalid        Lock attempt, audit,
  abuse                   challenge submissions   alert

  Multi-account           Shared indicators and   Correlation and human
  coordination            synchronised activity   review; avoid
                                                  single-signal
                                                  accusations
  -----------------------------------------------------------------------

IP address alone is not sufficient to label a user malicious. Shared
networks, carrier-grade NAT, campus networks, VPNs, and households can
produce shared IPs. Use multiple signals and minimise personal data.

## 9.3 Detection pipeline

1.  Application records structured security-relevant events.
2.  Deterministic Python rules and counters detect threshold violations.
3.  Correlation groups related signals into an investigation case.
4.  A risk score is calculated using explainable features.
5.  LangGraph orchestrates bounded specialist analysis.
6.  Gemini summarises evidence, proposes hypotheses, and recommends next
    investigative steps.
7.  A policy engine maps risk and evidence to permitted actions.
8.  High-impact actions require human review.
9.  Decisions and evidence are stored in an append-only or
    access-restricted audit history.

## 9.4 Suggested agents

  -----------------------------------------------------------------------
  Agent                   Responsibility          Allowed tools
  ----------------------- ----------------------- -----------------------
  Security Analyst Agent  Summarises an incident  Read-only security
                          and evidence            event queries

  Bot Behaviour Agent     Reviews                 Read-only aggregates
                          request/interaction     
                          patterns                

  Booking Fraud Agent     Analyses holds,         Read-only booking
                          cancellations, and seat aggregates
                          patterns                

  Threat Context Agent    Adds context to known   Approved threat-intel
                          indicators when data is lookup only
                          available               

  Incident Response       Suggests response steps Draft notes; no direct
  Assistant               and creates case notes  destructive action
  -----------------------------------------------------------------------

For a small demo, three agents are sufficient: Security Analyst,
Anti-Scalping Investigator, and Incident Response Assistant. A single
orchestrator should route tasks rather than launching many independent
always-on processes.

## 9.5 Example anti-scalping scenario

A user repeatedly holds premium seats, allows the holds to expire, then
immediately repeats the behaviour across several sessions.

-   Rule engine detects a high number of expired holds within a rolling
    time window.
-   It checks whether the behaviour exceeds configured thresholds.
-   Risk score increases with explainable reasons such as
    `repeated_expired_holds` and `high_seat_selection_velocity`.
-   Investigation agent summarises the pattern.
-   Policy engine may limit concurrent holds, introduce a verification
    step, or queue the case for review.
-   The system records the policy outcome.

Do not automatically accuse or permanently ban a user based only on a
model output. Provide false-positive handling and a way for an
administrator to review evidence.

## 9.6 Gemini free-tier use

Gemini is used on demand for summarisation and investigation, not for
every click or every seat request. Keep prompts compact, redact
unnecessary personal information, and avoid sending passwords, tokens,
payment credentials, or sensitive user data. Free-tier availability,
model access, quotas, and data-use terms can change; check the current
official pricing and terms before deployment.

If Gemini is unavailable or quota is exhausted, deterministic security
controls must continue to work. The application should mark AI analysis
as pending/unavailable and never fail open on core inventory
protections.

------------------------------------------------------------------------

# 10. System architecture

## 10.1 Logical architecture

``` mermaid
flowchart TD
    U[Customer / Admin] --> V[Vercel: React + Vite]
    V --> SA[Supabase Auth]
    V --> API[Render: FastAPI]

    SA -->|JWT access token| API
    API --> DB[(Supabase PostgreSQL)]

    V --> CDN[Static 3D assets / image delivery]
    V -->|3D scene metadata| API

    API --> INV[Catalog, Pricing, Inventory, Booking]
    API --> PAY[Demo Payment Simulator]
    API --> SEC[Python Security Detection]

    INV --> DB
    PAY --> DB
    SEC --> DB

    SEC --> LG[LangGraph Orchestrator]
    LG --> GEM[Gemini API]
    LG --> DB

    SEC --> DASH[Security Dashboard APIs]
    DASH --> V
```

## 10.2 Trust boundaries

-   Browser is untrusted. It can be modified by users.
-   Frontend Supabase publishable key is public by design; RLS must
    protect exposed tables.
-   Supabase service-role/secret keys are server-only and must never be
    sent to Vercel client bundles.
-   FastAPI validates the user's JWT and authorises each operation.
-   AI output is untrusted data and must be validated before it
    influences any workflow.
-   Payment challenge validation and booking confirmation occur
    server-side.
-   3D asset files are public/static where appropriate, but admin upload
    and asset mutation endpoints require authorisation.

## 10.3 Booking/payment sequence

``` mermaid
sequenceDiagram
    participant C as Customer
    participant W as Web App
    participant A as FastAPI
    participant D as Supabase DB
    participant G as Demo Gateway UI

    C->>W: Select show and seats
    W->>A: Create hold request
    A->>D: Atomic availability check + hold
    D-->>A: Hold created / conflict
    A-->>W: Hold ID, expiry, price snapshot
    C->>W: Continue to checkout
    W->>A: Create order + demo payment attempt
    A->>D: Persist order and attempt
    A-->>W: Gateway route + challenge display payload
    W->>G: Navigate to demo gateway
    C->>G: Re-enter displayed challenge
    G->>A: Confirm simulated payment
    A->>D: Validate + atomically confirm order/tickets
    D-->>A: Confirmation result
    A-->>G: Simulated success
    G-->>C: Demo ticket confirmation
```

------------------------------------------------------------------------

# 11. Recommended technology stack

  -----------------------------------------------------------------------
  Layer                   Recommended technology  Purpose and rationale
  ----------------------- ----------------------- -----------------------
  Frontend                React + Vite +          Component-based client
                          TypeScript              app; Vite supports a
                                                  lightweight SPA

  3D                      Three.js + React Three  WebGL-based interactive
                          Fiber                   3D, integrated with
                                                  React

  3D controls             Drei (optional)         Common helpers for
                                                  camera, loaders,
                                                  controls, and scene
                                                  composition

  Styling                 Tailwind CSS            Consistent responsive
                                                  styling

  Frontend hosting        Vercel                  Static frontend
                                                  deployment and CDN

  Backend                 Python + FastAPI        Typed API, validation,
                                                  async support, Python
                                                  security/AI ecosystem

  Backend hosting         Render free web service Demo deployment; must
                                                  account for
                                                  sleeping/cold starts

  SQL database            Supabase PostgreSQL     Relational integrity
                                                  for shows, seats,
                                                  holds, orders, and
                                                  audit records

  Authentication          Supabase Auth           User identity, JWT
                                                  sessions,
                                                  password/social sign-in
                                                  options

  Authorisation           PostgreSQL RLS +        Defence in depth
                          FastAPI checks          

  AI model                Gemini API              Investigation summaries
                                                  and reasoning within
                                                  available quota

  Agent orchestration     LangGraph               Stateful, bounded
                                                  multi-step agent
                                                  workflows

  Security detection      Python rules and        Deterministic, testable
                          aggregates              anti-abuse detection

  3D asset format         glTF/GLB                Web-oriented
                                                  scene/model delivery

  Version control         GitHub                  Source control and
                                                  deployment integration
  -----------------------------------------------------------------------

### 11.1 Why not add Redis initially?

The project targets free hosting. Start with PostgreSQL for durable
state and simple database-backed counters/queues. Add Redis only if
measured requirements justify it and a suitable free service is
available. Do not make correctness depend on an ephemeral in-memory
Python dictionary.

### 11.2 Gemini and LangGraph boundaries

LangGraph manages workflow state and tool routing. Gemini provides
language-model reasoning. The model should receive structured, minimised
evidence and return a schema-validated investigation result. LangGraph
does not replace application authorisation or the deterministic policy
engine.

------------------------------------------------------------------------

# 12. Data model and Supabase schema

The schema below is a logical design. Exact SQL types, indexes,
constraints, and RLS policies should be reviewed during implementation.

## 12.1 Main entities

### Catalog and venue

-   `catalog_items`: movie or event metadata.
-   `shows`: scheduled movie screening or live event occurrence.
-   `venues`: physical locations.
-   `venue_spaces`: auditorium, stadium bowl, arena, theatre room, etc.
-   `venue_layout_versions`: versioned spatial layout and asset
    references.
-   `sections`: stands, blocks, balconies, seating zones.
-   `seats`: stable seat identity and coordinates within a layout.
-   `seat_inventory`: show-specific sale state and price reference.

### Commercial workflow

-   `price_tiers`: Standard, Premium, VIP, etc.
-   `show_prices`: price rules for a show/section/tier or seat.
-   `seat_holds`: temporary seat allocation.
-   `orders`: checkout and amount snapshot.
-   `order_items`: selected seats and price snapshots.
-   `demo_payment_attempts`: simulated payment state.
-   `tickets`: demo ticket entitlements.

### Security and administration

-   `profiles`: application profile linked to `auth.users`.
-   `security_events`: structured security signals.
-   `risk_assessments`: score, reasons, and detector version.
-   `investigation_cases`: correlated incidents.
-   `agent_runs`: agent workflow metadata and result summary.
-   `audit_logs`: privileged state changes.

## 12.2 Relationship diagram

``` mermaid
erDiagram
    CATALOG_ITEMS ||--o{ SHOWS : has
    VENUES ||--o{ VENUE_SPACES : contains
    VENUE_SPACES ||--o{ VENUE_LAYOUT_VERSIONS : versions
    VENUE_LAYOUT_VERSIONS ||--o{ SECTIONS : contains
    SECTIONS ||--o{ SEATS : contains
    SHOWS }o--|| VENUE_SPACES : uses
    SHOWS }o--|| VENUE_LAYOUT_VERSIONS : uses
    SHOWS ||--o{ SEAT_INVENTORY : offers
    SEATS ||--o{ SEAT_INVENTORY : maps
    SHOWS ||--o{ SHOW_PRICES : prices
    PROFILES ||--o{ SEAT_HOLDS : creates
    SEAT_HOLDS ||--o| ORDERS : converts_to
    ORDERS ||--o{ ORDER_ITEMS : contains
    ORDERS ||--o{ DEMO_PAYMENT_ATTEMPTS : attempts
    ORDERS ||--o{ TICKETS : issues
    PROFILES ||--o{ SECURITY_EVENTS : generates
    SECURITY_EVENTS ||--o{ RISK_ASSESSMENTS : evaluated_as
    INVESTIGATION_CASES ||--o{ AGENT_RUNS : contains
```

## 12.3 Important field examples

`catalog_items` - `id` UUID primary key - `item_type` enum: `movie`,
`sports`, `concert`, `event` - `title` - `description` - `poster_url` -
`status` - `created_at`, `updated_at`

`shows` - `id` - `catalog_item_id` - `venue_id` - `venue_space_id` -
`layout_version_id` - `starts_at` timestamptz - `ends_at` timestamptz
nullable - `status` - `currency` - `created_at`

`venue_layout_versions` - `id` - `venue_space_id` - `version` -
`asset_url` - `asset_format` - `layout_metadata` JSONB -
`is_published` - `created_at`

`seats` - `id` - `layout_version_id` - `section_id` - `row_label` -
`seat_label` - `x`, `y`, `z` - `orientation` JSONB - `seat_type` -
`is_accessible` - unique constraint on layout/section/row/seat identity

`seat_inventory` - `id` - `show_id` - `seat_id` - `status` -
`price_tier_id` - `current_price_minor` - `currency` - unique constraint
on `(show_id, seat_id)`

`orders` - `id` - `user_id` - `show_id` - `hold_id` - `status` -
`subtotal_minor` - `fees_minor` - `total_minor` - `currency` -
`created_at` - `expires_at`

`demo_payment_attempts` - `id` - `order_id` - `user_id` - `status` -
`amount_minor` - `currency` - `challenge_hash` -
`challenge_expires_at` - `failed_attempt_count` -
`simulated_reference` - `created_at`, `updated_at`

`security_events` - `id` - `user_id` nullable - `event_type` -
`severity` - `source` - `ip_hash` or minimised network identifier where
justified - `metadata` JSONB with strict allowlist - `created_at`

## 12.4 Money representation

Store monetary values as integer minor units (for INR, paise) rather
than floating-point values. For example, ₹500.00 is stored as `50000`
paise. Return formatted values to the UI using the currency code and
locale. Store the currency on the order and item price snapshot.

## 12.5 RLS policy principles

-   Users can read/update only their own profile fields that are
    user-editable.
-   Users can read their own holds, orders, payment attempts, and
    tickets.
-   Users cannot directly set an order to paid/confirmed or mark seats
    as sold.
-   Public catalog/venue/show data may be readable by anonymous users if
    intended.
-   Admin-only writes require an explicit trusted role check.
-   Security event and agent-run tables should not be readable by
    ordinary customers.
-   Backend privileged access uses server-only secrets and performs
    explicit authorisation.
-   RLS is not a replacement for backend business logic; use both.

------------------------------------------------------------------------

# 13. API design

All privileged operations should go through FastAPI. The browser must
not directly mutate inventory, payment status, ticket issuance, or risk
decisions.

## 13.1 Public/catalog APIs

  ------------------------------------------------------------------------------------
  Method                  Endpoint                             Responsibility
  ----------------------- ------------------------------------ -----------------------
  GET                     `/api/catalog`                       List movies/events with
                                                               filters

  GET                     `/api/catalog/{item_id}`             Listing details

  GET                     `/api/catalog/{item_id}/shows`       Available sessions

  GET                     `/api/shows/{show_id}`               Show details, venue and
                                                               layout metadata

  GET                     `/api/shows/{show_id}/price-range`   Starting price and
                                                               range

  GET                     `/api/shows/{show_id}/sections`      Section list and
                                                               availability summary

  GET                     `/api/shows/{show_id}/seats`         Seat map/inventory
                                                               summary
  ------------------------------------------------------------------------------------

## 13.2 Booking APIs

  ----------------------------------------------------------------------------
  Method                  Endpoint                     Responsibility
  ----------------------- ---------------------------- -----------------------
  POST                    `/api/holds`                 Atomically hold
                                                       selected seats

  GET                     `/api/holds/{hold_id}`       Get hold status/expiry

  DELETE                  `/api/holds/{hold_id}`       Release a user's active
                                                       hold

  POST                    `/api/orders`                Create order from
                                                       active hold and server
                                                       prices

  GET                     `/api/orders/{order_id}`     Get own order

  GET                     `/api/me/bookings`           List own demo bookings

  GET                     `/api/tickets/{ticket_id}`   Retrieve own demo
                                                       ticket
  ----------------------------------------------------------------------------

## 13.3 Demo payment APIs

  -------------------------------------------------------------------------------------------
  Method                  Endpoint                                    Responsibility
  ----------------------- ------------------------------------------- -----------------------
  POST                    `/api/demo-payments`                        Create simulated
                                                                      payment attempt and
                                                                      challenge

  GET                     `/api/demo-payments/{attempt_id}`           Get own attempt status
                                                                      and gateway display
                                                                      data

  POST                    `/api/demo-payments/{attempt_id}/confirm`   Validate typed
                                                                      challenge and simulate
                                                                      success

  POST                    `/api/demo-payments/{attempt_id}/cancel`    Cancel a pending
                                                                      attempt
  -------------------------------------------------------------------------------------------

The confirm endpoint must: - Require authentication. - Verify attempt
belongs to the caller. - Verify order and hold are still eligible. -
Check challenge hash and expiry. - Enforce attempt count and rate
limit. - Be idempotent. - Perform state changes in one database
transaction. - Return a clear simulated result.

## 13.4 Security APIs

  ---------------------------------------------------------------------------------------------
  Method                  Endpoint                                      Responsibility
  ----------------------- --------------------------------------------- -----------------------
  GET                     `/api/security/summary`                       Admin/analyst dashboard
                                                                        summary

  GET                     `/api/security/events`                        Filter security events

  GET                     `/api/security/cases`                         List investigation
                                                                        cases

  GET                     `/api/security/cases/{case_id}`               Case evidence and
                                                                        history

  POST                    `/api/security/cases/{case_id}/investigate`   Trigger bounded AI
                                                                        investigation

  POST                    `/api/security/cases/{case_id}/review`        Record human review
                                                                        decision
  ---------------------------------------------------------------------------------------------

## 13.5 API reliability

-   Validate all request bodies with typed schemas.
-   Use pagination and bounded page sizes.
-   Use idempotency keys for hold/order/payment creation where
    appropriate.
-   Return consistent error structures.
-   Do not return stack traces or secrets.
-   Apply CORS only to known frontend origins.
-   Use request IDs for tracing.
-   Enforce rate limits on authentication, holds, payment challenge
    confirmation, and expensive AI investigation endpoints.

------------------------------------------------------------------------

# 14. Security, authentication, and authorisation

## 14.1 Supabase Auth

Supabase Auth manages user identity and issues JWT access tokens. The
frontend obtains a session using the Supabase client SDK. It sends the
access token to FastAPI as a bearer token. FastAPI verifies the token
using the configured trusted verification method and checks the user ID
and roles for the requested operation.

Do not trust a user ID supplied in the request body as proof of
identity. Derive the authenticated identity from the verified token.

## 14.2 Key management

-   Supabase publishable key: may be used in browser when RLS is
    correctly configured.
-   Supabase secret/service-role key: server-side only.
-   Gemini API key: server-side only.
-   JWT verification configuration: server-side.
-   No secrets in GitHub, client bundles, logs, or screenshots.
-   Use Vercel environment variables for frontend-safe configuration and
    Render environment variables for backend secrets.

## 14.3 Application protections

-   Password and session security via Supabase Auth.
-   RLS on exposed Supabase tables.
-   Server-side authorisation for all booking and admin actions.
-   Parameterised SQL / safe query APIs.
-   Input validation and output encoding.
-   CORS allowlist.
-   CSRF strategy appropriate to the chosen authentication transport.
-   Rate limiting and abuse detection.
-   Audit logs for privileged operations.
-   Dependency scanning and secure configuration.
-   Avoid exposing internal security signals to ordinary customers.

## 14.4 AI security

-   Treat event metadata and user-controlled text as untrusted input.
-   Do not let an event description or user field override agent
    instructions.
-   Use tool allowlists and read-only tools for investigation agents.
-   Validate model output against a strict schema.
-   Do not give the model direct SQL execution or unrestricted
    shell/network access.
-   Keep secrets and unnecessary personal data out of prompts.
-   Log model/version, input evidence references, output summary, and
    workflow status without storing excessive sensitive content.
-   Human approval for consequential actions.

------------------------------------------------------------------------

# 15. Performance and optimisation

## 15.1 3D optimisation

-   Prefer GLB/glTF assets.
-   Compress geometry and textures where supported.
-   Use instanced rendering for repeated seat meshes.
-   Use LOD for distant venue sections.
-   Load a simplified venue overview first.
-   Load detailed seat geometry only when a section is focused.
-   Avoid excessive real-time shadows and post-processing on mobile.
-   Use texture atlases and sensible draw-call budgets.
-   Lazy-load 3D viewer code and assets.
-   Provide a 2D fallback when WebGL is unavailable or performance is
    poor.

## 15.2 Backend optimisation

-   Paginate catalog and seat inventory.
-   Avoid returning every seat mesh and all metadata in one response for
    large stadiums.
-   Cache public catalog and static layout metadata where safe.
-   Do not cache authoritative seat availability for long periods.
-   Use indexes on show ID, seat ID, status, expiry, and user ID.
-   Keep AI calls off latency-sensitive seat selection and hold creation
    paths.
-   Use background/bounded analysis after a security event is recorded.

## 15.3 Suggested demo targets

These are proposed targets to validate, not guaranteed results:

-   Initial catalog shell: usable quickly on a typical broadband/mobile
    connection.
-   Catalog API: p95 under 500 ms when backend is warm.
-   Seat hold: p95 under 1 second when backend and database are warm.
-   3D overview: progressively rendered, with a low-detail first view.
-   Seat preview transition: smooth on supported desktop/mobile
    hardware.
-   No duplicate seat allocation under concurrent test load.
-   AI analysis may be asynchronous and should not block the booking
    flow.

Render free web services sleep after a period without traffic and may
take about a minute to wake. The UI should show a clear "server waking
up" or retry state rather than appearing broken.

------------------------------------------------------------------------

# 16. Accessibility and responsive design

-   Provide a keyboard-accessible seat list or 2D map.
-   Do not encode availability only by colour.
-   Ensure seat labels and prices are available to screen readers.
-   Support zoom and touch controls without requiring precision
    gestures.
-   Respect reduced-motion preferences.
-   Keep checkout usable on narrow screens.
-   Provide loading and error states for 3D assets.
-   Let users switch to "2D seat selection".
-   Do not use a 3D-only interaction to make a purchase.

------------------------------------------------------------------------

# 17. Testing and quality assurance

## 17.1 Unit tests

-   Price-range calculation.
-   Server-side order total.
-   Seat state transitions.
-   Hold expiry.
-   Challenge generation and verification.
-   Risk score calculation.
-   Policy engine mapping.
-   RLS helper/role logic where testable.

## 17.2 Integration tests

-   Supabase Auth token verification.
-   RLS access boundaries.
-   Hold creation transaction.
-   Concurrent hold attempts for the same seat.
-   Order creation from a valid hold.
-   Demo payment challenge success/failure/expiry.
-   Idempotent repeated confirmation.
-   Ticket issuance exactly once.
-   Gemini unavailable/quota-exhausted fallback.

## 17.3 End-to-end tests

1.  Browse multiple movie/event cards.
2.  Open a movie and choose a showtime.
3.  Confirm correct auditorium/screen loads.
4.  Open a sports event and confirm correct stadium loads.
5.  Select seats and verify prices differ by tier.
6.  Hold seats and verify timer.
7.  Proceed to the demo gateway.
8.  Enter the generated challenge correctly and confirm simulated
    booking.
9.  Try an incorrect code and verify no booking confirmation.
10. Try an expired code and verify no confirmation.
11. Confirm the demo ticket says "Not valid for entry".
12. Test mobile layout and 2D fallback.

## 17.4 Security tests

-   Attempt to read another user's order.
-   Attempt to confirm another user's payment attempt.
-   Attempt to change amount in browser payload.
-   Attempt to mark a seat sold from the frontend.
-   Repeated invalid challenge attempts.
-   High-frequency seat-map and hold requests.
-   Concurrent booking of the same seat.
-   Prompt injection in user-controlled metadata.
-   Verify no service-role/Gemini secret is present in frontend assets.

------------------------------------------------------------------------

# 18. Deployment and operations

## 18.1 Deployment topology

-   **Vercel:** React/Vite static frontend.
-   **Render:** FastAPI web service.
-   **Supabase:** PostgreSQL and Auth.
-   **Gemini API:** External model API accessed only from FastAPI.
-   **GitHub:** Source repository and deployment trigger.
-   **3D assets:** Static hosting/CDN or approved object storage; avoid
    relying on Render ephemeral disk.

## 18.2 Environment configuration

Frontend: - `VITE_SUPABASE_URL` - `VITE_SUPABASE_PUBLISHABLE_KEY` -
`VITE_API_BASE_URL`

Backend: - `SUPABASE_URL` - `SUPABASE_SECRET_KEY` or appropriately
scoped server credential - `SUPABASE_JWT_ISSUER` / verification
configuration as required - `GEMINI_API_KEY` - `ALLOWED_ORIGINS` -
`DEMO_PAYMENT_MODE=true` - `DEMO_PAYMENT_CHALLENGE_TTL_SECONDS` -
`DEMO_PAYMENT_MAX_ATTEMPTS` - `LOG_LEVEL`

Never use a `VITE_` prefix for secrets because Vite exposes prefixed
variables to client code.

## 18.3 Free-tier caveats

Free plans and quotas change. Validate current provider terms at
deployment time.

-   Render free web services can spin down after inactivity; local
    filesystem is ephemeral. Do not use local SQLite or local uploads
    for persistent application data.
-   Supabase free-plan quotas and inactivity policies may change;
    monitor project status and backups.
-   Gemini free-tier model availability and rate limits may change.
    Build a deterministic fallback.
-   Vercel Hobby is intended for personal/non-commercial usage and has
    plan-specific limits.
-   A free-tier deployment is suitable for a portfolio demo, not a
    guaranteed-uptime commercial ticketing service.

## 18.4 Monitoring

Track: - API errors and latency. - Seat hold conflicts and
expirations. - Simulated payment success/failure counts. - Challenge
failures and throttling. - 3D asset load failures. - Gemini
quota/availability errors. - Security detections and false-positive
review. - Database query latency and connection errors.

Do not log challenge plaintext, passwords, access tokens, or payment
secrets.

------------------------------------------------------------------------

# 19. Risks, limitations, and trade-offs

  -----------------------------------------------------------------------
  Risk                    Impact                  Mitigation
  ----------------------- ----------------------- -----------------------
  False-positive bot      Legitimate users        Multi-signal scoring,
  detection               blocked                 verification, human
                                                  review

  AI hallucination        Incorrect incident      Evidence-grounded
                          narrative               outputs, schema
                                                  validation, no direct
                                                  enforcement

  Render cold starts      Slow initial API call   Loading/retry UI,
                                                  warm-up only if
                                                  permitted, explain demo
                                                  limitation

  Gemini quota exhaustion AI analysis unavailable Rule-based detection
                                                  continues; queue or
                                                  mark AI unavailable

  Oversized 3D models     Slow or failed load     LOD, compression,
                                                  progressive loading, 2D
                                                  fallback

  Concurrent seat         Double booking          Atomic transaction and
  requests                                        constraints

  Client-tampered prices  Incorrect checkout      Server-authoritative
                                                  price snapshots

  Challenge replay        Duplicate confirmation  One-time challenge,
                                                  expiry, idempotency,
                                                  transactional state

  Misleading payment UX   Users think real money  Persistent DEMO labels
                          moved                   and no real payment
                                                  fields

  Stale venue layout      Wrong seat mapping      Versioned layouts
                                                  linked to show

  Shared IP false         Unfair risk score       Never use IP alone;
  positives                                       privacy-conscious
                                                  correlation

  Free-tier policy        Deployment interruption Keep architecture
  changes                                         portable and monitor
                                                  provider terms
  -----------------------------------------------------------------------

------------------------------------------------------------------------

# 20. Development phases and acceptance criteria

These phases describe the product's logical build sequence; they are not
an instruction to begin implementation automatically.

## Phase 1 --- Catalog and show/session model

Acceptance: - Multiple movies and events appear. - Each listing shows
title, date/time context, venue, and price range. - Listings have one or
more show/session records. - A show resolves to the correct venue space
and layout version.

## Phase 2 --- Venue layouts and 3D selection

Acceptance: - At least one cinema auditorium and one stadium/arena
layout are represented. - Different shows can use different layout
versions. - Seat IDs map consistently between 3D and 2D. - Seats expose
availability and price. - Selected seat can be previewed where camera
data exists.

## Phase 3 --- Booking and inventory

Acceptance: - Users can authenticate through Supabase Auth. - Backend
validates JWTs. - Seat holds expire. - Concurrent attempts cannot
sell/hold the same seat twice. - Price is calculated on the server.

## Phase 4 --- Demo payment

Acceptance: - Checkout opens a distinct Demo Payment Gateway screen. -
The page clearly states no real money is charged. - A fresh random
challenge is generated per payment attempt. - Correct code confirms a
simulated transaction once. - Wrong, expired, or replayed codes do not
create a second confirmation. - Successful flow produces a clearly
labelled demo ticket.

## Phase 5 --- Anti-scalping and security dashboard

Acceptance: - Repeated expired holds are detected. - High-frequency
booking/API behaviour is detected. - Risk explanations are visible. -
Gemini investigation is bounded and optional. - Security rules continue
to work if Gemini is unavailable. - High-impact actions require explicit
policy and/or human review.

## Phase 6 --- Optimisation and deployment

Acceptance: - Frontend deployed on Vercel. - FastAPI deployed on
Render. - Supabase Auth and PostgreSQL configured. - No secret appears
in client bundle or repository. - 3D fallback, mobile, and accessibility
paths work. - Free-tier limitations are documented in the demo UI or
project README.

------------------------------------------------------------------------

# 21. Open decisions

1.  Exact first-release catalog: how many sample movies and events?
2.  Initial venue inventory: one cinema with multiple auditoriums and
    one stadium, or several venues of each type?
3.  Whether to use custom-created 3D models, licensed assets, or
    low-poly illustrative models.
4.  Exact currency and tax/fee display rules.
5.  Whether users can select multiple seats in one order and the maximum
    quantity.
6.  Hold duration and maximum active holds per user.
7.  Whether admin and security analyst are separate roles.
8.  Whether to add an optional external payment provider's test mode
    after the custom demo gateway.
9.  Which Gemini model is available within the free quota at
    implementation time.
10. Whether ticket QR codes are decorative demo identifiers or locally
    verifiable signed demo tokens. They must not be represented as valid
    venue-entry tickets.

------------------------------------------------------------------------

# 22. Glossary

-   **Agentic AI:** An AI-driven workflow that can plan bounded steps
    and use approved tools to accomplish a task.
-   **Anti-scalping:** Controls intended to reduce automated bulk
    buying, seat hoarding, and unfair ticket acquisition.
-   **Auditorium:** A cinema room containing a screen and seats.
-   **Challenge code:** A short-lived random string used in the demo
    gateway to simulate a confirmation interaction.
-   **Demo payment:** An application-level simulation that does not
    transfer money.
-   **Idempotency:** Repeating a request does not duplicate its effect.
-   **Inventory:** Seats offered for a specific show/session and their
    current state.
-   **Layout version:** A stable, versioned representation of venue
    geometry and seat mapping.
-   **RLS:** Row-Level Security, database policies that limit access to
    rows.
-   **Seat hold:** A temporary allocation of seats before checkout
    completes.
-   **Show/session:** A specific scheduled occurrence of a movie
    screening or live event.
-   **Supabase Auth:** Supabase's authentication service, which issues
    JWT-based sessions.
-   **Venue space:** A particular auditorium, stadium bowl, arena room,
    or other seating area.
-   **GLB:** Binary glTF format commonly used to package 3D assets.

------------------------------------------------------------------------

# 23. Research references

The following references support the recommended technology and
operational decisions. Provider features, quotas, and terms can change;
re-check official documentation at implementation and deployment time.

1.  **Supabase Auth documentation** --- Describes authentication
    methods, JWT sessions, and integration with database
    authorisation/RLS.\
    https://supabase.com/docs/guides/auth

2.  **Supabase Row Level Security documentation** --- Reference for
    protecting database rows and using RLS with Supabase APIs.\
    https://supabase.com/docs/guides/database/postgres/row-level-security

3.  **Render: Deploy for Free** --- Describes free service types,
    spin-down behaviour, ephemeral filesystem, and limitations.\
    https://render.com/docs/free

4.  **Render: Your First Deploy** --- Deployment workflow and supported
    web-service/static-site patterns.\
    https://render.com/docs/your-first-deploy

5.  **Google Gemini API pricing** --- Current free and paid tier
    availability and quota/pricing distinctions.\
    https://ai.google.dev/gemini-api/docs/pricing

6.  **LangGraph documentation** --- Agent workflow orchestration, state,
    persistence, and graph execution concepts.\
    https://docs.langchain.com/oss/python/langgraph/overview

7.  **Three.js documentation** --- Browser 3D rendering concepts,
    renderer, scene, cameras, and loaders.\
    https://threejs.org/docs/

8.  **React Three Fiber documentation** --- React renderer for Three.js
    and declarative scene composition.\
    https://r3f.docs.pmnd.rs/

9.  **Khronos glTF specification and resources** --- Standard 3D asset
    transmission format and ecosystem.\
    https://www.khronos.org/gltf/

10. **Razorpay: Test and Live Modes** --- Optional external sandbox
    reference; test mode is separate from live mode and does not process
    real payments.\
    https://razorpay.com/docs/payments/dashboard/test-live-modes/

11. **Razorpay: Test Integration** --- Documents mock payment flows and
    test credentials; no money is deducted when using test keys.\
    https://razorpay.com/docs/payments/payment-gateway/web-integration/standard/test-integration/

12. **OWASP Application Security Verification Standard (ASVS)** --- A
    structured standard for verifying application security controls.\
    https://owasp.org/www-project-application-security-verification-standard/

13. **OWASP API Security Top 10** --- Common API security risks relevant
    to booking, authentication, and admin endpoints.\
    https://owasp.org/www-project-api-security/

14. **OWASP Automated Threats to Web Applications** --- Taxonomy and
    guidance relevant to bot activity, scraping, and automated abuse.\
    https://owasp.org/www-project-automated-threats-to-web-applications/

------------------------------------------------------------------------

## Final system definition

Ticket Booking 3D -- Optimised is a free-tier-oriented, demo web
application in which users browse multiple movies and live events,
choose a specific show/session, enter the correct venue-specific 3D
environment, select seats with show-specific pricing, and complete a
simulated payment by re-entering a server-generated one-time challenge
code. It uses Vercel for the frontend, Render for the FastAPI backend,
Supabase for PostgreSQL and authentication, and Gemini with LangGraph
for bounded AI-assisted security investigations. Python rules and
database transactions remain authoritative for anti-scalping controls,
inventory, order state, and simulated payment confirmation. No real
money is collected and demo tickets are not valid for physical
admission.
